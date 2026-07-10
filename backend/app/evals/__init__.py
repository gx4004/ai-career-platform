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
from app.evals.loader import FIXTURES_DIR, EvalFixture, load_fixtures

__all__ = [
    "CALIBRATION_THRESHOLD",
    "CalibrationReport",
    "CalibrationResult",
    "EvalFixture",
    "FIXTURES_DIR",
    "TOOL_JOB_MATCH",
    "TOOL_RESUME_ANALYZER",
    "ToolMissRate",
    "load_fixtures",
    "run_calibration",
]
