import pytest
from pydantic import ValidationError

from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.schemas.history import ToolRunSummary

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
        status="saved",
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


def test_list_workspaces_issues_constant_statement_count(client, auth_headers, test_user, db):
    """`list_workspaces` must not N+1 on workspace count (#357).

    Each workspace's tool runs, campaign tasks, and current listing are all
    eager-loaded, so the number of SELECTs the endpoint issues should stay the
    same whether there is one workspace or many — never one extra query per
    workspace (the `Workspace.listing` lazy-load this fixes) or per linked run.
    """
    from sqlalchemy import event

    from app.models.campaign_listing import CampaignListing
    from tests.conftest import engine as test_engine

    def _make_workspace(index: int) -> None:
        workspace = Workspace(user_id=test_user.id, label=f"Workspace {index}")
        db.add(workspace)
        db.commit()
        db.refresh(workspace)

        listing = CampaignListing(
            workspace_id=workspace.id,
            title="Staff Engineer",
            company="Acme",
            description="Own the platform roadmap.",
        )
        db.add(listing)
        db.commit()
        db.refresh(listing)
        workspace.current_listing_id = listing.id
        db.add(workspace)
        db.commit()

        _create_run(db, test_user.id, workspace_id=workspace.id, label=f"Run {index}")

    def _count_select_statements() -> int:
        captured: list[str] = []

        def _record(_conn, _cursor, statement, _params, _context, _executemany):
            if statement.lstrip().lower().startswith("select"):
                captured.append(statement)

        event.listen(test_engine, "after_cursor_execute", _record)
        try:
            resp = client.get(f"{PREFIX}/workspaces", headers=auth_headers)
        finally:
            event.remove(test_engine, "after_cursor_execute", _record)
        assert resp.status_code == 200
        return len(captured)

    _make_workspace(0)
    small_count = _count_select_statements()

    for index in range(1, 10):
        _make_workspace(index)
    large_count = _count_select_statements()

    assert small_count == large_count, (
        f"list_workspaces issued {small_count} SELECTs for 1 workspace but "
        f"{large_count} for 10 — statement count must stay constant"
    )


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


def test_saved_run_detail_carries_the_export_affordance(client, db, test_user, auth_headers):
    """A reload must not cost the user their export controls.

    `persist_tool_run` stores the pre-enrichment result while `build_tool_response`
    enriches only the live response, so `exportable_sections` and `download_title`
    existed on the run that had just finished and vanished from the same run read
    back afterwards — the TXT export button disappeared on reload, and every run
    saved before this fix has the same hole.
    """
    run = _create_run(db, test_user.id, tool_name="resume", label="Saved resume")
    assert "exportable_sections" not in (run.result_payload or {})

    response = client.get(f"{PREFIX}/{run.id}", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()["result_payload"]
    assert payload["exportable_sections"], "saved run detail must offer the same export sections as the live run"
    assert payload["download_title"]
    # Enrichment is a read-time projection, not a rewrite of stored evidence.
    db.refresh(run)
    assert "exportable_sections" not in (run.result_payload or {})
