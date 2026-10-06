import asyncio
import logging
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import TypeVar

import httpx
from bs4 import BeautifulSoup

from app.schemas.tools import ImportedJobResponse
from app.services.outbound_target import ResolvedPublicTarget, resolve_public_target

logger = logging.getLogger(__name__)

_T = TypeVar("_T")

# D-086/D-026: every fetch tier identifies itself honestly. This product does not
# impersonate a browser to get past a source's technical controls, so the
# user-provided-URL tier identifies itself in the same honest form the discovery
# ingestion tier uses (`CareerWorkbenchDiscovery/1.0`). Both the first-tier fetch
# and every request the bounded browser fallback makes go out through the one
# helper below, so this is the only identity either tier presents.
IMPORT_USER_AGENT = "CareerWorkbenchImport/1.0"

# A description shorter than this is not a substantive posting, so the bounded
# fallback tier gets a chance before the paste path.
_SUBSTANTIVE_DESCRIPTION_CHARS = 100

# A page long enough to pass the length check can still be no posting at all (a
# domain parking page, a blog post, a login wall). A posting either sits in a
# job-description container or names at least two of these job-ad markers; such a
# page does neither.
_JOB_SIGNALS = tuple(
    re.compile(pattern)
    for pattern in (
        r"\bresponsibilit",
        r"\brequirements?\b",
        r"\bqualifications?\b",
        r"\bexperience\b",
        r"\bskills?\b",
        r"\b(?:the|this) (?:role|position)\b",
        r"\bcandidates?\b",
        r"\b(?:apply|applicants?|application)\b",
        r"\b(?:salary|compensation|benefits)\b",
        r"\b(?:full|part)[- ]time\b",
        r"\b(?:remote|hybrid|on-?site)\b",
        r"\b(?:hiring|join (?:our|the) team)\b",
        r"\byou(?: will|'ll)\b",
        r"\b(?:we are|we're) looking\b|\blooking for\b",
        r"\byears? of\b",
    )
)
_MIN_JOB_SIGNALS = 2


def _is_job_posting(description: str | None, *, in_job_container: bool) -> bool:
    text = (description or "").lower()
    if len(text) <= _SUBSTANTIVE_DESCRIPTION_CHARS:
        return False
    if in_job_container:
        return True
    return sum(1 for signal in _JOB_SIGNALS if signal.search(text)) >= _MIN_JOB_SIGNALS


def _paste_fallback(url: str) -> ImportedJobResponse:
    """No tier produced a posting: say so explicitly, with nothing to paste over the user's text."""
    return ImportedJobResponse(
        job_title=None,
        company_name=None,
        job_description="",
        source_url=url,
        readable=False,
    )


_BS4_TIMEOUT = 5.0
_PLAYWRIGHT_TIMEOUT_MS = 10_000
_MAX_REDIRECTS = 5
_MAX_RESPONSE_BYTES = 2_000_000
# Anonymous callers get a smaller page budget: the import endpoint is open to
# guests, and parsing is the expensive part of an attacker-sized page.
GUEST_MAX_RESPONSE_BYTES = 1_000_000
# A hostname lookup (blocking getaddrinfo) that has not answered by then is
# treated as unresolvable, so one slow nameserver cannot hold a request open.
RESOLVE_DEADLINE_SECONDS = 5.0
# Lookups run in their own small pool so a hung resolver can never occupy the
# default executor that the rest of the app shares.
_RESOLVER_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="resolve")
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
    """A response arrived, but it cannot be turned into a job posting."""


class _ResponseTooLargeError(_UnparseableResponseError):
    """The page exceeds the caller's size budget; a browser render will not fix that."""


def _validate_url(url: str) -> None:
    resolve_public_target(url)


async def _in_resolver_pool(function: Callable[..., _T], *args) -> _T:
    """Run a blocking DNS-touching call off the event loop, bounded in time."""
    loop = asyncio.get_running_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(_RESOLVER_POOL, function, *args),
            timeout=RESOLVE_DEADLINE_SECONDS,
        )
    except TimeoutError as exc:
        raise ValueError("URL hostname could not be resolved") from exc


async def _resolve_target(url: str) -> ResolvedPublicTarget:
    return await _in_resolver_pool(resolve_public_target, url)


async def _fetch_with_httpx(url: str, max_bytes: int = _MAX_RESPONSE_BYTES) -> str:
    resource = await _fetch_resource_with_httpx(url, _HTML_CONTENT_TYPES, max_bytes)
    return resource.content.decode("utf-8", errors="replace")


async def _fetch_resource_with_httpx(
    url: str,
    allowed_content_types: frozenset[str],
    max_bytes: int = _MAX_RESPONSE_BYTES,
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
            target = await _resolve_target(current)
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
                await _resolve_target(next_url)
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
                    if declared_bytes > max_bytes:
                        await response.aclose()
                        raise _ResponseTooLargeError("Response is too large")

                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise _ResponseTooLargeError("Response is too large")
                return _FetchedResource(bytes(body), content_type)
            finally:
                await response.aclose()
    raise httpx.HTTPError("Too many redirects")


async def _fetch_with_playwright(
    url: str, *, max_response_bytes: int = _MAX_RESPONSE_BYTES
) -> str:
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
                    resource = await _fetch_resource_with_httpx(
                        request.url, _BROWSER_CONTENT_TYPES, max_response_bytes
                    )
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


def _parse_job_data(html: str, url: str) -> tuple[ImportedJobResponse, bool]:
    """The posting, and whether its text came from a job-description container."""
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style"]):
        tag.decompose()

    # The posting's own title and company often sit inside a <header>, so read them
    # before the page chrome (header, nav, footer) is removed from the description.
    title = _extract_title(soup)
    company = _extract_company(soup)
    for tag in soup(["nav", "footer", "header"]):
        tag.decompose()
    description, in_job_container = _extract_description(soup)

    return (
        ImportedJobResponse(
            job_title=title,
            company_name=company,
            job_description=description,
            source_url=url,
        ),
        in_job_container,
    )


async def scrape_job_posting(
    url: str, *, max_response_bytes: int = _MAX_RESPONSE_BYTES
) -> ImportedJobResponse:
    """Import one job posting: httpx + BS4, then Playwright, then the paste fallback.

    Everything blocking (DNS, HTML parsing) runs off the event loop.
    """
    await _in_resolver_pool(_validate_url, url)

    html: str | None = None
    too_large = False

    # Tier 1: BS4 with httpx (5s timeout)
    try:
        html = await _fetch_with_httpx(url, max_bytes=max_response_bytes)
    except Exception as exc:
        too_large = isinstance(exc, _ResponseTooLargeError)
        logger.info(
            "BS4 scrape failed; trying Playwright fallback error_type=%s",
            type(exc).__name__,
        )
    else:
        try:
            result, in_job_container = await asyncio.to_thread(_parse_job_data, html, url)
        except Exception as exc:
            logger.info(
                "BS4 parse failed; trying Playwright fallback error_type=%s",
                type(exc).__name__,
            )
            html = None
        else:
            if _is_job_posting(result.job_description, in_job_container=in_job_container):
                return result
            # A thin or non-job page: try the bounded fallback tier, then the paste path.
            html = None

    # Tier 2: Playwright fallback (10s timeout). It fetches under the same page cap
    # as tier 1 (so a guest cannot sidestep the smaller budget), and is skipped for
    # a page already known to be over that cap.
    if html is None and not too_large:
        try:
            html = await _fetch_with_playwright(
                url, max_response_bytes=max_response_bytes
            )
            rendered, in_job_container = await asyncio.to_thread(_parse_job_data, html, url)
            if _is_job_posting(rendered.job_description, in_job_container=in_job_container):
                return rendered
            # Still thin or not a job ad after rendering (a login wall, an error
            # page, a non-job site): not a posting.
        except Exception as exc:
            logger.info(
                "Playwright scrape also failed error_type=%s",
                type(exc).__name__,
            )

    # Tier 3: Graceful paste fallback — no tier yielded a usable posting.
    return _paste_fallback(url)


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


_JOB_CONTAINER_SELECTORS = (
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[id*="job-description"]',
)


def _extract_description(soup: BeautifulSoup) -> tuple[str, bool]:
    """The description text, and whether it came from a job-description container."""
    for selector in [
        *_JOB_CONTAINER_SELECTORS,
        '[class*="description"]',
        ".posting-page",
        "article",
        "main",
    ]:
        el = soup.select_one(selector)
        if el and len(el.get_text(strip=True)) > 100:
            return el.get_text(separator="\n", strip=True), selector in _JOB_CONTAINER_SELECTORS

    body = soup.find("body")
    if body:
        return body.get_text(separator="\n", strip=True)[:5000], False

    return soup.get_text(separator="\n", strip=True)[:5000], False
