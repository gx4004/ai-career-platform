"""Listing dismissals: the one owner correction control on Job Discovery (#175, #369)."""

from datetime import UTC, datetime, timedelta

from app.auth.security import create_access_token, hash_password
from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_personalization import DiscoveryDismissedListing
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.models.user import User
from app.services.data_export import export_career_data
from app.services.discovery_recommendations import rank_discovery_recommendations
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1"


def _source(db, key: str = "feed-a") -> DiscoverySource:
    source = DiscoverySource(
        source_key=key,
        display_name=f"{key.title()} Jobs",
        source_family="employer_ats",
        owner="Discovery Operations",
        terms_status="accepted",
        terms_reviewed_at=datetime(2026, 7, 1, tzinfo=UTC),
        terms_reviewed_by="reviewer@example.com",
        allowed_behavior="ats_integration",
        endpoint_url=f"https://{key}.example/jobs",
        allowed_query_parameters=[],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Show source and link",
        retention_days=30,
        kill_switch=False,
    )
    db.add(source)
    db.commit()
    return source


def _listing(db, source, *, title: str = "Platform Engineer") -> DiscoveredListing:
    listing = DiscoveredListing(
        content_sha256=title.encode().hex()[:64].ljust(64, "0"),
        title=title,
        company="Acme",
        description="Kubernetes platform work.",
    )
    db.add(listing)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source.id,
            source_listing_key=f"{source.source_key}:{listing.id}",
            source_url=f"https://{source.source_key}.example/jobs/{listing.id}",
            # Relative to the real clock: the listings endpoint has no `now` seam.
            retrieved_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    db.commit()
    return listing


def _listed_titles(client, headers) -> list[str]:
    resp = client.get(f"{PREFIX}/discovery/listings", headers=headers)
    assert resp.status_code == 200
    return [item["title"] for item in resp.json()["items"]]


def test_dismissing_a_listing_hides_it_until_undismissed(client, auth_headers, db):
    source = _source(db)
    listing = _listing(db, source)
    _listing(db, source, title="Data Engineer")

    resp = client.post(
        f"{PREFIX}/discovery/dismissals", json={"listing_id": listing.id}, headers=auth_headers
    )
    assert resp.status_code == 201
    assert resp.json()["listing_id"] == listing.id
    assert _listed_titles(client, auth_headers) == ["Data Engineer"]

    # Dismissing twice is idempotent.
    again = client.post(
        f"{PREFIX}/discovery/dismissals", json={"listing_id": listing.id}, headers=auth_headers
    )
    assert again.status_code == 201
    assert db.query(DiscoveryDismissedListing).count() == 1

    resp = client.delete(f"{PREFIX}/discovery/dismissals/{listing.id}", headers=auth_headers)
    assert resp.status_code == 204
    assert sorted(_listed_titles(client, auth_headers)) == ["Data Engineer", "Platform Engineer"]


def test_dismissing_an_unknown_listing_is_404(client, auth_headers):
    resp = client.post(
        f"{PREFIX}/discovery/dismissals", json={"listing_id": "missing"}, headers=auth_headers
    )
    assert resp.status_code == 404


def test_dismissals_are_owner_scoped(client, auth_headers, db):
    listing = _listing(db, _source(db))
    other = User(
        email="other@example.com",
        hashed_password=hash_password("password123"),
        full_name="Other",
    )
    db.add(other)
    db.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}

    client.post(
        f"{PREFIX}/discovery/dismissals", json={"listing_id": listing.id}, headers=other_headers
    )

    assert _listed_titles(client, other_headers) == []
    assert _listed_titles(client, auth_headers) == ["Platform Engineer"]


def test_preference_correction_changes_ranking_on_next_load(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source(db)
    listing = DiscoveredListing(
        content_sha256="ab" * 32,
        title="Remote Platform Engineer",
        company="Acme",
        description="Fully remote Kubernetes platform role.",
    )
    db.add(listing)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source.id,
            source_listing_key="feed-a:remote",
            source_url="https://feed-a.example/jobs/remote",
            retrieved_at=now,
        )
    )
    skill = EvidenceItem(
        user_id=test_user.id,
        kind="skill",
        content={"name": "Kubernetes"},
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    preference = EvidenceItem(
        user_id=test_user.id,
        kind="preference",
        content={"target": "remote"},
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    db.add_all([skill, preference])
    db.commit()

    before = rank_discovery_recommendations(db, test_user.id, now=now)
    # Correcting a preference means deleting it (no rejected state, #372).
    db.delete(preference)
    db.commit()
    after = rank_discovery_recommendations(db, test_user.id, now=now)

    assert before.preference_item_count == 1
    assert after.preference_item_count == 0
    assert before.items[0].score != after.items[0].score


def test_dismissals_are_exported_and_erased_with_the_account(client, auth_headers, db, test_user):
    listing = _listing(db, _source(db))
    client.post(
        f"{PREFIX}/discovery/dismissals", json={"listing_id": listing.id}, headers=auth_headers
    )

    exported = export_career_data(db, test_user.id)
    assert [item.listing_id for item in exported.personalization.dismissals] == [listing.id]

    delete_all_user_data(db, test_user.id)
    assert db.query(DiscoveryDismissedListing).count() == 0


def test_cut_hide_source_and_report_endpoints_are_gone(client, auth_headers, db):
    admin = User(
        email="disc-admin@example.com",
        hashed_password=hash_password("password123"),
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    admin_headers = {"Authorization": f"Bearer {create_access_token(admin.id)}"}
    assert client.get(f"{PREFIX}/discovery/personalization", headers=auth_headers).status_code == 404
    assert (
        client.post(
            f"{PREFIX}/discovery/hidden-sources", json={"source_id": "x"}, headers=auth_headers
        ).status_code
        == 404
    )
    assert (
        client.post(f"{PREFIX}/discovery/reports", json={}, headers=auth_headers).status_code
        == 404
    )
    assert client.get(f"{PREFIX}/admin/discovery-reports", headers=admin_headers).status_code == 404
