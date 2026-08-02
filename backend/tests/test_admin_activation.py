"""R6 admin activation dashboard endpoint (issue #108, parent #103, D-039).

Covers the parent spec's Testing Decision for this slice: exercise the admin
read endpoint at the HTTP boundary — an authorized admin gets a shaped
funnel/failure/latency/cost response for a given window and access-mode filter,
and unauthorized/non-admin requests are rejected the same way existing admin
endpoints already reject them (prior art: `get_current_admin` on every other
admin route in `app/routers/admin.py`).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User

PREFIX = "/api/v1"


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


def test_activation_requires_authentication(client):
    resp = client.get(f"{PREFIX}/admin/activation")
    assert resp.status_code == 401


def test_activation_rejects_non_admin(client, auth_headers):
    # `auth_headers` is a normal (non-admin) user — must be forbidden the same
    # way every other admin endpoint forbids non-admins.
    resp = client.get(f"{PREFIX}/admin/activation", headers=auth_headers)
    assert resp.status_code == 403


def test_activation_allows_admin(client, admin_headers):
    resp = client.get(f"{PREFIX}/admin/activation", headers=admin_headers)
    assert resp.status_code == 200


def test_activation_rejects_invalid_access_mode(client, admin_headers):
    resp = client.get(
        f"{PREFIX}/admin/activation",
        params={"access_mode": "not-a-mode"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_activation_rejects_invalid_tool_id(client, admin_headers):
    resp = client.get(
        f"{PREFIX}/admin/activation",
        params={"tool_id": "not-a-tool"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


# --- Shaped response for a window + access-mode filter ---------------------


def test_activation_shape_for_window_and_access_mode(client, db, admin_headers):
    now = datetime.now(UTC)
    inside = now - timedelta(days=2)

    # In-window guest_demo events realising every funnel step.
    _event(db, event_name="landing_page_viewed", access_mode="guest_demo", created_at=inside)
    _event(db, event_name="tool_run_started", access_mode="guest_demo", tool_id="resume", created_at=inside)
    _event(
        db, event_name="tool_run_completed", access_mode="guest_demo", tool_id="resume",
        duration_ms=1000, cost_estimate=Decimal("0.002000"), created_at=inside,
    )
    _event(
        db, event_name="tool_run_completed", access_mode="guest_demo", tool_id="resume",
        duration_ms=3000, cost_estimate=Decimal("0.004000"), created_at=inside,
    )
    _event(
        db, event_name="tool_run_failed", access_mode="guest_demo", tool_id="job-match",
        level="error", failure_category="tool_request_failed", duration_ms=500, created_at=inside,
    )
    _event(db, event_name="workflow_continued", access_mode="guest_demo", tool_id="resume", created_at=inside)
    _event(db, event_name="auth_signup_source", access_mode="guest_demo", created_at=inside)
    _event(db, event_name="export_action_used", access_mode="guest_demo", tool_id="resume", export_format="md", created_at=inside)

    # Must be excluded: a different access mode, and an event outside the window.
    _event(db, event_name="landing_page_viewed", access_mode="authenticated", created_at=inside)
    _event(db, event_name="landing_page_viewed", access_mode="guest_demo", created_at=now - timedelta(days=40))

    resp = client.get(
        f"{PREFIX}/admin/activation",
        params={
            "access_mode": "guest_demo",
            "start": (now - timedelta(days=14)).isoformat(),
            "end": now.isoformat(),
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["access_mode"] == "guest_demo"
    assert "window_start" in body and "window_end" in body

    # Six ordered funnel steps, other-access-mode and out-of-window excluded.
    funnel = {step["step"]: step["count"] for step in body["funnel"]}
    assert [s["step"] for s in body["funnel"]] == [
        "landing", "tool_started", "completed",
        "connected_next_step", "signup", "revisit_export",
    ]
    assert funnel == {
        "landing": 1,
        "tool_started": 1,
        "completed": 2,
        "connected_next_step": 1,
        "signup": 1,
        "revisit_export": 1,
    }

    # Failures grouped by allowlisted category.
    failures = {f["failure_category"]: f["count"] for f in body["failures"]}
    assert failures == {"tool_request_failed": 1}

    # Per-tool latency/cost over *completed* runs (#106), kept consistent with
    # the funnel completion step.
    tools = {t["tool_id"]: t for t in body["tools"]}
    assert tools["resume"]["runs"] == 2
    assert tools["resume"]["avg_duration_ms"] == 2000.0
    assert Decimal(str(tools["resume"]["total_cost_estimate"])) == Decimal("0.006000")
    assert Decimal(str(tools["resume"]["avg_cost_estimate"])) == Decimal("0.003000")
    # The failed job-match run is a failure, not a completion, so it drives the
    # failure count above but does NOT appear in the per-tool completion table.
    assert "job-match" not in tools


def test_activation_default_window_covers_all_access_modes(client, db, admin_headers):
    now = datetime.now(UTC)
    _event(db, event_name="landing_page_viewed", access_mode="guest_demo", created_at=now - timedelta(days=1))
    _event(db, event_name="landing_page_viewed", access_mode="authenticated", created_at=now - timedelta(days=1))
    # Outside the default two-week window — excluded.
    _event(db, event_name="landing_page_viewed", access_mode="guest_demo", created_at=now - timedelta(days=20))

    resp = client.get(f"{PREFIX}/admin/activation", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()

    assert body["access_mode"] is None
    landing = next(s for s in body["funnel"] if s["step"] == "landing")
    assert landing["count"] == 2


def test_activation_filters_every_aggregate_by_tool(client, db, admin_headers):
    now = datetime.now(UTC)
    for tool_id in ("resume", "job-match"):
        _event(db, event_name="tool_run_started", tool_id=tool_id, created_at=now)
        _event(
            db,
            event_name="tool_run_completed",
            tool_id=tool_id,
            duration_ms=1000,
            created_at=now,
        )
        _event(
            db,
            event_name="tool_run_failed",
            tool_id=tool_id,
            failure_category=f"{tool_id}_failure",
            created_at=now,
        )

    resp = client.get(
        f"{PREFIX}/admin/activation",
        params={"tool_id": "resume"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["tool_id"] == "resume"
    funnel = {step["step"]: step["count"] for step in body["funnel"]}
    assert funnel["tool_started"] == 1
    assert funnel["completed"] == 1
    assert body["failures"] == [{"failure_category": "resume_failure", "count": 1}]
    assert [tool["tool_id"] for tool in body["tools"]] == ["resume"]
