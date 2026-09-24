"""Fabrication-candidate claim extraction and tracing (D-043).

The generative tools (Cover Letter, Interview Q&A, Career Path, Portfolio
Planner) have no heuristic score, so a prompt regression that starts inventing
an employer, product, or metric absent from the user's resume would ship
undetected. This module is the deterministic groundedness signal
:mod:`app.services.campaign_reviewer` runs live on packet materials: it
extracts candidate claims (proper nouns / employer-shaped tokens and
quantified figures/metrics) from generated output and traces each back to the
CV's source text using :func:`app.services.quality_signals.keyword_present`
-style matching. Claims that cannot be traced surface as ``unsupported_claim``
reviewer findings.

This is a directional heuristic, not exact NLP entailment: it is intentionally
cheap and auditable and will have false positives (D-043). It is fully
deterministic and makes **no** live LLM call (D-044).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

from app.services.quality_signals import keyword_present

#: Claim kinds produced by :func:`extract_claims`.
KIND_PROPER_NOUN = "proper-noun"
KIND_FIGURE = "figure"

# A "word" inside a proper-noun run: starts with an uppercase letter and may
# carry internal case/digits/joiners (so "FastAPI", "Node.js", "CI/CD" survive).
_PROPER_WORD = r"[A-Z][A-Za-z0-9]*(?:[&./+\-][A-Za-z0-9]+)*"
#: A run of one or more capitalized words (e.g. "Nimbus Ledger", "PostgreSQL").
_PROPER_RUN = re.compile(rf"{_PROPER_WORD}(?:\s+{_PROPER_WORD})*")
#: A quantified figure: optional ``$``, digit groups, optional decimal, optional
#: ``%`` or ``+`` suffix. Captures "$1,200", "40%", "4,500", "99.95%", "30+".
_FIGURE = re.compile(r"\$?\d[\d,]*(?:\.\d+)?%?\+?")
#: Splits output into rough sentences so sentence-initial capitalization can be
#: distinguished from mid-sentence proper nouns.
_SENTENCE_SPLIT = re.compile(r"[.!?\n]+")

# Common words that are capitalized only because they open a sentence, are
# pronouns, or are letter/greeting boilerplate. Excluded from proper-noun claim
# extraction to cut the most obvious false positives (D-043 accepts the rest).
_CAPITALIZED_STOPWORDS: frozenset[str] = frozenset(
    {
        "a",
        "an",
        "and",
        "as",
        "at",
        "but",
        "by",
        "cv",
        "dear",
        "during",
        "for",
        "from",
        "hi",
        "hello",
        "here",
        "i",
        "in",
        "it",
        "my",
        "of",
        "on",
        "or",
        "our",
        "please",
        "regards",
        "she",
        "sincerely",
        "thank",
        "thanks",
        "that",
        "the",
        "their",
        "them",
        "these",
        "they",
        "this",
        "those",
        "to",
        "we",
        "with",
        "you",
        "your",
    }
)


@dataclass(frozen=True)
class Claim:
    """One candidate claim extracted from a generated output.

    Attributes:
        text: The claim as it appeared in the output (display form).
        kind: :data:`KIND_PROPER_NOUN` or :data:`KIND_FIGURE`.
    """

    text: str
    kind: str


@dataclass(frozen=True)
class ClaimTraceAttempt:
    source: str
    matched: bool


@dataclass(frozen=True)
class ClaimTrace:
    claim: Claim
    attempts: tuple[ClaimTraceAttempt, ...]

    @property
    def traceable(self) -> bool:
        return any(attempt.matched for attempt in self.attempts)


def _has_internal_signal(word: str) -> bool:
    """Return ``True`` if a single token looks proper regardless of position.

    A token with an internal uppercase letter or a digit (``FastAPI``, ``S3``,
    ``CI/CD``) reads as a proper noun even at a sentence start, so it should not
    be dropped by the sentence-initial rule.
    """
    return any(c.isdigit() for c in word) or any(c.isupper() for c in word[1:])


def _is_droppable_word(word: str) -> bool:
    return word.lower() in _CAPITALIZED_STOPWORDS


def _extract_proper_nouns(sentence: str, seen: set[str], claims: list[Claim]) -> None:
    stripped = sentence.lstrip()
    lead_offset = len(sentence) - len(stripped)
    for match in _PROPER_RUN.finditer(sentence):
        words = match.group().split()
        # A single capitalized word at the very start of a sentence is almost
        # always just sentence casing, not a proper noun — skip unless it
        # carries an internal case/digit signal.
        sentence_initial = match.start() == lead_offset
        if sentence_initial and len(words) == 1 and not _has_internal_signal(words[0]):
            continue
        # Trim stopword tokens (articles, pronouns, greeting/letter filler) from
        # both edges of a run, so adjacent capitalized function words don't glue
        # onto a proper noun (e.g. "At Nimbus Ledger I" -> "Nimbus Ledger").
        while words and _is_droppable_word(words[0]):
            words = words[1:]
        while words and _is_droppable_word(words[-1]):
            words = words[:-1]
        if not words:
            continue
        _add_claim(Claim(text=" ".join(words), kind=KIND_PROPER_NOUN), seen, claims)


def _extract_figures(text: str, seen: set[str], claims: list[Claim]) -> None:
    for match in _FIGURE.finditer(text):
        _add_claim(Claim(text=match.group(), kind=KIND_FIGURE), seen, claims)


def _claim_key(claim: Claim) -> str:
    return f"{claim.kind}:{claim.text.lower().replace(',', '')}"


def _add_claim(claim: Claim, seen: set[str], claims: list[Claim]) -> None:
    key = _claim_key(claim)
    if key in seen:
        return
    seen.add(key)
    claims.append(claim)


def extract_claims(output_text: str) -> list[Claim]:
    """Extract candidate claims from a tool's generated output.

    Pulls proper-noun/employer-shaped runs (sentence by sentence, so opening
    capitalization is not mistaken for a proper noun) and quantified figures.
    Claims are de-duplicated case-insensitively and returned in order of first
    appearance.
    """
    seen: set[str] = set()
    claims: list[Claim] = []
    for sentence in _SENTENCE_SPLIT.split(output_text):
        _extract_proper_nouns(sentence, seen, claims)
    _extract_figures(output_text, seen, claims)
    return claims


def _figure_traceable(figure: str, resume_text: str) -> bool:
    r"""Return ``True`` when a numeric figure appears in the resume text.

    Commas are stripped from both sides so ``4,500`` matches ``4500``; digit
    boundaries prevent ``12`` from matching inside ``120``, and the trailing
    ``(?!\.\d)`` stops a bare ``2`` from matching the integer part of ``2.5``.
    """
    normalized = figure.replace(",", "")
    resume_normalized = resume_text.replace(",", "")
    pattern = rf"(?<![\w.]){re.escape(normalized)}(?![\w])(?!\.\d)"
    return bool(re.search(pattern, resume_normalized))


def claim_traceable(claim: Claim, resume_text: str) -> bool:
    """Return ``True`` when a claim can be traced back to the source resume.

    Proper-noun claims reuse :func:`keyword_present` (boundary-aware,
    case-insensitive); figures use digit-boundary matching that tolerates
    thousands separators.
    """
    if claim.kind == KIND_FIGURE:
        return _figure_traceable(claim.text, resume_text)
    return keyword_present(claim.text, resume_text)


def trace_claim(claim: Claim, sources: Mapping[str, str]) -> ClaimTrace:
    """Trace one claim against named sources, preserving every exact attempt."""
    return ClaimTrace(
        claim=claim,
        attempts=tuple(
            ClaimTraceAttempt(source=name, matched=claim_traceable(claim, text))
            for name, text in sources.items()
        ),
    )
