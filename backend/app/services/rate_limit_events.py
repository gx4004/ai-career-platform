"""Privacy-bounded persistence for authoritative rate-limit outcomes (#140)."""

import logging

from app.database import SessionLocal
from app.schemas.analytics import RateLimitIdentityType, RateLimitRouteFamily
from app.services.analytics import safe_record_activation_event

logger = logging.getLogger(__name__)

_PREFIX_FAMILIES: tuple[tuple[str, RateLimitRouteFamily], ...] = (
    ("/api/v1/auth", "auth"),
    ("/api/v1/files", "imports"),
    ("/api/v1/job-posts", "imports"),
    ("/api/v1/history/workspaces/", "campaigns"),
    ("/api/v1/history", "history"),
    ("/api/v1/evidence-profile", "profile"),
    ("/api/v1/cv-documents", "cv_studio"),
    ("/api/v1/development-plan", "profile"),
    ("/api/v1/discovery", "discovery"),
    ("/api/v1/queue", "queue"),
    ("/api/v1/packets", "queue"),
    ("/api/v1/submission-authorizations", "submission"),
    ("/api/v1/admin", "admin"),
    ("/api/v1/telemetry", "telemetry"),
)
_TOOL_PREFIXES = (
    "/api/v1/resume",
    "/api/v1/job-match",
    "/api/v1/cover-letter",
    "/api/v1/interview",
    "/api/v1/career",
    "/api/v1/portfolio",
)


def rate_limit_route_family(path: str) -> RateLimitRouteFamily:
    if path.startswith(_TOOL_PREFIXES):
        return "tools"
    for prefix, family in _PREFIX_FAMILIES:
        if path.startswith(prefix):
            return family
    return "other"


def record_rate_limit_event(
    *, route_family: RateLimitRouteFamily, identity_type: RateLimitIdentityType
) -> None:
    """Persist one bounded event without affecting the already-limited response."""
    db = SessionLocal()
    try:
        safe_record_activation_event(
            db,
            event_name="r10_rate_limit_event",
            operational_dimension=route_family,
            operational_outcome=identity_type,
        )
    except Exception as error:  # defensive: the 429 must still be returned
        logger.warning(
            "rate-limit evidence persist failed error_type=%s",
            type(error).__name__,
        )
    finally:
        db.close()
