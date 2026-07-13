import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Query

from app.auth.security import hash_password
from app.models.campaign_listing import CampaignListing
from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.user import User
from app.schemas.discovered_listings import DiscoveredListingInput
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.services.discovered_listings import (
    expire_discovered_listings,
    listing_content_sha256,
    store_discovered_listing,
)
from app.services.discovery_sources import register_source, update_source

FIXTURE = json.loads((Path(__file__).parent / "fixtures/discovered_listings.json").read_text())


def _reviewer(db):
    reviewer = User(
        email="listing-reviewer@example.com",
        hashed_password=hash_password("password123"),
        is_admin=True,
    )
    db.add(reviewer)
    db.commit()
    return reviewer


def _source(db, reviewer, key: str, host: str, retention_days: int):
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key=key,
            display_name=key,
            source_family="licensed",
            owner="Discovery Operations",
            allowed_behavior="feed",
            endpoint_url=f"https://{host}/jobs",
            allowed_query_parameters=["role"],
            robots_policy="not_applicable",
            rate_limit_per_minute=10,
            attribution_rule="Show source and original link",
            retention_days=retention_days,
        ),
    )
    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="accepted"),
        actor=reviewer,
    )
    update_source(db, source, DiscoverySourceUpdate(kill_switch=False))
    return source


def test_cross_source_duplicates_collapse_but_near_miss_stays_distinct(db):
    reviewer = _reviewer(db)
    _source(db, reviewer, "feed-a", "feed-a.example", 30)
    _source(db, reviewer, "feed-b", "feed-b.example", 30)
    first, second = FIXTURE["known_duplicate"]

    first_result = store_discovered_listing(
        db, source_key="feed-a", body=DiscoveredListingInput(**first)
    )
    duplicate_result = store_discovered_listing(
        db, source_key="feed-b", body=DiscoveredListingInput(**second)
    )
    near_result = store_discovered_listing(
        db,
        source_key="feed-b",
        body=DiscoveredListingInput(**FIXTURE["near_miss"]),
    )

    assert first_result.deduplicated is False
    assert duplicate_result.deduplicated is True
    assert duplicate_result.listing.id == first_result.listing.id
    assert near_result.deduplicated is False
    assert near_result.listing.id != first_result.listing.id
    assert db.query(DiscoveredListing).count() == 2
    assert db.query(DiscoveredListingAttribution).count() == 3
    assert duplicate_result.attribution.source_url == "https://feed-b.example/openings/9001"
    assert db.query(CampaignListing).count() == 0
    assert not hasattr(first_result.listing, "workspace_id")


def test_expiry_uses_each_sources_current_retention_and_removes_orphans(db):
    reviewer = _reviewer(db)
    source_a = _source(db, reviewer, "feed-a", "feed-a.example", 5)
    source_b = _source(db, reviewer, "feed-b", "feed-b.example", 30)
    now = datetime(2026, 7, 13, tzinfo=UTC)
    retrieved = now - timedelta(days=10)
    first, second = FIXTURE["known_duplicate"]
    store_discovered_listing(
        db,
        source_key=source_a.source_key,
        body=DiscoveredListingInput(**first),
        retrieved_at=retrieved,
    )
    store_discovered_listing(
        db,
        source_key=source_b.source_key,
        body=DiscoveredListingInput(**second),
        retrieved_at=retrieved,
    )

    first_expiry = expire_discovered_listings(db, now=now)
    assert first_expiry.attributions_deleted == 1
    assert first_expiry.listings_deleted == 0
    assert db.query(DiscoveredListingAttribution).one().source_id == source_b.id

    update_source(db, source_b, DiscoverySourceUpdate(retention_days=5))
    second_expiry = expire_discovered_listings(db, now=now)
    assert second_expiry.attributions_deleted == 1
    assert second_expiry.listings_deleted == 1
    assert db.query(DiscoveredListing).count() == 0


def test_retention_boundary_is_kept(db):
    reviewer = _reviewer(db)
    source = _source(db, reviewer, "feed-a", "feed-a.example", 5)
    now = datetime(2026, 7, 13, tzinfo=UTC)
    store_discovered_listing(
        db,
        source_key=source.source_key,
        body=DiscoveredListingInput(**FIXTURE["known_duplicate"][0]),
        retrieved_at=now - timedelta(days=5),
    )
    result = expire_discovered_listings(db, now=now)
    assert result.attributions_deleted == 0
    assert db.query(DiscoveredListing).count() == 1


def test_reingested_source_key_moves_attribution_without_leaving_an_orphan(db):
    reviewer = _reviewer(db)
    source = _source(db, reviewer, "feed-a", "feed-a.example", 30)
    original = FIXTURE["known_duplicate"][0]
    replacement = {
        **original,
        "title": "Senior Platform Engineer",
        "description": "A materially changed role with expanded responsibilities.",
    }

    first = store_discovered_listing(
        db,
        source_key=source.source_key,
        body=DiscoveredListingInput(**original),
    )
    assert first.listing.attributions == [first.attribution]
    second = store_discovered_listing(
        db,
        source_key=source.source_key,
        body=DiscoveredListingInput(**replacement),
    )

    assert second.listing.id != first.listing.id
    assert second.attribution.listing_id == second.listing.id
    assert db.query(DiscoveredListingAttribution).count() == 1
    assert db.query(DiscoveredListing).count() == 1


def test_canonical_insert_collision_reuses_the_winning_listing(db, monkeypatch):
    reviewer = _reviewer(db)
    source = _source(db, reviewer, "feed-a", "feed-a.example", 30)
    body = DiscoveredListingInput(**FIXTURE["known_duplicate"][0])
    winner = DiscoveredListing(
        content_sha256=listing_content_sha256(body.title, body.company, body.description),
        title=body.title,
        company=body.company,
        description=body.description,
    )
    db.add(winner)
    db.commit()
    original_first = Query.first
    hidden = False

    def hide_winning_listing_once(query):
        nonlocal hidden
        entity = query.column_descriptions[0].get("entity")
        if entity is DiscoveredListing and not hidden:
            hidden = True
            return None
        return original_first(query)

    monkeypatch.setattr(Query, "first", hide_winning_listing_once)
    result = store_discovered_listing(db, source_key=source.source_key, body=body)

    assert hidden is True
    assert result.deduplicated is True
    assert result.listing.id == winner.id
    assert db.query(DiscoveredListing).count() == 1


def test_attribution_insert_collision_updates_the_winning_attribution(db, monkeypatch):
    reviewer = _reviewer(db)
    source = _source(db, reviewer, "feed-a", "feed-a.example", 30)
    body = DiscoveredListingInput(**FIXTURE["known_duplicate"][0])
    first = store_discovered_listing(db, source_key=source.source_key, body=body)
    original_first = Query.first
    hidden = False

    def hide_winning_attribution_once(query):
        nonlocal hidden
        entity = query.column_descriptions[0].get("entity")
        if entity is DiscoveredListingAttribution and not hidden:
            hidden = True
            return None
        return original_first(query)

    monkeypatch.setattr(Query, "first", hide_winning_attribution_once)
    refreshed_at = datetime(2026, 7, 13, tzinfo=UTC)
    result = store_discovered_listing(
        db,
        source_key=source.source_key,
        body=body,
        retrieved_at=refreshed_at,
    )

    assert hidden is True
    assert result.attribution.id == first.attribution.id
    assert result.attribution.retrieved_at.replace(tzinfo=UTC) == refreshed_at
    assert db.query(DiscoveredListingAttribution).count() == 1
