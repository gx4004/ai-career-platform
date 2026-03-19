"""Unit tests for the job scraper service."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.job_scraper import scrape_job_posting


HTML_PAGE = """
<html>
<head><title>Job</title></head>
<body>
  <h1 class="job-title">Backend Engineer</h1>
  <div class="company-name">Acme Corp</div>
  <div class="job-description">
    We are looking for a Backend Engineer with Python, SQL, and FastAPI experience.
    You will build APIs, manage databases, and deploy to cloud infrastructure.
    This is a full-time position requiring 3+ years of professional experience.
  </div>
</body>
</html>
"""


@pytest.mark.asyncio
async def test_scrape_extracts_fields():
    fake_response = httpx.Response(200, text=HTML_PAGE, request=httpx.Request("GET", "https://example.com/job"))

    with patch("app.services.job_scraper.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=fake_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await scrape_job_posting("https://example.com/job")

    assert result.job_title == "Backend Engineer"
    assert result.company_name == "Acme Corp"
    assert "Python" in result.job_description
    assert result.source_url == "https://example.com/job"


@pytest.mark.asyncio
async def test_scrape_minimal_html():
    """Page with no structured selectors falls back to body text."""
    minimal = "<html><body><p>Some job posting with enough text to pass the length check. " + "x " * 60 + "</p></body></html>"
    fake_response = httpx.Response(200, text=minimal, request=httpx.Request("GET", "https://example.com/plain"))

    with patch("app.services.job_scraper.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=fake_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await scrape_job_posting("https://example.com/plain")

    assert result.job_title is None
    assert result.company_name is None
    assert len(result.job_description) > 0


@pytest.mark.asyncio
async def test_scrape_http_error():
    fake_response = httpx.Response(404, request=httpx.Request("GET", "https://example.com/404"))

    with patch("app.services.job_scraper.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=fake_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            await scrape_job_posting("https://example.com/404")


@pytest.mark.asyncio
async def test_scrape_connection_error():
    with patch("app.services.job_scraper.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with pytest.raises(httpx.ConnectError):
            await scrape_job_posting("https://unreachable.example.com")
