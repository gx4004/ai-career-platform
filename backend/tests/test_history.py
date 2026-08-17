import pytest
from pydantic import ValidationError

from app.models.campaign_event import CampaignEvent
from app.models.cv_document import CvDocument, CvVariant
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.schemas.history import CampaignStatus, ToolRunSummary

PREFIX = "/api/v1/history"


def _create_run(db, user_id, tool_name="resume", label="Test", **kwargs):
    run = ToolRun(
        user_id=user_id,
        tool_name=tool_name,
        label=label,
        result_payload={
            "score": 80,
            "schema_version": "quality_v2",
            "summary": {"headline": "Saved summary headline"},
        },
        **kwargs,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def test_list_empty(client, auth_headers):
    resp = client.get(PREFIX, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["has_more"] is False


def test_list_with_items(client, auth_headers, test_user, db):
    _create_run(db, test_user.id)
    _create_run(db, test_user.id, tool_name="job-match", label="Match")

    resp = client.get(PREFIX, headers=auth_headers)
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


def test_filter_by_tool(client, auth_headers, test_user, db):
    _create_run(db, test_user.id, tool_name="resume")
    _create_run(db, test_user.id, tool_name="career")

    resp = client.get(f"{PREFIX}?tool=resume", headers=auth_headers)
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["tool_name"] == "resume"


def test_filter_by_favorite(client, auth_headers, test_user, db):
    _create_run(db, test_user.id, is_favorite=True)
    _create_run(db, test_user.id, is_favorite=False)

    resp = client.get(f"{PREFIX}?favorite=true", headers=auth_headers)
    assert resp.json()["total"] == 1


def test_get_detail(client, auth_headers, test_user, db):
    run = _create_run(db, test_user.id)
    resp = client.get(f"{PREFIX}/{run.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == run.id
    assert "result_payload" in data
    assert data["metadata"]["summary_headline"] == "Saved summary headline"
    assert data["saved"] is True
    assert data["workspace"] is None
    assert data["access_decision"] == {
        "state": "full",
        "treatment": "control",
        "reason": "policy_disabled",
        "can_export": True,
        "policy_version": "control-v1",
    }


def test_get_detail_includes_parent_run_id(client, auth_headers, test_user, db):
    parent = _create_run(db, test_user.id, label="Parent")
    child = _create_run(db, test_user.id, label="Child", parent_run_id=parent.id)

    resp = client.get(f"{PREFIX}/{child.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["parent_run_id"] == parent.id


def test_get_detail_includes_workspace_summary(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Application sprint")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    first = _create_run(db, test_user.id, workspace_id=workspace.id, label="Resume pass")
    second = _create_run(db, test_user.id, workspace_id=workspace.id, label="Job match")

    resp = client.get(f"{PREFIX}/{second.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["workspace"]["id"] == workspace.id
    assert data["workspace"]["label"] == "Application sprint"
    assert data["workspace"]["last_active_result_id"] == second.id
    assert data["workspace"]["linked_run_ids"] == [second.id, first.id]


def test_delete(client, auth_headers, test_user, db):
    run = _create_run(db, test_user.id)
    resp = client.delete(f"{PREFIX}/{run.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 1

    resp = client.get(f"{PREFIX}/{run.id}", headers=auth_headers)
    assert resp.status_code == 404


def test_delete_last_run_removes_workspace(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Solo workspace")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    only_run = _create_run(db, test_user.id, workspace_id=workspace.id, label="Only run")

    resp = client.delete(f"{PREFIX}/{only_run.id}", headers=auth_headers)
    assert resp.status_code == 200

    # Workspace should be gone because its only run was deleted.
    db.expire_all()
    remaining = db.query(Workspace).filter(Workspace.id == workspace.id).first()
    assert remaining is None


def test_delete_one_of_many_preserves_workspace(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Multi-run")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    first = _create_run(db, test_user.id, workspace_id=workspace.id, label="First")
    _create_run(db, test_user.id, workspace_id=workspace.id, label="Second")

    resp = client.delete(f"{PREFIX}/{first.id}", headers=auth_headers)
    assert resp.status_code == 200

    # Workspace must still exist — it still has the second run.
    db.expire_all()
    remaining = db.query(Workspace).filter(Workspace.id == workspace.id).first()
    assert remaining is not None
    assert len(remaining.tool_runs) == 1


def test_delete_last_run_preserves_workspace_with_campaign_data(
    client, auth_headers, test_user, db
):
    workspace = Workspace(
        user_id=test_user.id,
        label="Campaign",
        company="Example Corp",
        role="Engineer",
        status="planning",
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    only_run = _create_run(db, test_user.id, workspace_id=workspace.id)

    assert client.delete(f"{PREFIX}/{only_run.id}", headers=auth_headers).status_code == 200

    db.expire_all()
    remaining = db.query(Workspace).filter(Workspace.id == workspace.id).one()
    assert remaining.company == "Example Corp"
    assert remaining.tool_runs == []


def test_list_rows_carry_the_same_server_decision_as_the_detail_route(
    client, auth_headers, test_user, db
):
    """A list row is a delivery surface, so it states the decision explicitly.

    Leaving `access_decision` null here would make the browser fall back to a
    locally assumed default on the busiest history surface, which is exactly the
    client-authoritative shape D-048 rules out.
    """
    run = _create_run(db, test_user.id)

    listed = client.get(PREFIX, headers=auth_headers).json()["items"][0]
    detail = client.get(f"{PREFIX}/{run.id}", headers=auth_headers).json()

    assert listed["access_decision"] == {
        "state": "full",
        "treatment": "control",
        "reason": "policy_disabled",
        "can_export": True,
        "policy_version": "control-v1",
    }
    assert listed["access_decision"] == detail["access_decision"]


def test_summary_shaped_routes_all_carry_the_server_decision(
    client, auth_headers, test_user, db
):
    run = _create_run(db, test_user.id, is_favorite=False, label="Old label")

    favorite = client.patch(
        f"{PREFIX}/{run.id}/favorite", json={"is_favorite": True}, headers=auth_headers
    ).json()
    relabelled = client.patch(
        f"{PREFIX}/{run.id}", json={"label": "Backend application"}, headers=auth_headers
    ).json()

    assert favorite["access_decision"]["state"] == "full"
    assert favorite["access_decision"]["can_export"] is True
    assert relabelled["access_decision"] == favorite["access_decision"]


def test_list_rows_reflect_the_enabled_candidate_neutral_policy(
    client, auth_headers, test_user, db, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "RESULT_ACCESS_POLICY_ENABLED", True)
    _create_run(db, test_user.id)

    listed = client.get(PREFIX, headers=auth_headers).json()["items"][0]

    assert listed["access_decision"]["reason"] == "no_candidate_selected"
    assert listed["access_decision"]["state"] == "full"
    assert listed["access_decision"]["can_export"] is True


def test_toggle_favorite(client, auth_headers, test_user, db):
    run = _create_run(db, test_user.id, is_favorite=False)

    resp = client.patch(
        f"{PREFIX}/{run.id}/favorite",
        json={"is_favorite": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_favorite"] is True


def test_update_run_label(client, auth_headers, test_user, db):
    run = _create_run(db, test_user.id, label="Old label")

    resp = client.patch(
        f"{PREFIX}/{run.id}",
        json={"label": "Backend application"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["label"] == "Backend application"


def test_list_workspaces_and_update_workspace(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Draft chain")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    first = _create_run(db, test_user.id, workspace_id=workspace.id, label="Resume")
    second = _create_run(db, test_user.id, workspace_id=workspace.id, label="Interview")

    resp = client.get(f"{PREFIX}/workspaces", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == workspace.id
    assert data["items"][0]["linked_run_ids"] == [second.id, first.id]

    resp = client.patch(
        f"{PREFIX}/workspaces/{workspace.id}",
        json={"label": "Pinned workspace", "is_pinned": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["label"] == "Pinned workspace"
    assert payload["is_pinned"] is True


def test_legacy_workspace_is_a_label_only_campaign(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Existing search", is_pinned=True)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    response = client.get(f"{PREFIX}/workspaces", headers=auth_headers)

    assert response.status_code == 200
    campaign = response.json()["items"][0]
    assert campaign["id"] == workspace.id
    assert campaign["label"] == "Existing search"
    assert campaign["is_pinned"] is True
    assert campaign["company"] is None
    assert campaign["role"] is None
    assert campaign["status"] is None
    assert campaign["deadline"] is None


def test_owner_can_update_and_read_campaign_fields(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Target")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    response = client.patch(
        f"{PREFIX}/workspaces/{workspace.id}",
        json={
            "company": "Example Corp",
            "role": "Platform Engineer",
            "status": "planning",
            "deadline": "2026-08-15T16:00:00Z",
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["company"] == "Example Corp"
    assert payload["role"] == "Platform Engineer"
    assert payload["status"] == "planning"
    assert payload["deadline"] == "2026-08-15T16:00:00Z"
    listed = client.get(f"{PREFIX}/workspaces", headers=auth_headers).json()["items"][0]
    assert listed["company"] == "Example Corp"
    assert listed["role"] == "Platform Engineer"
    assert listed["status"] == "planning"


def test_campaign_fields_are_owner_only(client, auth_headers, test_user, db):
    from app.auth.security import hash_password
    from app.models.user import User

    second_user = User(email="campaign-owner@example.com", hashed_password=hash_password("pass"))
    db.add(second_user)
    db.flush()
    workspace = Workspace(user_id=second_user.id, label="Private target")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    response = client.patch(
        f"{PREFIX}/workspaces/{workspace.id}",
        json={"company": "Not mine", "status": "planning"},
        headers=auth_headers,
    )

    assert response.status_code == 404


def test_campaign_status_lifecycle_is_enforced_server_side(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Lifecycle")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    endpoint = f"{PREFIX}/workspaces/{workspace.id}"

    assert (
        client.patch(endpoint, json={"status": "applied"}, headers=auth_headers).status_code == 409
    )
    assert (
        client.patch(endpoint, json={"status": "planning"}, headers=auth_headers).status_code == 200
    )
    assert (
        client.patch(endpoint, json={"status": "preparing"}, headers=auth_headers).status_code
        == 200
    )
    assert (
        client.patch(endpoint, json={"status": "applied"}, headers=auth_headers).status_code == 200
    )
    assert (
        client.patch(endpoint, json={"status": "planning"}, headers=auth_headers).status_code == 409
    )
    assert (
        client.patch(endpoint, json={"status": "custom-stage"}, headers=auth_headers).status_code
        == 422
    )
    assert (
        client.patch(
            endpoint,
            json={"deadline": "2026-08-15T16:00:00"},
            headers=auth_headers,
        ).status_code
        == 422
    )

    assert [status.value for status in CampaignStatus] == [
        "planning",
        "preparing",
        "applied",
        "interviewing",
        "offer",
        "accepted",
        "rejected",
        "withdrawn",
    ]
    events = db.query(CampaignEvent).filter_by(workspace_id=workspace.id).all()
    assert [
        (event.event_type, event.details)
        for event in events
        if event.event_type == "status_changed"
    ] == [
        ("status_changed", {"from": None, "to": "planning"}),
        ("status_changed", {"from": "planning", "to": "preparing"}),
        ("status_changed", {"from": "preparing", "to": "applied"}),
    ]
    assert [event.event_type for event in events].count("submission_snapshot_created") == 1


def test_campaign_deadline_changes_are_append_only(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id)
    db.add(workspace)
    db.commit()
    endpoint = f"{PREFIX}/workspaces/{workspace.id}"

    for deadline in ("2026-08-15T16:00:00Z", "2026-08-20T16:00:00Z", None):
        assert (
            client.patch(endpoint, json={"deadline": deadline}, headers=auth_headers).status_code
            == 200
        )

    events = db.query(CampaignEvent).filter_by(workspace_id=workspace.id).all()
    assert [event.event_type for event in events] == [
        "deadline_changed",
        "deadline_changed",
        "deadline_changed",
    ]
    assert events[-1].details["to"] is None


def test_campaign_detail_selects_exact_immutable_material_versions(
    client, auth_headers, test_user, db
):
    workspace = Workspace(user_id=test_user.id, company="Northstar Labs", role="Platform Engineer")
    document = CvDocument(user_id=test_user.id, name="Platform CV", sections=[])
    db.add_all([workspace, document])
    db.flush()
    variant = CvVariant(document_id=document.id, name="Northstar variant", sections=[])
    cover_parent = ToolRun(user_id=test_user.id, tool_name="cover-letter", label="Cover v1")
    cover_revision = ToolRun(
        user_id=test_user.id, tool_name="cover-letter", label="Cover v2", parent_run=cover_parent
    )
    interview = ToolRun(user_id=test_user.id, tool_name="interview", label="Interview prep")
    db.add_all([variant, cover_parent, cover_revision, interview])
    db.commit()

    response = client.patch(
        f"{PREFIX}/workspaces/{workspace.id}/materials",
        json={
            "cv_variant_id": variant.id,
            "cover_letter_run_id": cover_revision.id,
            "interview_run_id": interview.id,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_materials"]["cv_variant"]["id"] == variant.id
    assert payload["selected_materials"]["cover_letter"]["id"] == cover_revision.id
    assert payload["selected_materials"]["cover_letter"]["parent_run_id"] == cover_parent.id
    assert payload["selected_materials"]["interview"]["id"] == interview.id
    assert {item["id"] for item in payload["available_materials"]["cover_letters"]} == {
        cover_parent.id,
        cover_revision.id,
    }
    events = db.query(CampaignEvent).filter_by(workspace_id=workspace.id).all()
    assert [(event.event_type, event.details) for event in events] == [
        ("material_selection_changed", {"material_type": "cv_variant", "action": "selected"}),
        ("material_selection_changed", {"material_type": "cover_letter", "action": "selected"}),
        ("material_selection_changed", {"material_type": "interview", "action": "selected"}),
    ]

    detail = client.get(f"{PREFIX}/workspaces/{workspace.id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["selected_materials"] == payload["selected_materials"]
    exported_campaign = client.get("/api/v1/evidence-profile/export", headers=auth_headers).json()[
        "campaigns"
    ]["campaigns"][0]
    assert exported_campaign["selected_cover_letter"]["id"] == cover_revision.id
    assert exported_campaign["selected_cover_letter"]["result_payload"] == {}
    assert exported_campaign["selected_interview"]["id"] == interview.id


def test_campaign_material_selection_rejects_foreign_and_wrong_type_refs(
    client, auth_headers, test_user, db
):
    from app.auth.security import hash_password
    from app.models.user import User

    other = User(email="private-materials@example.com", hashed_password=hash_password("pass"))
    workspace = Workspace(user_id=test_user.id)
    wrong_type = ToolRun(user_id=test_user.id, tool_name="resume")
    foreign_cover = ToolRun(user=other, tool_name="cover-letter")
    db.add_all([other, workspace, wrong_type, foreign_cover])
    db.commit()

    endpoint = f"{PREFIX}/workspaces/{workspace.id}/materials"
    assert (
        client.patch(
            endpoint, json={"cover_letter_run_id": wrong_type.id}, headers=auth_headers
        ).status_code
        == 422
    )
    assert (
        client.patch(
            endpoint, json={"cover_letter_run_id": foreign_cover.id}, headers=auth_headers
        ).status_code
        == 422
    )
    assert db.query(CampaignEvent).filter_by(workspace_id=workspace.id).count() == 0


def test_campaign_material_selection_can_be_cleared_with_content_free_event(
    client, auth_headers, test_user, db
):
    workspace = Workspace(user_id=test_user.id)
    run = ToolRun(user_id=test_user.id, tool_name="interview", label="Private prep title")
    db.add_all([workspace, run])
    db.commit()
    endpoint = f"{PREFIX}/workspaces/{workspace.id}/materials"
    assert (
        client.patch(endpoint, json={"interview_run_id": run.id}, headers=auth_headers).status_code
        == 200
    )
    response = client.patch(endpoint, json={"interview_run_id": None}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["selected_materials"]["interview"] is None
    events = db.query(CampaignEvent).filter_by(workspace_id=workspace.id).all()
    assert events[-1].details == {"material_type": "interview", "action": "cleared"}
    assert "Private prep title" not in str(events[-1].details)


def test_selected_material_deletion_clears_reference_without_deleting_campaign(
    client, auth_headers, test_user, db
):
    workspace = Workspace(user_id=test_user.id, status="planning")
    run = ToolRun(user_id=test_user.id, tool_name="cover-letter")
    db.add_all([workspace, run])
    db.commit()
    assert (
        client.patch(
            f"{PREFIX}/workspaces/{workspace.id}/materials",
            json={"cover_letter_run_id": run.id},
            headers=auth_headers,
        ).status_code
        == 200
    )

    assert client.delete(f"{PREFIX}/{run.id}", headers=auth_headers).status_code == 200
    db.expire_all()
    remaining = db.query(Workspace).filter_by(id=workspace.id).one()
    assert remaining.selected_cover_letter_run_id is None


def test_pagination(client, auth_headers, test_user, db):
    for i in range(15):
        _create_run(db, test_user.id, label=f"Run {i}")

    resp = client.get(f"{PREFIX}?page=1&page_size=10", headers=auth_headers)
    data = resp.json()
    assert len(data["items"]) == 10
    assert data["total"] == 15
    assert data["has_more"] is True

    resp = client.get(f"{PREFIX}?page=2&page_size=10", headers=auth_headers)
    data = resp.json()
    assert len(data["items"]) == 5
    assert data["has_more"] is False


def test_user_isolation(client, auth_headers, test_user, db):
    """Users should not see other users' history."""
    from app.auth.security import hash_password
    from app.models.user import User

    other = User(
        email="other@example.com",
        hashed_password=hash_password("pass"),
    )
    db.add(other)
    db.commit()
    db.refresh(other)

    _create_run(db, other.id, label="Other's run")
    _create_run(db, test_user.id, label="My run")

    resp = client.get(PREFIX, headers=auth_headers)
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["label"] == "My run"


def test_campaign_tracking_is_append_only_exportable_and_content_free(
    client, auth_headers, test_user, db
):
    workspace = Workspace(user_id=test_user.id, label="Target")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    task = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/tasks",
        json={"title": "Send application", "deadline": "2026-08-15T16:00:00Z"},
        headers=auth_headers,
    )
    note = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/notes",
        json={"text": "Private hiring-manager observation"},
        headers=auth_headers,
    )
    contact = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/contacts",
        json={"name": "Alex Example", "role": "Recruiter", "channel": "alex@example.test"},
        headers=auth_headers,
    )
    assert (task.status_code, note.status_code, contact.status_code) == (201, 201, 201)
    assert (
        client.patch(
            f"{PREFIX}/workspaces/{workspace.id}/tasks/{task.json()['id']}",
            json={"completed": True},
            headers=auth_headers,
        ).status_code
        == 200
    )

    detail = client.get(f"{PREFIX}/workspaces/{workspace.id}", headers=auth_headers).json()
    assert [event["event_type"] for event in detail["events"]] == [
        "task_created",
        "note_added",
        "contact_added",
        "task_completed",
    ]
    serialized_events = str(detail["events"])
    assert "Private hiring-manager" not in serialized_events
    assert "Alex Example" not in serialized_events
    assert "Send application" not in serialized_events
    exported = client.get("/api/v1/evidence-profile/export", headers=auth_headers).json()[
        "campaigns"
    ]["campaigns"][0]
    assert exported["tasks"][0]["title"] == "Send application"
    assert exported["notes"][0]["text"].startswith("Private")
    assert exported["contacts"][0]["name"] == "Alex Example"


def test_campaign_tracking_rejects_foreign_campaign(client, auth_headers, db):
    from app.auth.security import hash_password
    from app.models.user import User

    other = User(email="tracking-owner@example.com", hashed_password=hash_password("pass"))
    db.add(other)
    db.flush()
    workspace = Workspace(user_id=other.id, label="Private")
    db.add(workspace)
    db.commit()
    assert (
        client.post(
            f"{PREFIX}/workspaces/{workspace.id}/contacts",
            json={"name": "Hidden"},
            headers=auth_headers,
        ).status_code
        == 404
    )


def test_campaign_reminders_are_default_off_consent_driven_and_revocable(
    client, auth_headers, test_user, db
):
    from datetime import UTC, datetime, timedelta

    from app.models.campaign_tracking import CampaignTask

    workspace = Workspace(user_id=test_user.id, deadline=datetime.now(UTC) + timedelta(days=2))
    db.add(workspace)
    db.flush()
    db.add(
        CampaignTask(
            workspace_id=workspace.id,
            title="Follow up",
            deadline=datetime.now(UTC) + timedelta(days=1),
        )
    )
    db.commit()
    endpoint = f"{PREFIX}/workspaces/{workspace.id}/reminders"
    assert client.get(endpoint, headers=auth_headers).json() == {
        "enabled": False,
        "items": [],
        "next_surface_at": None,
    }
    assert client.patch(endpoint, json={"enabled": True}, headers=auth_headers).status_code == 200
    first = client.get(endpoint, headers=auth_headers).json()
    assert [item["kind"] for item in first["items"]] == ["task_deadline", "campaign_deadline"]
    second = client.get(endpoint, headers=auth_headers).json()
    assert second["items"] == []
    assert second["next_surface_at"] is not None
    for _ in range(7):
        assert client.get(endpoint, headers=auth_headers).status_code == 200
    assert client.get(endpoint, headers=auth_headers).status_code == 429
    revoked = client.patch(endpoint, json={"enabled": False}, headers=auth_headers)
    assert revoked.json() == {"enabled": False, "items": [], "next_surface_at": None}
    db.refresh(workspace)
    assert workspace.reminders_enabled is False
    assert workspace.reminders_last_surfaced_at is None


def test_campaign_reminders_are_owner_isolated(client, auth_headers, db):
    from app.auth.security import hash_password
    from app.models.user import User

    other = User(email="reminder-owner@example.com", hashed_password=hash_password("pass"))
    db.add(other)
    db.flush()
    workspace = Workspace(user_id=other.id)
    db.add(workspace)
    db.commit()
    assert (
        client.patch(
            f"{PREFIX}/workspaces/{workspace.id}/reminders",
            json={"enabled": True},
            headers=auth_headers,
        ).status_code
        == 404
    )


def test_applied_transition_captures_immutable_submission_snapshot(
    client, auth_headers, test_user, db
):
    from app.models.campaign_listing import CampaignListing
    from app.models.campaign_snapshot import CampaignSubmissionSnapshot
    from app.models.cv_document import CvDocument, CvVariant
    from app.models.tool_run import ToolRun

    workspace = Workspace(user_id=test_user.id, status="planning")
    document = CvDocument(user_id=test_user.id, name="CV", sections=[])
    cover = ToolRun(
        user_id=test_user.id,
        tool_name="cover-letter",
        label="Letter",
        result_payload={"body": "Original letter"},
    )
    db.add_all([workspace, document, cover])
    db.flush()
    original_section = {
        "id": "summary",
        "kind": "summary",
        "title": "Summary",
        "visible": True,
        "position": 0,
        "entries": [
            {"id": "entry", "evidence_item_id": None, "body": "Original CV", "position": 0}
        ],
    }
    variant = CvVariant(document_id=document.id, name="Applied CV", sections=[original_section])
    listing = CampaignListing(
        workspace_id=workspace.id,
        title="Engineer",
        company="Example",
        description="Original listing",
    )
    db.add_all([variant, listing])
    db.flush()
    workspace.current_listing_id = listing.id
    workspace.selected_cv_variant_id = variant.id
    workspace.selected_cover_letter_run_id = cover.id
    db.commit()
    endpoint = f"{PREFIX}/workspaces/{workspace.id}"
    assert (
        client.patch(endpoint, json={"status": "preparing"}, headers=auth_headers).status_code
        == 200
    )
    assert (
        client.patch(endpoint, json={"status": "applied"}, headers=auth_headers).status_code == 200
    )
    snapshot = db.query(CampaignSubmissionSnapshot).filter_by(workspace_id=workspace.id).one()
    original_bytes = snapshot.content_json.encode()
    original_digest = snapshot.content_sha256
    variant.sections = [
        {**original_section, "entries": [{**original_section["entries"][0], "body": "Changed CV"}]}
    ]
    cover.result_payload = {"body": "Changed letter"}
    listing.description = "Changed listing"
    db.commit()
    db.expire_all()
    unchanged = db.query(CampaignSubmissionSnapshot).filter_by(id=snapshot.id).one()
    assert unchanged.content_json.encode() == original_bytes
    assert unchanged.content_sha256 == original_digest
    detail = client.get(endpoint, headers=auth_headers).json()
    assert (
        detail["submission_snapshots"][0]["content"]["cover_letter"]["result_payload"]["body"]
        == "Original letter"
    )
    assert "submission_snapshot_created" in [event["event_type"] for event in detail["events"]]
    exported = client.get("/api/v1/evidence-profile/export", headers=auth_headers).json()[
        "campaigns"
    ]["campaigns"][0]
    assert exported["submission_snapshots"][0]["content_sha256"] == original_digest
    assert client.delete(endpoint, headers=auth_headers).status_code == 200
    assert db.query(CampaignSubmissionSnapshot).filter_by(id=snapshot.id).count() == 0


def test_tool_run_summary_access_mode_is_constrained_to_the_frontend_enum():
    """access_mode must mirror the frontend Zod enum, not accept any string.

    The frontend parses history responses with
    z.enum(['authenticated', 'guest_demo']); a third value on the backend would
    break that parse. Pinning the backend Literal keeps the contract exact and
    catches an out-of-set value at the schema boundary instead of in the browser.
    """
    base = dict(id="r1", tool_name="resume", is_favorite=False, created_at="2026-07-24T00:00:00Z")

    assert ToolRunSummary(**base, access_mode="authenticated").access_mode == "authenticated"
    assert ToolRunSummary(**base, access_mode="guest_demo").access_mode == "guest_demo"
    assert ToolRunSummary(**base).access_mode == "authenticated"

    with pytest.raises(ValidationError):
        ToolRunSummary(**base, access_mode="something_else")
