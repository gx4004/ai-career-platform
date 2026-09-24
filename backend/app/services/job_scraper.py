import logging
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

from app.schemas.analytics import ImportFailureCategory
from app.schemas.tools import ImportedJobResponse
from app.services.import_source import set_import_outcome
from app.services.outbound_target import resolve_public_target

logger = logging.getLogger(__name__)

# D-086/D-026: every fetch tier identifies itself honestly. This product does not
# impersonate a browser to get past a source's technical controls, so the
# user-provided-URL tier identifies itself in the same honest form the discovery
# ingestion tier uses (`CareerWorkbenchDiscovery/1.0`). Both the first-tier fetch
# and every request the bounded browser fallback makes go out through the one
# helper below, so this is the only identity either tier presents.
IMPORT_USER_AGENT = "CareerWorkbenchImport/1.0"

# A description shorter than this is not a substantive posting. It still does not
# make the import a *failure* — see `scrape_job_posting` (#142).
_SUBSTANTIVE_DESCRIPTION_CHARS = 100

# Status codes that mean "this source refused the fetch" rather than "this fetch
# went wrong". Kept separate so the recorded failure category distinguishes an
# access control from an outage (#142).
_BLOCKED_STATUS_CODES = frozenset({401, 403, 407, 429, 451})

_BS4_TIMEOUT = 5.0
_PLAYWRIGHT_TIMEOUT_MS = 10_000
_MAX_REDIRECTS = 5
_MAX_RESPONSE_BYTES = 2_000_000
_MAX_BROWSER_REQUESTS = 50
_MAX_BROWSER_BYTES = 10_000_000
_HTML_CONTENT_TYPES = frozenset({"text/html", "application/xhtml+xml"})
_BROWSER_CONTENT_TYPES = frozenset(
    {
        *_HTML_CONTENT_TYPES,
        "application/javascript",
        "application/json",
        "application/ld+json",
        "application/x-javascript",
        "text/css",
        "text/javascript",
        "text/plain",
    }
)


@dataclass(frozen=True)
class _FetchedResource:
    content: bytes
    content_type: str


class _UnparseableResponseError(httpx.HTTPError):
    """A response arrived, but it cannot be turned into a job posting.

    A dedicated exception type — not a message match — so the recorded import
    failure category is derived from the branch that produced it and never from
    a message string (#142, D-059).
    """


def _classify_fetch_failure(exc: BaseException) -> ImportFailureCategory:
    """Map one fetch failure onto a bounded, content-free failure category.

    Only the exception *type*, and for a status error the status code, is
    inspected — never a message, URL, host, or response body — so nothing
    beyond the closed category set can reach the recorded evidence.
    """
    if isinstance(exc, ValueError):
        # `resolve_public_target` refused the target or a redirect hop: this
        # fetch is blocked by our own outbound policy.
        return "failure_blocked"
    if isinstance(exc, httpx.TimeoutException):
        return "failure_timeout"
    if isinstance(exc, _UnparseableResponseError):
        return "failure_unparseable"
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code in _BLOCKED_STATUS_CODES:
            return "failure_blocked"
        return "failure_unavailable"
    return "failure_unavailable"


def _validate_url(url: str) -> None:
    resolve_public_target(url)


async def _fetch_with_httpx(url: str) -> str:
    resource = await _fetch_resource_with_httpx(url, _HTML_CONTENT_TYPES)
    return resource.content.decode("utf-8", errors="replace")


async def _fetch_resource_with_httpx(
    url: str,
    allowed_content_types: frozenset[str],
) -> _FetchedResource:
    transport = httpx.AsyncHTTPTransport(retries=0)
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=_BS4_TIMEOUT,
        transport=transport,
        trust_env=False,
    ) as client:
        current = url
        for _ in range(_MAX_REDIRECTS + 1):
            target = resolve_public_target(current)
            request = client.build_request(
                "GET",
                target.connect_url,
                headers={
                    "Host": target.host_header,
                    "User-Agent": IMPORT_USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml",
                },
                extensions={"sni_hostname": target.hostname},
            )
            response = await client.send(request, stream=True)
            if response.is_redirect:
                location = response.headers.get("location")
                await response.aclose()
                if not location:
                    break
                next_url = str(httpx.URL(current).join(location))
                resolve_public_target(next_url)
                current = next_url
                continue
            try:
                response.raise_for_status()
                content_type = (
                    response.headers.get("content-type", "").partition(";")[0].strip().lower()
                )
                if content_type not in allowed_content_types:
                    raise _UnparseableResponseError("Unsupported response content type")
                content_length = response.headers.get("content-length")
                if content_length:
                    try:
                        declared_bytes = int(content_length)
                    except ValueError as exc:
                        # A response we cannot even size is not a blocked fetch.
                        raise _UnparseableResponseError("Malformed content length") from exc
                    if declared_bytes > _MAX_RESPONSE_BYTES:
                        await response.aclose()
                        raise _UnparseableResponseError("Response is too large")

                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > _MAX_RESPONSE_BYTES:
                        raise _UnparseableResponseError("Response is too large")
                return _FetchedResource(bytes(body), content_type)
            finally:
                await response.aclose()
    raise httpx.HTTPError("Too many redirects")


async def _fetch_with_playwright(url: str) -> str:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            request_count = 0
            fetched_bytes = 0

            async def _guard(route):
                nonlocal request_count, fetched_bytes
                request = route.request
                if request.method != "GET" or request.resource_type in {
                    "font",
                    "image",
                    "media",
                    "websocket",
                }:
                    await route.abort()
                    return
                request_count += 1
                if request_count > _MAX_BROWSER_REQUESTS:
                    await route.abort()
                    return
                try:
                    resource = await _fetch_resource_with_httpx(request.url, _BROWSER_CONTENT_TYPES)
                    fetched_bytes += len(resource.content)
                    if fetched_bytes > _MAX_BROWSER_BYTES:
                        await route.abort()
                        return
                    await route.fulfill(
                        status=200,
                        content_type=resource.content_type,
                        body=resource.content,
                    )
                except (ValueError, httpx.HTTPError):
                    await route.abort()

            await page.route("**/*", _guard)
            await page.goto(url, timeout=_PLAYWRIGHT_TIMEOUT_MS, wait_until="domcontentloaded")
            content = await page.content()
        finally:
            await browser.close()
    return content


def _parse_job_data(html: str, url: str) -> ImportedJobResponse:
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    title = _extract_title(soup)
    company = _extract_company(soup)
    description = _extract_description(soup)

    return ImportedJobResponse(
        job_title=title,
        company_name=company,
        job_description=description,
        source_url=url,
    )


async def scrape_job_posting(url: str) -> ImportedJobResponse:
    """Import one job posting, recording what actually happened as evidence.

    The recorded R10 import outcome (#136, D-059) separates two questions the
    source-concentration trigger must not conflate (#142): did the fetch and the
    parse *work*, and was the result *substantive*. A page that fetches and
    parses but yields a short description is a low-quality success — the user
    still gets the same fallback behaviour as before, but the evidence no longer
    counts that source as a failed import. Every failure the scraper can actually
    tell apart is recorded with its bounded category instead of a bare failure.
    """
    _validate_url(url)

    html: str | None = None

    # Tier 1: BS4 with httpx (5s timeout)
    try:
        html = await _fetch_with_httpx(url)
    except Exception as exc:
        set_import_outcome(_classify_fetch_failure(exc))
        logger.info(
            "BS4 scrape failed; trying Playwright fallback error_type=%s",
            type(exc).__name__,
        )
    else:
        try:
            result = _parse_job_data(html, url)
        except Exception as exc:
            set_import_outcome("failure_unparseable")
            logger.info(
                "BS4 parse failed; trying Playwright fallback error_type=%s",
                type(exc).__name__,
            )
            html = None
        else:
            description = result.job_description or ""
            if len(description) > _SUBSTANTIVE_DESCRIPTION_CHARS:
                set_import_outcome("success")
                return result
            # The fetch and the parse both worked; only the substance is
            # missing. Record the quality honestly — a thin page is a
            # low-quality success, an empty one is the source returning nothing
            # — and keep the user-facing behaviour identical: try the bounded
            # fallback tier, then the paste path.
            set_import_outcome(
                "success_low_quality" if description.strip() else "failure_empty"
            )
            html = None

    # Tier 2: Playwright fallback (10s timeout)
    if html is None:
        try:
            html = await _fetch_with_playwright(url)
            result = _parse_job_data(html, url)
            # R10 import outcome: the bounded Playwright fallback produced it.
            set_import_outcome("fallback")
            return result
        except Exception as exc:
            # The first tier already recorded what it observed about this
            # source; a failing fallback must not overwrite that evidence.
            logger.info(
                "Playwright scrape also failed error_type=%s",
                type(exc).__name__,
            )

    # Tier 3: Graceful paste fallback — no tier yielded a usable posting. The
    # outcome recorded by tier 1 already describes why, so it stands.
    return ImportedJobResponse(
        job_title=None,
        company_name=None,
        job_description="Could not extract the job description. Please copy and paste it.",
        source_url=url,
    )


def _extract_title(soup: BeautifulSoup) -> str | None:
    for selector in [
        'h1[class*="job-title"]',
        'h1[class*="jobTitle"]',
        '[data-testid="jobTitle"]',
        ".job-title",
        ".posting-headline h2",
        "h1",
    ]:
        el = soup.select_one(selector)
        if el and el.get_text(strip=True):
            return el.get_text(strip=True)
    return None


def _extract_company(soup: BeautifulSoup) -> str | None:
    for selector in [
        '[class*="company-name"]',
        '[class*="companyName"]',
        '[data-testid="companyName"]',
        ".company-name",
        '[class*="employer"]',
    ]:
        el = soup.select_one(selector)
        if el and el.get_text(strip=True):
            return el.get_text(strip=True)
    return None


def _extract_description(soup: BeautifulSoup) -> str:
    for selector in [
        '[class*="job-description"]',
        '[class*="jobDescription"]',
        '[id*="job-description"]',
        '[class*="description"]',
        ".posting-page",
        "article",
        "main",
    ]:
        el = soup.select_one(selector)
        if el and len(el.get_text(strip=True)) > 100:
            return el.get_text(separator="\n", strip=True)

    body = soup.find("body")
    if body:
        return body.get_text(separator="\n", strip=True)[:5000]

    return soup.get_text(separator="\n", strip=True)[:5000]
