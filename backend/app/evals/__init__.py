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

__all__ = [
    "CALIBRATION_THRESHOLD",
    "GENERATIVE_TOOLS",
    "CalibrationReport",
    "CalibrationResult",
    "Claim",
    "EvalFixture",
    "FIXTURES_DIR",
    "FabricationReport",
    "FabricationResult",
    "TOOL_CAREER_PATH",
    "TOOL_COVER_LETTER",
    "TOOL_INTERVIEW_QA",
    "TOOL_JOB_MATCH",
    "TOOL_PORTFOLIO_PLANNER",
    "TOOL_RESUME_ANALYZER",
    "ToolFabricationCount",
    "ToolMissRate",
    "check_output",
    "extract_claims",
    "find_fabrication_candidates",
    "load_fixtures",
    "run_calibration",
    "run_fabrication_check",
]
