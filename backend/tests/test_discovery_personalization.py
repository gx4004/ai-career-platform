from datetime import UTC, datetime

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_personalization import (
    DiscoveryDismissedListing,
    DiscoveryHiddenSource,
    DiscoveryRecommendationReport,
)
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.models.user import User
from app.services.data_export import export_career_data
from app.services.discovery_personalization import export_personalization
from app.services.discovery_recommendations import rank_discovery_recommendations
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1"


def _source(key: str, *, family: str = "licensed", retention_days: int = 30):
    return DiscoverySource(
        source_key=key,
        display_name=f"{key.title()} Jobs",
        source_family=family,
        owner="Discovery Operations",
        terms_status="accepted",
        terms_reviewed_at=datetime(2026, 7, 1, tzinfo=UTC),
        terms_reviewed_by="reviewer@example.com",
        allowed_behavior="feed",
        endpoint_url=f"https://{key}.example/jobs",
        allowed_query_parameters=["role"],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Show source and link",
        retention_days=retention_days,
        kill_switch=False,
    )


def _listing(db, source, *, title: str, description: str, retrieved_at: datetime, company="Acme"):
    listing = DiscoveredListing(
        content_sha256=(title + description).encode().hex()[:64].ljust(64, "0"),
        title=title,
        company=company,
        description=description,
    )
    db.add(listing)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source.id,
            source_listing_key=f"{source.source_key}:{listing.id}",
            source_url=f"https://{source.source_key}.example/jobs/{listing.id}",
            retrieved_at=retrieved_at,
        )
    )
    db.commit()
    return listing


def _evidence(db, user_id, *, kind="skill", content=None, state="confirmed"):
    item = EvidenceItem(
        user_id=user_id,
        kind=kind,
        content=content or {"name": "Kubernetes"},
        provenance="user-entered",
        confirmation_state=state,
    )
    db.add(item)
    db.commit()
    return item


@pytest.fixture
def admin_headers(db):
    admin = User(
        email="disc-admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Admin",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def test_hidden_source_removes_listing_from_feed_immediately(client, auth_headers, db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing = _listing(
        db, source, title="Platform Engineer", description="Kubernetes work.", retrieved_at=now
    )
    _evidence(db, test_user.id)

    assert len(rank_discovery_recommendations(db, test_user.id, now=now).items) == 1

    resp = client.post(
        f"{PREFIX}/discovery/hidden-sources",
        json={"source_id": source.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["source_family"] == "licensed"

    # Immediate effect on the very next ranking read.
    assert rank_discovery_recommendations(db, test_user.id, now=now).items == []
    # Persisted owner-scoped.
    assert db.query(DiscoveryHiddenSource).filter_by(user_id=test_user.id).count() == 1

    # Un-hiding restores the listing.
    client.delete(f"{PREFIX}/discovery/hidden-sources/{source.id}", headers=auth_headers)
    assert len(rank_discovery_recommendations(db, test_user.id, now=now).items) == 1
    assert listing.id is not None


def test_listing_stays_when_only_one_of_two_sources_is_hidden(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source_a = _source("feed-a")
    source_b = _source("feed-b", family="employer_ats")
    db.add_all([source_a, source_b])
    db.commit()
    listing = _listing(
        db, source_a, title="Platform Engineer", description="Kubernetes work.", retrieved_at=now
    )
    db.add(
        DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source_b.id,
            source_listing_key="feed-b-copy",
            source_url="https://feed-b.example/jobs/copy",
            retrieved_at=now,
        )
    )
    db.commit()
    _evidence(db, test_user.id)
    db.add(DiscoveryHiddenSource(user_id=test_user.id, source_id=source_a.id))
    db.commit()

    result = rank_discovery_recommendations(db, test_user.id, now=now)
    assert len(result.items) == 1
    # Only the visible source is attributed.
    assert [a.source_name for a in result.items[0].attributions] == ["Feed-B Jobs"]


def test_dismissed_recommendation_excluded_and_persisted(client, auth_headers, db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing = _listing(
        db, source, title="Platform Engineer", description="Kubernetes work.", retrieved_at=now
    )
    _evidence(db, test_user.id)

    resp = client.post(
        f"{PREFIX}/discovery/dismissals",
        json={"listing_id": listing.id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert rank_discovery_recommendations(db, test_user.id, now=now).items == []
    assert db.query(DiscoveryDismissedListing).filter_by(user_id=test_user.id).count() == 1

    client.delete(f"{PREFIX}/discovery/dismissals/{listing.id}", headers=auth_headers)
    assert len(rank_discovery_recommendations(db, test_user.id, now=now).items) == 1


def test_personalization_is_owner_scoped(client, db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing = _listing(
        db, source, title="Platform Engineer", description="Kubernetes work.", retrieved_at=now
    )
    other = User(
        email="other@example.com",
        hashed_password=hash_password("password123"),
        full_name="Other",
    )
    db.add(other)
    db.commit()
    _evidence(db, test_user.id)
    _evidence(db, other.id)
    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}

    # Other user hides + dismisses.
    client.post(
        f"{PREFIX}/discovery/hidden-sources", json={"source_id": source.id}, headers=other_headers
    )
    client.post(
        f"{PREFIX}/discovery/dismissals", json={"listing_id": listing.id}, headers=other_headers
    )

    # test_user's feed is unaffected.
    assert len(rank_discovery_recommendations(db, test_user.id, now=now).items) == 1
    # And test_user's personalization state is empty.
    resp = client.get(
        f"{PREFIX}/discovery/personalization",
        headers={"Authorization": f"Bearer {create_access_token(test_user.id)}"},
    )
    assert resp.json() == {"hidden_sources": [], "dismissals": []}


def test_preference_correction_changes_ranking_on_next_load(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    _listing(
        db,
        source,
        title="Remote Platform Engineer",
        description="Fully remote Kubernetes platform role.",
        retrieved_at=now,
    )
    _evidence(db, test_user.id, kind="skill", content={"name": "Kubernetes"})
    preference = _evidence(
        db, test_user.id, kind="preference", content={"target": "remote"}, state="confirmed"
    )

    before = rank_discovery_recommendations(db, test_user.id, now=now)
    assert before.preference_item_count == 1

    # Correct the preference by rejecting it — the next load must reflect it.
    preference.confirmation_state = "rejected"
    db.commit()

    after = rank_discovery_recommendations(db, test_user.id, now=now)
    assert after.preference_item_count == 0
    assert before.items[0].score != after.items[0].score


def test_report_persists_and_admin_view_hides_profile(client, auth_headers, admin_headers, db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a", family="public_career_page")
    db.add(source)
    db.commit()
    listing = _listing(
        db,
        source,
        title="Platform Engineer",
        description="Kubernetes work.",
        retrieved_at=now,
        company="Kestrel Infra",
    )
    _evidence(db, test_user.id, content={"name": "SECRET_SKILL"})

    resp = client.post(
        f"{PREFIX}/discovery/reports",
        json={
            "listing_id": listing.id,
            "reason_category": "not_relevant",
            "reason": "This role is not related to my field.",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201

    row = db.query(DiscoveryRecommendationReport).filter_by(user_id=test_user.id).one()
    assert row.reason_text == "This role is not related to my field."
    assert row.source_family == "public_career_page"

    admin = client.get(f"{PREFIX}/admin/discovery-reports", headers=admin_headers)
    assert admin.status_code == 200
    items = admin.json()["items"]
    assert len(items) == 1
    item = items[0]
    # Admin sees product listing snapshot + reason; never reporter identity or profile.
    assert item["listing_title"] == "Platform Engineer"
    assert item["reason"] == "This role is not related to my field."
    assert "user_id" not in item
    assert "SECRET_SKILL" not in resp.text
    assert "SECRET_SKILL" not in admin.text

    # Non-admins cannot read the review view.
    assert client.get(f"{PREFIX}/admin/discovery-reports", headers=auth_headers).status_code == 403


def test_report_rejects_out_of_set_reason(client, auth_headers, db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing = _listing(
        db, source, title="Platform Engineer", description="Kubernetes work.", retrieved_at=now
    )
    resp = client.post(
        f"{PREFIX}/discovery/reports",
        json={"listing_id": listing.id, "reason_category": "made_up", "reason": "x"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_personalization_included_in_export_and_deletion_cascade(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing = _listing(
        db, source, title="Platform Engineer", description="Kubernetes work.", retrieved_at=now
    )
    db.add(DiscoveryHiddenSource(user_id=test_user.id, source_id=source.id))
    db.add(DiscoveryDismissedListing(user_id=test_user.id, listing_id=listing.id))
    db.add(
        DiscoveryRecommendationReport(
            user_id=test_user.id,
            listing_id=listing.id,
            listing_title=listing.title,
            listing_company=listing.company,
            source_family="licensed",
            reason_category="expired",
            reason_text="posting closed",
        )
    )
    db.commit()

    exported = export_personalization(db, test_user.id)
    assert len(exported.hidden_sources) == 1
    assert len(exported.dismissals) == 1
    assert len(exported.reports) == 1
    assert exported.reports[0].reason == "posting closed"

    # And it rides along on the top-level machine-readable export.
    full = export_career_data(db, test_user.id)
    assert full.personalization.hidden_sources[0].source_key == "feed-a"

    # Account deletion cascades personalization.
    delete_all_user_data(db, test_user.id)
    assert db.query(DiscoveryHiddenSource).count() == 0
    assert db.query(DiscoveryDismissedListing).count() == 0
    assert db.query(DiscoveryRecommendationReport).count() == 0


def test_telemetry_carries_only_family_and_outcome(client, auth_headers, db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a", family="employer_ats")
    db.add(source)
    db.commit()
    listing = _listing(
        db, source, title="Platform Engineer", description="Kubernetes work.", retrieved_at=now
    )

    client.post(
        f"{PREFIX}/discovery/hidden-sources", json={"source_id": source.id}, headers=auth_headers
    )
    client.post(
        f"{PREFIX}/discovery/dismissals", json={"listing_id": listing.id}, headers=auth_headers
    )
    client.post(
        f"{PREFIX}/discovery/reports",
        json={"listing_id": listing.id, "reason_category": "other", "reason": "noisy"},
        headers=auth_headers,
    )

    events = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "discovery_personalization_changed")
        .all()
    )
    outcomes = {e.operational_outcome for e in events}
    assert outcomes == {"source_hidden", "recommendation_dismissed", "recommendation_reported"}
    for event in events:
        # Only the two allowlisted low-cardinality axes carry data.
        assert event.operational_dimension == "employer_ats"
        assert event.tool_id is None
        assert event.failure_category is None
        # No listing content, listing id, or reason leaked onto the row.
        for value in vars(event).values():
            if isinstance(value, str):
                assert "Platform Engineer" not in value
                assert listing.id not in value
                assert "noisy" not in value
