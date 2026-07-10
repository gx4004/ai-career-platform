"""Tests for the R8 generative-tool usefulness judge (issue #122, D-043/D-044).

Covers the pure logic only — prompt building, score parsing, and per-tool
averaging — plus the orchestration wired to an injected fake ``complete``. No
test reaches the live Gemini provider (D-044): the live-LLM path is exercised
only via the documented manual smoke run, never here. A guardrail test asserts
the real ``complete_structured`` is never invoked by the default suite.
"""

from __future__ import annotations

import pytest

from app.evals import (
    GENERATIVE_TOOLS,
    JUDGE_PROMPT_VERSION,
    TOOL_CAREER_PATH,
    TOOL_COVER_LETTER,
    TOOL_INTERVIEW_QA,
    TOOL_PORTFOLIO_PLANNER,
    JudgeError,
    UsefulnessReport,
    build_judge_prompt,
    judge_output,
    parse_judge_score,
    run_usefulness_judge,
)
from app.evals.loader import EvalFixture
from app.evals.usefulness import (
    JUDGE_RATIONALE_KEY,
    JUDGE_SCORE_KEY,
    MAX_USEFULNESS_SCORE,
    MIN_USEFULNESS_SCORE,
    aggregate_usefulness,
    parse_judge_rationale,
)


def _fixture(fixture_id: str = "synthetic-case", jd: str | None = "Senior Backend JD") -> EvalFixture:
    return EvalFixture(
        id=fixture_id,
        resume_text="Robin Alcott\nSenior Backend Engineer",
        job_description=jd,
        expected_score_band=(0, 100),
        notes="synthetic usefulness test fixture",
    )


def _fake_complete(score: object, rationale: str = "ok"):
    """Return an async ``complete`` that always answers with ``score``."""

    async def _complete(system_prompt, user_prompt, schema=None, model_override=None):
        return {JUDGE_SCORE_KEY: score, JUDGE_RATIONALE_KEY: rationale}

    return _complete


# --- Prompt building ---


def test_prompt_includes_job_description_and_output() -> None:
    system, user = build_judge_prompt("A tailored cover letter body.", "Backend JD text.")
    assert "1" in system and str(MAX_USEFULNESS_SCORE) in system
    assert "Backend JD text." in user
    assert "A tailored cover letter body." in user


def test_prompt_handles_missing_job_description() -> None:
    system, user = build_judge_prompt("Some output.", None)
    # No JD: the judge is told to score the output on its own merits.
    assert "No job description" in user
    assert "Some output." in user


def test_prompt_is_deterministic() -> None:
    assert build_judge_prompt("out", "jd") == build_judge_prompt("out", "jd")


# --- Score parsing ---


def test_parses_integer_score() -> None:
    assert parse_judge_score({JUDGE_SCORE_KEY: 4}) == 4


def test_parses_integer_valued_float() -> None:
    assert parse_judge_score({JUDGE_SCORE_KEY: 5.0}) == 5


def test_rounds_fractional_score_half_up() -> None:
    assert parse_judge_score({JUDGE_SCORE_KEY: 3.5}) == 4
    assert parse_judge_score({JUDGE_SCORE_KEY: 3.4}) == 3


def test_parses_numeric_string_score() -> None:
    assert parse_judge_score({JUDGE_SCORE_KEY: " 2 "}) == 2


@pytest.mark.parametrize("bad", [0, 6, -1, 100])
def test_rejects_out_of_range_score(bad: int) -> None:
    with pytest.raises(JudgeError, match="outside"):
        parse_judge_score({JUDGE_SCORE_KEY: bad})


def test_rejects_missing_score_key() -> None:
    with pytest.raises(JudgeError, match="missing"):
        parse_judge_score({JUDGE_RATIONALE_KEY: "no score here"})


def test_rejects_non_numeric_score() -> None:
    with pytest.raises(JudgeError):
        parse_judge_score({JUDGE_SCORE_KEY: "high"})


def test_rejects_bool_score() -> None:
    # bool is an int subclass; True must not be accepted as 1.
    with pytest.raises(JudgeError, match="bool"):
        parse_judge_score({JUDGE_SCORE_KEY: True})


def test_rationale_defaults_to_empty() -> None:
    assert parse_judge_rationale({JUDGE_SCORE_KEY: 3}) == ""
    assert parse_judge_rationale({JUDGE_RATIONALE_KEY: "  tidy  "}) == "tidy"


# --- Averaging ---


def test_aggregate_averages_per_tool() -> None:
    from app.evals.usefulness import UsefulnessResult

    results = [
        UsefulnessResult(TOOL_COVER_LETTER, "a", 4, ""),
        UsefulnessResult(TOOL_COVER_LETTER, "b", 2, ""),
        UsefulnessResult(TOOL_CAREER_PATH, "a", 5, ""),
    ]
    per_tool = aggregate_usefulness(results)
    assert set(per_tool) == set(GENERATIVE_TOOLS)
    assert per_tool[TOOL_COVER_LETTER].average_score == pytest.approx(3.0)
    assert per_tool[TOOL_COVER_LETTER].evaluated == 2
    assert per_tool[TOOL_CAREER_PATH].average_score == pytest.approx(5.0)
    # A tool with no results reports None, not omitted / not zero.
    assert per_tool[TOOL_INTERVIEW_QA].evaluated == 0
    assert per_tool[TOOL_PORTFOLIO_PLANNER].average_score is None


# --- Orchestration (fake complete, no live call) ---


async def test_judge_output_uses_injected_complete() -> None:
    result = await judge_output(
        TOOL_COVER_LETTER, _fixture(), "output", complete=_fake_complete(4, "specific")
    )
    assert result.tool == TOOL_COVER_LETTER
    assert result.fixture_id == "synthetic-case"
    assert result.score == 4
    assert result.rationale == "specific"


async def test_judge_output_rejects_non_generative_tool() -> None:
    with pytest.raises(ValueError, match="generative"):
        await judge_output(
            "resume-analyzer", _fixture(), "output", complete=_fake_complete(3)
        )


async def test_run_usefulness_judge_averages_across_fixtures() -> None:
    fixtures = [_fixture("f1"), _fixture("f2")]
    outputs = {
        TOOL_COVER_LETTER: {"f1": "out-1", "f2": "out-2"},
        TOOL_CAREER_PATH: {"f1": "out-3"},
    }
    report = await run_usefulness_judge(
        outputs, fixtures=fixtures, complete=_fake_complete(4)
    )
    assert isinstance(report, UsefulnessReport)
    assert set(report.per_tool) == set(GENERATIVE_TOOLS)
    assert report.per_tool[TOOL_COVER_LETTER].evaluated == 2
    assert report.per_tool[TOOL_COVER_LETTER].average_score == pytest.approx(4.0)
    assert report.per_tool[TOOL_CAREER_PATH].evaluated == 1
    # Tools with no supplied output still appear, with a None average.
    assert report.per_tool[TOOL_INTERVIEW_QA].average_score is None
    assert report.per_tool[TOOL_PORTFOLIO_PLANNER].evaluated == 0
    # The report records which judge prompt produced the scores.
    assert report.judge_prompt_version == JUDGE_PROMPT_VERSION


async def test_run_usefulness_judge_rejects_unknown_tool() -> None:
    with pytest.raises(ValueError, match="non-generative tool"):
        await run_usefulness_judge(
            {"job-match": {"f1": "out"}},
            fixtures=[_fixture("f1")],
            complete=_fake_complete(3),
        )


async def test_run_usefulness_judge_rejects_unknown_fixture() -> None:
    with pytest.raises(ValueError, match="unknown fixture id"):
        await run_usefulness_judge(
            {TOOL_COVER_LETTER: {"missing": "out"}},
            fixtures=[_fixture("f1")],
            complete=_fake_complete(3),
        )


# --- Guardrail: default suite never hits the live provider (D-044) ---


async def test_never_calls_live_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("usefulness judge must not call the live LLM in CI")

    monkeypatch.setattr("app.services.ai_client.complete_structured", _boom)

    report = await run_usefulness_judge(
        {TOOL_COVER_LETTER: {"backend-engineering-senior": "A tailored letter."}},
        complete=_fake_complete(5),
    )
    assert report.per_tool[TOOL_COVER_LETTER].average_score == pytest.approx(5.0)
