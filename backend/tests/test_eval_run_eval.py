"""Tests for the R8 CLI eval runner and JSON reports (issue #123, D-044/D-045).

Covers target resolution, the pure output-text flattener, report shape/filename,
and the runner's orchestration + JSON writing — the deterministic path plus the
live path wired to injected fakes. No test reaches the live Gemini provider
(D-044): a guardrail asserts the default deterministic run never calls it, and
the live-path tests inject both a fake output generator and a fake judge
``complete`` so the real ``service_fn``s and provider are never touched.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.evals.explanation import TOOL_RESUME_ANALYZER
from app.evals.loader import EvalFixture
from app.evals.run_eval import (
    ALL_TOOLS,
    REPORT_SCHEMA_VERSION,
    TOOL_CAREER_PATH,
    TOOL_COVER_LETTER,
    TOOL_INTERVIEW_QA,
    TOOL_JOB_MATCH,
    TOOL_PORTFOLIO_PLANNER,
    TOOL_RESUME,
    ToolReport,
    build_report,
    flatten_output_text,
    main,
    report_filename,
    resolve_targets,
    run_eval,
)
from app.evals.usefulness import JUDGE_PROMPT_VERSION, JUDGE_RATIONALE_KEY, JUDGE_SCORE_KEY

_FIXED_NOW = datetime(2026, 7, 10, 15, 30, 0, tzinfo=UTC)


def _fixtures() -> list[EvalFixture]:
    """A tiny synthetic corpus: one with a JD, one no-JD case."""
    return [
        EvalFixture(
            id="case-with-jd",
            resume_text=(
                "Robin Alcott\nSenior Backend Engineer\n"
                "Built APIs in Python at Meadowbyte, raising coverage to 80%."
            ),
            job_description="Backend Engineer\nBuild APIs and own the services platform.",
            expected_score_band=(0, 100),
            notes="synthetic fixture with a job description",
        ),
        EvalFixture(
            id="case-no-jd",
            resume_text="Devon Marsh\nJunior Developer\nPython, FastAPI, SQL.",
            job_description=None,
            expected_score_band=(0, 100),
            notes="synthetic no-JD fixture",
        ),
    ]


def _fake_complete(score: int = 4, rationale: str = "specific"):
    async def _complete(system_prompt, user_prompt, schema=None, model_override=None):
        return {JUDGE_SCORE_KEY: score, JUDGE_RATIONALE_KEY: rationale}

    return _complete


async def _fake_scoring_outputs(corpus, tools):
    """Canned scoring-tool responses whose narrative contradicts their own numbers.

    Resume: a "keywords" issue rendered "low" over a subscore in the "high"
    band. Job Match: a summary verdict of "strong" over a match score whose band
    is "borderline". Both are supplied by the caller, so no LLM is involved.
    """
    fixture_id = corpus[0].id
    return {
        TOOL_RESUME_ANALYZER: {
            fixture_id: {
                "score_breakdown": [{"key": "keywords", "score": 30}],
                "issues": [{"id": "kw", "category": "keywords", "severity": "low"}],
            }
        },
        TOOL_JOB_MATCH: {
            fixture_id: {
                "match_score": 60,
                "verdict": "borderline",
                "summary": {"verdict": "strong"},
            }
        },
    }


async def _fake_generate(corpus, tools):
    """Return one canned, deliberately ungrounded output per generative tool.

    "Globex" (proper noun) and "400" (figure) appear in no fixture resume, so the
    fabrication check must flag them — letting tests assert a real candidate count.
    """
    fixture_id = corpus[0].id
    text = "At Globex I shipped 400 features across the platform."
    return {tool: {fixture_id: text} for tool in tools}


# --- Target resolution ---


def test_resolve_all_returns_every_tool_in_order() -> None:
    assert resolve_targets("all") == list(ALL_TOOLS)


def test_resolve_single_tool() -> None:
    assert resolve_targets(TOOL_RESUME) == [TOOL_RESUME]
    assert resolve_targets(TOOL_COVER_LETTER) == [TOOL_COVER_LETTER]


def test_resolve_unknown_target_raises() -> None:
    with pytest.raises(ValueError, match="unknown eval target"):
        resolve_targets("nope")


# --- Output-text flattener ---


def test_flatten_collects_nested_strings() -> None:
    result = {
        "summary": {"headline": "Tailored plan"},
        "questions": [{"question": "Why here?"}, {"question": "Tell me more"}],
    }
    blob = flatten_output_text(result)
    assert "Tailored plan" in blob
    assert "Why here?" in blob
    assert "Tell me more" in blob


def test_flatten_excludes_metadata_keys() -> None:
    result = {
        "schema_version": "quality_v2",
        "generated_at": "2026-07-10T00:00:00+00:00",
        "full_text": "Dear Hiring Manager",
    }
    blob = flatten_output_text(result)
    assert "Dear Hiring Manager" in blob
    assert "quality_v2" not in blob
    assert "2026-07-10" not in blob


# --- Report shape + filename ---


def _report(tool: str = TOOL_RESUME) -> ToolReport:
    return build_report(
        tool,
        generated_at=_FIXED_NOW,
        mode="deterministic",
        calibration=None,
        fabrication=None,
        usefulness=None,
    )


def test_filename_embeds_tool_and_prompt_version() -> None:
    from app.evals.run_eval import PROMPT_VERSIONS

    name = report_filename(_report(TOOL_RESUME))
    assert name.startswith("resume-")
    assert PROMPT_VERSIONS[TOOL_RESUME] in name
    assert name.endswith("-20260710T153000Z.json")


def test_all_tool_reports_identify_the_evidence_aware_prompt_generation() -> None:
    """R11 evidence injection changed every tool prompt's cache/report identity."""
    from app.evals.run_eval import PROMPT_VERSIONS

    assert PROMPT_VERSIONS == {
        TOOL_RESUME: "2026-08-13-v2",
        TOOL_JOB_MATCH: "2026-08-13-v2",
        TOOL_CAREER_PATH: "2026-08-13-v2",
        TOOL_COVER_LETTER: "2026-08-13-v2",
        TOOL_INTERVIEW_QA: "2026-08-13-v2",
        TOOL_PORTFOLIO_PLANNER: "2026-08-13-v2",
    }


# --- Deterministic orchestration (no live call) ---


async def test_deterministic_all_writes_one_report_per_tool(tmp_path: Path) -> None:
    paths = await run_eval(
        "all",
        reports_dir=tmp_path,
        fixtures=_fixtures(),
        now=lambda: _FIXED_NOW,
    )
    assert len(paths) == len(ALL_TOOLS)
    assert {p.name for p in paths} == {p.name for p in tmp_path.glob("*.json")}


async def test_deterministic_resume_report_has_calibration_only(tmp_path: Path) -> None:
    (path,) = await run_eval(
        TOOL_RESUME, reports_dir=tmp_path, fixtures=_fixtures(), now=lambda: _FIXED_NOW
    )
    data = json.loads(path.read_text())
    assert data["report_schema_version"] == REPORT_SCHEMA_VERSION
    assert data["tool"] == TOOL_RESUME
    assert data["mode"] == "deterministic"
    assert isinstance(data["calibration_miss_rate"], float)
    # The explanation check is deterministic too, so it reports a real figure
    # (not null) on the credential-free path (D-121).
    assert data["explanation_inconsistency_count"] == 0
    assert data["fabrication_candidate_count"] is None
    assert data["usefulness_score"] is None
    assert data["judge_prompt_version"] is None
    assert data["fixtures_evaluated"] == len(_fixtures())


async def test_deterministic_generative_report_has_null_live_figures(
    tmp_path: Path,
) -> None:
    (path,) = await run_eval(
        TOOL_COVER_LETTER,
        reports_dir=tmp_path,
        fixtures=_fixtures(),
        now=lambda: _FIXED_NOW,
    )
    data = json.loads(path.read_text())
    assert data["calibration_miss_rate"] is None
    # A generative tool has no heuristic numbers to contradict, so the
    # explanation figure stays null exactly like the calibration one.
    assert data["explanation_inconsistency_count"] is None
    assert data["fabrication_candidate_count"] is None
    assert data["usefulness_score"] is None


async def test_single_tool_writes_only_that_report(tmp_path: Path) -> None:
    await run_eval(
        TOOL_JOB_MATCH, reports_dir=tmp_path, fixtures=_fixtures(), now=lambda: _FIXED_NOW
    )
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    assert files[0].name.startswith("job-match-")


async def test_explanation_inconsistencies_reach_the_scoring_tool_reports(
    tmp_path: Path,
) -> None:
    """The count in the report is the check's real finding, not a hard-coded zero."""
    paths = await run_eval(
        "all",
        reports_dir=tmp_path,
        fixtures=_fixtures(),
        scoring_outputs=_fake_scoring_outputs,
        now=lambda: _FIXED_NOW,
    )
    by_tool = {json.loads(p.read_text())["tool"]: json.loads(p.read_text()) for p in paths}

    assert by_tool[TOOL_RESUME]["explanation_inconsistency_count"] == 1
    assert by_tool[TOOL_JOB_MATCH]["explanation_inconsistency_count"] == 1
    # Still null for every generative tool.
    assert by_tool[TOOL_CAREER_PATH]["explanation_inconsistency_count"] is None
    assert by_tool[TOOL_PORTFOLIO_PLANNER]["explanation_inconsistency_count"] is None


# --- Live orchestration wired to injected fakes ---


async def test_live_run_scores_fabrication_and_usefulness(tmp_path: Path) -> None:
    (path,) = await run_eval(
        TOOL_COVER_LETTER,
        reports_dir=tmp_path,
        fixtures=_fixtures(),
        generate_outputs=_fake_generate,
        score_usefulness=True,
        complete=_fake_complete(4),
        now=lambda: _FIXED_NOW,
    )
    data = json.loads(path.read_text())
    assert data["mode"] == "live"
    # "Globex"/"400" are untraceable to the resume -> at least one candidate.
    assert data["fabrication_candidate_count"] >= 1
    assert data["usefulness_score"] == pytest.approx(4.0)
    assert data["judge_prompt_version"] == JUDGE_PROMPT_VERSION
    assert data["fixtures_evaluated"] == 1


async def test_live_generative_and_calibration_tools_together(tmp_path: Path) -> None:
    paths = await run_eval(
        "all",
        reports_dir=tmp_path,
        fixtures=_fixtures(),
        generate_outputs=_fake_generate,
        score_usefulness=True,
        complete=_fake_complete(5),
        now=lambda: _FIXED_NOW,
    )
    by_tool = {json.loads(p.read_text())["tool"]: json.loads(p.read_text()) for p in paths}
    # Calibration tool: real miss rate, no generative figures.
    assert isinstance(by_tool[TOOL_RESUME]["calibration_miss_rate"], float)
    assert by_tool[TOOL_RESUME]["fabrication_candidate_count"] is None
    # Generative tool: usefulness scored from the fake judge.
    assert by_tool[TOOL_CAREER_PATH]["usefulness_score"] == pytest.approx(5.0)


# --- Guardrail: the default (deterministic) run never calls the live provider ---


async def test_deterministic_run_never_calls_live_provider(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("CLI eval runner must not call the live LLM by default")

    monkeypatch.setattr("app.services.ai_client.complete_structured", _boom)
    paths = await run_eval(
        "all", reports_dir=tmp_path, fixtures=_fixtures(), now=lambda: _FIXED_NOW
    )
    assert len(paths) == len(ALL_TOOLS)


# --- CLI entry point ---


def test_main_deterministic_writes_reports(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("--deterministic must not call the live LLM")

    monkeypatch.setattr("app.evals.run_eval.load_fixtures", _fixtures)
    monkeypatch.setattr("app.services.ai_client.complete_structured", _boom)
    exit_code = main(["all", "--reports-dir", str(tmp_path), "--deterministic"])
    assert exit_code == 0
    assert len(list(tmp_path.glob("*.json"))) == len(ALL_TOOLS)


def test_main_default_is_live(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # The default CLI invocation performs the full live run: it wires
    # live_generate_outputs and the usefulness judge. We swap both seams for
    # fakes so the test proves the wiring without touching the real provider.
    monkeypatch.setattr("app.evals.run_eval.load_fixtures", _fixtures)
    monkeypatch.setattr("app.evals.run_eval.live_generate_outputs", _fake_generate)
    monkeypatch.setattr(
        "app.services.ai_client.complete_structured", _fake_complete(4)
    )
    exit_code = main(["cover-letter", "--reports-dir", str(tmp_path)])
    assert exit_code == 0
    data = json.loads(next(iter(tmp_path.glob("*.json"))).read_text())
    assert data["mode"] == "live"
    assert data["fabrication_candidate_count"] >= 1
    assert data["usefulness_score"] == pytest.approx(4.0)


def test_main_default_live_wires_the_live_scoring_outputs_seam(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The scoring tools' explanation figures are only worth reading when they
    # score real responses, so the default (live) CLI path must route through
    # live_scoring_outputs. Swapped for a fake so no provider is touched.
    monkeypatch.setattr("app.evals.run_eval.load_fixtures", _fixtures)
    monkeypatch.setattr("app.evals.run_eval.live_scoring_outputs", _fake_scoring_outputs)
    monkeypatch.setattr("app.evals.run_eval.live_generate_outputs", _fake_generate)
    monkeypatch.setattr("app.services.ai_client.complete_structured", _fake_complete(4))

    assert main(["resume", "--reports-dir", str(tmp_path)]) == 0

    data = json.loads(next(iter(tmp_path.glob("*.json"))).read_text())
    assert data["mode"] == "live"
    assert data["explanation_inconsistency_count"] == 1


def test_main_deterministic_reports_explanation_without_a_provider(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("--deterministic must not call the live LLM")

    monkeypatch.setattr("app.evals.run_eval.load_fixtures", _fixtures)
    monkeypatch.setattr("app.services.ai_client.complete_structured", _boom)

    assert main(["job-match", "--reports-dir", str(tmp_path), "--deterministic"]) == 0

    data = json.loads(next(iter(tmp_path.glob("*.json"))).read_text())
    assert data["mode"] == "deterministic"
    # The heuristic-only fallback narrative agrees with its own numbers.
    assert data["explanation_inconsistency_count"] == 0


def test_main_rejects_unknown_target(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        main(["bogus", "--reports-dir", str(tmp_path)])
