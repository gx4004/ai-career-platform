from app.config import Settings, settings
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.schemas.tools import ImportedJobResponse


def test_build_ahead_outcomes_default_off():
    defaults = Settings(_env_file=None)
    assert defaults.R11_EVIDENCE_PROFILE_ENABLED is False
    assert defaults.R12_CV_STUDIO_ENABLED is False
    assert defaults.R13_CAMPAIGNS_ENABLED is False
    assert defaults.R14_DISCOVERY_ENABLED is False
    assert defaults.R15_QUEUE_ENABLED is False
    assert defaults.R16_SUBMISSION_FOUNDATION_ENABLED is False
    assert defaults.R17_DEVELOPMENT_LOOP_ENABLED is False


def test_dark_shipped_route_is_absent(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "R11_EVIDENCE_PROFILE_ENABLED", False)
    response = client.get("/api/v1/evidence-profile/items", headers=auth_headers)
    assert response.status_code == 404
    assert response.json() == {"detail": "Feature not available"}


def test_dark_profile_keeps_owner_export_and_erasure_available(
    client, auth_headers, monkeypatch
):
    created = client.post(
        "/api/v1/evidence-profile/items",
        headers=auth_headers,
        json={
            "kind": "skill",
            "content": {"name": "Synthetic recovery fixture"},
            "provenance": "user-entered",
        },
    )
    assert created.status_code == 201

    monkeypatch.setattr(settings, "R11_EVIDENCE_PROFILE_ENABLED", False)

    exported = client.get("/api/v1/evidence-profile/export", headers=auth_headers)
    assert exported.status_code == 200
    assert exported.json()["item_count"] == 1
    assert (
        client.delete("/api/v1/evidence-profile/items", headers=auth_headers).status_code
        == 204
    )


def test_downstream_route_requires_every_upstream_gate(
    client, auth_headers, monkeypatch
):
    monkeypatch.setattr(settings, "R14_DISCOVERY_ENABLED", False)
    response = client.get("/api/v1/queue/rules", headers=auth_headers)
    assert response.status_code == 404


def test_campaign_and_gap_routes_are_dark_while_core_workspaces_remain_available(
    client, auth_headers, monkeypatch
):
    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", False)
    assert client.get("/api/v1/history/workspaces", headers=auth_headers).status_code == 200
    assert (
        client.get(
            "/api/v1/history/workspaces/not-present", headers=auth_headers
        ).status_code
        == 404
    )

    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", True)
    monkeypatch.setattr(settings, "R17_DEVELOPMENT_LOOP_ENABLED", False)
    assert (
        client.get(
            "/api/v1/history/workspaces/not-present/gap-classifications",
            headers=auth_headers,
        ).status_code
        == 404
    )


def test_dark_campaigns_reject_campaign_writes_but_keep_core_workspace_edits(
    client, auth_headers, test_user, db, monkeypatch
):
    """A dark R13 must not accept campaign state, events, or submission snapshots.

    The endpoint is gated per field: renaming and pinning are core history controls
    that predate campaigns, so they must keep working while the outcome is dark.
    """
    workspace = Workspace(user_id=test_user.id, label="Core workspace")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    url = f"/api/v1/history/workspaces/{workspace.id}"

    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", False)

    for payload in (
        {"company": "ProbeCo"},
        {"role": "Backend Engineer"},
        {"status": "applied"},
        {"deadline": "2026-09-01T00:00:00+00:00"},
    ):
        response = client.patch(url, headers=auth_headers, json=payload)
        assert response.status_code == 404, payload
        assert response.json() == {"detail": "Feature not available"}

    # Core controls stay usable, and nothing campaign-shaped was persisted.
    renamed = client.patch(url, headers=auth_headers, json={"label": "Renamed"})
    assert renamed.status_code == 200
    pinned = client.patch(url, headers=auth_headers, json={"is_pinned": True})
    assert pinned.status_code == 200

    db.refresh(workspace)
    assert workspace.label == "Renamed"
    assert workspace.company is None and workspace.role is None
    assert workspace.deadline is None
    assert db.query(CampaignEvent).filter(
        CampaignEvent.workspace_id == workspace.id
    ).count() == 0

    # The same writes succeed once the outcome is explicitly activated.
    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", True)
    assert client.patch(url, headers=auth_headers, json={"company": "ProbeCo"}).status_code == 200


def test_dark_campaigns_redact_retained_campaign_data_from_core_history(
    client, auth_headers, test_user, db, monkeypatch
):
    """A flag rollback keeps core history usable without exposing dark R13 data."""
    workspace = Workspace(
        user_id=test_user.id,
        label="Core label",
        is_pinned=True,
        company="Owner A Company",
        role="Private role",
        status="planning",
    )
    db.add(workspace)
    db.flush()
    listing = CampaignListing(
        workspace_id=workspace.id,
        title="Private listing",
        company="Owner A Company",
        description="Sensitive listing description",
        source_url="https://example.com/private-role",
    )
    db.add(listing)
    db.flush()
    workspace.current_listing_id = listing.id
    run = ToolRun(
        user_id=test_user.id,
        workspace_id=workspace.id,
        tool_name="resume",
        label="Core run",
        result_payload={"score": 80},
    )
    db.add(run)
    db.commit()

    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", False)

    workspace_payload = client.get(
        "/api/v1/history/workspaces", headers=auth_headers
    ).json()["items"][0]
    history_payload = client.get("/api/v1/history", headers=auth_headers).json()[
        "items"
    ][0]["workspace"]
    detail_payload = client.get(
        f"/api/v1/history/{run.id}", headers=auth_headers
    ).json()["workspace"]
    renamed_payload = client.patch(
        f"/api/v1/history/workspaces/{workspace.id}",
        headers=auth_headers,
        json={"label": "Still core"},
    ).json()

    for payload in (
        workspace_payload,
        history_payload,
        detail_payload,
        renamed_payload,
    ):
        assert payload["id"] == workspace.id
        assert payload["is_pinned"] is True
        assert payload["company"] is None
        assert payload["role"] is None
        assert payload["status"] is None
        assert payload["deadline"] is None
        assert payload["listing"] is None


def test_dark_campaigns_reject_pasted_listing_attachment(
    client, auth_headers, test_user, db, monkeypatch
):
    workspace = Workspace(user_id=test_user.id, label="Core workspace")
    db.add(workspace)
    db.commit()
    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", False)

    response = client.post(
        "/api/v1/job-posts/import-text",
        headers=auth_headers,
        json={
            "campaign_id": workspace.id,
            "job_title": "Platform Engineer",
            "company_name": "Example Corp",
            "job_description": "Build reliable Python services for customers.",
        },
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Feature not available"}
    assert db.query(CampaignListing).count() == 0
    assert db.query(CampaignEvent).count() == 0


def test_dark_campaigns_hide_pasted_listing_route_before_auth(client, db, monkeypatch):
    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", False)

    response = client.post(
        "/api/v1/job-posts/import-text",
        json={
            "campaign_id": "hidden-workspace",
            "job_title": "Platform Engineer",
            "company_name": "Example Corp",
            "job_description": "Build reliable Python services for customers.",
        },
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Feature not available"}
    assert db.query(CampaignListing).count() == 0
    assert db.query(CampaignEvent).count() == 0


def test_dark_campaigns_reject_url_attachment_before_scraping(
    client, auth_headers, test_user, db, monkeypatch
):
    workspace = Workspace(user_id=test_user.id, label="Core workspace")
    db.add(workspace)
    db.commit()
    called: list[str] = []

    async def fake_scrape(url: str) -> ImportedJobResponse:
        called.append(url)
        return ImportedJobResponse(
            job_title="Platform Engineer",
            company_name="Example Corp",
            job_description="Build reliable Python services for customers.",
            source_url=url,
        )

    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", False)
    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", fake_scrape)

    response = client.post(
        "/api/v1/job-posts/import-url",
        headers=auth_headers,
        json={"url": "https://example.com/jobs/1", "campaign_id": workspace.id},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Feature not available"}
    assert called == []
    assert db.query(CampaignListing).count() == 0
    assert db.query(CampaignEvent).count() == 0


def test_dark_campaigns_keep_standalone_url_import_available(client, monkeypatch):
    called: list[str] = []

    async def fake_scrape(url: str) -> ImportedJobResponse:
        called.append(url)
        return ImportedJobResponse(
            job_title="Platform Engineer",
            company_name="Example Corp",
            job_description="Build reliable Python services for customers.",
            source_url=url,
        )

    monkeypatch.setattr(settings, "R13_CAMPAIGNS_ENABLED", False)
    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", fake_scrape)

    response = client.post(
        "/api/v1/job-posts/import-url",
        json={"url": "https://example.com/jobs/1"},
    )

    assert response.status_code == 200
    assert called == ["https://example.com/jobs/1"]


def test_core_tool_route_remains_available_when_build_ahead_is_dark(
    client, auth_headers, monkeypatch
):
    for flag in (
        "R11_EVIDENCE_PROFILE_ENABLED",
        "R12_CV_STUDIO_ENABLED",
        "R13_CAMPAIGNS_ENABLED",
        "R14_DISCOVERY_ENABLED",
        "R15_QUEUE_ENABLED",
        "R16_SUBMISSION_FOUNDATION_ENABLED",
        "R17_DEVELOPMENT_LOOP_ENABLED",
    ):
        monkeypatch.setattr(settings, flag, False)
    assert client.get("/api/v1/history", headers=auth_headers).status_code == 200


# Prefix -> the gate every route under it must carry. `conftest` force-enables all
# seven flags for the rest of the suite, so an ungated build-ahead route would
# otherwise pass CI unnoticed — which is exactly how the campaign write path above
# stayed open. This check is structural and does not depend on flag state.
_GATED_PREFIXES = {
    "/api/v1/evidence-profile": "require_r11_enabled",
    "/api/v1/cv-documents": "require_r12_enabled",
    "/api/v1/development-plan": "require_r17_enabled",
    "/api/v1/discovery": "require_r14_enabled",
    "/api/v1/queue": "require_r15_enabled",
    "/api/v1/packets": "require_r15_enabled",
    "/api/v1/submission-authorizations": "require_r16_enabled",
}

# Deliberate exceptions: portability and erasure must survive a dark outcome so a
# user is never left with data they cannot export or delete (D-065).
_RECOVERY_ROUTES = {
    ("/api/v1/evidence-profile/export", "GET"),
    ("/api/v1/evidence-profile/items", "DELETE"),
}

# History and job-import mix stable core behavior with R13/R17 build-ahead
# operations, so a prefix rule would incorrectly gate core history. Pin every
# intentionally gated operation instead; additions must be reviewed here.
_MIXED_GATED_ROUTES = {
    ("POST", "/api/v1/job-posts/import-text"): "require_r13_enabled",
    ("GET", "/api/v1/history/workspaces/{workspace_id}"): "require_r13_enabled",
    ("PATCH", "/api/v1/history/workspaces/{workspace_id}/materials"): "require_r13_enabled",
    ("GET", "/api/v1/history/workspaces/{workspace_id}/reminders"): "require_r13_enabled",
    ("PATCH", "/api/v1/history/workspaces/{workspace_id}/reminders"): "require_r13_enabled",
    ("POST", "/api/v1/history/workspaces/{workspace_id}/review"): "require_r13_enabled",
    ("POST", "/api/v1/history/workspaces/{workspace_id}/tasks"): "require_r13_enabled",
    ("PATCH", "/api/v1/history/workspaces/{workspace_id}/tasks/{item_id}"): "require_r13_enabled",
    ("DELETE", "/api/v1/history/workspaces/{workspace_id}/tasks/{item_id}"): "require_r13_enabled",
    ("POST", "/api/v1/history/workspaces/{workspace_id}/notes"): "require_r13_enabled",
    ("DELETE", "/api/v1/history/workspaces/{workspace_id}/notes/{item_id}"): "require_r13_enabled",
    ("POST", "/api/v1/history/workspaces/{workspace_id}/contacts"): "require_r13_enabled",
    ("DELETE", "/api/v1/history/workspaces/{workspace_id}/contacts/{item_id}"): "require_r13_enabled",
    ("POST", "/api/v1/history/workspaces/{workspace_id}/gap-classifications"): "require_r17_enabled",
    ("GET", "/api/v1/history/workspaces/{workspace_id}/gap-classifications"): "require_r17_enabled",
    ("DELETE", "/api/v1/history/workspaces/{workspace_id}/gap-classifications/{classification_id}"): "require_r17_enabled",
    ("GET", "/api/v1/history/workspaces/{workspace_id}/gap-classifications/{classification_id}/response"): "require_r17_enabled",
}


def _effective_app_routes():
    from app.main import app

    for route in app.routes:
        contexts = getattr(route, "effective_route_contexts", None)
        if callable(contexts):
            yield from contexts()
        else:
            yield route


def test_every_build_ahead_route_carries_its_activation_gate():
    ungated = []
    inspected = 0
    for route in _effective_app_routes():
        path = getattr(route, "path", "")
        prefix = next((p for p in _GATED_PREFIXES if path.startswith(p)), None)
        if prefix is None:
            continue
        methods = getattr(route, "methods", set()) - {"HEAD", "OPTIONS"}
        if {(path, m) for m in methods} & _RECOVERY_ROUTES:
            continue
        inspected += len(methods)
        names = {
            getattr(dep.call, "__name__", "") for dep in route.dependant.dependencies
        }
        if _GATED_PREFIXES[prefix] not in names:
            ungated.append(f"{sorted(methods)} {path}")

    assert inspected > 0, "FastAPI route introspection did not inspect build-ahead routes"
    assert ungated == [], f"build-ahead routes missing an activation gate: {ungated}"


def test_mixed_core_routers_pin_every_build_ahead_operation_gate():
    observed = {}
    for route in _effective_app_routes():
        path = getattr(route, "path", "")
        for method in getattr(route, "methods", set()) - {"HEAD", "OPTIONS"}:
            key = (method, path)
            if key not in _MIXED_GATED_ROUTES:
                continue
            observed[key] = {
                getattr(dependency.call, "__name__", "")
                for dependency in route.dependant.dependencies
            }

    assert observed.keys() == _MIXED_GATED_ROUTES.keys()
    for operation, expected_gate in _MIXED_GATED_ROUTES.items():
        assert expected_gate in observed[operation], f"{operation} is missing {expected_gate}"


def test_evidence_profile_recovery_routes_stay_ungated_by_design():
    """Pin the two intentional exceptions so neither is gated by accident."""
    inspected = set()
    for route in _effective_app_routes():
        methods = getattr(route, "methods", set())
        for method in methods:
            if (getattr(route, "path", ""), method) in _RECOVERY_ROUTES:
                inspected.add((getattr(route, "path", ""), method))
                names = {
                    getattr(dep.call, "__name__", "")
                    for dep in route.dependant.dependencies
                }
                assert "require_r11_enabled" not in names
                assert "get_current_user" in names
    assert inspected == _RECOVERY_ROUTES
