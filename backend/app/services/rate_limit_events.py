"""Privacy-bounded persistence for authoritative rate-limit outcomes (#140)."""

import logging
from contextlib import suppress
from datetime import UTC, datetime

from app.database import SessionLocal
from app.limiter import abuse_counters
from app.schemas.analytics import RateLimitIdentityType, RateLimitRouteFamily
from app.services.analytics import safe_record_activation_event

logger = logging.getLogger(__name__)
RATE_LIMIT_BUCKET_SECONDS = 15 * 60
RATE_LIMIT_EVIDENCE_THRESHOLD = 50

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


def threshold_evidence_for_rejection(
    *,
    route_family: RateLimitRouteFamily,
    identity_type: RateLimitIdentityType,
    now: datetime | None = None,
) -> dict | None:
    """Return one bounded evidence event when a family crosses 50 rejections.

    Shared limiter storage coalesces an unbounded rejection flood into at most
    one database row per route family and 15-minute bucket. Identity counts are
    retained only as a low-cardinality classification; firing is route-level.
    """
    observed_at = now or datetime.now(UTC)
    bucket = int(observed_at.timestamp()) // RATE_LIMIT_BUCKET_SECONDS
    identity = f"{route_family}:{bucket}"
    identity_key = f"{identity}:{identity_type}"
    abuse_counters.increment(
        "rate-limit-evidence-identity", identity_key, expiry=RATE_LIMIT_BUCKET_SECONDS * 2
    )
    total = abuse_counters.increment(
        "rate-limit-evidence-total", identity, expiry=RATE_LIMIT_BUCKET_SECONDS * 2
    )
    if total != RATE_LIMIT_EVIDENCE_THRESHOLD:
        return None

    guest = abuse_counters.get("rate-limit-evidence-identity", f"{identity}:guest")
    account = abuse_counters.get("rate-limit-evidence-identity", f"{identity}:account")
    observed_identity: RateLimitIdentityType = (
        "mixed" if guest and account else "account" if account else "guest"
    )
    return {
        "route_family": route_family,
        "identity_type": observed_identity,
        "metric_value": RATE_LIMIT_EVIDENCE_THRESHOLD,
    }


def record_rate_limit_event(
    *,
    route_family: RateLimitRouteFamily,
    identity_type: RateLimitIdentityType,
    metric_value: int = 1,
) -> None:
    """Persist one bounded event without affecting the already-limited response."""
    db = None
    try:
        db = SessionLocal()
        safe_record_activation_event(
            db,
            event_name="r10_rate_limit_event",
            operational_dimension=route_family,
            operational_outcome=identity_type,
            metric_value=metric_value,
        )
    except Exception as error:  # defensive: the 429 must still be returned
        logger.warning(
            "rate-limit evidence persist failed error_type=%s",
            type(error).__name__,
        )
    finally:
        if db is not None:
            with suppress(Exception):
                db.close()


def collect_rate_limit_evidence(
    *,
    route_family: RateLimitRouteFamily,
    identity_type: RateLimitIdentityType,
) -> None:
    """Collect and persist rejection evidence without affecting the 429 path."""
    try:
        evidence = threshold_evidence_for_rejection(
            route_family=route_family,
            identity_type=identity_type,
        )
    except Exception as error:  # defensive: optional evidence must fail open
        logger.warning(
            "rate_limit_evidence_failed error_type=%s",
            type(error).__name__,
        )
        return
    if evidence is None:
        return
    logger.warning(
        "abuse_limit_threshold_reached route=%s identity_type=%s",
        route_family,
        evidence["identity_type"],
    )
    record_rate_limit_event(**evidence)
