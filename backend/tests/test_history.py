from app.models.tool_run import ToolRun
from app.models.workspace import Workspace

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


def test_toggle_favorite(client, auth_headers, test_user, db):
    run = _create_run(db, test_user.id, is_favorite=False)

    resp = client.patch(
        f"{PREFIX}/{run.id}/favorite",
        json={"is_favorite": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_favorite"] is True


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
