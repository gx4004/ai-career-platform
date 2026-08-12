"""Health endpoint smoke test."""

PREFIX = "/api/v1"


def test_health_returns_200(client):
    resp = client.get(f"{PREFIX}/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-career-platform"
    assert "time" in data


def test_health_returns_503_when_database_is_unavailable(client, db, monkeypatch):
    def fail_query(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(db, "execute", fail_query)

    resp = client.get(f"{PREFIX}/health")

    assert resp.status_code == 503
    assert resp.json()["status"] == "degraded"
    assert resp.json()["checks"] == {"database": "error: RuntimeError"}
