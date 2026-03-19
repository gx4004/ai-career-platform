"""Health endpoint smoke test."""

PREFIX = "/api/v1"


def test_health_returns_200(client):
    resp = client.get(f"{PREFIX}/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-career-platform"
    assert "time" in data
