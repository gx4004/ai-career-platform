import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.discovered_listing import DiscoveredListingAttribution
from app.models.discovery_source import DiscoverySource
from app.models.user import User
from app.schemas.discovered_listings import DiscoveredListingInput
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.services.analytics import safe_record_activation_event
from app.services.discovered_listings import (
    expire_discovered_listings,
    store_discovered_listing,
)
from app.services.discovery_sources import (
    IngestionRefusal,
    SourceIngestionRefused,
    register_source,
    require_ingestion_allowed,
    update_source,
)
from app.services.source_health import (
    SOURCE_FAMILIES,
    SOURCE_STALENESS_THRESHOLD_DAYS,
    aggregate_source_health,
)

PREFIX = "/api/v1"
FIXTURE = json.loads((Path(__file__).parent / "fixtures/discovered_listings.json").read_text())


def _admin(db, email: str = "health-admin@example.com") -> User:
    admin = User(
        email=email,
        hashed_password=hash_password("password123"),
        full_name="Health Admin",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _activated_source(db, reviewer, *, key: str, host: str, retention_days: int = 30):
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
    update_source(db, source, DiscoverySourceUpdate(terms_status="accepted"), actor=reviewer)
    update_source(db, source, DiscoverySourceUpdate(kill_switch=False))
    return source


# ── Kill switch: immediate effect + operational event ──


def test_kill_switch_trip_blocks_ingestion_immediately_and_records_event(db, client):
    admin = _admin(db)
    source = _activated_source(db, admin, key="feed-a", host="feed-a.example")
    # Baseline: source is ingestible.
    require_ingestion_allowed(db, source.source_key, "feed")

    trip = client.post(
        f"{PREFIX}/admin/discovery-sources/{source.id}/kill-switch?tripped=true",
        headers=_headers(admin),
    )
    assert trip.status_code == 200
    assert trip.json()["kill_switch"] is True

    # No deploy/restart: the very next read of the enforcement path refuses.
    with pytest.raises(SourceIngestionRefused) as refused:
        require_ingestion_allowed(db, source.source_key, "feed")
    assert refused.value.reason == IngestionRefusal.KILL_SWITCHED

    event = (
        db.query(AnalyticsEvent)
        .filter_by(event_name="discovery_source_kill_switch")
        .order_by(AnalyticsEvent.created_at.desc())
        .first()
    )
    assert event is not None
    assert event.operational_dimension == "licensed"
    assert event.operational_outcome == "kill_switch_enabled"
    # No source key/name/url leaks onto the event row.
    assert source.source_key not in str(event.__dict__)
    assert source.display_name not in str(event.__dict__)


def test_kill_switch_clear_re_enables_and_records_event(db, client):
    admin = _admin(db)
    source = _activated_source(db, admin, key="feed-a", host="feed-a.example")
    client.post(
        f"{PREFIX}/admin/discovery-sources/{source.id}/kill-switch?tripped=true",
        headers=_headers(admin),
    )

    clear = client.post(
        f"{PREFIX}/admin/discovery-sources/{source.id}/kill-switch?tripped=false",
        headers=_headers(admin),
    )
    assert clear.status_code == 200
    assert clear.json()["kill_switch"] is False

    authorization = require_ingestion_allowed(db, source.source_key, "feed")
    assert authorization.source_id == source.id

    outcomes = [
        e.operational_outcome
        for e in db.query(AnalyticsEvent)
        .filter_by(event_name="discovery_source_kill_switch")
        .order_by(AnalyticsEvent.created_at)
        .all()
    ]
    assert outcomes == ["kill_switch_enabled", "kill_switch_disabled"]


def test_kill_switch_clear_refused_before_terms_accepted(db, client):
    admin = _admin(db)
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key="feed-pending",
            display_name="feed-pending",
            source_family="public_career_page",
            owner="Discovery Operations",
            allowed_behavior="public_page",
            endpoint_url="https://pending.example/jobs",
            allowed_query_parameters=["role"],
            robots_policy="required",
            rate_limit_per_minute=10,
            attribution_rule="Show source and original link",
            retention_days=30,
        ),
    )
    response = client.post(
        f"{PREFIX}/admin/discovery-sources/{source.id}/kill-switch?tripped=false",
        headers=_headers(admin),
    )
    assert response.status_code == 409
    db.refresh(source)
    assert source.kill_switch is True


def test_kill_switch_endpoint_is_owner_admin_scoped(db, client, auth_headers):
    admin = _admin(db)
    source = _activated_source(db, admin, key="feed-a", host="feed-a.example")
    path = f"{PREFIX}/admin/discovery-sources/{source.id}/kill-switch?tripped=true"
    assert client.post(path).status_code == 401
    assert client.post(path, headers=auth_headers).status_code == 403
    assert (
        client.post(
            f"{PREFIX}/admin/discovery-sources/does-not-exist/kill-switch?tripped=true",
            headers=_headers(admin),
        ).status_code
        == 404
    )


# ── Health aggregates ──


def test_health_aggregates_compute_per_source_family(db, client):
    admin = _admin(db)
    _activated_source(db, admin, key="feed-a", host="feed-a.example")
    _activated_source(db, admin, key="feed-b", host="feed-b.example")

    first, second = FIXTURE["known_duplicate"]
    store_discovered_listing(db, source_key="feed-a", body=DiscoveredListingInput(**first))
    dup = store_discovered_listing(db, source_key="feed-b", body=DiscoveredListingInput(**second))
    assert dup.deduplicated is True

    # Fetch outcomes are bounded family/outcome events.
    safe_record_activation_event(
        db,
        event_name="discovery_source_fetch_outcome",
        operational_dimension="licensed",
        operational_outcome="success",
    )
    safe_record_activation_event(
        db,
        event_name="discovery_source_fetch_outcome",
        operational_dimension="licensed",
        operational_outcome="failure",
    )

    response = client.get(f"{PREFIX}/admin/source-health", headers=_headers(admin))
    assert response.status_code == 200
    body = response.json()
    assert [f["source_family"] for f in body["families"]] == list(SOURCE_FAMILIES)
    assert body["staleness_threshold_days"] == SOURCE_STALENESS_THRESHOLD_DAYS

    licensed = next(f for f in body["families"] if f["source_family"] == "licensed")
    assert licensed["source_count"] == 2
    assert licensed["active_count"] == 2
    assert licensed["killed_count"] == 0
    assert licensed["listing_count"] == 2  # two attributions, one deduplicated listing
    assert licensed["ingested"] == 1
    assert licensed["deduplicated"] == 1
    assert licensed["fetch_success"] == 1
    assert licensed["fetch_failure"] == 1

    empty = next(f for f in body["families"] if f["source_family"] == "user_provided")
    assert empty["source_count"] == 0
    assert empty["listing_count"] == 0


def test_health_counts_expiry_and_staleness(db):
    admin = _admin(db)
    _activated_source(db, admin, key="feed-a", host="feed-a.example", retention_days=5)
    now = datetime(2026, 7, 13, tzinfo=UTC)
    first = FIXTURE["known_duplicate"][0]
    store_discovered_listing(
        db,
        source_key="feed-a",
        body=DiscoveredListingInput(**first),
        retrieved_at=now - timedelta(days=10),
    )
    # Stale (older than the staleness threshold), not yet expired mid-run.
    health = aggregate_source_health(
        db,
        window_start=now - timedelta(days=14),
        window_end=now + timedelta(days=1),
        now=now,
    )
    licensed = next(f for f in health.families if f.source_family == "licensed")
    assert licensed.stale_count == 1

    result = expire_discovered_listings(db, now=now)
    assert result.attributions_deleted == 1
    assert db.query(DiscoveredListingAttribution).count() == 0

    after = aggregate_source_health(
        db,
        window_start=now - timedelta(days=14),
        window_end=now + timedelta(days=1),
        now=now,
    )
    licensed_after = next(f for f in after.families if f.source_family == "licensed")
    assert licensed_after.expired == 1
    assert licensed_after.listing_count == 0


def test_killed_source_counts_in_registry_posture(db):
    admin = _admin(db)
    source = _activated_source(db, admin, key="feed-a", host="feed-a.example")
    update_source(db, source, DiscoverySourceUpdate(kill_switch=True))
    health = aggregate_source_health(
        db,
        window_start=datetime(2026, 7, 1, tzinfo=UTC),
        window_end=datetime(2026, 8, 1, tzinfo=UTC),
    )
    licensed = next(f for f in health.families if f.source_family == "licensed")
    assert licensed.source_count == 1
    assert licensed.killed_count == 1
    assert licensed.active_count == 0


# ── Monitoring payload carries no sensitive content ──


def test_health_endpoint_is_owner_admin_scoped(db, client, auth_headers):
    admin = _admin(db)
    path = f"{PREFIX}/admin/source-health"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=auth_headers).status_code == 403
    assert client.get(path, headers=_headers(admin)).status_code == 200


def test_health_payload_contains_no_listing_content_urls_or_user_data(db, client):
    admin = _admin(db)
    _activated_source(db, admin, key="secret-feed", host="secret-host.example")
    listing = {
        "source_listing_key": "secret-101",
        "title": "Confidential Staff Engineer",
        "company": "Hidden Labs Inc",
        "description": "A sensitive listing body that must never reach any monitoring payload.",
        "source_url": "https://secret-host.example/jobs/secret-101?tracking=remove",
    }
    store_discovered_listing(db, source_key="secret-feed", body=DiscoveredListingInput(**listing))

    raw = client.get(f"{PREFIX}/admin/source-health", headers=_headers(admin)).text
    # No listing content, company, source key/name, full URL, host, or user email.
    for needle in (
        listing["title"],
        listing["company"],
        listing["source_url"],
        "secret-feed",
        "secret-host.example",
        "secret-host",
        admin.email,
        admin.id,
    ):
        assert needle not in raw

    # Only the four allowlisted family strings appear as source_family values.
    body = json.loads(raw)
    families = {f["source_family"] for f in body["families"]}
    assert families == set(SOURCE_FAMILIES)
    # Every attribution's stored source_url is not reachable from the store either.
    stored_url = db.query(DiscoveredListingAttribution.source_url).scalar()
    assert stored_url is not None
    assert stored_url not in raw
