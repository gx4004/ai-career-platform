from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.discovered_listing import DiscoveredListingAttribution
from app.models.discovery_source import DiscoverySource
from app.schemas.admin import AdminSourceHealthResponse, SourceFamilyHealth

# The four canonical source families, in registry preference order (D-085). The
# health view always returns all four so an operator sees the whole landscape,
# including families with nothing registered yet.
SOURCE_FAMILIES: tuple[str, ...] = (
    "licensed",
    "employer_ats",
    "public_career_page",
    "user_provided",
)

# An attribution whose most recent retrieval is older than this is counted as
# stale for the operator view. Fixed, documented threshold — not a per-source
# retention rule (retention governs deletion; staleness governs "is this family
# still being refreshed?").
SOURCE_STALENESS_THRESHOLD_DAYS = 7


def aggregate_source_health(
    db: Session,
    *,
    now: datetime | None = None,
) -> AdminSourceHealthResponse:
    """Aggregate per-source-family operational health for the admin view (#177, D-053).

    Read-only. Every figure is a bounded per-family aggregate:

    * registry posture from ``discovery_sources`` (counts by family and state);
    * listings-store stock from ``discovered_listing_attributions`` (volume,
      staleness, oldest/newest retrieval timestamps).

    No listing content, listing id, full URL, source key/name, or user identifier
    is reachable from this response — only source-family strings and integer
    counts (plus min/max retrieval timestamps, which are not user data).
    """
    now = now or datetime.now(UTC)
    stale_before = now - timedelta(days=SOURCE_STALENESS_THRESHOLD_DAYS)

    # ── Registry posture (current state) ──
    registry_rows = (
        db.query(
            DiscoverySource.source_family,
            DiscoverySource.terms_status,
            DiscoverySource.kill_switch,
            func.count(DiscoverySource.id),
        )
        .group_by(
            DiscoverySource.source_family,
            DiscoverySource.terms_status,
            DiscoverySource.kill_switch,
        )
        .all()
    )

    # ── Listings-store stock (current state) ──
    stock_rows = (
        db.query(
            DiscoverySource.source_family,
            func.count(DiscoveredListingAttribution.id),
            func.min(DiscoveredListingAttribution.retrieved_at),
            func.max(DiscoveredListingAttribution.retrieved_at),
        )
        .join(
            DiscoverySource,
            DiscoverySource.id == DiscoveredListingAttribution.source_id,
        )
        .group_by(DiscoverySource.source_family)
        .all()
    )
    stale_rows = (
        db.query(
            DiscoverySource.source_family,
            func.count(DiscoveredListingAttribution.id),
        )
        .join(
            DiscoverySource,
            DiscoverySource.id == DiscoveredListingAttribution.source_id,
        )
        .filter(DiscoveredListingAttribution.retrieved_at < stale_before)
        .group_by(DiscoverySource.source_family)
        .all()
    )

    families: dict[str, SourceFamilyHealth] = {
        family: SourceFamilyHealth(source_family=family) for family in SOURCE_FAMILIES
    }

    for family, terms_status, kill_switch, count in registry_rows:
        health = families.get(family)
        if health is None:
            continue
        health.source_count += count
        if kill_switch:
            health.killed_count += count
        if terms_status != "accepted":
            health.pending_terms_count += count
        elif not kill_switch:
            health.active_count += count

    for family, listing_count, oldest, newest in stock_rows:
        health = families.get(family)
        if health is None:
            continue
        health.listing_count = listing_count
        health.oldest_retrieved_at = _isoformat(oldest)
        health.newest_retrieved_at = _isoformat(newest)

    for family, stale_count in stale_rows:
        health = families.get(family)
        if health is None:
            continue
        health.stale_count = stale_count

    return AdminSourceHealthResponse(
        staleness_threshold_days=SOURCE_STALENESS_THRESHOLD_DAYS,
        families=[families[family] for family in SOURCE_FAMILIES],
    )


def _isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()
