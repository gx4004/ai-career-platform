"""Server-authoritative activation gates for provisional build-ahead outcomes.

Each outcome (R11-R17) is an independent on/off toggle: enabling one does not
require any other outcome to also be enabled, and disabling one does not dark
any other outcome's routes (#321, Phase 1a). Earlier revisions chained these
gates (each outcome required every earlier one too); that chain is gone.

The one place a real data dependency exists — CV Studio's evidence-grounded
tailoring reads confirmed Evidence Profile items — is handled at the data
layer, not here: ``run_tool_pipeline`` only attaches an evidence payload when
``outcome_enabled("r11")`` is true, and the CV document/tailoring services
already treat a missing or empty evidence profile as "no evidence available"
rather than an error. So CV Studio (R12) stays fully usable with R11 off; it
just degrades the evidence-grounded parts instead of crashing.
"""

from collections.abc import Callable

from fastapi import HTTPException, status

from app.config import settings

_OUTCOME_FLAGS: dict[str, tuple[str, ...]] = {
    "r11": ("R11_EVIDENCE_PROFILE_ENABLED",),
    "r12": ("R12_CV_STUDIO_ENABLED",),
    "r13": ("R13_CAMPAIGNS_ENABLED",),
    "r14": ("R14_DISCOVERY_ENABLED",),
    "r15": ("R15_QUEUE_ENABLED",),
    "r16": ("R16_SUBMISSION_FOUNDATION_ENABLED",),
    "r17": ("R17_DEVELOPMENT_LOOP_ENABLED",),
}


def outcome_enabled(outcome: str) -> bool:
    """Require the outcome's own flag (and only its own flag) to be active."""
    return all(bool(getattr(settings, flag)) for flag in _OUTCOME_FLAGS[outcome])


def _gate(outcome: str) -> Callable[[], None]:
    def require_enabled() -> None:
        if not outcome_enabled(outcome):
            # Treat dark-shipped routes as absent. Do not reveal provisional API
            # inventory to unauthenticated callers or invite client retries.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feature not available",
            )

    require_enabled.__name__ = f"require_{outcome}_enabled"
    return require_enabled


require_r11_enabled = _gate("r11")
require_r12_enabled = _gate("r12")
require_r13_enabled = _gate("r13")
require_r14_enabled = _gate("r14")
require_r15_enabled = _gate("r15")
require_r16_enabled = _gate("r16")
require_r17_enabled = _gate("r17")
