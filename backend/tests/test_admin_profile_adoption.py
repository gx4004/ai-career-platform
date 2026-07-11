"""R11 admin profile-adoption dashboard endpoint (issue #150, parent #143, D-067).

Exercises the admin read endpoint at the HTTP boundary — an authorized admin
gets a shaped adoption/trust aggregate for a given window, and
unauthorized/non-admin requests are rejected the same way every other admin
endpoint rejects them (prior art: `get_current_admin` on every admin route).
Every figure is derived from allowlisted low-cardinality profile events; no
evidence content is reachable from the view.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User

PREFIX = "/api/v1"
ENDPOINT = f"{PREFIX}/admin/profile-adoption"


@pytest.fixture
def admin_headers(db):
    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Admin User",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def _event(db, *, created_at: datetime | None = None, **fields) -> AnalyticsEvent:
    row = AnalyticsEvent(created_at=created_at or datetime.now(UTC), **fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --- Authorization boundary ------------------------------------------------


def test_profile_adoption_requires_authentication(client):
    assert client.get(ENDPOINT).status_code == 401


def test_profile_adoption_rejects_non_admin(client, auth_headers):
    assert client.get(ENDPOINT, headers=auth_headers).status_code == 403


def test_profile_adoption_allows_admin(client, admin_headers):
    assert client.get(ENDPOINT, headers=admin_headers).status_code == 200


# --- Shaped adoption/trust aggregate ---------------------------------------


def test_profile_adoption_shape(client, db, admin_headers):
    now = datetime.now(UTC)
    inside = now - timedelta(days=2)
    # Adoption: created items across kinds + provenance classes.
    _event(db, event_name="profile_item_created", evidence_kind="skill",
           evidence_provenance="imported", confirmation_transition="unconfirmed", created_at=inside)
    _event(db, event_name="profile_item_created", evidence_kind="skill",
           evidence_provenance="inferred", confirmation_transition="unconfirmed", created_at=inside)
    _event(db, event_name="profile_item_created", evidence_kind="experience",
           evidence_provenance="user-entered", confirmation_transition="unconfirmed", created_at=inside)
    # Trust decisions.
    _event(db, event_name="profile_item_confirmed", evidence_kind="skill",
           evidence_provenance="imported", confirmation_transition="confirmed", created_at=inside)
    _event(db, event_name="profile_item_rejected", evidence_kind="skill",
           evidence_provenance="inferred", confirmation_transition="rejected", created_at=inside)
    # Deletion.
    _event(db, event_name="profile_item_deleted", evidence_kind="experience",
           evidence_provenance="user-entered", created_at=inside)

    body = client.get(ENDPOINT, headers=admin_headers).json()

    assert body["total_created"] == 3
    assert body["total_deleted"] == 1
    assert {r["kind"]: r["count"] for r in body["created_by_kind"]} == {"skill": 2, "experience": 1}
    assert {r["provenance"]: r["count"] for r in body["created_by_provenance"]} == {
        "imported": 1,
        "inferred": 1,
        "user-entered": 1,
    }
    assert {r["transition"]: r["count"] for r in body["confirmation_transitions"]} == {
        "confirmed": 1,
        "rejected": 1,
    }


def test_profile_adoption_excludes_events_outside_window(client, db, admin_headers):
    old = datetime.now(UTC) - timedelta(days=60)
    _event(db, event_name="profile_item_created", evidence_kind="skill",
           evidence_provenance="imported", confirmation_transition="unconfirmed", created_at=old)

    # Default rolling two-week window excludes the 60-day-old event.
    body = client.get(ENDPOINT, headers=admin_headers).json()
    assert body["total_created"] == 0
    assert body["created_by_kind"] == []


def test_profile_adoption_ignores_non_profile_events(client, db, admin_headers):
    """Activation/operational events in the same table never leak into the
    profile-adoption aggregate."""
    _event(db, event_name="tool_run_completed", tool_id="resume", access_mode="guest_demo")
    _event(db, event_name="r10_cache_outcome", operational_outcome="hit")

    body = client.get(ENDPOINT, headers=admin_headers).json()
    assert body["total_created"] == 0
    assert body["total_deleted"] == 0
    assert body["created_by_kind"] == []
    assert body["confirmation_transitions"] == []
