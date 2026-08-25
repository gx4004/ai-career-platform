"""R8 calibration check for the Resume Analyzer and Job Match heuristic scorers.

For each synthetic fixture (:class:`app.evals.loader.EvalFixture`), this runs the
deterministic heuristic scorers from :mod:`app.services.quality_signals` against
the fixture's ``resume_text``/``job_description``, compares the actual score to
the fixture's expected band, and flags a "calibration miss" when the actual score
falls outside the band by more than :data:`CALIBRATION_THRESHOLD` points. It
reports a per-tool miss rate across the fixture corpus for the Resume Analyzer
and Job Match tools (D-042).

The two tools are measured on two different scales, so each has its own band
(#118). Resume Analyzer is the mean of the five heuristic dimensions, every one
of which has a generous floor, so a complete resume lands in the 70s-90s;
``expected_score_band`` is authored on that scale. Job Match is pure keyword
overlap with the JD (25 at zero overlap, 100 at full), so a resume that echoes a
JD's vocabulary scores near the top regardless of its quality;
``expected_match_band`` is authored on *that* scale. Reusing one band for both is
what shipped the harness red with untriaged misses.

This path is deterministic and heuristic-only: it makes no live LLM call (D-044),
so the whole check is unit-testable in isolation. The Resume Analyzer score is
routed through :func:`compute_blended_score` with no LLM breakdown, exercising the
same "blended score" entry point production uses (which returns the heuristic
breakdown unchanged when there is no LLM half) — note this means the score is the
heuristic overall, not the 40/60 blend production reports when an LLM half exists.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.evals.loader import EvalFixture, load_fixtures
from app.services.quality_signals import (
    build_resume_prepass,
    compute_blended_score,
    compute_match_score,
    compute_overall_score,
    compute_resume_breakdown,
)

#: Tool identifiers used when reporting per-tool miss rates.
TOOL_RESUME_ANALYZER = "resume-analyzer"
TOOL_JOB_MATCH = "job-match"

#: Points an actual score may fall outside its expected band before the fixture
#: is flagged as a calibration miss (D-042's "fixed threshold"). Fixture bands
#: are 14 points wide on the resume scale and 16 on the match scale; this
#: tolerance absorbs minor heuristic drift at the band edges without hiding a
#: real regression.
CALIBRATION_THRESHOLD = 5


def resume_analyzer_score(fixture: EvalFixture) -> int:
    """Return the Resume Analyzer heuristic overall score for a fixture (0..100).

    Mirrors the heuristic-only path in :mod:`app.services.resume_analyzer`: build
    the prepass, compute the resume breakdown, blend with no LLM breakdown (a
    no-op that returns the heuristic breakdown), then take the overall score.
    Compare against ``expected_score_band``, which is authored on this scale.
    """
    prepass = build_resume_prepass(fixture.resume_text, fixture.job_description)
    breakdown = compute_resume_breakdown(prepass)
    blended = compute_blended_score(breakdown, None)
    return compute_overall_score(blended)


def job_match_score(fixture: EvalFixture) -> int | None:
    """Return the Job Match heuristic score for a fixture, or ``None`` if N/A.

    This is keyword overlap with the JD, not resume quality: compare it against
    ``expected_match_band``, never against ``expected_score_band``.

    Job Match requires a job description, so no-JD fixtures are not scored and are
    excluded from the Job Match miss rate rather than scored against a
    meaningless default.
    """
    if fixture.job_description is None:
        return None
    prepass = build_resume_prepass(fixture.resume_text, fixture.job_description)
    return compute_match_score(prepass.matched_keywords, prepass.missing_keywords)


def band_deviation(score: int, band: tuple[int, int]) -> int:
    """Return how many points ``score`` falls outside the inclusive ``band``.

    Zero when the score is within (or on the edge of) the band.
    """
    low, high = band
    if score < low:
        return low - score
    if score > high:
        return score - high
    return 0


def is_calibration_miss(
    score: int,
    band: tuple[int, int],
    threshold: int = CALIBRATION_THRESHOLD,
) -> bool:
    """Return ``True`` when ``score`` falls outside ``band`` by more than ``threshold``."""
    return band_deviation(score, band) > threshold


@dataclass(frozen=True)
class CalibrationResult:
    """One tool's calibration outcome for one fixture."""

    tool: str
    fixture_id: str
    score: int
    expected_band: tuple[int, int]
    deviation: int
    is_miss: bool


@dataclass(frozen=True)
class ToolMissRate:
    """A tool's calibration miss rate across the fixtures it was evaluated on."""

    tool: str
    evaluated: int
    misses: int
    missed_fixture_ids: tuple[str, ...]

    @property
    def miss_rate(self) -> float:
        """Fraction of evaluated fixtures flagged as a calibration miss (0..1)."""
        if self.evaluated == 0:
            return 0.0
        return self.misses / self.evaluated


@dataclass(frozen=True)
class CalibrationReport:
    """A full calibration run: per-fixture results plus per-tool miss rates."""

    results: tuple[CalibrationResult, ...]
    per_tool: dict[str, ToolMissRate]


def _result_for(
    tool: str,
    fixture: EvalFixture,
    score: int,
    band: tuple[int, int],
    threshold: int,
) -> CalibrationResult:
    return CalibrationResult(
        tool=tool,
        fixture_id=fixture.id,
        score=score,
        expected_band=band,
        deviation=band_deviation(score, band),
        is_miss=is_calibration_miss(score, band, threshold),
    )


def check_fixture(
    fixture: EvalFixture,
    threshold: int = CALIBRATION_THRESHOLD,
) -> list[CalibrationResult]:
    """Return the calibration result for every applicable tool on one fixture.

    Always includes a Resume Analyzer result; includes a Job Match result only
    when the fixture has a job description. Each tool is compared against its own
    band, since the two scores are on different scales (#118).
    """
    results = [
        _result_for(
            TOOL_RESUME_ANALYZER,
            fixture,
            resume_analyzer_score(fixture),
            fixture.expected_score_band,
            threshold,
        )
    ]
    match = job_match_score(fixture)
    if match is not None:
        results.append(
            _result_for(
                TOOL_JOB_MATCH,
                fixture,
                match,
                fixture.expected_match_band,
                threshold,
            )
        )
    return results


def _miss_rate(tool: str, results: list[CalibrationResult]) -> ToolMissRate:
    tool_results = [result for result in results if result.tool == tool]
    missed = tuple(result.fixture_id for result in tool_results if result.is_miss)
    return ToolMissRate(
        tool=tool,
        evaluated=len(tool_results),
        misses=len(missed),
        missed_fixture_ids=missed,
    )


def run_calibration(
    fixtures: list[EvalFixture] | None = None,
    threshold: int = CALIBRATION_THRESHOLD,
) -> CalibrationReport:
    """Run the calibration check across the fixture corpus.

    Args:
        fixtures: Fixtures to check; defaults to the committed synthetic corpus.
        threshold: Points a score may fall outside its band before it counts as a
            miss (D-042's fixed threshold).

    Returns:
        A :class:`CalibrationReport` holding a per-fixture, per-tool result list
        and a per-tool miss rate for Resume Analyzer and Job Match.
    """
    corpus = load_fixtures() if fixtures is None else fixtures
    results: list[CalibrationResult] = []
    for fixture in corpus:
        results.extend(check_fixture(fixture, threshold))
    per_tool = {
        TOOL_RESUME_ANALYZER: _miss_rate(TOOL_RESUME_ANALYZER, results),
        TOOL_JOB_MATCH: _miss_rate(TOOL_JOB_MATCH, results),
    }
    return CalibrationReport(results=tuple(results), per_tool=per_tool)
