import io

import fitz
import pytest
from docx import Document
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request

from app.routers.files import parse_cv_endpoint

PREFIX = "/api/v1"


def test_parse_cv_unsupported(client):
    file = io.BytesIO(b"not a real file")
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("test.txt", file, "text/plain")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "The uploaded file could not be safely parsed."


def test_parse_cv_rejects_spoofed_extension_pdf(client):
    """Plain text renamed to .pdf must be rejected via magic-byte check."""
    file = io.BytesIO(b"this is plain text, not a pdf")
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("malicious.pdf", file, "application/pdf")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "The uploaded file could not be safely parsed."


def test_parse_cv_rejects_spoofed_extension_docx(client):
    """Plain text renamed to .docx must be rejected via magic-byte check."""
    file = io.BytesIO(b"this is plain text, not a docx")
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("malicious.docx", file, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "The uploaded file could not be safely parsed."


def test_parse_cv_rejects_declared_mime_that_disagrees_with_pdf_extension(client):
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={
            "file": (
                "resume.pdf",
                io.BytesIO(b"%PDF-1.7\nboundary-test"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "The uploaded file could not be safely parsed."


def test_parse_cv_rejects_fake_docx_zip_container_before_parser(client):
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={
            "file": (
                "resume.docx",
                io.BytesIO(b"PK\x03\x04not-a-real-zip"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "The uploaded file could not be safely parsed."


def test_parse_cv_maps_malformed_pdf_parser_failure_to_generic_error(client):
    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={
            "file": (
                "resume.pdf",
                io.BytesIO(b"%PDF-1.7\nmalformed"),
                "application/pdf",
            )
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "The uploaded file could not be safely parsed."


def test_parse_cv_maps_unexpected_boundary_failure_to_generic_error(client, monkeypatch):
    async def fail_boundary(file):
        raise RuntimeError("internal parser detail")

    monkeypatch.setattr(
        "app.routers.files.read_validated_cv_upload",
        fail_boundary,
    )

    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("resume.pdf", io.BytesIO(b"%PDF-1.7"), "application/pdf")},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "The uploaded file could not be safely parsed."
    assert "internal parser detail" not in resp.text


def test_parse_cv_accepts_valid_pdf_through_isolated_parser(client):
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Safe resume text")
    content = document.tobytes()
    document.close()

    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={"file": ("resume.pdf", io.BytesIO(content), "application/pdf")},
    )

    assert resp.status_code == 200
    assert "Safe resume text" in resp.json()["extracted_text"]


def test_parse_cv_accepts_valid_docx_through_isolated_parser(client):
    output = io.BytesIO()
    document = Document()
    document.add_paragraph("Safe DOCX resume text")
    document.save(output)

    resp = client.post(
        f"{PREFIX}/files/parse-cv",
        files={
            "file": (
                "resume.docx",
                io.BytesIO(output.getvalue()),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert resp.status_code == 200
    assert "Safe DOCX resume text" in resp.json()["extracted_text"]


async def test_parse_cv_closes_upload_resource_on_rejection():
    stream = io.BytesIO(b"not-pdf")
    upload = UploadFile(
        stream,
        filename="resume.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": f"{PREFIX}/files/parse-cv",
            "headers": [],
            "client": ("127.0.0.1", 1234),
        }
    )

    with pytest.raises(HTTPException):
        await parse_cv_endpoint.__wrapped__(request, upload)

    assert stream.closed is True


def test_health(client):
    resp = client.get(f"{PREFIX}/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-career-platform"
    assert "time" in data


def test_import_job_url_invalid(client, monkeypatch):
    import httpx

    async def mock_fetch(*args, **kwargs):
        raise httpx.HTTPError("Connection failed")

    monkeypatch.setattr("app.services.job_scraper._validate_url", lambda _url: None)
    monkeypatch.setattr("app.services.job_scraper._fetch_with_httpx", mock_fetch)
    monkeypatch.setattr("app.services.job_scraper._fetch_with_playwright", mock_fetch)

    resp = client.post(
        f"{PREFIX}/job-posts/import-url",
        json={"url": "https://example.com/job"},
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
