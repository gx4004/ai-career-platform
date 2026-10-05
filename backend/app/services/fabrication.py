"""Fabrication-candidate claim extraction and tracing (D-043).

The generative tools (Cover Letter, Interview Q&A, Career Path, Portfolio
Planner) have no heuristic score, so a prompt regression that starts inventing
an employer, product, or metric absent from the user's resume would ship
undetected. This module is the deterministic groundedness signal
:mod:`app.services.campaign_reviewer` runs on application materials: it
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
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass

from app.services.quality_signals import keyword_present

#: Claim kinds produced by :func:`extract_claims`.
KIND_PROPER_NOUN = "proper-noun"
KIND_FIGURE = "figure"

# One word token: unicode letters/digits with internal joiners (so "FastAPI",
# "Node.js", "CI/CD" survive) and an optional "++"/"#" tail ("C++", "C#"). Unicode
# aware so "Müller" and "Zürich" are one word, not "M" and "Z".
_WORD_TOKEN = re.compile(r"[^\W_][^\W_]*(?:[&./+\-][^\W_]+)*(?:\+\+|#)?")
#: A quantified figure: optional ``$``, digit groups, optional decimal, optional
#: unit suffix (``%``, ``+``, ``k``/``m``/``b``, ``x``). Captures "$1,200", "40%",
#: "99.95%", "30+", "$1.2M", "3x". The figure must stand alone: "p95" or "3rd"
#: are tokens, not numbers, and yield no figure claim.
_FIGURE = re.compile(r"(?<![\w.])\$?\d[\d,]*(?:\.\d+)?(?:%|\+|[kKmMbBxX])?(?!\w)")
#: Splits output into rough sentences so sentence-initial capitalization can be
#: distinguished from mid-sentence proper nouns.
_SENTENCE_SPLIT = re.compile(r"[.!?\n]+")
#: Verbs that routinely open CV/letter sentences ("Used Go", "Led Atlas"); the
#: capitalisation is sentence casing, not part of the name that follows.
_OPENING_VERBS = frozenset(
    {"used", "led", "ran", "built", "wrote", "made", "drove", "took", "won", "set", "got", "cut", "grew"}
)
#: Suffix words that spell out a figure's unit, so ``$1.2M`` grounds in "$1.2 million".
_UNIT_WORDS = {"k": "thousand", "m": "million", "b": "billion"}

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


def _is_proper_token(token: str) -> bool:
    return token[0].isupper() or (token[0].isalpha() and any(c.isupper() for c in token[1:]))


def _proper_runs(sentence: str) -> list[tuple[int, list[str]]]:
    """Runs of consecutive proper tokens separated only by whitespace."""
    runs: list[tuple[int, list[str]]] = []
    current: list[str] = []
    start = 0
    previous_end = -1
    for match in _WORD_TOKEN.finditer(sentence):
        token = match.group()
        adjacent = current and not sentence[previous_end : match.start()].strip()
        if _is_proper_token(token):
            if not adjacent:
                if current:
                    runs.append((start, current))
                current = []
                start = match.start()
            current.append(token)
        else:
            if current:
                runs.append((start, current))
            current = []
        previous_end = match.end()
    if current:
        runs.append((start, current))
    return runs


def _is_opening_verb(word: str) -> bool:
    lowered = word.lower()
    return lowered in _OPENING_VERBS or (len(lowered) >= 5 and lowered.endswith(("ed", "ing")))


def _extract_proper_nouns(sentence: str, seen: set[str], claims: list[Claim]) -> None:
    lead_offset = len(sentence) - len(sentence.lstrip())
    for start, words in _proper_runs(sentence):
        sentence_initial = start == lead_offset
        # A capitalized verb that opens the sentence is sentence casing, not part
        # of the name after it ("Used Go" -> "Go").
        if sentence_initial and len(words) > 1 and _is_opening_verb(words[0]):
            words = words[1:]
        # A single capitalized word at the very start of a sentence is almost
        # always just sentence casing, not a proper noun — skip unless it
        # carries an internal case/digit signal.
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
        _add_claim(Claim(text=match.group().rstrip(","), kind=KIND_FIGURE), seen, claims)


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
    A ``$`` prefix is optional on the resume side ("1.2M dollars") and a ``k``/``m``/
    ``b`` suffix also matches its spelled-out unit ("$1.2 million").
    """
    normalized = figure.replace(",", "")
    resume_normalized = resume_text.replace(",", "")
    bare = normalized.lstrip("$")
    forms = {re.escape(normalized), re.escape(bare)}
    unit = _UNIT_WORDS.get(bare[-1:].lower())
    if unit and bare[:-1][-1:].isdigit():
        forms.add(rf"{re.escape(bare[:-1])}\s*{unit}")
    for form in forms:
        if re.search(rf"(?<![\w.]){form}(?![\w])(?!\.\d)", resume_normalized, re.IGNORECASE):
            return True
    return False


def _literal_traceable(text: str, source: str) -> bool:
    """Whole-token literal match, so names the skill vocabulary does not know
    ("Go", "C++") still trace to the same text in the source."""
    flags = 0 if len(text) <= 3 else re.IGNORECASE
    return bool(re.search(rf"(?<!\w){re.escape(text)}(?!\w)", source, flags))


def claim_traceable(claim: Claim, resume_text: str) -> bool:
    """Return ``True`` when a claim can be traced back to the source resume.

    Proper-noun claims reuse :func:`keyword_present` (boundary-aware,
    case-insensitive) and also accept the same text literally; figures use
    digit-boundary matching that tolerates thousands separators. Both sides are
    NFC-normalised so composed and decomposed accents compare equal.
    """
    resume_text = unicodedata.normalize("NFC", resume_text)
    text = unicodedata.normalize("NFC", claim.text)
    if claim.kind == KIND_FIGURE:
        return _figure_traceable(text, resume_text)
    return keyword_present(text, resume_text) or _literal_traceable(text, resume_text)


def trace_claim(claim: Claim, sources: Mapping[str, str]) -> ClaimTrace:
    """Trace one claim against named sources, preserving every exact attempt."""
    return ClaimTrace(
        claim=claim,
        attempts=tuple(
            ClaimTraceAttempt(source=name, matched=claim_traceable(claim, text))
            for name, text in sources.items()
        ),
    )
