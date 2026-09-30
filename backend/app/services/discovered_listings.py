"""The product-owned discovered-listing store (ADR 0008).

Canonical listings are deduplicated by a hash of their normalized title, company
and description; each source posting is an attribution row keyed by
``(source_id, source_listing_key)``. Ingestion writes one source's whole payload
per call and commits once. There is one scheduler loop in one process, so no two
writers ever store for the same source at the same time.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse, urlunparse

from sqlalchemy import delete, exists, select, update
from sqlalchemy.orm import Session

from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_source import DiscoverySource
from app.schemas.discovered_listings import DiscoveredListingInput
from app.services.ats_providers import listing_host_for_api_host

_MUTABLE_FIELDS = ("location", "remote", "posted_at", "apply_url", "department")


@dataclass(frozen=True)
class StoreCounts:
    stored: int
    deduplicated: int
    skipped: int


@dataclass(frozen=True)
class ListingExpiryResult:
    attributions_deleted: int
    listings_deleted: int


def store_source_listings(
    db: Session,
    source: DiscoverySource,
    bodies: list[DiscoveredListingInput],
    *,
    retrieved_at: datetime,
) -> StoreCounts:
    """Upsert one source's current listings in a fixed number of statements.

    ``stored`` counts new canonical listings; ``deduplicated`` counts postings
    whose content already had a canonical listing. An unchanged posting only has
    its retrieval date bumped, in one UPDATE for the whole source. The caller
    commits.
    """
    by_key = {body.source_listing_key: body for body in bodies}
    digests = {
        key: listing_content_sha256(body.title, body.company, body.description)
        for key, body in by_key.items()
    }
    attributions = {
        row.source_listing_key: row
        for row in db.scalars(
            select(DiscoveredListingAttribution).where(
                DiscoveredListingAttribution.source_id == source.id
            )
        )
    }
    listings = (
        {
            row.content_sha256: row
            for row in db.scalars(
                select(DiscoveredListing).where(
                    DiscoveredListing.content_sha256.in_(set(digests.values()))
                )
            )
        }
        if digests
        else {}
    )

    stored = deduplicated = skipped = 0
    unchanged: list[str] = []
    moved_from: set[str] = set()
    for key, body in by_key.items():
        try:
            source_url = _canonical_source_url(body.source_url, source)
        except ValueError:
            skipped += 1
            continue
        listing = listings.get(digests[key])
        attribution = attributions.get(key)
        if listing is None:
            stored += 1
            listing = DiscoveredListing(
                id=str(uuid.uuid4()),
                content_sha256=digests[key],
                title=body.title.strip(),
                company=body.company.strip(),
                description=body.description.strip(),
            )
            _set_mutable_fields(listing, body)
            db.add(listing)
            listings[digests[key]] = listing
        else:
            deduplicated += 1
            # Refresh location/apply link/etc. only on a re-fetch of the same
            # posting: the same text posted for another office must not
            # overwrite this canonical row's office.
            if attribution is not None and attribution.listing_id == listing.id:
                _set_mutable_fields(listing, body)

        if attribution is None:
            db.add(
                DiscoveredListingAttribution(
                    listing_id=listing.id,
                    source_id=source.id,
                    source_listing_key=key,
                    source_url=source_url,
                    retrieved_at=retrieved_at,
                )
            )
        elif attribution.listing_id == listing.id and attribution.source_url == source_url:
            unchanged.append(attribution.id)
        else:
            if attribution.listing_id != listing.id:
                moved_from.add(attribution.listing_id)
            attribution.listing_id = listing.id
            attribution.source_url = source_url
            attribution.retrieved_at = retrieved_at
    db.flush()

    if unchanged:
        db.execute(
            update(DiscoveredListingAttribution)
            .where(DiscoveredListingAttribution.id.in_(unchanged))
            .values(retrieved_at=retrieved_at)
            .execution_options(synchronize_session=False)
        )
    if moved_from:
        db.execute(
            delete(DiscoveredListing)
            .where(DiscoveredListing.id.in_(moved_from), ~_has_attribution())
            .execution_options(synchronize_session=False)
        )
    return StoreCounts(stored=stored, deduplicated=deduplicated, skipped=skipped)


def expire_discovered_listings(db: Session, *, now: datetime | None = None) -> ListingExpiryResult:
    """Delete attributions past their source's retention, then orphaned listings."""
    now = now or datetime.now(UTC)
    attributions_deleted = 0
    for source_id, retention_days in db.execute(
        select(DiscoverySource.id, DiscoverySource.retention_days)
    ):
        attributions_deleted += db.execute(
            delete(DiscoveredListingAttribution)
            .where(
                DiscoveredListingAttribution.source_id == source_id,
                DiscoveredListingAttribution.retrieved_at < now - timedelta(days=retention_days),
            )
            .execution_options(synchronize_session=False)
        ).rowcount
    listings_deleted = db.execute(
        delete(DiscoveredListing)
        .where(~_has_attribution())
        .execution_options(synchronize_session=False)
    ).rowcount
    db.commit()
    return ListingExpiryResult(attributions_deleted, listings_deleted)


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


def _has_attribution():
    return exists().where(DiscoveredListingAttribution.listing_id == DiscoveredListing.id)


def _set_mutable_fields(listing: DiscoveredListing, body: DiscoveredListingInput) -> None:
    values = {
        "location": _stripped_or_none(body.location),
        "remote": body.remote,
        "posted_at": body.posted_at,
        "apply_url": body.apply_url,
        "department": _stripped_or_none(body.department),
    }
    for field in _MUTABLE_FIELDS:
        if getattr(listing, field) != values[field]:
            setattr(listing, field, values[field])


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value)).strip()


def _canonical_source_url(value: str, source: DiscoverySource) -> str:
    """The posting's public link, which must sit on the source's own board host.

    An employer-ATS source's API host (``boards-api.greenhouse.io``) pairs with
    exactly one hosted-board host (``boards.greenhouse.io``); any other source
    must link to its endpoint's own host.
    """
    parsed = urlparse(value)
    endpoint_host = urlparse(source.endpoint_url or "").hostname or ""
    allowed_host = (
        listing_host_for_api_host(endpoint_host)
        if source.source_family == "employer_ats"
        else endpoint_host
    )
    if parsed.username or parsed.password or not allowed_host or parsed.hostname != allowed_host:
        raise ValueError("Listing attribution URL must belong to the governed source host")
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", "", ""))


def _stripped_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
