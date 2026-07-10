"""Output Quality Program (R8) evaluation harness.

Houses the hand-authored synthetic fixture corpus (``fixtures/``), the loader
that reads it into typed objects, and the calibration check that scores each
fixture against its expected band. Fixtures are never sampled, anonymized, or
derived from real user ``ToolRun`` content (see docs/decisions.md D-041 and
docs/adr/0002-r8-eval-fixture-data-source.md).
"""

from app.evals.calibration import (
    CALIBRATION_THRESHOLD,
    TOOL_JOB_MATCH,
    TOOL_RESUME_ANALYZER,
    CalibrationReport,
    CalibrationResult,
    ToolMissRate,
    run_calibration,
)
from app.evals.fabrication import (
    GENERATIVE_TOOLS,
    TOOL_CAREER_PATH,
    TOOL_COVER_LETTER,
    TOOL_INTERVIEW_QA,
    TOOL_PORTFOLIO_PLANNER,
    Claim,
    FabricationReport,
    FabricationResult,
    ToolFabricationCount,
    check_output,
    extract_claims,
    find_fabrication_candidates,
    run_fabrication_check,
)
from app.evals.loader import FIXTURES_DIR, EvalFixture, load_fixtures
from app.evals.usefulness import (
    JUDGE_PROMPT_VERSION,
    MAX_USEFULNESS_SCORE,
    MIN_USEFULNESS_SCORE,
    JudgeError,
    ToolUsefulnessScore,
    UsefulnessReport,
    UsefulnessResult,
    aggregate_usefulness,
    build_judge_prompt,
    judge_output,
    parse_judge_score,
    run_usefulness_judge,
)

__all__ = [
    "CALIBRATION_THRESHOLD",
    "GENERATIVE_TOOLS",
    "JUDGE_PROMPT_VERSION",
    "MAX_USEFULNESS_SCORE",
    "MIN_USEFULNESS_SCORE",
    "CalibrationReport",
    "CalibrationResult",
    "Claim",
    "EvalFixture",
    "FIXTURES_DIR",
    "FabricationReport",
    "FabricationResult",
    "JudgeError",
    "TOOL_CAREER_PATH",
    "TOOL_COVER_LETTER",
    "TOOL_INTERVIEW_QA",
    "TOOL_JOB_MATCH",
    "TOOL_PORTFOLIO_PLANNER",
    "TOOL_RESUME_ANALYZER",
    "ToolFabricationCount",
    "ToolMissRate",
    "ToolUsefulnessScore",
    "UsefulnessReport",
    "UsefulnessResult",
    "aggregate_usefulness",
    "build_judge_prompt",
    "check_output",
    "extract_claims",
    "find_fabrication_candidates",
    "judge_output",
    "load_fixtures",
    "parse_judge_score",
    "run_calibration",
    "run_fabrication_check",
    "run_usefulness_judge",
]
