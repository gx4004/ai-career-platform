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


def test_parse_cv_rejects_spoofed_extension_pdf(client):
    """Plain text renamed to .pdf must be rejected via magic-byte check."""
    file = io.BytesIO(b"this is plain text, not a pdf")
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("malicious.pdf", file, "application/pdf")},
    )
    assert resp.status_code == 400
    assert "valid" in resp.json()["detail"].lower()


def test_parse_cv_rejects_spoofed_extension_docx(client):
    """Plain text renamed to .docx must be rejected via magic-byte check."""
    file = io.BytesIO(b"this is plain text, not a docx")
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("malicious.docx", file, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert resp.status_code == 400
    assert "valid" in resp.json()["detail"].lower()


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
    assert resp.status_code == 200
    data = resp.json()
    assert "paste" in data.get("job_description", "").lower() or data.get("source") == "fallback"


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
