"""Server-authoritative activation gates for provisional build-ahead outcomes."""

from collections.abc import Callable

from fastapi import HTTPException, status

from app.config import settings

_OUTCOME_FLAGS: dict[str, tuple[str, ...]] = {
    "r11": ("R11_EVIDENCE_PROFILE_ENABLED",),
    "r12": ("R11_EVIDENCE_PROFILE_ENABLED", "R12_CV_STUDIO_ENABLED"),
    "r13": (
        "R11_EVIDENCE_PROFILE_ENABLED",
        "R12_CV_STUDIO_ENABLED",
        "R13_CAMPAIGNS_ENABLED",
    ),
    "r14": (
        "R11_EVIDENCE_PROFILE_ENABLED",
        "R12_CV_STUDIO_ENABLED",
        "R13_CAMPAIGNS_ENABLED",
        "R14_DISCOVERY_ENABLED",
    ),
    "r15": (
        "R11_EVIDENCE_PROFILE_ENABLED",
        "R12_CV_STUDIO_ENABLED",
        "R13_CAMPAIGNS_ENABLED",
        "R14_DISCOVERY_ENABLED",
        "R15_QUEUE_ENABLED",
    ),
    "r16": (
        "R11_EVIDENCE_PROFILE_ENABLED",
        "R12_CV_STUDIO_ENABLED",
        "R13_CAMPAIGNS_ENABLED",
        "R14_DISCOVERY_ENABLED",
        "R15_QUEUE_ENABLED",
        "R16_SUBMISSION_FOUNDATION_ENABLED",
    ),
    "r17": (
        "R11_EVIDENCE_PROFILE_ENABLED",
        "R12_CV_STUDIO_ENABLED",
        "R13_CAMPAIGNS_ENABLED",
        "R14_DISCOVERY_ENABLED",
        "R15_QUEUE_ENABLED",
        "R16_SUBMISSION_FOUNDATION_ENABLED",
        "R17_DEVELOPMENT_LOOP_ENABLED",
    ),
}


def outcome_enabled(outcome: str) -> bool:
    """Require the outcome and every upstream outcome to be explicitly active."""
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
