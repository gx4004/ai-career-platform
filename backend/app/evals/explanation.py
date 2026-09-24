"""R8 explanation-consistency check for the two heuristic-scored tools.

Resume Analyzer and Job Match are split-brain by design: a deterministic
heuristic owns the *numbers* (``score_breakdown``, ``match_score``,
``matched_keywords``/``missing_keywords``) while the LLM writes the *narrative*
around them. Nothing forces the two halves to agree — ``_normalize_issues`` in
:mod:`app.services.resume_analyzer` accepts whatever ``severity`` the model
supplies for an issue without checking it against that issue's category
subscore, and ``_normalize_requirements`` in :mod:`app.services.job_matcher`
accepts whatever ``status`` the model supplies without checking it against the
prepass keywords that produced the match score. A prompt regression that starts
narrating "you already cover Docker" over a heuristic that reports Docker as
missing would therefore ship undetected, exactly like the split verdict
``job_matcher`` already hard-locks against (see the comment above its return
statement).

This module is the deterministic measurement of that risk (D-121). Given a
fixture and that tool's *response mapping*, it re-derives the numbers from the
same production primitives the tool used (:func:`quality_signals.severity_from_score`,
:func:`quality_signals.job_match_verdict`, :func:`quality_signals.keyword_present`
over :func:`quality_signals.build_resume_prepass`) and flags every place the
rendered explanation contradicts them. It counts *contradictions with the
response's own numbers*, not disagreements with an outside notion of quality —
there is no LLM judge here (D-043's judge covers usefulness, not consistency).

Kinds flagged:

- ``severity-band`` — an issue's ``severity`` is not the band its own category
  subscore falls in.
- ``unreported-weakest-dimension`` — the lowest-scoring dimension is in the
  "high" band, yet no issue names that category.
- ``contradicted-requirement`` — a requirement is called "matched" while its
  text names a keyword the prepass reports missing (or vice versa).
- ``contradicted-tailoring`` — a tailoring action tells the user to add a
  keyword the prepass already reports as matched (and reports as missing under
  no reading).
- ``verdict-band`` — ``summary.verdict`` or the top-level ``verdict`` is not
  :func:`quality_signals.job_match_verdict` of the reported ``match_score``.

Like the fabrication check, this is deliberately cheap and auditable rather than
exhaustive, it is fully deterministic, and it makes **no** live LLM call
(D-044): the tool outputs are supplied to :func:`run_explanation_check` by the
caller (the CLI runner, or a test's canned mappings), never produced here.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.evals.calibration import TOOL_JOB_MATCH, TOOL_RESUME_ANALYZER
from app.evals.loader import EvalFixture, load_fixtures
from app.services.quality_signals import (
    ResumePrepass,
    build_resume_prepass,
    job_match_verdict,
    keyword_present,
    severity_from_score,
)

#: The two heuristic-scored tools this check covers, in tool-order. The ids are
#: imported from :mod:`app.evals.calibration` rather than restated so the two
#: scoring-tool checks can never drift onto different keys.
SCORING_TOOLS: tuple[str, ...] = (TOOL_RESUME_ANALYZER, TOOL_JOB_MATCH)

#: Inconsistency kinds produced by this check.
KIND_SEVERITY_BAND = "severity-band"
KIND_UNREPORTED_WEAKEST_DIMENSION = "unreported-weakest-dimension"
KIND_CONTRADICTED_REQUIREMENT = "contradicted-requirement"
KIND_CONTRADICTED_TAILORING = "contradicted-tailoring"
KIND_VERDICT_BAND = "verdict-band"

#: Severity band that makes an unreported dimension worth flagging: a merely
#: "medium" weakest dimension is a judgement call, a "high" one is the headline
#: number the explanation is expected to account for.
_WEAKEST_DIMENSION_BAND = "high"


@dataclass(frozen=True)
class Inconsistency:
    """One place a tool's rendered explanation contradicts its own numbers.

    Attributes:
        fixture_id: Fixture whose output was checked.
        tool: One of :data:`SCORING_TOOLS`.
        kind: One of the ``KIND_*`` constants.
        detail: Human-readable statement of the contradiction, naming both the
            rendered claim and the number it disagrees with.
    """

    fixture_id: str
    tool: str
    kind: str
    detail: str


@dataclass(frozen=True)
class ExplanationResult:
    """One tool's explanation-consistency outcome for one fixture's output."""

    tool: str
    fixture_id: str
    inconsistencies: tuple[Inconsistency, ...]

    @property
    def inconsistency_count(self) -> int:
        return len(self.inconsistencies)


@dataclass(frozen=True)
class ToolExplanationCount:
    """A tool's inconsistency tally across the outputs it was checked on."""

    tool: str
    evaluated: int
    inconsistency_count: int
    flagged_fixture_ids: tuple[str, ...]

    @property
    def inconsistency_rate(self) -> float:
        """Fraction of scored outputs carrying at least one contradiction (0..1).

        Deliberately *fixtures flagged* over *fixtures scored*, matching the
        calibration miss rate's shape; ``inconsistency_count`` is the raw
        finding tally and can exceed ``evaluated``.
        """
        if self.evaluated == 0:
            return 0.0
        return len(self.flagged_fixture_ids) / self.evaluated


@dataclass(frozen=True)
class ExplanationReport:
    """A full run: per-output results plus per-tool inconsistency counts."""

    results: tuple[ExplanationResult, ...]
    per_tool: dict[str, ToolExplanationCount]


# --- Shared reading helpers -------------------------------------------------


def _mappings(value: object) -> list[Mapping[str, object]]:
    """Return the mapping items of a list-shaped result field, ignoring junk."""
    if not isinstance(value, (list, tuple)):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _text(item: Mapping[str, object], key: str) -> str:
    value = item.get(key)
    return value.strip() if isinstance(value, str) else ""


def _score(value: object) -> int | None:
    # bool is a subclass of int; a True score is malformed, not a 1.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value)


# --- Resume Analyzer --------------------------------------------------------


def _subscores(result: Mapping[str, object]) -> dict[str, int]:
    """Return ``{dimension key: score}`` from a resume result's breakdown."""
    subscores: dict[str, int] = {}
    for item in _mappings(result.get("score_breakdown")):
        key = _text(item, "key")
        score = _score(item.get("score"))
        if key and score is not None and key not in subscores:
            subscores[key] = score
    return subscores


def _weakest_dimension(subscores: dict[str, int]) -> str | None:
    """Return the lowest-scoring dimension key, ties broken by breakdown order."""
    if not subscores:
        return None
    return min(subscores, key=lambda key: subscores[key])


def check_resume_output(
    fixture: EvalFixture,
    result: Mapping[str, object],
) -> tuple[Inconsistency, ...]:
    """Flag Resume Analyzer explanations that contradict the same response's scores.

    Args:
        fixture: The fixture the output was produced for (identity only; the
            resume scores being checked are the ones inside ``result``).
        result: The tool's response mapping, as returned by
            ``app.services.resume_analyzer.analyze_resume``.
    """
    found: list[Inconsistency] = []
    subscores = _subscores(result)
    issues = _mappings(result.get("issues"))

    def flag(kind: str, detail: str) -> None:
        found.append(
            Inconsistency(
                fixture_id=fixture.id,
                tool=TOOL_RESUME_ANALYZER,
                kind=kind,
                detail=detail,
            )
        )

    for index, issue in enumerate(issues):
        category = _text(issue, "category")
        severity = _text(issue, "severity")
        subscore = subscores.get(category)
        # An issue naming no scored dimension, or carrying no severity, is a
        # schema problem the normalizers already guard; it is not a
        # *contradiction* between the narrative and a number, so skip it.
        if not category or not severity or subscore is None:
            continue
        expected = severity_from_score(subscore)
        if severity != expected:
            issue_id = _text(issue, "id") or f"issue #{index + 1}"
            flag(
                KIND_SEVERITY_BAND,
                f"issue {issue_id!r} is rendered as {severity!r} severity, but its "
                f"{category!r} subscore of {subscore} is in the {expected!r} band",
            )

    weakest = _weakest_dimension(subscores)
    if weakest is not None:
        weakest_score = subscores[weakest]
        named = {_text(issue, "category") for issue in issues}
        if (
            severity_from_score(weakest_score) == _WEAKEST_DIMENSION_BAND
            and weakest not in named
        ):
            flag(
                KIND_UNREPORTED_WEAKEST_DIMENSION,
                f"{weakest!r} is the weakest dimension at {weakest_score} "
                f"({_WEAKEST_DIMENSION_BAND} band), but no issue names that category",
            )

    return tuple(found)


# --- Job Match --------------------------------------------------------------


def _keyword_hits(text: str, keywords: list[str]) -> list[str]:
    """Return the prepass keywords the given rendered text names.

    Uses :func:`quality_signals.keyword_present` — the same boundary-aware
    matcher that built ``matched_keywords``/``missing_keywords`` in the first
    place — so this check can never disagree with the prepass by using a
    different notion of "mentions".
    """
    return [keyword for keyword in keywords if keyword_present(keyword, text)]


def _check_requirements(
    fixture: EvalFixture,
    result: Mapping[str, object],
    prepass: ResumePrepass,
) -> list[Inconsistency]:
    found: list[Inconsistency] = []
    for requirement in _mappings(result.get("requirements")):
        text = _text(requirement, "requirement")
        status = _text(requirement, "status")
        # "partial" is the honest middle ground between the two keyword lists
        # and is never a contradiction.
        if not text or status not in {"matched", "missing"}:
            continue
        matched_hits = _keyword_hits(text, prepass.matched_keywords)
        missing_hits = _keyword_hits(text, prepass.missing_keywords)
        # A requirement naming keywords from both lists is genuinely ambiguous;
        # only an unambiguous contradiction is flagged.
        if status == "matched" and missing_hits and not matched_hits:
            contradicted = ", ".join(missing_hits)
            detail = (
                f"requirement {text!r} is rendered as 'matched', but the prepass "
                f"reports {contradicted} as missing"
            )
        elif status == "missing" and matched_hits and not missing_hits:
            contradicted = ", ".join(matched_hits)
            detail = (
                f"requirement {text!r} is rendered as 'missing', but the prepass "
                f"reports {contradicted} as matched"
            )
        else:
            continue
        found.append(
            Inconsistency(
                fixture_id=fixture.id,
                tool=TOOL_JOB_MATCH,
                kind=KIND_CONTRADICTED_REQUIREMENT,
                detail=detail,
            )
        )
    return found


def _check_tailoring_actions(
    fixture: EvalFixture,
    result: Mapping[str, object],
    prepass: ResumePrepass,
) -> list[Inconsistency]:
    found: list[Inconsistency] = []
    for action in _mappings(result.get("tailoring_actions")):
        keyword = _text(action, "keyword")
        if not keyword:
            continue
        already_matched = _keyword_hits(keyword, prepass.matched_keywords)
        # Same unambiguity rule as the requirement check: a multi-word keyword
        # can contain a shorter matched one ("Design Systems" contains the
        # matched "Design"), and asking for the longer phrase is not a
        # contradiction while the prepass still reports it missing.
        if not already_matched or _keyword_hits(keyword, prepass.missing_keywords):
            continue
        found.append(
            Inconsistency(
                fixture_id=fixture.id,
                tool=TOOL_JOB_MATCH,
                kind=KIND_CONTRADICTED_TAILORING,
                detail=(
                    f"tailoring action asks the user to add {keyword!r} in the "
                    f"{_text(action, 'section') or 'resume'} section, but the prepass "
                    f"already reports {', '.join(already_matched)} as matched"
                ),
            )
        )
    return found


def _check_verdict(
    fixture: EvalFixture,
    result: Mapping[str, object],
) -> list[Inconsistency]:
    """Flag a verdict that is not the band of the response's own match score.

    Production currently hard-locks both verdict fields to the heuristic verdict
    (``app/services/job_matcher.py``, the comment above ``match_job``'s return);
    this check exists so a regression that unlocks either field is measured
    rather than silently rendered.
    """
    match_score = _score(result.get("match_score"))
    if match_score is None:
        return []
    expected = job_match_verdict(match_score)

    summary = result.get("summary")
    rendered: list[tuple[str, str]] = []
    if isinstance(summary, Mapping):
        summary_verdict = _text(summary, "verdict")
        if summary_verdict:
            rendered.append(("summary.verdict", summary_verdict))
    top_level = _text(result, "verdict")
    if top_level:
        rendered.append(("verdict", top_level))

    return [
        Inconsistency(
            fixture_id=fixture.id,
            tool=TOOL_JOB_MATCH,
            kind=KIND_VERDICT_BAND,
            detail=(
                f"{field} is rendered as {value!r}, but a match score of "
                f"{match_score} is a {expected!r} verdict"
            ),
        )
        for field, value in rendered
        if value != expected
    ]


def check_job_match_output(
    fixture: EvalFixture,
    result: Mapping[str, object],
) -> tuple[Inconsistency, ...]:
    """Flag Job Match explanations that contradict the same response's numbers.

    Args:
        fixture: The fixture the output was produced for; its
            ``resume_text``/``job_description`` rebuild the prepass whose
            matched/missing keyword split the requirements and tailoring actions
            are checked against.
        result: The tool's response mapping, as returned by
            ``app.services.job_matcher.match_job``.
    """
    prepass = build_resume_prepass(fixture.resume_text, fixture.job_description)
    return tuple(
        [
            *_check_requirements(fixture, result, prepass),
            *_check_tailoring_actions(fixture, result, prepass),
            *_check_verdict(fixture, result),
        ]
    )


# --- Orchestration ----------------------------------------------------------


def check_output(
    tool: str,
    fixture: EvalFixture,
    result: Mapping[str, object],
) -> ExplanationResult:
    """Check one scoring-tool output against the numbers it reports itself.

    Args:
        tool: One of :data:`SCORING_TOOLS`.
        fixture: The fixture the output was produced for.
        result: The tool's response mapping (canned in tests; produced by the
            CLI runner in real use — never generated here).

    Returns:
        An :class:`ExplanationResult` listing every contradiction found.

    Raises:
        ValueError: If ``tool`` is not a scoring tool.
    """
    if tool == TOOL_RESUME_ANALYZER:
        inconsistencies = check_resume_output(fixture, result)
    elif tool == TOOL_JOB_MATCH:
        inconsistencies = check_job_match_output(fixture, result)
    else:
        raise ValueError(f"{tool!r} is not a scoring tool: {', '.join(SCORING_TOOLS)}")
    return ExplanationResult(
        tool=tool, fixture_id=fixture.id, inconsistencies=inconsistencies
    )


def _tool_count(tool: str, results: list[ExplanationResult]) -> ToolExplanationCount:
    tool_results = [result for result in results if result.tool == tool]
    flagged = tuple(
        result.fixture_id for result in tool_results if result.inconsistency_count > 0
    )
    return ToolExplanationCount(
        tool=tool,
        evaluated=len(tool_results),
        inconsistency_count=sum(result.inconsistency_count for result in tool_results),
        flagged_fixture_ids=flagged,
    )


def run_explanation_check(
    outputs: Mapping[str, Mapping[str, Mapping[str, object]]],
    fixtures: list[EvalFixture] | None = None,
) -> ExplanationReport:
    """Run the explanation-consistency check for both scoring tools.

    Args:
        outputs: ``{tool_id: {fixture_id: result_mapping}}`` — the same
            caller-supplied shape :func:`app.evals.fabrication.run_fabrication_check`
            takes, except the leaf is the tool's full response mapping rather
            than flattened text, because the check compares rendered fields
            against sibling numeric fields. Tool ids must be in
            :data:`SCORING_TOOLS`; fixture ids must exist in the corpus.
        fixtures: Corpus the outputs were produced from; defaults to the
            committed synthetic fixtures (D-041).

    Returns:
        An :class:`ExplanationReport` with a per-output result list and a
        per-tool count for both scoring tools (zero when no output was supplied
        for one).

    Raises:
        ValueError: If ``outputs`` names a tool outside :data:`SCORING_TOOLS` or
            a fixture id absent from the corpus.
    """
    corpus = load_fixtures() if fixtures is None else fixtures
    fixtures_by_id = {fixture.id: fixture for fixture in corpus}

    unknown_tools = [tool for tool in outputs if tool not in SCORING_TOOLS]
    if unknown_tools:
        raise ValueError(
            f"outputs reference non-scoring tool(s): {', '.join(sorted(unknown_tools))}"
        )

    results: list[ExplanationResult] = []
    for tool in SCORING_TOOLS:
        for fixture_id, result in outputs.get(tool, {}).items():
            fixture = fixtures_by_id.get(fixture_id)
            if fixture is None:
                raise ValueError(
                    f"output for tool {tool!r} references unknown fixture id {fixture_id!r}"
                )
            results.append(check_output(tool, fixture, result))

    per_tool = {tool: _tool_count(tool, results) for tool in SCORING_TOOLS}
    return ExplanationReport(results=tuple(results), per_tool=per_tool)
