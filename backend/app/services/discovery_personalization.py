from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.discovered_listing import DiscoveredListing
from app.models.discovery_personalization import (
    DiscoveryDismissedListing,
    DiscoveryHiddenSource,
    DiscoveryRecommendationReport,
)
from app.models.discovery_source import DiscoverySource
from app.schemas.discovery_personalization import (
    AdminRecommendationReportItem,
    AdminRecommendationReportList,
    DiscoveryPersonalizationResponse,
    DismissalItem,
    HiddenSourceItem,
    PersonalizationExport,
    PersonalizationReportExport,
    RecommendationReportAck,
)
from app.services.analytics import safe_record_activation_event


class DiscoverySourceNotFoundError(Exception):
    """The referenced discovery source does not exist."""


class DiscoveredListingNotFoundError(Exception):
    """The referenced discovered listing does not exist."""


def _record(db: Session, *, outcome: str, source_family: str | None) -> None:
    """Emit an allowlisted personalization telemetry event (D-090).

    Carries only the outcome class and — when the source family is unambiguous —
    the source family. Never a listing id, listing content, run id, or reporter
    identity. Best-effort: instrumentation must never break a user action.
    """
    fields: dict[str, str] = {
        "event_name": "discovery_personalization_changed",
        "operational_outcome": outcome,
    }
    if source_family is not None:
        fields["operational_dimension"] = source_family
    safe_record_activation_event(db, **fields)


def _listing_source_family(listing: DiscoveredListing) -> str | None:
    """The source family of a listing's earliest attribution, or None if absent.

    Used purely as the low-cardinality telemetry dimension for a dismissal; a
    listing carries one family class per attribution and this is a stable pick.
    """
    families = sorted(
        {attribution.source.source_family for attribution in listing.attributions}
    )
    return families[0] if families else None


# ── Hidden sources ──


def hide_source(db: Session, user_id: str, source_id: str) -> HiddenSourceItem:
    source = db.query(DiscoverySource).filter(DiscoverySource.id == source_id).one_or_none()
    if source is None:
        raise DiscoverySourceNotFoundError(source_id)
    existing = (
        db.query(DiscoveryHiddenSource)
        .filter(
            DiscoveryHiddenSource.user_id == user_id,
            DiscoveryHiddenSource.source_id == source_id,
        )
        .one_or_none()
    )
    if existing is None:
        db.add(DiscoveryHiddenSource(user_id=user_id, source_id=source_id))
        db.commit()
        _record(db, outcome="source_hidden", source_family=source.source_family)
    return _hidden_item(source, _hidden_created_at(db, user_id, source_id))


def unhide_source(db: Session, user_id: str, source_id: str) -> None:
    row = (
        db.query(DiscoveryHiddenSource)
        .filter(
            DiscoveryHiddenSource.user_id == user_id,
            DiscoveryHiddenSource.source_id == source_id,
        )
        .one_or_none()
    )
    if row is None:
        return
    source = db.query(DiscoverySource).filter(DiscoverySource.id == source_id).one_or_none()
    db.delete(row)
    db.commit()
    _record(
        db,
        outcome="source_unhidden",
        source_family=source.source_family if source is not None else None,
    )


def _hidden_created_at(db: Session, user_id: str, source_id: str):
    row = (
        db.query(DiscoveryHiddenSource)
        .filter(
            DiscoveryHiddenSource.user_id == user_id,
            DiscoveryHiddenSource.source_id == source_id,
        )
        .one()
    )
    return row.created_at


def _hidden_item(source: DiscoverySource, created_at) -> HiddenSourceItem:
    return HiddenSourceItem(
        source_id=source.id,
        source_key=source.source_key,
        display_name=source.display_name,
        source_family=source.source_family,
        created_at=created_at,
    )


# ── Dismissals ──


def dismiss_recommendation(db: Session, user_id: str, listing_id: str) -> DismissalItem:
    listing = (
        db.query(DiscoveredListing).filter(DiscoveredListing.id == listing_id).one_or_none()
    )
    if listing is None:
        raise DiscoveredListingNotFoundError(listing_id)
    existing = (
        db.query(DiscoveryDismissedListing)
        .filter(
            DiscoveryDismissedListing.user_id == user_id,
            DiscoveryDismissedListing.listing_id == listing_id,
        )
        .one_or_none()
    )
    if existing is None:
        db.add(DiscoveryDismissedListing(user_id=user_id, listing_id=listing_id))
        db.commit()
        _record(
            db,
            outcome="recommendation_dismissed",
            source_family=_listing_source_family(listing),
        )
    row = (
        db.query(DiscoveryDismissedListing)
        .filter(
            DiscoveryDismissedListing.user_id == user_id,
            DiscoveryDismissedListing.listing_id == listing_id,
        )
        .one()
    )
    return DismissalItem(listing_id=row.listing_id, created_at=row.created_at)


def undismiss_recommendation(db: Session, user_id: str, listing_id: str) -> None:
    row = (
        db.query(DiscoveryDismissedListing)
        .filter(
            DiscoveryDismissedListing.user_id == user_id,
            DiscoveryDismissedListing.listing_id == listing_id,
        )
        .one_or_none()
    )
    if row is None:
        return
    listing = (
        db.query(DiscoveredListing).filter(DiscoveredListing.id == listing_id).one_or_none()
    )
    db.delete(row)
    db.commit()
    _record(
        db,
        outcome="recommendation_undismissed",
        source_family=_listing_source_family(listing) if listing is not None else None,
    )


# ── Error reports ──


def report_recommendation(
    db: Session,
    user_id: str,
    *,
    listing_id: str,
    reason_category: str,
    reason: str,
) -> RecommendationReportAck:
    listing = (
        db.query(DiscoveredListing).filter(DiscoveredListing.id == listing_id).one_or_none()
    )
    if listing is None:
        raise DiscoveredListingNotFoundError(listing_id)
    source_family = _listing_source_family(listing) or "user_provided"
    report = DiscoveryRecommendationReport(
        user_id=user_id,
        listing_id=listing.id,
        listing_title=listing.title,
        listing_company=listing.company,
        source_family=source_family,
        reason_category=reason_category,
        reason_text=reason,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    _record(db, outcome="recommendation_reported", source_family=source_family)
    return RecommendationReportAck(
        id=report.id,
        listing_id=report.listing_id,
        reason_category=report.reason_category,
        created_at=report.created_at,
    )


# ── Reads used by the feed, admin, export, and ranking ──


def list_personalization(db: Session, user_id: str) -> DiscoveryPersonalizationResponse:
    hidden_rows = (
        db.query(DiscoveryHiddenSource, DiscoverySource)
        .join(DiscoverySource, DiscoveryHiddenSource.source_id == DiscoverySource.id)
        .filter(DiscoveryHiddenSource.user_id == user_id)
        .order_by(DiscoverySource.display_name)
        .all()
    )
    dismissals = (
        db.query(DiscoveryDismissedListing)
        .filter(DiscoveryDismissedListing.user_id == user_id)
        .order_by(DiscoveryDismissedListing.created_at.desc())
        .all()
    )
    return DiscoveryPersonalizationResponse(
        hidden_sources=[_hidden_item(source, hidden.created_at) for hidden, source in hidden_rows],
        dismissals=[
            DismissalItem(listing_id=row.listing_id, created_at=row.created_at)
            for row in dismissals
        ],
    )


def hidden_source_ids(db: Session, user_id: str) -> set[str]:
    return {
        source_id
        for (source_id,) in db.query(DiscoveryHiddenSource.source_id).filter(
            DiscoveryHiddenSource.user_id == user_id
        )
    }


def dismissed_listing_ids(db: Session, user_id: str) -> set[str]:
    return {
        listing_id
        for (listing_id,) in db.query(DiscoveryDismissedListing.listing_id).filter(
            DiscoveryDismissedListing.user_id == user_id
        )
    }


def list_admin_reports(db: Session) -> AdminRecommendationReportList:
    rows = (
        db.query(DiscoveryRecommendationReport)
        .order_by(DiscoveryRecommendationReport.created_at.desc())
        .all()
    )
    return AdminRecommendationReportList(
        items=[
            AdminRecommendationReportItem(
                id=row.id,
                listing_id=row.listing_id,
                listing_title=row.listing_title,
                listing_company=row.listing_company,
                source_family=row.source_family,
                reason_category=row.reason_category,
                reason=row.reason_text,
                created_at=row.created_at,
            )
            for row in rows
        ]
    )


def export_personalization(db: Session, user_id: str) -> PersonalizationExport:
    state = list_personalization(db, user_id)
    reports = (
        db.query(DiscoveryRecommendationReport)
        .filter(DiscoveryRecommendationReport.user_id == user_id)
        .order_by(DiscoveryRecommendationReport.created_at.desc())
        .all()
    )
    return PersonalizationExport(
        hidden_sources=state.hidden_sources,
        dismissals=state.dismissals,
        reports=[
            PersonalizationReportExport(
                listing_id=row.listing_id,
                listing_title=row.listing_title,
                listing_company=row.listing_company,
                source_family=row.source_family,
                reason_category=row.reason_category,
                reason=row.reason_text,
                created_at=row.created_at,
            )
            for row in reports
        ],
    )


def delete_personalization(db: Session, user_id: str) -> dict[str, int]:
    """Owner-scoped hard delete used by the account-deletion cascade.

    Returns per-table counts so the caller's audit line can record what was
    removed without persisting any of the deleted content.
    """
    hidden = (
        db.query(DiscoveryHiddenSource)
        .filter(DiscoveryHiddenSource.user_id == user_id)
        .delete(synchronize_session=False)
    )
    dismissals = (
        db.query(DiscoveryDismissedListing)
        .filter(DiscoveryDismissedListing.user_id == user_id)
        .delete(synchronize_session=False)
    )
    reports = (
        db.query(DiscoveryRecommendationReport)
        .filter(DiscoveryRecommendationReport.user_id == user_id)
        .delete(synchronize_session=False)
    )
    return {
        "hidden_sources": hidden,
        "dismissals": dismissals,
        "reports": reports,
    }
