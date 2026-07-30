from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.analytics_event import AnalyticsEvent
from app.schemas.admin import AdminSubmissionQualityResponse, SubmissionFamilyQuality
from app.schemas.analytics import DiscoverySourceFamily, SubmissionQualityOutcome
from app.services.analytics import record_activation_event, safe_record_activation_event

SOURCE_FAMILIES: tuple[DiscoverySourceFamily, ...] = (
    "licensed",
    "employer_ats",
    "public_career_page",
    "user_provided",
)


def _rate(counts: dict[str, int], outcome: str) -> float | None:
    confirmed = counts.get("confirmed", 0)
    if confirmed == 0:
        return None
    # The privacy contract intentionally excludes submission identifiers from
    # telemetry, so aggregation cannot entity-deduplicate repeated authoritative
    # observations. Saturate at one instead of allowing duplicated observations
    # to violate the response schema and disable the governance dashboard.
    return min(round(counts.get(outcome, 0) / confirmed, 4), 1.0)


def _duplicate_prevention_rate(counts: dict[str, int]) -> float | None:
    confirmed = counts.get("confirmed", 0)
    if confirmed == 0:
        return None
    prevented = counts.get("duplicate_prevented", 0)
    return round(prevented / (confirmed + prevented), 4)


def record_submission_quality_outcome(
    db: Session,
    *,
    source_family: DiscoverySourceFamily,
    outcome: SubmissionQualityOutcome,
) -> None:
    """Record one backend-authoritative, content-free R16 quality outcome."""
    record_activation_event(
        db,
        event_name="submission_quality_outcome",
        operational_dimension=source_family,
        operational_outcome=outcome,
    )


def safe_record_submission_quality_outcome(
    db: Session,
    *,
    source_family: DiscoverySourceFamily,
    outcome: SubmissionQualityOutcome,
) -> None:
    """Best-effort variant for user-facing submission paths already committed."""
    safe_record_activation_event(
        db,
        event_name="submission_quality_outcome",
        operational_dimension=source_family,
        operational_outcome=outcome,
    )


def aggregate_submission_quality(
    db: Session,
    *,
    window_start: datetime,
    window_end: datetime,
) -> AdminSubmissionQualityResponse:
    """Return quality-first per-family rates without granting control authority."""
    rows = (
        db.query(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.operational_outcome,
            func.count(AnalyticsEvent.id),
        )
        .filter(
            AnalyticsEvent.event_name == "submission_quality_outcome",
            AnalyticsEvent.created_at >= window_start,
            AnalyticsEvent.created_at <= window_end,
        )
        .group_by(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.operational_outcome,
        )
        .all()
    )
    counts: dict[str, dict[str, int]] = {family: {} for family in SOURCE_FAMILIES}
    for family, outcome, count in rows:
        if family in counts:
            counts[family][outcome] = count

    families: list[SubmissionFamilyQuality] = []
    for family in SOURCE_FAMILIES:
        family_counts = counts[family]
        confirmed = family_counts.get("confirmed", 0)
        families.append(
            SubmissionFamilyQuality(
                source_family=family,
                evidence_base=confirmed,
                response_rate=_rate(family_counts, "response_received"),
                packet_edit_rate=_rate(family_counts, "packet_edited"),
                duplicate_prevention_rate=_duplicate_prevention_rate(family_counts),
                complaint_rate=_rate(family_counts, "complaint_reported"),
            )
        )

    return AdminSubmissionQualityResponse(
        window_start=window_start.isoformat(),
        window_end=window_end.isoformat(),
        families=families,
    )
