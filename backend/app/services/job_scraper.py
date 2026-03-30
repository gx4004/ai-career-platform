import logging
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.schemas.tools import ImportedJobResponse

logger = logging.getLogger(__name__)

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
_BLOCKED_PREFIXES = ("10.", "192.168.", "169.254.",
                     "172.16.", "172.17.", "172.18.", "172.19.",
                     "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
                     "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.")

_BS4_TIMEOUT = 5.0
_PLAYWRIGHT_TIMEOUT_MS = 10_000


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only HTTP(S) URLs are supported")
    hostname = parsed.hostname or ""
    if hostname in _BLOCKED_HOSTS or hostname.startswith(_BLOCKED_PREFIXES):
        raise ValueError("Internal or private URLs are not allowed")


async def _fetch_with_httpx(url: str) -> str:
    async with httpx.AsyncClient(
        follow_redirects=True, timeout=_BS4_TIMEOUT
    ) as client:
        response = await client.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; CareerPlatformBot/1.0)"
            },
        )
        response.raise_for_status()
    return response.text


async def _fetch_with_playwright(url: str) -> str:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
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
    _validate_url(url)

    html: str | None = None

    # Tier 1: BS4 with httpx (5s timeout)
    try:
        html = await _fetch_with_httpx(url)
        result = _parse_job_data(html, url)
        if result.job_description and len(result.job_description) > 100:
            return result
        html = None
    except Exception:
        logger.info("BS4 scrape failed for %s, trying Playwright fallback", url)

    # Tier 2: Playwright fallback (10s timeout)
    if html is None:
        try:
            html = await _fetch_with_playwright(url)
            return _parse_job_data(html, url)
        except Exception:
            logger.info("Playwright scrape also failed for %s", url)

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
