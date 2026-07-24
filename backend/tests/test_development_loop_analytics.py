"""R17 development-loop privacy telemetry and aggregate admin reporting (#202).

The durable event seam may observe only the four bounded gap kinds, four honest
response kinds, and three-state transitions. It must never accept gap messages,
notes, or recommendation content. The admin surface is a read-only aggregation
over those dimensions, never a user- or item-level view (D-114).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.gap_classification import GapClassification
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.analytics import ActivationEventCreate
from app.schemas.development import DevelopmentItemCreate, DevelopmentItemUpdate
from app.services.development import (
    create_development_item,
    delete_development_item,
    update_development_item,
)

ENDPOINT = "/api/v1/admin/development-loop"


@pytest.fixture
def admin_headers(db):
    admin = User(
        email="development-admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Development Admin",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def _classification(db, user_id, *, gap_kind="missing_skill"):
    workspace = Workspace(user_id=user_id, label="Development telemetry")
    db.add(workspace)
    db.flush()
    row = GapClassification(
        user_id=user_id,
        workspace_id=workspace.id,
        finding_id=f"finding-{gap_kind}",
        source_category="missed_requirement",
        gap_kind=gap_kind,
        message="Sensitive gap description that must never enter telemetry",
        locations=["Canonical listing:chars 0-4"],
        cited_trace=["listing_requirement:Rust", f"classified:{gap_kind}"],
    )
    db.add(row)
    db.commit()
    return row


def _event(db, *, created_at=None, **fields):
    row = AnalyticsEvent(created_at=created_at or datetime.now(UTC), **fields)
    db.add(row)
    db.commit()
    return row


def test_development_event_allowlist_accepts_only_bounded_dimensions():
    event = ActivationEventCreate(
        event_name="development_item_state_changed",
        development_gap_kind="missing_skill",
        development_response_kind="learn_skill",
        development_state_from="planned",
        development_state_to="in_progress",
    )
    assert event.development_gap_kind == "missing_skill"
    assert event.development_response_kind == "learn_skill"

    for private_field in (
        "gap_description",
        "notes",
        "recommendation_content",
        "gap_classification_id",
        "development_item_id",
        "user_id",
    ):
        with pytest.raises(ValidationError):
            ActivationEventCreate(
                event_name="development_item_created",
                **{private_field: "private career content"},
            )


@pytest.mark.parametrize(
    "fields",
    [
        {
            "event_name": "development_item_created",
            "development_gap_kind": "missing_skill",
            "development_response_kind": "learn_skill",
        },
        {
            "event_name": "development_item_created",
            "development_gap_kind": "missing_skill",
            "development_response_kind": "learn_skill",
            "development_state_to": "planned",
            "tool_id": "career",
        },
        {
            "event_name": "development_item_state_changed",
            "development_gap_kind": "missing_skill",
            "development_response_kind": "learn_skill",
            "development_state_from": "planned",
            "development_state_to": "planned",
        },
        {
            "event_name": "development_item_deleted",
            "development_gap_kind": "missing_skill",
            "development_response_kind": "learn_skill",
            "development_state_from": "completed",
            "development_state_to": "completed",
        },
        {
            "event_name": "profile_item_created",
            "development_gap_kind": "missing_skill",
        },
    ],
)
def test_development_event_allowlist_rejects_cross_event_and_invalid_shapes(fields):
    with pytest.raises(ValidationError):
        ActivationEventCreate(**fields)


def test_development_write_seams_emit_content_free_lifecycle_events(db, test_user):
    classification = _classification(db, test_user.id)
    item = create_development_item(
        db,
        test_user.id,
        DevelopmentItemCreate(
            gap_classification_id=classification.id,
            notes="Private learning notes",
        ),
    )
    update_development_item(
        db,
        item.id,
        test_user.id,
        DevelopmentItemUpdate(state="in_progress"),
    )
    delete_development_item(db, item.id, test_user.id)

    rows = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name.like("development_item_%"))
        .order_by(AnalyticsEvent.created_at.asc())
        .all()
    )
    assert [row.event_name for row in rows] == [
        "development_item_created",
        "development_item_state_changed",
        "development_item_deleted",
    ]
    assert all(row.development_gap_kind == "missing_skill" for row in rows)
    assert all(row.development_response_kind == "learn_skill" for row in rows)
    assert rows[1].development_state_from == "planned"
    assert rows[1].development_state_to == "in_progress"
    # The storage model has no content-bearing development columns at all.
    assert not hasattr(rows[0], "notes")
    assert not hasattr(rows[0], "recommendation_content")
    assert not hasattr(rows[0], "user_id")


def test_development_loop_admin_endpoint_is_admin_only(
    client, auth_headers, admin_headers
):
    assert client.get(ENDPOINT).status_code == 401
    assert client.get(ENDPOINT, headers=auth_headers).status_code == 403
    assert client.get(ENDPOINT, headers=admin_headers).status_code == 200


def test_development_loop_admin_reports_aggregate_dimensions_only(
    client, db, admin_headers
):
    inside = datetime.now(UTC) - timedelta(days=1)
    _event(
        db,
        event_name="development_item_created",
        development_gap_kind="missing_skill",
        development_response_kind="learn_skill",
        development_state_to="planned",
        created_at=inside,
    )
    _event(
        db,
        event_name="development_item_created",
        development_gap_kind="evidence_not_yet_produced",
        development_response_kind="produce_evidence",
        development_state_to="planned",
        created_at=inside,
    )
    _event(
        db,
        event_name="development_item_state_changed",
        development_gap_kind="missing_skill",
        development_response_kind="learn_skill",
        development_state_from="planned",
        development_state_to="completed",
        created_at=inside,
    )
    _event(
        db,
        event_name="development_item_deleted",
        development_gap_kind="missing_skill",
        development_response_kind="learn_skill",
        development_state_from="completed",
        created_at=inside,
    )

    response = client.get(ENDPOINT, headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_items_created"] == 2
    assert body["total_items_deleted"] == 1
    assert body["total_state_transitions"] == 1
    assert {row["gap_kind"]: row["count"] for row in body["created_by_gap_kind"]} == {
        "missing_skill": 1,
        "evidence_not_yet_produced": 1,
    }
    assert {
        row["response_kind"]: row["count"]
        for row in body["created_by_response_kind"]
    } == {"learn_skill": 1, "produce_evidence": 1}
    assert body["state_transitions"] == [
        {"from_state": "planned", "to_state": "completed", "count": 1}
    ]
    # A strict aggregate schema has no content or stable-identifier escape hatch.
    assert set(body) == {
        "window_start",
        "window_end",
        "total_items_created",
        "total_items_deleted",
        "total_state_transitions",
        "created_by_gap_kind",
        "created_by_response_kind",
        "state_transitions",
    }


def test_development_loop_admin_excludes_events_outside_window(
    client, db, admin_headers
):
    _event(
        db,
        event_name="development_item_created",
        development_gap_kind="missing_skill",
        development_response_kind="learn_skill",
        development_state_to="planned",
        created_at=datetime.now(UTC) - timedelta(days=60),
    )
    body = client.get(ENDPOINT, headers=admin_headers).json()
    assert body["total_items_created"] == 0
    assert body["created_by_gap_kind"] == []


def test_development_loop_admin_rejects_an_inverted_window(client, admin_headers):
    response = client.get(
        ENDPOINT,
        params={
            "start": "2026-07-25T00:00:00Z",
            "end": "2026-07-24T00:00:00Z",
        },
        headers=admin_headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "start must be before or equal to end"
