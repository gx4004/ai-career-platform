"""Unit tests for the job scraper service."""

import sys
from types import ModuleType
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics import IMPORT_FAILURE_OUTCOMES, ActivationEventCreate
from app.services.import_source import get_import_outcome, reset_import_outcome
from app.services.job_scraper import (
    _fetch_resource_with_httpx,
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
    with patch(
        "app.services.job_scraper._fetch_with_httpx", new_callable=AsyncMock, return_value=HTML_PAGE
    ):
        result = await scrape_job_posting("https://example.com/job")

    assert result.job_title == "Backend Engineer"
    assert result.company_name == "Acme Corp"
    assert "Python" in result.job_description
    assert result.source_url == "https://example.com/job"


@pytest.mark.asyncio
async def test_scrape_minimal_html():
    """Page with no structured selectors falls back to body text."""
    minimal = (
        "<html><body><p>Some job posting with enough text to pass the length check. "
        + "x " * 60
        + "</p></body></html>"
    )

    with patch(
        "app.services.job_scraper._fetch_with_httpx", new_callable=AsyncMock, return_value=minimal
    ):
        result = await scrape_job_posting("https://example.com/plain")

    assert result.job_title is None
    assert result.company_name is None
    assert len(result.job_description) > 0


@pytest.mark.asyncio
async def test_scrape_http_error_falls_back_gracefully():
    fake_response = httpx.Response(404, request=httpx.Request("GET", "https://example.com/404"))

    with patch(
        "app.services.job_scraper._fetch_with_httpx",
        side_effect=httpx.HTTPStatusError(
            "404", request=httpx.Request("GET", "https://example.com/404"), response=fake_response
        ),
    ):
        with patch(
            "app.services.job_scraper._fetch_with_playwright",
            side_effect=Exception("Playwright failed"),
        ):
            result = await scrape_job_posting("https://example.com/404")

    assert result.job_title is None
    assert "paste" in result.job_description.lower()
    assert result.source_url == "https://example.com/404"


@pytest.mark.asyncio
async def test_scrape_connection_error_falls_back_gracefully():
    with patch(
        "app.services.job_scraper._fetch_with_httpx",
        side_effect=httpx.ConnectError("Connection refused"),
    ):
        with patch(
            "app.services.job_scraper._fetch_with_playwright",
            side_effect=Exception("Playwright failed"),
        ):
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

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)

    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("http://looks-public.example.com/")


def test_validate_url_rejects_unresolvable_hostname(monkeypatch):
    import socket as _socket

    def fake_getaddrinfo(_host, _port, _family, _socktype):
        raise _socket.gaierror("nodename nor servname provided")

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)

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

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)

    with pytest.raises(ValueError, match="private/internal"):
        _validate_url("https://example.com/job")


def test_validate_url_rejects_metadata_hostname(monkeypatch):
    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [(0, 0, 0, "", ("169.254.169.254", 0))]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)

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

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)
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

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)
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

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)
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

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)
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

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)
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
    monkeypatch.setattr("app.services.job_scraper._fetch_resource_with_httpx", fetch_resource)
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
    assert response.json() == {"detail": "URLs resolving to private/internal IPs are not allowed"}


# ── Honest identification (D-026, D-086) ──
#
# Neither fetch tier may pretend to be a browser: both go out through
# `_fetch_resource_with_httpx`, and the identity they present is asserted by its
# exact value so that re-introducing an impersonating agent fails here.


@pytest.fixture
def public_dns(monkeypatch):
    """Every hostname resolves to one public address; no real DNS or network."""

    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [(0, 0, 0, "", ("93.184.216.34", 0))]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)


@pytest.fixture
def no_browser_tier(monkeypatch):
    """The bounded Playwright tier never launches a browser in these tests."""
    monkeypatch.setattr(
        "app.services.job_scraper._fetch_with_playwright",
        AsyncMock(side_effect=RuntimeError("browser tier unavailable")),
    )


def _mock_http(monkeypatch, handler):
    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_both_fetch_tiers_send_the_honest_identifier(monkeypatch, public_dns):
    requests = []

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, headers={"content-type": "text/html"}, text=HTML_PAGE)

    _mock_http(monkeypatch, handler)

    # Tier 1 (the user-provided URL) and every request the browser tier makes.
    await _fetch_with_httpx("https://example.com/job")
    await _fetch_resource_with_httpx("https://example.com/job", frozenset({"text/html"}))

    assert [request.headers["user-agent"] for request in requests] == [
        "CareerWorkbenchImport/1.0",
        "CareerWorkbenchImport/1.0",
    ]
    assert all("Mozilla" not in request.headers["user-agent"] for request in requests)


# ── Import-outcome evidence (#142, D-059) ──
#
# The source-concentration trigger decides from these recorded outcomes, so the
# evidence must separate "the fetch and the parse worked" from "the result was
# substantive", and a failed import must say which bounded failure mode it hit.

SHORT_DESCRIPTION_PAGE = (
    '<html><body><h1 class="job-title">Backend Engineer</h1>'
    "<p>Short posting.</p></body></html>"
)
EMPTY_PAGE = "<html><body></body></html>"


def _status_handler(status: int, *, content_type: str = "text/html", text: str = "denied"):
    async def handler(_request):
        return httpx.Response(status, headers={"content-type": content_type}, text=text)

    return handler


async def _timeout_handler(_request):
    raise httpx.ConnectTimeout("read timed out")


async def _connect_error_handler(_request):
    raise httpx.ConnectError("connection refused")


async def _unsized_response_handler(_request):
    return httpx.Response(
        200,
        headers={"content-type": "text/html", "content-length": "not-a-number"},
        text=HTML_PAGE,
    )


@pytest.mark.asyncio
async def test_short_description_records_low_quality_success_not_failure(
    monkeypatch, public_dns, no_browser_tier
):
    """A page that fetches and parses is not a failed import — only a thin one."""
    _mock_http(monkeypatch, _status_handler(200, text=SHORT_DESCRIPTION_PAGE))
    reset_import_outcome()

    result = await scrape_job_posting("https://example.com/job")

    assert get_import_outcome() == "success_low_quality"
    # User-facing behaviour is unchanged: the fallback tier still runs and the
    # user still gets the paste path when it cannot do better.
    assert result.job_title is None
    assert "paste" in result.job_description.lower()


@pytest.mark.parametrize(
    ("handler", "expected_outcome"),
    [
        (_status_handler(403), "failure_blocked"),
        (_status_handler(429), "failure_blocked"),
        (_timeout_handler, "failure_timeout"),
        (_status_handler(503), "failure_unavailable"),
        (_connect_error_handler, "failure_unavailable"),
        (_status_handler(200, content_type="application/pdf"), "failure_unparseable"),
        (_unsized_response_handler, "failure_unparseable"),
        (_status_handler(200, text=EMPTY_PAGE), "failure_empty"),
    ],
)
@pytest.mark.asyncio
async def test_each_failure_branch_records_its_bounded_category(
    monkeypatch, public_dns, no_browser_tier, handler, expected_outcome
):
    _mock_http(monkeypatch, handler)
    reset_import_outcome()

    result = await scrape_job_posting("https://example.com/job")

    assert get_import_outcome() == expected_outcome
    assert "paste" in result.job_description.lower()


@pytest.mark.asyncio
async def test_redirect_to_internal_address_records_blocked(monkeypatch, no_browser_tier):
    """The outbound guard refusing a redirect hop is a blocked fetch, not an outage."""

    def fake_getaddrinfo(host, _port, _family, _socktype):
        ip = "93.184.216.34" if host == "example.com" else "127.0.0.1"
        return [(0, 0, 0, "", (ip, 0))]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)

    async def handler(_request):
        return httpx.Response(302, headers={"location": "http://internal.example/secret"})

    _mock_http(monkeypatch, handler)
    reset_import_outcome()

    result = await scrape_job_posting("https://example.com/job")

    assert get_import_outcome() == "failure_blocked"
    assert "paste" in result.job_description.lower()


def test_import_outcome_event_records_category_without_url_host_or_message(
    client, db, monkeypatch, public_dns, no_browser_tier
):
    """The persisted row carries the family and the category — nothing else."""

    async def handler(_request):
        return httpx.Response(
            403,
            headers={"content-type": "text/html", "x-blocked-by": "Acme WAF"},
            text="Forbidden by boards.greenhouse.io for token=secret",
        )

    _mock_http(monkeypatch, handler)

    response = client.post(
        "/api/v1/job-posts/import-url",
        json={"url": "https://boards.greenhouse.io/acme/jobs/4815162342?token=secret"},
    )

    assert response.status_code == 200
    event = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "r10_import_outcome")
        .one()
    )
    assert event.operational_dimension == "greenhouse"
    assert event.operational_outcome == "failure_blocked"
    assert event.duration_ms >= 0

    persisted = " ".join(
        str(getattr(event, column.name)) for column in AnalyticsEvent.__table__.columns
    )
    for leaked in (
        "greenhouse.io",
        "boards",
        "4815162342",
        "secret",
        "Acme WAF",
        "Forbidden",
        "https://",
    ):
        assert leaked not in persisted


@pytest.mark.parametrize(
    "outcome",
    [
        "success",
        "success_low_quality",
        "fallback",
        "failure",
        "failure_blocked",
        "failure_timeout",
        "failure_unavailable",
        "failure_unparseable",
        "failure_empty",
    ],
)
def test_import_outcome_allowlist_accepts_every_recorded_class(outcome):
    event = ActivationEventCreate(
        event_name="r10_import_outcome",
        operational_dimension="greenhouse",
        operational_outcome=outcome,
        duration_ms=12,
    )

    assert event.operational_outcome == outcome


def test_import_failure_class_covers_every_category():
    assert IMPORT_FAILURE_OUTCOMES == {
        "failure",
        "failure_blocked",
        "failure_timeout",
        "failure_unavailable",
        "failure_unparseable",
        "failure_empty",
    }


@pytest.mark.parametrize(
    "fields",
    [
        # A message-bearing or host-bearing outcome is still rejected outright.
        {
            "event_name": "r10_import_outcome",
            "operational_dimension": "greenhouse",
            "operational_outcome": "failure: boards.greenhouse.io returned 403",
            "duration_ms": 1,
        },
        # The import-specific classes belong to the import event and nothing else.
        {
            "event_name": "discovery_source_fetch_outcome",
            "operational_dimension": "licensed",
            "operational_outcome": "failure_blocked",
        },
        {
            "event_name": "discovery_source_fetch_outcome",
            "operational_dimension": "licensed",
            "operational_outcome": "success_low_quality",
        },
    ],
)
def test_import_outcome_allowlist_rejects_unbounded_or_borrowed_values(fields):
    with pytest.raises(Exception):
        ActivationEventCreate(**fields)
