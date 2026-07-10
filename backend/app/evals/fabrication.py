"""R8 fabrication-candidate check for the four generative tools.

The generative tools (Cover Letter, Interview Q&A, Career Path, Portfolio
Planner) have no heuristic score, so a prompt regression that starts inventing
an employer, product, or metric absent from the user's resume would ship
undetected. This module is the deterministic first-pass groundedness signal for
that risk (D-043): given a fixture and that tool's generated output, it extracts
candidate claims (proper nouns / employer-shaped tokens and quantified
figures/metrics) from the output and traces each back to the fixture's source
``resume_text`` using :func:`app.services.quality_signals.keyword_present`-style
matching. Claims that cannot be traced are flagged as *fabrication candidates*
and counted per tool across the fixture set.

This is a directional heuristic, not exact NLP entailment: it is intentionally
cheap and auditable and will have false positives (D-043). It is fully
deterministic and makes **no** live LLM call (D-044) — the generated outputs are
supplied to :func:`run_fabrication_check` by the caller (the CLI runner, or a
test's canned strings), never produced here.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

from app.evals.loader import EvalFixture, load_fixtures
from app.services.quality_signals import keyword_present

#: Tool identifiers, matching the ``tool_name`` values the routers persist.
TOOL_COVER_LETTER = "cover-letter"
TOOL_INTERVIEW_QA = "interview"
TOOL_CAREER_PATH = "career"
TOOL_PORTFOLIO_PLANNER = "portfolio"

#: The four generative tools this check covers, in tool-order.
GENERATIVE_TOOLS: tuple[str, ...] = (
    TOOL_CAREER_PATH,
    TOOL_COVER_LETTER,
    TOOL_INTERVIEW_QA,
    TOOL_PORTFOLIO_PLANNER,
)

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
        "a", "an", "and", "as", "at", "but", "by", "dear", "during", "for",
        "from", "hi", "hello", "here", "i", "in", "it", "my", "of", "on", "or",
        "our", "please", "regards", "she", "sincerely", "thank", "thanks",
        "that", "the", "their", "them", "these", "they", "this", "those", "to",
        "we", "with", "you", "your",
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
        if (
            sentence_initial
            and len(words) == 1
            and not _has_internal_signal(words[0])
        ):
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
    """Return ``True`` when a numeric figure appears in the resume text.

    Commas are stripped from both sides so ``4,500`` matches ``4500``; digit
    boundaries prevent ``12`` from matching inside ``120``.
    """
    normalized = figure.replace(",", "")
    resume_normalized = resume_text.replace(",", "")
    pattern = rf"(?<![\w.]){re.escape(normalized)}(?![\w])"
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


def find_fabrication_candidates(output_text: str, resume_text: str) -> list[Claim]:
    """Return the claims in ``output_text`` not traceable to ``resume_text``."""
    return [
        claim
        for claim in extract_claims(output_text)
        if not claim_traceable(claim, resume_text)
    ]


@dataclass(frozen=True)
class FabricationResult:
    """One tool's fabrication outcome for one fixture's generated output."""

    tool: str
    fixture_id: str
    total_claims: int
    candidates: tuple[Claim, ...]

    @property
    def candidate_count(self) -> int:
        return len(self.candidates)


@dataclass(frozen=True)
class ToolFabricationCount:
    """A tool's fabrication-candidate tally across the outputs it was checked on."""

    tool: str
    evaluated: int
    candidate_count: int
    flagged_fixture_ids: tuple[str, ...]


@dataclass(frozen=True)
class FabricationReport:
    """A full fabrication run: per-output results plus per-tool candidate counts."""

    results: tuple[FabricationResult, ...]
    per_tool: dict[str, ToolFabricationCount]


def check_output(tool: str, fixture: EvalFixture, output_text: str) -> FabricationResult:
    """Check one generated output against one fixture's source resume.

    Args:
        tool: One of :data:`GENERATIVE_TOOLS`.
        fixture: The fixture whose ``resume_text`` is the ground truth.
        output_text: The tool's generated output (canned in tests; produced by
            the CLI runner in real use — never generated here).

    Returns:
        A :class:`FabricationResult` with every untraceable claim flagged.
    """
    claims = extract_claims(output_text)
    candidates = tuple(
        claim for claim in claims if not claim_traceable(claim, fixture.resume_text)
    )
    return FabricationResult(
        tool=tool,
        fixture_id=fixture.id,
        total_claims=len(claims),
        candidates=candidates,
    )


def _tool_count(tool: str, results: list[FabricationResult]) -> ToolFabricationCount:
    tool_results = [result for result in results if result.tool == tool]
    flagged = tuple(
        result.fixture_id for result in tool_results if result.candidate_count > 0
    )
    return ToolFabricationCount(
        tool=tool,
        evaluated=len(tool_results),
        candidate_count=sum(result.candidate_count for result in tool_results),
        flagged_fixture_ids=flagged,
    )


def run_fabrication_check(
    outputs: Mapping[str, Mapping[str, str]],
    fixtures: list[EvalFixture] | None = None,
) -> FabricationReport:
    """Run the fabrication-candidate check for all four generative tools.

    Args:
        outputs: ``{tool_id: {fixture_id: generated_output_text}}``. Tool ids
            must be in :data:`GENERATIVE_TOOLS`; fixture ids must exist in the
            corpus. Supplied by the caller so this stays LLM-free (D-044).
        fixtures: Corpus to trace claims against; defaults to the committed
            synthetic fixtures (D-041).

    Returns:
        A :class:`FabricationReport` with a per-output result list and a per-tool
        candidate count for every generative tool (zero when no output was
        supplied for it).

    Raises:
        ValueError: If ``outputs`` names a tool outside :data:`GENERATIVE_TOOLS`
            or a fixture id absent from the corpus.
    """
    corpus = load_fixtures() if fixtures is None else fixtures
    fixtures_by_id = {fixture.id: fixture for fixture in corpus}

    unknown_tools = [tool for tool in outputs if tool not in GENERATIVE_TOOLS]
    if unknown_tools:
        raise ValueError(
            f"outputs reference non-generative tool(s): {', '.join(sorted(unknown_tools))}"
        )

    results: list[FabricationResult] = []
    for tool in GENERATIVE_TOOLS:
        for fixture_id, output_text in outputs.get(tool, {}).items():
            fixture = fixtures_by_id.get(fixture_id)
            if fixture is None:
                raise ValueError(
                    f"output for tool {tool!r} references unknown fixture id "
                    f"{fixture_id!r}"
                )
            results.append(check_output(tool, fixture, output_text))

    per_tool = {tool: _tool_count(tool, results) for tool in GENERATIVE_TOOLS}
    return FabricationReport(results=tuple(results), per_tool=per_tool)
