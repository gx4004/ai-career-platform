"""Unit tests for the job scraper service."""

import sys
from types import ModuleType
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.job_scraper import (
    _fetch_with_httpx,
    _fetch_with_playwright,
    _FetchedResource,
    _validate_url,
    scrape_job_posting,
)

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
            result = await scrape_job_posting("https://example.com/unreachable")

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


def test_validate_url_rejects_unresolvable_hostname(monkeypatch):
    import socket as _socket

    def fake_getaddrinfo(_host, _port, _family, _socktype):
        raise _socket.gaierror("nodename nor servname provided")

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)

    with pytest.raises(ValueError, match="resolve"):
        _validate_url("http://this-does-not-resolve.invalid/")


@pytest.mark.parametrize(
    "url",
    [
        "http://user:password@example.com/job",
        "https://example.com:444/job",
        "http://2130706433/",
        "http://0x7f000001/",
        "http://0177.0.0.1/",
    ],
)
def test_validate_url_rejects_credentials_ports_and_alternate_loopback(url):
    with pytest.raises(ValueError):
        _validate_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com%2f@127.0.0.1/",
        "https://example.com\\@127.0.0.1/",
        "https://example.com./job",
        "http://[fe80::1%25eth0]/",
    ],
)
def test_validate_url_rejects_ambiguous_or_encoded_authority(url):
    with pytest.raises(ValueError):
        _validate_url(url)


@pytest.mark.parametrize(
    "ip",
    ["::", "::1", "fc00::1", "fe80::1", "2001:db8::1", "100.64.0.1", "192.0.0.170"],
)
def test_validate_url_rejects_ipv6_and_special_use_ranges(ip):
    rendered_ip = f"[{ip}]" if ":" in ip else ip
    with pytest.raises(ValueError, match="private/internal"):
        _validate_url(f"http://{rendered_ip}/")


def test_validate_url_rejects_when_any_dns_answer_is_private(monkeypatch):
    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [
            (0, 0, 0, "", ("93.184.216.34", 0)),
            (0, 0, 0, "", ("169.254.169.254", 0)),
        ]

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)

    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("https://example.com/job")


def test_validate_url_rejects_metadata_hostname(monkeypatch):
    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [(0, 0, 0, "", ("169.254.169.254", 0))]

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)

    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://metadata.google.internal/computeMetadata/v1/")


@pytest.mark.asyncio
async def test_http_fetch_connects_to_vetted_ip_and_preserves_host(monkeypatch):
    requests = []

    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [(0, 0, 0, "", ("93.184.216.34", 0))]

    async def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            text="<html><body>job</body></html>",
        )

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )

    await _fetch_with_httpx("https://example.com/job")

    assert str(requests[0].url) == "https://93.184.216.34/job"
    assert requests[0].headers["host"] == "example.com"
    assert requests[0].extensions["sni_hostname"] == "example.com"


@pytest.mark.asyncio
async def test_http_fetch_revalidates_redirect_target(monkeypatch):
    def fake_getaddrinfo(host, _port, _family, _socktype):
        ip = "93.184.216.34" if host == "example.com" else "127.0.0.1"
        return [(0, 0, 0, "", (ip, 0))]

    async def handler(_request):
        return httpx.Response(302, headers={"location": "http://internal.example/secret"})

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )

    with pytest.raises(ValueError, match="private/internal"):
        await _fetch_with_httpx("https://example.com/job")


@pytest.mark.asyncio
async def test_http_fetch_rejects_non_html_and_oversized_responses(monkeypatch):
    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [(0, 0, 0, "", ("93.184.216.34", 0))]

    responses = iter(
        [
            httpx.Response(200, headers={"content-type": "text/html-evil"}, content=b"x"),
            httpx.Response(
                200,
                headers={"content-type": "text/html", "content-length": "2000001"},
                content=b"x",
            ),
        ]
    )

    async def handler(_request):
        return next(responses)

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )

    with pytest.raises(httpx.HTTPError, match="content type"):
        await _fetch_with_httpx("https://example.com/job")
    with pytest.raises(httpx.HTTPError, match="large"):
        await _fetch_with_httpx("https://example.com/job")


@pytest.mark.asyncio
async def test_http_fetch_rejects_streamed_overflow_without_content_length(monkeypatch):
    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [(0, 0, 0, "", ("93.184.216.34", 0))]

    async def handler(_request):
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            content=b"x" * 2_000_001,
        )

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )

    with pytest.raises(httpx.HTTPError, match="large"):
        await _fetch_with_httpx("https://example.com/job")


@pytest.mark.asyncio
async def test_http_fetch_pins_first_resolution_against_dns_rebinding(monkeypatch):
    lookups = 0
    requests = []

    def fake_getaddrinfo(_host, _port, _family, _socktype):
        nonlocal lookups
        lookups += 1
        ip = "93.184.216.34" if lookups == 1 else "127.0.0.1"
        return [(0, 0, 0, "", (ip, 0))]

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, headers={"content-type": "text/html"}, text="safe")

    monkeypatch.setattr("app.services.job_scraper.socket.getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )

    assert await _fetch_with_httpx("https://example.com/job") == "safe"
    assert lookups == 1
    assert requests[0].url.host == "93.184.216.34"


@pytest.mark.asyncio
async def test_playwright_renders_pinned_html_without_direct_network(monkeypatch):
    routes = []

    class FakeRequest:
        def __init__(self, url, resource_type, method="GET"):
            self.method = method
            self.resource_type = resource_type
            self.url = url

    class FakeRoute:
        def __init__(self, request):
            self.request = request
            self.aborted = False
            self.fulfilled = False

        async def abort(self):
            self.aborted = True

        async def fulfill(self, **kwargs):
            self.fulfilled = True
            assert kwargs["body"]

    class FakePage:
        async def route(self, _pattern, handler):
            self.handler = handler

        async def goto(self, _url, **_kwargs):
            requests = [
                FakeRequest("https://example.com/job", "document"),
                FakeRequest("https://cdn.example.com/app.js", "script"),
                FakeRequest("https://private.example.com/app.css", "stylesheet"),
                FakeRequest("https://cdn.example.com/logo.png", "image"),
            ]
            for request in requests:
                route = FakeRoute(request)
                await self.handler(route)
                routes.append(route)

        async def content(self):
            return "<html><body>rendered</body></html>"

    class FakeBrowser:
        async def new_page(self):
            return FakePage()

        async def close(self):
            pass

    class FakeChromium:
        async def launch(self, **_kwargs):
            return FakeBrowser()

    class FakePlaywright:
        chromium = FakeChromium()

    class FakeManager:
        async def __aenter__(self):
            return FakePlaywright()

        async def __aexit__(self, *_args):
            pass

    fetch_resource = AsyncMock(
        side_effect=[
            _FetchedResource(b"<html><body>safe</body></html>", "text/html"),
            _FetchedResource(b"document.title = 'safe'", "text/javascript"),
            ValueError("private redirect"),
        ]
    )
    monkeypatch.setattr(
        "app.services.job_scraper._fetch_resource_with_httpx", fetch_resource
    )
    playwright_module = ModuleType("playwright")
    async_api_module = ModuleType("playwright.async_api")
    async_api_module.async_playwright = lambda: FakeManager()
    playwright_module.async_api = async_api_module
    monkeypatch.setitem(sys.modules, "playwright", playwright_module)
    monkeypatch.setitem(sys.modules, "playwright.async_api", async_api_module)

    result = await _fetch_with_playwright("https://example.com/job")

    assert result == "<html><body>rendered</body></html>"
    assert routes[0].fulfilled is True
    assert routes[1].fulfilled is True
    assert routes[2].aborted is True
    assert routes[3].aborted is True
    assert [call.args[0] for call in fetch_resource.await_args_list] == [
        "https://example.com/job",
        "https://cdn.example.com/app.js",
        "https://private.example.com/app.css",
    ]


def test_import_endpoint_returns_safe_error_for_blocked_target(client):
    response = client.post(
        "/api/v1/job-posts/import-url",
        json={"url": "http://169.254.169.254/latest/meta-data/"},
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "URLs resolving to private/internal IPs are not allowed"
    }
