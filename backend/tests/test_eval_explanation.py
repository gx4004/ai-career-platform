"""Tests for the R8 scoring-tool explanation-consistency check (D-121).

Covers every inconsistency kind twice — once with an explanation that agrees
with the numbers in the same response (no finding) and once with an explanation
that contradicts them (exactly one finding of that kind) — plus the orchestrator
contract. Every case uses canned response mappings, the same technique the
fabrication tests use; no live LLM call is made (D-044).
"""

from __future__ import annotations

import pytest

from app.evals.explanation import (
    KIND_CONTRADICTED_REQUIREMENT,
    KIND_CONTRADICTED_TAILORING,
    KIND_SEVERITY_BAND,
    KIND_UNREPORTED_WEAKEST_DIMENSION,
    KIND_VERDICT_BAND,
    SCORING_TOOLS,
    TOOL_JOB_MATCH,
    TOOL_RESUME_ANALYZER,
    ExplanationReport,
    check_job_match_output,
    check_output,
    check_resume_output,
    run_explanation_check,
)
from app.evals.loader import EvalFixture
from app.services.quality_signals import build_resume_prepass, severity_from_score

# A synthetic resume/JD pair whose keyword split is known and asserted below, so
# the "matched" / "missing" expectations are exact rather than assumed.
_RESUME = (
    "Robin Alcott\n"
    "Backend Engineer\n"
    "Experience\n"
    "- Built Python services and shipped REST APIs for 3 teams.\n"
    "Skills\n"
    "Python, FastAPI, PostgreSQL\n"
)
_JOB_DESCRIPTION = (
    "Backend Engineer\n"
    "You will build Python services and own deployment.\n"
    "Required: Python, Kubernetes.\n"
)


def _fixture(fixture_id: str = "synthetic-case") -> EvalFixture:
    return EvalFixture(
        id=fixture_id,
        resume_text=_RESUME,
        job_description=_JOB_DESCRIPTION,
        expected_score_band=(0, 100),
        notes="synthetic explanation-consistency test fixture",
    )


def _kinds(inconsistencies) -> list[str]:
    return [item.kind for item in inconsistencies]


def test_fixture_keyword_split_is_what_the_job_match_cases_assume() -> None:
    """Guardrail: the canned Job Match cases below depend on this exact split."""
    prepass = build_resume_prepass(_RESUME, _JOB_DESCRIPTION)
    assert "Python" in prepass.matched_keywords
    assert "Kubernetes" in prepass.missing_keywords


# --- Resume Analyzer: severity-band -----------------------------------------


def _resume_result(issues: list[dict], breakdown: list[dict] | None = None) -> dict:
    """A Resume Analyzer response whose breakdown spans all three bands."""
    return {
        "overall_score": 70,
        "score_breakdown": breakdown
        or [
            {"key": "keywords", "label": "Keyword alignment", "score": 40},
            {"key": "impact", "label": "Impact evidence", "score": 60},
            {"key": "structure", "label": "Structure", "score": 80},
            {"key": "clarity", "label": "Clarity", "score": 85},
            {"key": "completeness", "label": "Completeness", "score": 88},
        ],
        "issues": issues,
    }


def test_severity_matching_its_own_subscore_band_is_consistent() -> None:
    # 40 -> "high", 60 -> "medium", 80 -> "low": each issue agrees with the
    # band of the dimension it names.
    assert severity_from_score(40) == "high"
    assert severity_from_score(60) == "medium"
    assert severity_from_score(80) == "low"
    result = _resume_result(
        [
            {"id": "kw", "category": "keywords", "severity": "high"},
            {"id": "im", "category": "impact", "severity": "medium"},
            {"id": "st", "category": "structure", "severity": "low"},
        ]
    )

    assert check_resume_output(_fixture(), result) == ()


def test_severity_contradicting_its_own_subscore_band_is_flagged() -> None:
    # "keywords" scores 40 (high band) but the issue is rendered as "low".
    result = _resume_result(
        [
            {"id": "kw", "category": "keywords", "severity": "low"},
            {"id": "im", "category": "impact", "severity": "medium"},
            {"id": "st", "category": "structure", "severity": "low"},
        ]
    )

    found = check_resume_output(_fixture(), result)

    assert _kinds(found) == [KIND_SEVERITY_BAND]
    assert found[0].tool == TOOL_RESUME_ANALYZER
    assert found[0].fixture_id == "synthetic-case"
    assert "'kw'" in found[0].detail
    assert "40" in found[0].detail


# --- Resume Analyzer: unreported-weakest-dimension --------------------------


def test_weakest_high_band_dimension_named_by_an_issue_is_consistent() -> None:
    result = _resume_result(
        [{"id": "kw", "category": "keywords", "severity": "high"}]
    )

    assert check_resume_output(_fixture(), result) == ()


def test_weakest_high_band_dimension_no_issue_names_is_flagged() -> None:
    # "keywords" is the weakest dimension at 40 (high band), yet the only issue
    # talks about "impact".
    result = _resume_result(
        [{"id": "im", "category": "impact", "severity": "medium"}]
    )

    found = check_resume_output(_fixture(), result)

    assert _kinds(found) == [KIND_UNREPORTED_WEAKEST_DIMENSION]
    assert "'keywords'" in found[0].detail


def test_weakest_dimension_outside_the_high_band_is_not_flagged() -> None:
    # Weakest dimension is 60 -> "medium": an unnamed medium dimension is a
    # judgement call, not a contradiction.
    result = _resume_result(
        [{"id": "st", "category": "structure", "severity": "low"}],
        breakdown=[
            {"key": "keywords", "label": "Keyword alignment", "score": 60},
            {"key": "structure", "label": "Structure", "score": 80},
        ],
    )

    assert check_resume_output(_fixture(), result) == ()


# --- Job Match: contradicted-requirement ------------------------------------


def _job_match_result(
    *,
    requirements: list[dict] | None = None,
    tailoring_actions: list[dict] | None = None,
    match_score: int = 62,
    verdict: str = "borderline",
    summary_verdict: str | None = None,
) -> dict:
    return {
        "match_score": match_score,
        "verdict": verdict,
        "summary": {
            "headline": "The foundation is there.",
            "verdict": summary_verdict if summary_verdict is not None else verdict,
        },
        "requirements": requirements or [],
        "tailoring_actions": tailoring_actions or [],
    }


def test_requirement_status_agreeing_with_the_prepass_is_consistent() -> None:
    result = _job_match_result(
        requirements=[
            {"requirement": "Python", "status": "matched", "importance": "must"},
            {"requirement": "Kubernetes", "status": "missing", "importance": "must"},
        ]
    )

    assert check_job_match_output(_fixture(), result) == ()


def test_requirement_called_matched_while_the_prepass_reports_missing_is_flagged() -> None:
    result = _job_match_result(
        requirements=[
            {"requirement": "Python", "status": "matched", "importance": "must"},
            {"requirement": "Kubernetes", "status": "matched", "importance": "must"},
        ]
    )

    found = check_job_match_output(_fixture(), result)

    assert _kinds(found) == [KIND_CONTRADICTED_REQUIREMENT]
    assert found[0].tool == TOOL_JOB_MATCH
    assert "Kubernetes" in found[0].detail


def test_requirement_called_missing_while_the_prepass_reports_matched_is_flagged() -> None:
    result = _job_match_result(
        requirements=[
            {"requirement": "Python", "status": "missing", "importance": "must"},
        ]
    )

    found = check_job_match_output(_fixture(), result)

    assert _kinds(found) == [KIND_CONTRADICTED_REQUIREMENT]
    assert "Python" in found[0].detail


def test_partial_requirement_status_is_never_a_contradiction() -> None:
    result = _job_match_result(
        requirements=[
            {"requirement": "Python", "status": "partial", "importance": "must"},
            {"requirement": "Kubernetes", "status": "partial", "importance": "must"},
        ]
    )

    assert check_job_match_output(_fixture(), result) == ()


# --- Job Match: contradicted-tailoring --------------------------------------


def test_tailoring_action_for_a_missing_keyword_is_consistent() -> None:
    result = _job_match_result(
        tailoring_actions=[
            {
                "section": "skills",
                "keyword": "Kubernetes",
                "action": "Add a bullet showing Kubernetes ownership.",
            }
        ]
    )

    assert check_job_match_output(_fixture(), result) == ()


def test_tailoring_action_for_an_already_matched_keyword_is_flagged() -> None:
    result = _job_match_result(
        tailoring_actions=[
            {
                "section": "skills",
                "keyword": "Python",
                "action": "Add Python to the skills section.",
            }
        ]
    )

    found = check_job_match_output(_fixture(), result)

    assert _kinds(found) == [KIND_CONTRADICTED_TAILORING]
    assert "Python" in found[0].detail


def test_tailoring_action_for_a_phrase_containing_a_matched_word_is_not_flagged() -> None:
    """Regression: the real corpus flagged "Design Systems" over matched "Design".

    A multi-word missing keyword can contain a shorter matched one; asking for
    the phrase the prepass still reports missing is not a contradiction.
    """
    fixture = EvalFixture(
        id="design-case",
        resume_text=(
            "Casey Lin\nProduct Designer\n"
            "- Ran user research and design reviews for 4 squads.\n"
            "Skills\nFigma, design, prototyping\n"
        ),
        job_description=(
            "Product Designer\n"
            "You will own our design systems and run user research.\n"
            "Required: design systems, Figma.\n"
        ),
        expected_score_band=(0, 100),
        notes="synthetic overlapping-keyword fixture",
    )
    prepass = build_resume_prepass(fixture.resume_text, fixture.job_description)
    assert "Design" in prepass.matched_keywords
    assert "Design Systems" in prepass.missing_keywords

    result = _job_match_result(
        tailoring_actions=[
            {
                "section": "projects",
                "keyword": "Design Systems",
                "action": "Add a project that shows design-system ownership.",
            }
        ]
    )

    assert check_job_match_output(fixture, result) == ()


# --- Job Match: verdict-band ------------------------------------------------


def test_verdict_matching_the_reported_match_score_band_is_consistent() -> None:
    # 62 -> "borderline" in both the summary and the top-level field.
    assert check_job_match_output(_fixture(), _job_match_result()) == ()


def test_summary_verdict_outside_the_match_score_band_is_flagged() -> None:
    result = _job_match_result(summary_verdict="strong")

    found = check_job_match_output(_fixture(), result)

    assert _kinds(found) == [KIND_VERDICT_BAND]
    assert "summary.verdict" in found[0].detail
    assert "borderline" in found[0].detail


def test_top_level_verdict_outside_the_match_score_band_is_flagged() -> None:
    # Only the top-level field drifts; the summary keeps the correct band.
    result = _job_match_result(verdict="stretch", summary_verdict="borderline")

    found = check_job_match_output(_fixture(), result)

    assert _kinds(found) == [KIND_VERDICT_BAND]
    assert found[0].detail.startswith("verdict is rendered as 'stretch'")


# --- Orchestration ----------------------------------------------------------


def test_run_explanation_check_counts_per_tool() -> None:
    fixture = _fixture()
    report = run_explanation_check(
        {
            TOOL_RESUME_ANALYZER: {
                fixture.id: _resume_result(
                    [{"id": "kw", "category": "keywords", "severity": "low"}]
                )
            },
            TOOL_JOB_MATCH: {fixture.id: _job_match_result(summary_verdict="strong")},
        },
        [fixture],
    )

    assert isinstance(report, ExplanationReport)
    resume_stats = report.per_tool[TOOL_RESUME_ANALYZER]
    assert resume_stats.evaluated == 1
    assert resume_stats.inconsistency_count == 1
    assert resume_stats.flagged_fixture_ids == (fixture.id,)
    assert resume_stats.inconsistency_rate == pytest.approx(1.0)
    assert report.per_tool[TOOL_JOB_MATCH].inconsistency_count == 1


def test_run_explanation_check_reports_zero_for_a_tool_with_no_output() -> None:
    fixture = _fixture()
    report = run_explanation_check({}, [fixture])

    assert set(report.per_tool) == set(SCORING_TOOLS)
    for stats in report.per_tool.values():
        assert stats.evaluated == 0
        assert stats.inconsistency_count == 0
        assert stats.inconsistency_rate == 0.0


def test_run_explanation_check_rejects_a_non_scoring_tool() -> None:
    with pytest.raises(ValueError, match="non-scoring tool"):
        run_explanation_check({"cover-letter": {}}, [_fixture()])


def test_run_explanation_check_rejects_an_unknown_fixture_id() -> None:
    with pytest.raises(ValueError, match="unknown fixture id"):
        run_explanation_check(
            {TOOL_RESUME_ANALYZER: {"nope": _resume_result([])}}, [_fixture()]
        )


def test_check_output_rejects_a_non_scoring_tool() -> None:
    with pytest.raises(ValueError, match="not a scoring tool"):
        check_output("portfolio", _fixture(), {})


def test_a_consistent_pair_of_outputs_produces_an_empty_report() -> None:
    fixture = _fixture()
    report = run_explanation_check(
        {
            TOOL_RESUME_ANALYZER: {
                fixture.id: _resume_result(
                    [{"id": "kw", "category": "keywords", "severity": "high"}]
                )
            },
            TOOL_JOB_MATCH: {
                fixture.id: _job_match_result(
                    requirements=[
                        {
                            "requirement": "Kubernetes",
                            "status": "missing",
                            "importance": "must",
                        }
                    ]
                )
            },
        },
        [fixture],
    )

    assert all(stats.inconsistency_count == 0 for stats in report.per_tool.values())
    assert all(result.inconsistencies == () for result in report.results)
