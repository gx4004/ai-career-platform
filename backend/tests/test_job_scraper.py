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
    with patch("app.services.job_scraper._fetch_with_httpx", new_callable=AsyncMock, return_value=HTML_PAGE):
        result = await scrape_job_posting("https://example.com/job")

    assert result.job_title == "Backend Engineer"
    assert result.company_name == "Acme Corp"
    assert "Python" in result.job_description
    assert result.source_url == "https://example.com/job"


@pytest.mark.asyncio
async def test_scrape_minimal_html():
    """Page with no structured selectors falls back to body text."""
    minimal = "<html><body><p>Some job posting with enough text to pass the length check. " + "x " * 60 + "</p></body></html>"

    with patch("app.services.job_scraper._fetch_with_httpx", new_callable=AsyncMock, return_value=minimal):
        result = await scrape_job_posting("https://example.com/plain")

    assert result.job_title is None
    assert result.company_name is None
    assert len(result.job_description) > 0


@pytest.mark.asyncio
async def test_scrape_http_error_falls_back_gracefully():
    fake_response = httpx.Response(404, request=httpx.Request("GET", "https://example.com/404"))

    with patch("app.services.job_scraper._fetch_with_httpx", side_effect=httpx.HTTPStatusError("404", request=httpx.Request("GET", "https://example.com/404"), response=fake_response)):
        with patch("app.services.job_scraper._fetch_with_playwright", side_effect=Exception("Playwright failed")):
            result = await scrape_job_posting("https://example.com/404")

    assert result.job_title is None
    assert "paste" in result.job_description.lower()
    assert result.source_url == "https://example.com/404"


@pytest.mark.asyncio
async def test_scrape_connection_error_falls_back_gracefully():
    with patch("app.services.job_scraper._fetch_with_httpx", side_effect=httpx.ConnectError("Connection refused")):
        with patch("app.services.job_scraper._fetch_with_playwright", side_effect=Exception("Playwright failed")):
            result = await scrape_job_posting("https://unreachable.example.com")

    assert result.job_title is None
    assert "paste" in result.job_description.lower()
