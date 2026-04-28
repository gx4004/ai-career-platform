"""Unit tests for the job scraper service."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.job_scraper import _validate_url, scrape_job_posting


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


# ── SSRF guard ──
#
# The scraper is exposed unauthenticated via /api/v1/job-posts/import-url, so
# the URL validator is the only thing standing between an attacker and an
# arbitrary HTTP request from the backend pod (Vertex API metadata, internal
# services on the Railway network, link-local, etc). These tests lock the
# allowlist behavior in place: scheme, hostname, and DNS resolution must all
# pass before any fetch is attempted.


def test_validate_url_rejects_non_http_scheme():
    with pytest.raises(ValueError, match="HTTP"):
        _validate_url("file:///etc/passwd")
    with pytest.raises(ValueError, match="HTTP"):
        _validate_url("ftp://example.com/file")
    with pytest.raises(ValueError, match="HTTP"):
        _validate_url("javascript:alert(1)")


def test_validate_url_requires_hostname():
    with pytest.raises(ValueError, match="hostname"):
        _validate_url("http:///no-host")


def test_validate_url_blocks_loopback_literal():
    # No DNS lookup needed — getaddrinfo returns the literal IP.
    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://127.0.0.1/")
    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://[::1]/")


def test_validate_url_blocks_rfc1918_literal():
    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://10.0.0.5/")
    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://192.168.1.1/")
    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://172.16.0.1/")


def test_validate_url_blocks_link_local_metadata_endpoint():
    # The AWS / GCP / Azure instance metadata service.
    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://169.254.169.254/latest/meta-data/")


def test_validate_url_blocks_hostname_resolving_to_private_ip(monkeypatch):
    """A *hostname* that resolves to a private address must also be blocked.
    This catches DNS-based SSRF where the URL itself looks public."""

    def fake_getaddrinfo(_host, _port, _family, _socktype):
        # Family / proto / canonname / sockaddr — only sockaddr[0] is read.
        return [(0, 0, 0, "", ("10.0.0.42", 0))]

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)

    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://looks-public.example.com/")


def test_validate_url_passes_through_when_hostname_unresolvable(monkeypatch):
    """An unresolvable hostname is not an SSRF vector (can't connect to a
    private IP). The scraper's tier-3 fallback handles the actual fetch
    failure with a paste-it-in message — see test_scrape_connection_error_*.
    Validate-time must therefore *not* raise on gaierror."""
    import socket as _socket

    def fake_getaddrinfo(_host, _port, _family, _socktype):
        raise _socket.gaierror("nodename nor servname provided")

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)

    # Should not raise.
    _validate_url("http://this-does-not-resolve.invalid/")
