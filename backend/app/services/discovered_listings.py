from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse, urlunparse

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_source import DiscoverySource
from app.schemas.discovered_listings import DiscoveredListingInput
from app.services.analytics import safe_record_activation_event
from app.services.discovery_sources import require_ingestion_allowed


@dataclass(frozen=True)
class ListingStoreResult:
    listing: DiscoveredListing
    attribution: DiscoveredListingAttribution
    deduplicated: bool


@dataclass(frozen=True)
class ListingExpiryResult:
    attributions_deleted: int
    listings_deleted: int


def store_discovered_listing(
    db: Session,
    *,
    source_key: str,
    body: DiscoveredListingInput,
    retrieved_at: datetime | None = None,
) -> ListingStoreResult:
    source = (
        db.query(DiscoverySource)
        .filter_by(source_key=source_key)
        .with_for_update()
        .one()
    )
    require_ingestion_allowed(db, source_key, source.allowed_behavior)
    source_family = source.source_family
    source_url = _canonical_source_url(body.source_url, source.endpoint_url or "")
    digest = listing_content_sha256(body.title, body.company, body.description)
    listing = db.query(DiscoveredListing).filter_by(content_sha256=digest).first()
    deduplicated = listing is not None
    if listing is None:
        listing = DiscoveredListing(
            content_sha256=digest,
            title=body.title.strip(),
            company=body.company.strip(),
            description=body.description.strip(),
        )
        try:
            with db.begin_nested():
                db.add(listing)
                db.flush()
        except IntegrityError:
            # Another ingestion worker can win the unique-content race between
            # our lookup and insert. Reuse its canonical row rather than
            # failing or creating a parallel listing.
            listing = db.query(DiscoveredListing).filter_by(content_sha256=digest).one()
            deduplicated = True

    attribution = (
        db.query(DiscoveredListingAttribution)
        .filter_by(source_id=source.id, source_listing_key=body.source_listing_key)
        .with_for_update()
        .first()
    )
    previous_listing_id: str | None = None
    if attribution is None:
        attribution = DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source.id,
            source_listing_key=body.source_listing_key,
            source_url=source_url,
            retrieved_at=retrieved_at or datetime.now(UTC),
        )
        try:
            with db.begin_nested():
                db.add(attribution)
                db.flush()
        except IntegrityError:
            # A parallel refresh of the same source record won the unique-key
            # race. Treat it as the existing attribution and update it below.
            attribution = (
                db.query(DiscoveredListingAttribution)
                .filter_by(source_id=source.id, source_listing_key=body.source_listing_key)
                .with_for_update()
                .one()
            )
            previous_listing_id = attribution.listing_id
            attribution.listing = listing
            attribution.source_url = source_url
            attribution.retrieved_at = retrieved_at or datetime.now(UTC)
    else:
        previous_listing_id = attribution.listing_id
        attribution.listing = listing
        attribution.source_url = source_url
        attribution.retrieved_at = retrieved_at or datetime.now(UTC)
    db.flush()
    if previous_listing_id is not None and previous_listing_id != listing.id:
        previous_listing = (
            db.query(DiscoveredListing)
            .filter_by(id=previous_listing_id)
            .with_for_update()
            .one_or_none()
        )
        has_attribution = (
            db.query(DiscoveredListingAttribution.id)
            .filter_by(listing_id=previous_listing_id)
            .first()
            is not None
        )
        if previous_listing is not None and not has_attribution:
            db.delete(previous_listing)
    db.commit()
    db.refresh(listing)
    db.refresh(attribution)
    # Bounded per-source-family ingest outcome for the operator health view
    # (#177). Recorded after the store commit so it never rides the ingestion
    # transaction; carries only the family and the dedup outcome class.
    safe_record_activation_event(
        db,
        event_name="discovery_source_ingest_outcome",
        operational_dimension=source_family,
        operational_outcome="deduplicated" if deduplicated else "ingested",
    )
    return ListingStoreResult(listing, attribution, deduplicated)


def expire_discovered_listings(db: Session, *, now: datetime | None = None) -> ListingExpiryResult:
    now = now or datetime.now(UTC)
    expired_attributions: list[DiscoveredListingAttribution] = []
    governed_sources = (
        db.query(DiscoverySource)
        .order_by(DiscoverySource.id)
        .populate_existing()
        .with_for_update()
        .all()
    )
    sources_by_id = {source.id: source for source in governed_sources}
    governed_attributions = []
    if sources_by_id:
        # Match store's source -> attribution -> canonical lock order to avoid
        # deadlocks while re-reading the rows that determine expiry.
        governed_attributions = (
            db.query(DiscoveredListingAttribution)
            .filter(DiscoveredListingAttribution.source_id.in_(sources_by_id))
            .order_by(
                DiscoveredListingAttribution.source_id,
                DiscoveredListingAttribution.id,
            )
            .populate_existing()
            .with_for_update()
            .all()
        )
    for attribution in governed_attributions:
        source = sources_by_id[attribution.source_id]
        retrieved_at = attribution.retrieved_at
        if retrieved_at.tzinfo is None:
            retrieved_at = retrieved_at.replace(tzinfo=UTC)
        if retrieved_at < now - timedelta(days=source.retention_days):
            expired_attributions.append(attribution)

    expired_families = [
        sources_by_id[item.source_id].source_family for item in expired_attributions
    ]
    affected_listing_ids = {item.listing_id for item in expired_attributions}
    locked_listings = []
    if affected_listing_ids:
        # Parent row locks serialize expiry/deletion with FK-backed attribution
        # inserts, preventing a newly inserted attribution from being cascaded
        # away with a canonical row we observed as orphaned.
        locked_listings = (
            db.query(DiscoveredListing)
            .filter(DiscoveredListing.id.in_(affected_listing_ids))
            .with_for_update()
            .all()
        )
    for attribution in expired_attributions:
        db.delete(attribution)
    db.flush()
    listings_deleted = 0
    for candidate in locked_listings:
        has_attribution = (
            db.query(DiscoveredListingAttribution.id)
            .filter_by(listing_id=candidate.id)
            .first()
            is not None
        )
        if not has_attribution:
            db.delete(candidate)
            listings_deleted += 1
    db.commit()
    # Bounded per-source-family expiry outcomes for the operator health view
    # (#177). Emitted after the expiry transaction commits so instrumentation
    # never holds the row locks; one event per expired attribution carries only
    # the family and the `expired` outcome class — no listing content or id.
    for family in expired_families:
        safe_record_activation_event(
            db,
            event_name="discovery_source_expiry",
            operational_dimension=family,
            operational_outcome="expired",
        )
    return ListingExpiryResult(len(expired_attributions), listings_deleted)


def listing_content_sha256(title: str, company: str, description: str) -> str:
    canonical = json.dumps(
        {
            "company": _normalize(company),
            "description": _normalize(description),
            "title": _normalize(title),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value)).strip()


def _canonical_source_url(value: str, endpoint_url: str) -> str:
    parsed = urlparse(value)
    endpoint = urlparse(endpoint_url)
    if parsed.username or parsed.password or parsed.hostname != endpoint.hostname:
        raise ValueError("Listing attribution URL must belong to the governed source host")
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", "", ""))
