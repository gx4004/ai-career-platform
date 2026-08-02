from app.config import Settings, settings


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
