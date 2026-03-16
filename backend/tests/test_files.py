import io

PREFIX = "/api/v1"


def test_parse_cv_unsupported(client):
    file = io.BytesIO(b"not a real file")
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("test.txt", file, "text/plain")},
    )
    assert resp.status_code == 400
    assert "Unsupported" in resp.json()["detail"]


def test_health(client):
    resp = client.get(f"{PREFIX}/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-career-platform"
    assert "time" in data


def test_import_job_url_invalid(client, monkeypatch):
    import httpx

    async def mock_get(*args, **kwargs):
        raise httpx.HTTPError("Connection failed")

    monkeypatch.setattr("app.services.job_scraper.httpx.AsyncClient", _mock_client_cls(mock_get))

    resp = client.post(
        f"{PREFIX}/job-posts/import-url",
        json={"url": "https://invalid.example.com/job"},
    )
    assert resp.status_code == 400


def _mock_client_cls(mock_get):
    """Create a mock AsyncClient class."""

    class MockAsyncClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, *args, **kwargs):
            return await mock_get(*args, **kwargs)

    return MockAsyncClient
