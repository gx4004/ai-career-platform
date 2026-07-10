"""R8 LLM-as-judge usefulness score for the four generative tools.

The generative tools (Cover Letter, Interview Q&A, Career Path, Portfolio
Planner) have no heuristic score, and the deterministic fabrication check
(:mod:`app.evals.fabrication`) only measures groundedness, not whether the
output is actually *useful*. This module supplies the usefulness signal (D-043):
for each fixture it sends that tool's generated output plus the fixture's job
description to a separate judge prompt asking for a 1-5 specificity/actionability
rating, then reports a per-tool average across the fixture set.

Same-provider-judge limitation (D-043): the judge runs against the **same**
Gemini Flash provider (D-006) that produced the output being judged. A model
grading its own family's output can share blind spots and is biased toward its
own style, so the score is a directional quality signal, not an independent
audit. Using a second provider purely as an impartial judge is explicitly out of
scope for V1 (it would reopen the single-provider decision D-006); this is an
accepted, documented V1 limitation rather than a defect.

CI exclusion + manual smoke run (D-044): scoring makes a **live** Gemini call,
which is slow, costly, and rate-limited, so this path is deliberately kept out of
the default ``pytest``/CI run — nothing here is exercised by an automated test
against the real provider. The pure logic (prompt building, score parsing,
per-tool averaging) is unit-tested in isolation with an injected fake
``complete`` callable; :func:`judge_output` / :func:`run_usefulness_judge` only
reach the live provider when called with the default (real) ``complete``.

To smoke-run the live path manually (requires configured Vertex credentials)::

    cd backend
    python - <<'PY'
    import asyncio

    from app.evals import judge_output
    from app.evals.loader import load_fixtures

    async def main():
        fixture = load_fixtures()[0]
        # A representative generated Cover Letter output for this fixture:
        sample_output = (
            "Dear Hiring Manager, drawing on my work at Nimbus Ledger reducing "
            "p95 latency by 38% across 14 microservices, I am well prepared to "
            "own and scale your services platform..."
        )
        result = await judge_output("cover-letter", fixture, sample_output)
        print(result.tool, result.fixture_id, result.score, result.rationale)

    asyncio.run(main())
    PY

A 1-5 integer score printed without error is a passing smoke run.
"""

from __future__ import annotations

import math
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass

from app.evals.fabrication import GENERATIVE_TOOLS
from app.evals.loader import EvalFixture, load_fixtures

#: Inclusive bounds of the usefulness rating scale the judge is asked to return.
MIN_USEFULNESS_SCORE = 1
MAX_USEFULNESS_SCORE = 5

#: Bumped whenever the judge prompt's wording or scale changes, so reports can be
#: compared only across matching judge-prompt versions.
JUDGE_PROMPT_VERSION = "usefulness-judge-v1"

#: Keys the judge is instructed to return in its JSON object.
JUDGE_SCORE_KEY = "score"
JUDGE_RATIONALE_KEY = "rationale"

#: Advisory JSON shape passed to the provider. The Vertex path currently ignores
#: the schema argument, but declaring it keeps the expected contract visible and
#: forward-compatible with structured-output support.
JUDGE_RESPONSE_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        JUDGE_SCORE_KEY: {
            "type": "integer",
            "minimum": MIN_USEFULNESS_SCORE,
            "maximum": MAX_USEFULNESS_SCORE,
        },
        JUDGE_RATIONALE_KEY: {"type": "string"},
    },
    "required": [JUDGE_SCORE_KEY],
}

#: Signature of the LLM entry point this module calls. Matches
#: :func:`app.services.ai_client.complete_structured` and is injectable so unit
#: tests can supply a fake without a live call.
CompleteFn = Callable[..., Awaitable[Mapping[str, object]]]

_JUDGE_SYSTEM_PROMPT = (
    "You are an impartial evaluator of AI-generated job-search materials. "
    "Rate ONLY how specific and actionable the candidate-facing output is for "
    "the given job description, on an integer scale from "
    f"{MIN_USEFULNESS_SCORE} (vague, generic, boilerplate) to "
    f"{MAX_USEFULNESS_SCORE} (concrete, tailored, immediately actionable). "
    "Do not reward length, confidence, or fabricated detail. "
    'Respond with strict JSON: {"'
    + JUDGE_SCORE_KEY
    + '": <integer '
    + f"{MIN_USEFULNESS_SCORE}-{MAX_USEFULNESS_SCORE}"
    + '>, "'
    + JUDGE_RATIONALE_KEY
    + '": "<one sentence>"}.'
)

_NO_JOB_DESCRIPTION = "(No job description was provided; judge the output on its own merits.)"


class JudgeError(ValueError):
    """Raised when the judge response cannot be parsed into a valid 1-5 score."""


def build_judge_prompt(
    output_text: str, job_description: str | None
) -> tuple[str, str]:
    """Build the ``(system_prompt, user_prompt)`` pair for the usefulness judge.

    Pure and deterministic: no network access. ``job_description`` may be
    ``None`` (the no-JD fixture case), in which case the user prompt tells the
    judge to score the output on its own merits.
    """
    job_block = job_description if job_description is not None else _NO_JOB_DESCRIPTION
    user_prompt = (
        "JOB DESCRIPTION:\n"
        f"{job_block}\n\n"
        "GENERATED OUTPUT TO RATE:\n"
        f"{output_text}\n\n"
        f"Return the JSON rating now."
    )
    return _JUDGE_SYSTEM_PROMPT, user_prompt


def _round_half_up(value: float) -> int:
    """Round to the nearest integer, rounding exact halves up (not banker's)."""
    return math.floor(value + 0.5)


def _coerce_to_number(raw: object) -> float:
    # bool is a subclass of int; reject it so True/False can't pass as 1/0.
    if isinstance(raw, bool):
        raise JudgeError(f"judge {JUDGE_SCORE_KEY!r} must be a number, got a bool")
    if isinstance(raw, int):
        return float(raw)
    if isinstance(raw, float):
        if not math.isfinite(raw):
            raise JudgeError(f"judge {JUDGE_SCORE_KEY!r} is not a finite number")
        return raw
    if isinstance(raw, str):
        try:
            return float(raw.strip())
        except ValueError as exc:
            raise JudgeError(
                f"judge {JUDGE_SCORE_KEY!r} string is not numeric: {raw!r}"
            ) from exc
    raise JudgeError(
        f"judge {JUDGE_SCORE_KEY!r} must be a number or numeric string, "
        f"got {type(raw).__name__}"
    )


def parse_judge_score(payload: Mapping[str, object]) -> int:
    """Extract and validate the 1-5 usefulness score from a judge response.

    Accepts an integer, an integer-valued or fractional float, or a numeric
    string; fractional values are rounded to the nearest integer (halves up).
    The result must land inside ``[MIN_USEFULNESS_SCORE, MAX_USEFULNESS_SCORE]``.

    Raises:
        JudgeError: If the ``score`` key is missing, non-numeric, or the rounded
            value falls outside the ``1..5`` scale.
    """
    if JUDGE_SCORE_KEY not in payload:
        raise JudgeError(f"judge response is missing the {JUDGE_SCORE_KEY!r} key")
    score = _round_half_up(_coerce_to_number(payload[JUDGE_SCORE_KEY]))
    if not (MIN_USEFULNESS_SCORE <= score <= MAX_USEFULNESS_SCORE):
        raise JudgeError(
            f"judge {JUDGE_SCORE_KEY!r} {score} is outside the "
            f"{MIN_USEFULNESS_SCORE}..{MAX_USEFULNESS_SCORE} scale"
        )
    return score


def parse_judge_rationale(payload: Mapping[str, object]) -> str:
    """Return the judge's one-line rationale, or ``""`` when absent."""
    rationale = payload.get(JUDGE_RATIONALE_KEY, "")
    return str(rationale).strip()


@dataclass(frozen=True)
class UsefulnessResult:
    """One tool's usefulness rating for one fixture's generated output."""

    tool: str
    fixture_id: str
    score: int
    rationale: str


@dataclass(frozen=True)
class ToolUsefulnessScore:
    """A tool's average usefulness across the outputs it was judged on."""

    tool: str
    evaluated: int
    average_score: float | None
    scored_fixture_ids: tuple[str, ...]


@dataclass(frozen=True)
class UsefulnessReport:
    """A full usefulness run: per-output results plus per-tool average scores.

    ``judge_prompt_version`` records which judge prompt produced the scores, so a
    report is only comparable to another with the same version (the prompt's
    wording/scale defines what a "4" means).
    """

    results: tuple[UsefulnessResult, ...]
    per_tool: dict[str, ToolUsefulnessScore]
    judge_prompt_version: str = JUDGE_PROMPT_VERSION


def _tool_score(tool: str, results: list[UsefulnessResult]) -> ToolUsefulnessScore:
    tool_results = [result for result in results if result.tool == tool]
    scored_ids = tuple(result.fixture_id for result in tool_results)
    average = (
        sum(result.score for result in tool_results) / len(tool_results)
        if tool_results
        else None
    )
    return ToolUsefulnessScore(
        tool=tool,
        evaluated=len(tool_results),
        average_score=average,
        scored_fixture_ids=scored_ids,
    )


def aggregate_usefulness(
    results: list[UsefulnessResult],
) -> dict[str, ToolUsefulnessScore]:
    """Reduce per-output results to a per-tool average for every generative tool.

    Pure and deterministic. A tool with no results reports ``evaluated == 0`` and
    ``average_score is None`` rather than being omitted.
    """
    return {tool: _tool_score(tool, results) for tool in GENERATIVE_TOOLS}


def _default_complete() -> CompleteFn:
    # Imported lazily so unit tests that always inject a fake never import the
    # provider stack, and so this module carries no import-time provider cost.
    from app.services.ai_client import complete_structured

    return complete_structured


async def judge_output(
    tool: str,
    fixture: EvalFixture,
    output_text: str,
    *,
    complete: CompleteFn | None = None,
) -> UsefulnessResult:
    """Score one generated output for usefulness against one fixture's JD.

    Args:
        tool: One of :data:`app.evals.fabrication.GENERATIVE_TOOLS`.
        fixture: The fixture whose ``job_description`` frames the rating.
        output_text: The tool's generated output to rate.
        complete: LLM entry point; defaults to the live Gemini Flash provider
            (:func:`app.services.ai_client.complete_structured`). Tests inject a
            fake so no live call is made (D-044).

    Returns:
        A :class:`UsefulnessResult` carrying the parsed 1-5 score and rationale.

    Raises:
        ValueError: If ``tool`` is not a generative tool.
        JudgeError: If the judge response has no valid 1-5 score.
    """
    if tool not in GENERATIVE_TOOLS:
        raise ValueError(f"usefulness judge only covers generative tools, got {tool!r}")
    system_prompt, user_prompt = build_judge_prompt(output_text, fixture.job_description)
    run = complete or _default_complete()
    payload = await run(system_prompt, user_prompt, JUDGE_RESPONSE_SCHEMA)
    return UsefulnessResult(
        tool=tool,
        fixture_id=fixture.id,
        score=parse_judge_score(payload),
        rationale=parse_judge_rationale(payload),
    )


async def run_usefulness_judge(
    outputs: Mapping[str, Mapping[str, str]],
    fixtures: list[EvalFixture] | None = None,
    *,
    complete: CompleteFn | None = None,
) -> UsefulnessReport:
    """Judge usefulness for all four generative tools and average per tool.

    Args:
        outputs: ``{tool_id: {fixture_id: generated_output_text}}``. Tool ids
            must be in :data:`app.evals.fabrication.GENERATIVE_TOOLS`; fixture
            ids must exist in the corpus.
        fixtures: Corpus supplying each fixture's job description; defaults to the
            committed synthetic corpus (D-041).
        complete: LLM entry point; defaults to the live provider. **Calling this
            with the default reaches the live Gemini API** and is excluded from
            CI (D-044); tests pass a fake.

    Returns:
        A :class:`UsefulnessReport` with a per-output result list and a per-tool
        average score for every generative tool (``None`` when no output was
        supplied for it).

    Raises:
        ValueError: If ``outputs`` names a non-generative tool or an unknown
            fixture id.
        JudgeError: If any judge response lacks a valid 1-5 score.
    """
    unknown_tools = [tool for tool in outputs if tool not in GENERATIVE_TOOLS]
    if unknown_tools:
        raise ValueError(
            f"outputs reference non-generative tool(s): {', '.join(sorted(unknown_tools))}"
        )

    corpus = load_fixtures() if fixtures is None else fixtures
    fixtures_by_id = {fixture.id: fixture for fixture in corpus}

    results: list[UsefulnessResult] = []
    for tool in GENERATIVE_TOOLS:
        for fixture_id, output_text in outputs.get(tool, {}).items():
            fixture = fixtures_by_id.get(fixture_id)
            if fixture is None:
                raise ValueError(
                    f"output for tool {tool!r} references unknown fixture id "
                    f"{fixture_id!r}"
                )
            results.append(
                await judge_output(tool, fixture, output_text, complete=complete)
            )

    return UsefulnessReport(
        results=tuple(results),
        per_tool=aggregate_usefulness(results),
        judge_prompt_version=JUDGE_PROMPT_VERSION,
    )
