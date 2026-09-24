"""Tests for the R8 Resume/Job Match calibration check (issue #120, D-042).

Covers the acceptance criteria: running the check across the fixture corpus
produces a per-tool miss rate for Resume Analyzer and Job Match; a fixture whose
actual score is deliberately outside its band is flagged as a miss; an in-band
fixture is not flagged; and the threshold comparison logic is exercised in
isolation. Everything runs on the deterministic heuristic-only path with no live
LLM call (D-044).
"""

from __future__ import annotations

import pytest

from app.evals import (
    TOOL_JOB_MATCH,
    TOOL_RESUME_ANALYZER,
    load_fixtures,
    run_calibration,
)
from app.evals.calibration import (
    CALIBRATION_THRESHOLD,
    CalibrationReport,
    band_deviation,
    check_fixture,
    is_calibration_miss,
    job_match_score,
    resume_analyzer_score,
)
from app.evals.loader import EvalFixture

# A small synthetic resume/JD pair; content is irrelevant to the band-comparison
# tests, which pin the band relative to the score the scorers actually produce.
_RESUME = (
    "Professional Summary\n"
    "Backend engineer with 6 years building Python APIs.\n"
    "Experience\n"
    "- Led a team that reduced API latency by 40% and shipped 12 services.\n"
    "Skills\n"
    "Python, FastAPI, PostgreSQL, Docker, Kubernetes, AWS\n"
    "Education\n"
    "BSc Computer Science\n"
)
_JOB = "Senior Backend Engineer. Python, FastAPI, PostgreSQL, Docker, AWS, APIs."


def _fixture(
    band: tuple[int, int],
    *,
    job_description: str | None = _JOB,
    match_band: tuple[int, int] | None = None,
) -> EvalFixture:
    return EvalFixture(
        id="synthetic-case",
        resume_text=_RESUME,
        job_description=job_description,
        expected_score_band=band,
        notes="synthetic calibration test fixture",
        expected_match_band=match_band,
    )


# --- Threshold comparison logic (pure, no scoring) ---


@pytest.mark.parametrize(
    ("score", "band", "expected"),
    [
        (70, (60, 80), 0),  # inside
        (60, (60, 80), 0),  # on the low edge
        (80, (60, 80), 0),  # on the high edge
        (55, (60, 80), 5),  # below by 5
        (88, (60, 80), 8),  # above by 8
    ],
)
def test_band_deviation(score: int, band: tuple[int, int], expected: int) -> None:
    assert band_deviation(score, band) == expected


def test_is_calibration_miss_respects_threshold() -> None:
    band = (60, 80)
    # Exactly threshold points outside the band is tolerated, not a miss.
    assert not is_calibration_miss(80 + CALIBRATION_THRESHOLD, band)
    assert not is_calibration_miss(60 - CALIBRATION_THRESHOLD, band)
    # One point beyond the threshold is a miss on either side.
    assert is_calibration_miss(80 + CALIBRATION_THRESHOLD + 1, band)
    assert is_calibration_miss(60 - CALIBRATION_THRESHOLD - 1, band)


def test_is_calibration_miss_threshold_is_configurable() -> None:
    band = (60, 80)
    # A score 10 above the band: a miss at the default threshold (5), tolerated
    # once the threshold is widened to 10.
    assert is_calibration_miss(90, band)
    assert not is_calibration_miss(90, band, threshold=10)


# --- In-band vs. out-of-band flagging ---


def test_in_band_fixture_is_not_flagged() -> None:
    score = resume_analyzer_score(_fixture((0, 0)))
    fixture = _fixture((score - 5, score + 5))
    results = check_fixture(fixture)
    resume_result = next(r for r in results if r.tool == TOOL_RESUME_ANALYZER)
    assert resume_result.score == score
    assert resume_result.deviation == 0
    assert resume_result.is_miss is False


def test_out_of_band_fixture_is_flagged_as_miss() -> None:
    score = resume_analyzer_score(_fixture((0, 0)))
    # Pin the band far below the actual score so the deviation exceeds the
    # threshold regardless of the exact heuristic value.
    fixture = _fixture((0, max(score - 20, 0)))
    results = check_fixture(fixture)
    resume_result = next(r for r in results if r.tool == TOOL_RESUME_ANALYZER)
    assert resume_result.is_miss is True
    assert resume_result.deviation > CALIBRATION_THRESHOLD


def test_edge_of_threshold_is_not_a_miss() -> None:
    score = resume_analyzer_score(_fixture((0, 0)))
    # Band ends exactly CALIBRATION_THRESHOLD below the score: on the boundary,
    # so not a miss.
    fixture = _fixture((0, score - CALIBRATION_THRESHOLD))
    resume_result = next(
        r for r in check_fixture(fixture) if r.tool == TOOL_RESUME_ANALYZER
    )
    assert resume_result.deviation == CALIBRATION_THRESHOLD
    assert resume_result.is_miss is False


# --- Job Match applicability ---


def test_no_job_description_skips_job_match() -> None:
    fixture = _fixture((0, 100), job_description=None)
    assert job_match_score(fixture) is None
    tools = {result.tool for result in check_fixture(fixture)}
    assert tools == {TOOL_RESUME_ANALYZER}


def test_job_match_scored_when_job_description_present() -> None:
    fixture = _fixture((0, 100))
    assert job_match_score(fixture) is not None
    tools = {result.tool for result in check_fixture(fixture)}
    assert tools == {TOOL_RESUME_ANALYZER, TOOL_JOB_MATCH}


# --- Per-tool bands (#118) ---


def test_job_match_is_compared_against_its_own_band() -> None:
    """Keyword overlap and resume quality are different scales, so different bands.

    The resume band here is deliberately impossible; Job Match must ignore it and
    read ``expected_match_band`` instead, so only the resume half is flagged.
    """
    fixture = _fixture((0, 10), match_band=(0, 100))
    results = {result.tool: result for result in check_fixture(fixture)}

    job_match = results[TOOL_JOB_MATCH]
    assert job_match.expected_band == (0, 100)
    assert job_match.is_miss is False

    resume = results[TOOL_RESUME_ANALYZER]
    assert resume.expected_band == (0, 10)
    assert resume.is_miss is True


def test_job_match_band_can_flag_a_miss_the_resume_band_would_not() -> None:
    """The reverse direction: a wide resume band must not mask a match miss."""
    fixture = _fixture((0, 100), match_band=(0, 10))
    job_match = next(r for r in check_fixture(fixture) if r.tool == TOOL_JOB_MATCH)
    assert job_match.expected_band == (0, 10)
    assert job_match.is_miss is True


def test_job_match_falls_back_to_the_resume_band() -> None:
    """Fixtures that predate the split keep working off one band."""
    fixture = _fixture((0, 100))
    job_match = next(r for r in check_fixture(fixture) if r.tool == TOOL_JOB_MATCH)
    assert job_match.expected_band == (0, 100)


# --- Corpus-level per-tool miss rate ---


def test_run_calibration_reports_per_tool_miss_rate() -> None:
    report = run_calibration()
    assert isinstance(report, CalibrationReport)

    resume = report.per_tool[TOOL_RESUME_ANALYZER]
    job_match = report.per_tool[TOOL_JOB_MATCH]

    # Resume Analyzer runs on every fixture; Job Match only on JD-bearing ones.
    fixtures = load_fixtures()
    jd_fixtures = [f for f in fixtures if f.job_description is not None]
    assert resume.evaluated == len(fixtures)
    assert job_match.evaluated == len(jd_fixtures)
    assert job_match.evaluated < resume.evaluated  # corpus has no-JD cases

    for rate in (resume, job_match):
        assert 0.0 <= rate.miss_rate <= 1.0
        assert rate.misses == len(rate.missed_fixture_ids)
        assert rate.misses <= rate.evaluated
        assert rate.miss_rate == pytest.approx(rate.misses / rate.evaluated)


def test_committed_corpus_has_no_calibration_misses() -> None:
    """The corpus is the harness's green baseline on an unmodified tree (#118).

    Bands are authored on the scale each check actually measures, so a clean tree
    reports a zero miss rate. A miss appearing here means either the heuristic
    drifted or a band was authored on the wrong scale; either way it gets triaged
    in the fixture's notes, not absorbed by widening the band.
    """
    report = run_calibration()
    assert report.per_tool[TOOL_RESUME_ANALYZER].missed_fixture_ids == ()
    assert report.per_tool[TOOL_JOB_MATCH].missed_fixture_ids == ()


def test_run_calibration_is_deterministic() -> None:
    first = run_calibration()
    second = run_calibration()
    assert first.results == second.results
    assert first.per_tool == second.per_tool


def test_widening_threshold_never_increases_misses() -> None:
    strict = run_calibration(threshold=0)
    lenient = run_calibration(threshold=100)
    assert lenient.per_tool[TOOL_RESUME_ANALYZER].misses == 0
    assert lenient.per_tool[TOOL_JOB_MATCH].misses == 0
    assert (
        strict.per_tool[TOOL_RESUME_ANALYZER].misses
        >= lenient.per_tool[TOOL_RESUME_ANALYZER].misses
    )


def test_calibration_makes_no_live_llm_call(monkeypatch: pytest.MonkeyPatch) -> None:
    """The calibration path is heuristic-only and must never hit the provider."""

    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("calibration must not call the live LLM")

    # Patch the only LLM entry point the tool services use; calibration reuses
    # the scoring primitives directly and must not reach it.
    monkeypatch.setattr("app.services.ai_client.complete_structured", _boom)
    report = run_calibration()
    assert report.per_tool[TOOL_RESUME_ANALYZER].evaluated > 0
