"""R8 on-demand CLI eval runner and versioned JSON reports (issue #123).

Runs the applicable quality checks for one tool or all six against the committed
synthetic fixture corpus and writes one versioned JSON report per tool per run to
``backend/app/evals/reports/`` (parent spec #118; D-044, D-045):

- Resume Analyzer / Job Match: the deterministic calibration check
  (:mod:`app.evals.calibration`) — a per-tool miss rate — plus the deterministic
  explanation-consistency check (:mod:`app.evals.explanation`) — a per-tool count
  of places the rendered explanation contradicts the numbers in the same
  response. Neither check calls an LLM itself; on the live path the explanation
  check scores real responses from each tool's ``service_fn``, on the
  deterministic path it scores their heuristic-only fallback responses.
- Cover Letter / Interview Q&A / Career Path / Portfolio Planner: the
  deterministic fabrication-candidate check (:mod:`app.evals.fabrication`) plus
  the LLM-as-judge usefulness score (:mod:`app.evals.usefulness`), scored over
  outputs produced by calling each tool's ``service_fn`` directly — the same
  callable :func:`app.services.tool_pipeline.run_tool_pipeline` invokes, bypassing
  cache and persistence.

On demand only, never wired into CI (D-044): running the CLI *is* the manual
pre-``_PROMPT_VERSION``-bump check, so the default invocation performs the full
live run — it calls each generative tool's ``service_fn`` against the live Gemini
provider and scores usefulness, and therefore needs configured Vertex
credentials. CI never invokes this script; the default ``pytest`` run exercises
the orchestration with injected fakes only, so no test makes a live call.

Pass ``--deterministic`` for the credential-free path: it runs only the
deterministic checks (Resume/Job Match calibration and explanation consistency,
the latter over the two tools' heuristic-only responses) and leaves the
generative tools' live figures (``fabrication_candidate_count``,
``usefulness_score``) as ``null``. Use it to reproduce a report offline or
without credentials.

Reports are dev-tooling artifacts written to disk as versioned JSON; they are
never persisted into the ``analytics_events`` table (D-037, D-045).

Usage::

    cd backend
    python -m app.evals.run_eval all                  # full live run, all six tools
    python -m app.evals.run_eval resume               # one tool
    python -m app.evals.run_eval all --deterministic  # calibration only, no live call
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.evals.calibration import (
    TOOL_JOB_MATCH,
    TOOL_RESUME_ANALYZER,
    CalibrationReport,
    ToolMissRate,
    run_calibration,
)
from app.evals.explanation import (
    ExplanationReport,
    ToolExplanationCount,
    run_explanation_check,
)
from app.evals.fabrication import (
    GENERATIVE_TOOLS,
    TOOL_CAREER_PATH,
    TOOL_COVER_LETTER,
    TOOL_INTERVIEW_QA,
    TOOL_PORTFOLIO_PLANNER,
    FabricationReport,
    run_fabrication_check,
)
from app.evals.loader import EvalFixture, load_fixtures
from app.evals.usefulness import (
    CompleteFn,
    UsefulnessReport,
    run_usefulness_judge,
)
from app.prompts.career import CAREER_PROMPT_VERSION
from app.prompts.cover_letter import COVER_LETTER_PROMPT_VERSION
from app.prompts.interview import INTERVIEW_PROMPT_VERSION
from app.prompts.job_match import JOB_MATCH_PROMPT_VERSION
from app.prompts.portfolio import PORTFOLIO_PROMPT_VERSION
from app.prompts.resume import RESUME_PROMPT_VERSION
from app.services.quality_signals import (
    build_resume_prepass,
    compute_match_score,
    compute_overall_score,
    compute_resume_breakdown,
    job_match_verdict,
)

#: Directory the versioned JSON reports are written to (created on demand). The
#: reports themselves are generated artifacts and are not committed (D-045).
REPORTS_DIR = Path(__file__).parent / "reports"

#: Bumped when the on-disk report shape changes, so a reader can tell whether an
#: older report file is still comparable to a newer one. ``v2`` added
#: ``explanation_inconsistency_count`` for the two scoring tools (D-121).
REPORT_SCHEMA_VERSION = "r8-eval-report-v2"

#: Report schema versions the reader still accepts. Every bump so far has been
#: purely additive with a ``null`` default, so an older artifact stays readable
#: (it simply carries no figure for a check that did not exist when it was
#: written); a breaking change must drop the superseded version from this tuple.
SUPPORTED_REPORT_SCHEMA_VERSIONS: tuple[str, ...] = (
    "r8-eval-report-v1",
    REPORT_SCHEMA_VERSION,
)

#: CLI tool id for the Resume Analyzer (router ``tool_name``). It maps to the
#: calibration module's :data:`TOOL_RESUME_ANALYZER` ("resume-analyzer") key.
TOOL_RESUME = "resume"

#: The two heuristic-scored tools the calibration check covers, keyed by CLI id.
CALIBRATION_TOOLS: tuple[str, ...] = (TOOL_RESUME, TOOL_JOB_MATCH)

#: All six tools in canonical tool-order (Resume -> Job Match -> Career ->
#: Cover Letter -> Interview -> Portfolio), keyed by CLI id.
ALL_TOOLS: tuple[str, ...] = (
    TOOL_RESUME,
    TOOL_JOB_MATCH,
    TOOL_CAREER_PATH,
    TOOL_COVER_LETTER,
    TOOL_INTERVIEW_QA,
    TOOL_PORTFOLIO_PLANNER,
)

#: Current ``_PROMPT_VERSION`` constant per tool, stamped into each report and its
#: filename so results are traceable to the prompt that produced them.
PROMPT_VERSIONS: dict[str, str] = {
    TOOL_RESUME: RESUME_PROMPT_VERSION,
    TOOL_JOB_MATCH: JOB_MATCH_PROMPT_VERSION,
    TOOL_CAREER_PATH: CAREER_PROMPT_VERSION,
    TOOL_COVER_LETTER: COVER_LETTER_PROMPT_VERSION,
    TOOL_INTERVIEW_QA: INTERVIEW_PROMPT_VERSION,
    TOOL_PORTFOLIO_PLANNER: PORTFOLIO_PROMPT_VERSION,
}

#: Maps a calibration CLI id to the key the calibration report uses internally.
_CALIBRATION_KEY: dict[str, str] = {
    TOOL_RESUME: TOOL_RESUME_ANALYZER,
    TOOL_JOB_MATCH: TOOL_JOB_MATCH,
}

#: Result keys carrying provider/run metadata rather than candidate-facing text;
#: excluded from :func:`flatten_output_text` so timestamps/version tags do not
#: masquerade as fabrication-candidate figures or proper nouns.
_METADATA_KEYS: frozenset[str] = frozenset(
    {"schema_version", "generated_at", "tone_used", "confidence_note"}
)

#: Placeholder ``generated_at`` stamped into the heuristic Resume payloads built
#: by :func:`deterministic_scoring_outputs`. The explanation check never reads
#: that field, and a constant keeps the deterministic path reproducible.
_HEURISTIC_GENERATED_AT = "1970-01-01T00:00:00+00:00"

#: A callable that produces generated output text per generative tool per fixture:
#: ``(corpus, tools) -> {tool_id: {fixture_id: output_text}}``. Injected so tests
#: never reach the live provider; the live implementation is
#: :func:`live_generate_outputs`.
GenerateOutputsFn = Callable[
    [list[EvalFixture], Sequence[str]],
    Awaitable[Mapping[str, Mapping[str, str]]],
]

#: A callable that produces one *response mapping* per scoring tool per fixture:
#: ``(corpus, tools) -> {tool_id: {fixture_id: result}}``, keyed by the
#: explanation check's tool ids. Injected so the caller chooses between the
#: credential-free heuristic path (:func:`deterministic_scoring_outputs`) and the
#: live one (:func:`live_scoring_outputs`).
ScoringOutputsFn = Callable[
    [list[EvalFixture], Sequence[str]],
    Awaitable[Mapping[str, Mapping[str, Mapping[str, object]]]],
]


@dataclass(frozen=True)
class ToolReport:
    """One tool's eval outcome for one run — the on-disk JSON report shape.

    Attributes:
        report_schema_version: :data:`REPORT_SCHEMA_VERSION` at write time.
        tool: CLI tool id (router ``tool_name``).
        prompt_version: The tool's ``_PROMPT_VERSION`` at run time.
        judge_prompt_version: The usefulness judge prompt version, or ``None``
            when usefulness was not scored (deterministic run, or a heuristic tool).
        generated_at: ISO-8601 UTC timestamp of the run.
        mode: ``"deterministic"`` (no live LLM) or ``"live"``.
        fixtures_evaluated: How many fixtures fed this tool's checks.
        calibration_miss_rate: Resume/Job Match miss rate (0..1), else ``None``.
        explanation_inconsistency_count: Resume/Job Match tally of places the
            rendered explanation contradicts the numbers in the same response
            (D-121), else ``None``. Reported beside the miss rate because both
            answer "do this tool's numbers hold up?" (R8 acceptance gate).
        fabrication_candidate_count: Generative-tool untraceable-claim tally, or
            ``None`` when no output was generated (deterministic run) or N/A.
        usefulness_score: Generative-tool average usefulness (1..5), or ``None``.
    """

    report_schema_version: str
    tool: str
    prompt_version: str
    judge_prompt_version: str | None
    generated_at: str
    mode: str
    fixtures_evaluated: int
    calibration_miss_rate: float | None
    explanation_inconsistency_count: int | None
    fabrication_candidate_count: int | None
    usefulness_score: float | None


def resolve_targets(target: str) -> list[str]:
    """Expand a CLI target into an ordered list of tool ids.

    Args:
        target: ``"all"`` for every tool, or a single tool id.

    Returns:
        Tool ids in canonical tool-order.

    Raises:
        ValueError: If ``target`` is neither ``"all"`` nor a known tool id.
    """
    if target == "all":
        return list(ALL_TOOLS)
    if target in ALL_TOOLS:
        return [target]
    raise ValueError(
        f"unknown eval target {target!r}; expected 'all' or one of: "
        f"{', '.join(ALL_TOOLS)}"
    )


def _flatten(value: object, key: str | None, out: list[str]) -> None:
    if key in _METADATA_KEYS:
        return
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, Mapping):
        for child_key, child in value.items():
            _flatten(child, str(child_key), out)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _flatten(item, key, out)


def flatten_output_text(result: Mapping[str, object]) -> str:
    """Join every candidate-facing string in a tool result into one blob.

    Walks the result recursively and concatenates string leaves (skipping
    :data:`_METADATA_KEYS`) so the fabrication and usefulness checks see all the
    generated prose regardless of which tool produced it. Pure and deterministic.
    """
    collected: list[str] = []
    _flatten(result, None, collected)
    return "\n".join(collected)


def _target_role_for(fixture: EvalFixture) -> str | None:
    """Derive a target-role hint for Career/Portfolio from a fixture's JD.

    The synthetic corpus carries no explicit target role, so use the job
    description's first line when present (e.g. "Backend Engineer (Entry
    Level)") and ``None`` for the no-JD case.
    """
    if not fixture.job_description:
        return None
    for line in fixture.job_description.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


async def live_generate_outputs(
    corpus: list[EvalFixture],
    tools: Sequence[str],
) -> dict[str, dict[str, str]]:
    """Generate real outputs by calling each generative tool's ``service_fn``.

    Calls the same service callables ``run_tool_pipeline`` uses, directly and
    without cache or persistence (D-044). **Reaches the live Gemini provider** and
    requires configured Vertex credentials — only ``--live`` routes here.

    Cover Letter and Interview Q&A need a job description, so no-JD fixtures are
    skipped for those tools. Career Path and Portfolio Planner run against every
    fixture, deriving a target-role hint from the JD where available.
    """
    # Imported lazily so the default (deterministic) path and unit tests never
    # import the provider stack (D-044).
    from app.services.career_recommender import recommend_career
    from app.services.cover_letter_gen import generate_cover_letter
    from app.services.interview_gen import generate_interview_questions
    from app.services.portfolio_planner import recommend_portfolio

    outputs: dict[str, dict[str, str]] = {}
    for tool in tools:
        if tool not in GENERATIVE_TOOLS:
            continue
        tool_outputs: dict[str, str] = {}
        for fixture in corpus:
            target_role = _target_role_for(fixture)
            if tool == TOOL_COVER_LETTER:
                if fixture.job_description is None:
                    continue
                result = await generate_cover_letter(
                    fixture.resume_text, fixture.job_description, tone=None
                )
            elif tool == TOOL_INTERVIEW_QA:
                if fixture.job_description is None:
                    continue
                result = await generate_interview_questions(
                    fixture.resume_text, fixture.job_description, num_questions=None
                )
            elif tool == TOOL_CAREER_PATH:
                result = await recommend_career(fixture.resume_text, target_role)
            else:  # TOOL_PORTFOLIO_PLANNER — target_role is required (str)
                result = await recommend_portfolio(
                    fixture.resume_text, target_role or "the target role"
                )
            tool_outputs[fixture.id] = flatten_output_text(result)
        outputs[tool] = tool_outputs
    return outputs


def _scoring_targets(tools: Sequence[str]) -> list[str]:
    """Map CLI targets onto the explanation check's scoring-tool ids."""
    return [_CALIBRATION_KEY[tool] for tool in tools if tool in CALIBRATION_TOOLS]


async def deterministic_scoring_outputs(
    corpus: list[EvalFixture],
    tools: Sequence[str],
) -> dict[str, dict[str, dict]]:
    """Build Resume/Job Match responses from their heuristic paths only.

    The credential-free source of scoring-tool outputs for the explanation
    check: it calls the two services' own heuristic builders — the code that
    runs verbatim when the provider is unavailable (spec decision #7) — so the
    check measures production's fallback narrative instead of a re-derivation.
    **No live call is made** (D-044); the service modules are imported lazily
    here for the same reason :func:`live_generate_outputs` imports lazily, and
    only the heuristic helpers are touched.
    """
    from app.services.job_matcher import (
        CONFIDENCE_NOTE as JOB_MATCH_CONFIDENCE_NOTE,
    )
    from app.services.job_matcher import (
        SCHEMA_VERSION as JOB_MATCH_SCHEMA_VERSION,
    )
    from app.services.job_matcher import (
        _fallback_requirements,
        _fallback_tailoring_actions,
        _headline,
    )
    from app.services.resume_analyzer import _build_heuristic_fallback

    targets = _scoring_targets(tools)
    outputs: dict[str, dict[str, dict]] = {}
    for tool in targets:
        tool_outputs: dict[str, dict] = {}
        for fixture in corpus:
            prepass = build_resume_prepass(fixture.resume_text, fixture.job_description)
            if tool == TOOL_RESUME_ANALYZER:
                breakdown = compute_resume_breakdown(prepass)
                tool_outputs[fixture.id] = _build_heuristic_fallback(
                    prepass,
                    breakdown,
                    compute_overall_score(breakdown),
                    _HEURISTIC_GENERATED_AT,
                )
                continue
            # Job Match needs a job description; no-JD fixtures are skipped
            # exactly as the calibration check skips them.
            if fixture.job_description is None:
                continue
            match_score = compute_match_score(
                prepass.matched_keywords, prepass.missing_keywords
            )
            verdict = job_match_verdict(match_score)
            tool_outputs[fixture.id] = {
                "schema_version": JOB_MATCH_SCHEMA_VERSION,
                "summary": {
                    "headline": _headline(
                        verdict, prepass.matched_keywords, prepass.missing_keywords
                    ),
                    "verdict": verdict,
                    "confidence_note": JOB_MATCH_CONFIDENCE_NOTE,
                },
                "match_score": match_score,
                "verdict": verdict,
                "requirements": _fallback_requirements(
                    prepass.matched_keywords, prepass.missing_keywords
                ),
                "tailoring_actions": _fallback_tailoring_actions(
                    prepass.missing_keywords
                ),
            }
        outputs[tool] = tool_outputs
    return outputs


async def live_scoring_outputs(
    corpus: list[EvalFixture],
    tools: Sequence[str],
) -> dict[str, dict[str, dict]]:
    """Generate real Resume/Job Match responses by calling their ``service_fn``s.

    The explanation check's whole point is the LLM half of these two tools
    (D-121), so the live run scores the real responses. Calls the same service
    callables ``run_tool_pipeline`` uses, directly and without cache or
    persistence. **Reaches the live Gemini provider** and requires configured
    Vertex credentials — only the default (live) CLI path routes here.
    """
    # Imported lazily so the deterministic path never touches the provider stack.
    from app.services.job_matcher import match_job
    from app.services.resume_analyzer import analyze_resume

    targets = _scoring_targets(tools)
    outputs: dict[str, dict[str, dict]] = {}
    for tool in targets:
        tool_outputs: dict[str, dict] = {}
        for fixture in corpus:
            if tool == TOOL_RESUME_ANALYZER:
                tool_outputs[fixture.id] = await analyze_resume(
                    fixture.resume_text, fixture.job_description
                )
            elif fixture.job_description is not None:
                tool_outputs[fixture.id] = await match_job(
                    fixture.resume_text, fixture.job_description
                )
        outputs[tool] = tool_outputs
    return outputs


def _calibration_stats(
    tool: str, report: CalibrationReport | None
) -> ToolMissRate | None:
    """Return the tool's calibration stats, or ``None`` if it is not a calibration tool."""
    if report is None or tool not in CALIBRATION_TOOLS:
        return None
    return report.per_tool.get(_CALIBRATION_KEY[tool])


def _explanation_stats(
    tool: str, report: ExplanationReport | None
) -> ToolExplanationCount | None:
    """Return the tool's explanation stats, or ``None`` if it is not a scoring tool."""
    if report is None or tool not in CALIBRATION_TOOLS:
        return None
    return report.per_tool.get(_CALIBRATION_KEY[tool])


def build_report(
    tool: str,
    *,
    generated_at: datetime,
    mode: str,
    calibration: CalibrationReport | None,
    explanation: ExplanationReport | None = None,
    fabrication: FabricationReport | None,
    usefulness: UsefulnessReport | None,
) -> ToolReport:
    """Assemble one tool's :class:`ToolReport` from the run's sub-reports."""
    is_generative = tool in GENERATIVE_TOOLS

    calibration_stats = _calibration_stats(tool, calibration)
    calibration_miss_rate = (
        round(calibration_stats.miss_rate, 4) if calibration_stats is not None else None
    )

    explanation_stats = _explanation_stats(tool, explanation)
    explanation_inconsistency_count = (
        explanation_stats.inconsistency_count if explanation_stats is not None else None
    )

    fabrication_count: int | None = None
    fixtures_evaluated = calibration_stats.evaluated if calibration_stats is not None else 0
    if is_generative and fabrication is not None:
        tool_fabrication = fabrication.per_tool.get(tool)
        if tool_fabrication is not None:
            fabrication_count = tool_fabrication.candidate_count
            fixtures_evaluated = tool_fabrication.evaluated

    usefulness_score: float | None = None
    judge_prompt_version: str | None = None
    if is_generative and usefulness is not None:
        tool_usefulness = usefulness.per_tool.get(tool)
        if tool_usefulness is not None and tool_usefulness.average_score is not None:
            usefulness_score = round(tool_usefulness.average_score, 4)
            judge_prompt_version = usefulness.judge_prompt_version

    return ToolReport(
        report_schema_version=REPORT_SCHEMA_VERSION,
        tool=tool,
        prompt_version=PROMPT_VERSIONS[tool],
        judge_prompt_version=judge_prompt_version,
        generated_at=generated_at.isoformat(),
        mode=mode,
        fixtures_evaluated=fixtures_evaluated,
        calibration_miss_rate=calibration_miss_rate,
        explanation_inconsistency_count=explanation_inconsistency_count,
        fabrication_candidate_count=fabrication_count,
        usefulness_score=usefulness_score,
    )


def _slug(value: str) -> str:
    """Reduce a value to filename-safe characters (alnum, dot, dash, underscore)."""
    return re.sub(r"[^A-Za-z0-9._-]", "-", value)


def report_filename(report: ToolReport) -> str:
    """Return ``<tool>-<prompt_version>-<timestamp>.json`` for a report.

    The prompt version is embedded so a report file is traceable to the prompt
    that produced it (issue #123 acceptance criterion 2).
    """
    stamp = datetime.fromisoformat(report.generated_at).strftime("%Y%m%dT%H%M%SZ")
    return f"{_slug(report.tool)}-{_slug(report.prompt_version)}-{stamp}.json"


def write_report(report: ToolReport, reports_dir: Path) -> Path:
    """Write one report as pretty-printed JSON and return its path.

    Creates ``reports_dir`` if needed. Reports are on-disk dev-tooling artifacts
    only; they are never written to ``analytics_events`` (D-045).
    """
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / report_filename(report)
    path.write_text(
        json.dumps(asdict(report), indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return path


async def run_eval(
    target: str,
    *,
    reports_dir: Path | None = None,
    generate_outputs: GenerateOutputsFn | None = None,
    scoring_outputs: ScoringOutputsFn | None = None,
    score_usefulness: bool = False,
    complete: CompleteFn | None = None,
    fixtures: list[EvalFixture] | None = None,
    now: Callable[[], datetime] | None = None,
) -> list[Path]:
    """Run the applicable checks for ``target`` and write one report per tool.

    Args:
        target: ``"all"`` or a single tool id.
        reports_dir: Output directory; defaults to :data:`REPORTS_DIR`.
        generate_outputs: Produces generative-tool outputs. The CLI passes
            :func:`live_generate_outputs` for the default full run. ``None``
            (the ``--deterministic`` path) generates no output, so generative
            reports carry ``null`` fabrication/usefulness figures and no live
            call is made.
        scoring_outputs: Produces the Resume/Job Match response mappings the
            explanation-consistency check reads. Defaults to
            :func:`deterministic_scoring_outputs`, which is credential-free, so
            the check reports a real figure even on the ``--deterministic``
            path; the CLI passes :func:`live_scoring_outputs` for the full run.
        score_usefulness: When ``True`` (and outputs exist), score usefulness via
            :func:`run_usefulness_judge`. Left ``False`` on the deterministic path.
        complete: Judge LLM entry point forwarded to the usefulness judge; tests
            inject a fake so no live call is made (D-044).
        fixtures: Corpus override; defaults to the committed synthetic corpus.
        now: Clock override for deterministic timestamps in tests.

    Returns:
        Paths of the written report files, in tool-order.
    """
    targets = resolve_targets(target)
    corpus = load_fixtures() if fixtures is None else fixtures
    clock = now or (lambda: datetime.now(UTC))
    generated_at = clock()

    calibration: CalibrationReport | None = None
    explanation: ExplanationReport | None = None
    if any(tool in CALIBRATION_TOOLS for tool in targets):
        calibration = run_calibration(corpus)
        build_scoring_outputs = scoring_outputs or deterministic_scoring_outputs
        explanation = run_explanation_check(
            await build_scoring_outputs(corpus, targets), corpus
        )

    generative_targets = [tool for tool in targets if tool in GENERATIVE_TOOLS]
    outputs: Mapping[str, Mapping[str, str]] = {}
    if generate_outputs is not None and generative_targets:
        outputs = await generate_outputs(corpus, generative_targets)

    fabrication: FabricationReport | None = None
    usefulness: UsefulnessReport | None = None
    if outputs:
        fabrication = run_fabrication_check(outputs, corpus)
        if score_usefulness:
            usefulness = await run_usefulness_judge(outputs, corpus, complete=complete)

    mode = "live" if generate_outputs is not None else "deterministic"
    out_dir = reports_dir if reports_dir is not None else REPORTS_DIR

    written: list[Path] = []
    for tool in targets:
        report = build_report(
            tool,
            generated_at=generated_at,
            mode=mode,
            calibration=calibration,
            explanation=explanation,
            fabrication=fabrication,
            usefulness=usefulness,
        )
        written.append(write_report(report, out_dir))
    return written


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point for ``python -m app.evals.run_eval``."""
    parser = argparse.ArgumentParser(
        prog="python -m app.evals.run_eval",
        description=(
            "Run R8 output-quality evals over the synthetic fixture corpus and "
            "write one versioned JSON report per tool to app/evals/reports/."
        ),
    )
    parser.add_argument(
        "target",
        help="tool id (resume, job-match, career, cover-letter, interview, "
        "portfolio) or 'all'",
    )
    parser.add_argument(
        "--deterministic",
        action="store_true",
        help="run only the credential-free deterministic checks (calibration "
        "and explanation consistency for Resume/Job Match, the latter over "
        "their heuristic-only responses); skip live generation and the "
        "usefulness judge, leaving generative live figures null. Use without "
        "Vertex credentials or to reproduce a report offline. Default is the "
        "full live run.",
    )
    parser.add_argument(
        "--reports-dir",
        type=Path,
        default=None,
        help=f"output directory for report files (default: {REPORTS_DIR})",
    )
    args = parser.parse_args(argv)

    try:
        resolve_targets(args.target)
    except ValueError as exc:
        parser.error(str(exc))

    live = not args.deterministic
    paths = asyncio.run(
        run_eval(
            args.target,
            reports_dir=args.reports_dir,
            generate_outputs=live_generate_outputs if live else None,
            scoring_outputs=live_scoring_outputs if live else None,
            score_usefulness=live,
        )
    )
    for path in paths:
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
