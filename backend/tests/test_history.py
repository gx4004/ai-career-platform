from app.models.campaign_event import CampaignEvent
from app.models.cv_document import CvDocument, CvVariant
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.schemas.history import CampaignStatus

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
    assert [(event.event_type, event.details) for event in events] == [
        ("status_changed", {"from": None, "to": "planning"}),
        ("status_changed", {"from": "planning", "to": "preparing"}),
        ("status_changed", {"from": "preparing", "to": "applied"}),
    ]


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
