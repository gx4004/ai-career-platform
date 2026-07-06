import ipaddress
import logging
import socket
from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

from app.schemas.tools import ImportedJobResponse

logger = logging.getLogger(__name__)

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
class _ResolvedTarget:
    connect_url: str
    hostname: str
    host_header: str


@dataclass(frozen=True)
class _FetchedResource:
    content: bytes
    content_type: str


def _is_private_ip(ip_str: str) -> bool:
    """Return whether an address is unsafe for an outbound public-web request."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return not addr.is_global
    except ValueError:
        return True  # If we can't parse it, block it


def _resolve_public_target(url: str) -> _ResolvedTarget:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only HTTP(S) URLs are supported")
    hostname = parsed.hostname or ""
    if not hostname:
        raise ValueError("URL must have a hostname")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Credentials in URLs are not allowed")
    if "\\" in parsed.netloc or "%" in parsed.netloc:
        raise ValueError("Encoded or ambiguous URL authorities are not allowed")
    if hostname.endswith(".") or "%" in hostname:
        raise ValueError("Non-canonical hostnames are not allowed")
    if all(character.isdigit() or character == "." for character in hostname):
        try:
            ipaddress.ip_address(hostname)
        except ValueError as exc:
            raise ValueError("Alternate numeric IP formats are not allowed") from exc

    default_port = 443 if parsed.scheme == "https" else 80
    try:
        port = parsed.port or default_port
    except ValueError as exc:
        raise ValueError("URL port is invalid") from exc
    if port != default_port:
        raise ValueError("Only standard HTTP(S) ports are allowed")

    try:
        addrinfo = socket.getaddrinfo(
            hostname, port, socket.AF_UNSPEC, socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise ValueError("URL hostname could not be resolved") from exc

    public_ips: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for _family, _, _, _, sockaddr in addrinfo:
        try:
            address = ipaddress.ip_address(sockaddr[0])
        except ValueError as exc:
            raise ValueError("URL resolved to an invalid address") from exc
        if _is_private_ip(str(address)):
            raise ValueError("URLs resolving to private/internal IPs are not allowed")
        if address not in public_ips:
            public_ips.append(address)

    if not public_ips:
        raise ValueError("URL hostname did not resolve to a public address")

    selected_ip = public_ips[0]
    connect_host = f"[{selected_ip}]" if selected_ip.version == 6 else str(selected_ip)
    connect_url = urlunparse(
        (
            parsed.scheme,
            connect_host,
            parsed.path or "/",
            parsed.params,
            parsed.query,
            "",
        )
    )
    host_header = hostname if port == default_port else f"{hostname}:{port}"
    return _ResolvedTarget(connect_url, hostname, host_header)


def _validate_url(url: str) -> None:
    _resolve_public_target(url)


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
            target = _resolve_public_target(current)
            request = client.build_request(
                "GET",
                target.connect_url,
                headers={
                    "Host": target.host_header,
                    "User-Agent": "Mozilla/5.0 (compatible; CareerPlatformBot/1.0)",
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
                _resolve_public_target(next_url)
                current = next_url
                continue
            try:
                response.raise_for_status()
                content_type = (
                    response.headers.get("content-type", "")
                    .partition(";")[0]
                    .strip()
                    .lower()
                )
                if content_type not in allowed_content_types:
                    raise httpx.HTTPError("Unsupported response content type")
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > _MAX_RESPONSE_BYTES:
                    await response.aclose()
                    raise httpx.HTTPError("Response is too large")

                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > _MAX_RESPONSE_BYTES:
                        raise httpx.HTTPError("Response is too large")
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
                    resource = await _fetch_resource_with_httpx(
                        request.url, _BROWSER_CONTENT_TYPES
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
            await page.goto(
                url, timeout=_PLAYWRIGHT_TIMEOUT_MS, wait_until="domcontentloaded"
            )
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
    _validate_url(url)

    html: str | None = None

    # Tier 1: BS4 with httpx (5s timeout)
    try:
        html = await _fetch_with_httpx(url)
        result = _parse_job_data(html, url)
        if result.job_description and len(result.job_description) > 100:
            return result
        html = None
    except Exception as exc:
        logger.info(
            "BS4 scrape failed; trying Playwright fallback error_type=%s",
            type(exc).__name__,
        )

    # Tier 2: Playwright fallback (10s timeout)
    if html is None:
        try:
            html = await _fetch_with_playwright(url)
            return _parse_job_data(html, url)
        except Exception as exc:
            logger.info(
                "Playwright scrape also failed error_type=%s",
                type(exc).__name__,
            )

    # Tier 3: Graceful failure
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
