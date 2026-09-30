"""Listing ingestion from public employer-ATS job-board APIs (#323).

Three adapters (Greenhouse, Lever, Ashby), each a public, unauthenticated GET
API intended for embedding on the employer's own careers site. A source is
fetched only while ``DiscoverySource.ingestion_allowed`` holds, re-read right
before the GET, and only through the SSRF-safe ``fetch_public_resource``.

- The provider is derived only from the source's own ``endpoint_url`` host, so
  ingestion can only reach one of the three fixed provider API hosts.
- A listing's attribution ``source_url`` is built on the provider's hosted-board
  host; the provider's "apply here" link (which can be a custom domain) is
  carried separately as ``apply_url``.
- Each source is stored and committed as one batch, in isolation: one dead board
  or malformed payload never stops the others. Every run stamps the source's
  ``last_fetched_at`` / ``last_outcome`` / ``listing_count``.

Two triggers: the recurring scheduler (``ATS_INGESTION_ENABLED``) and the
``python -m app.scripts.ingest_ats_sources`` CLI. Both call ``run_ats_ingestion``.
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.discovery_source import DiscoverySource
from app.schemas.discovered_listings import DiscoveredListingInput
from app.services.ats_providers import board_slug, provider_for_endpoint
from app.services.discovered_listings import store_source_listings
from app.services.discovery_fetch import DISCOVERY_USER_AGENT, fetch_public_resource
from app.services.discovery_sources import require_ingestion_allowed

logger = logging.getLogger("app.ats_ingestion")

ATS_TIMEOUT_SECONDS = 15.0
# Greenhouse `content=true` inlines full HTML job descriptions for every open
# role on the board, so a large board needs a wide response cap.
ATS_MAX_RESPONSE_BYTES = 10_000_000
ATS_INGESTION_INTERVAL_SECONDS = 6 * 60 * 60
ATS_INGESTION_INITIAL_DELAY_SECONDS = 60

_ATS_CONTENT_TYPES = frozenset({"application/json"})


class ATSIngestionRefused(RuntimeError):
    pass


class _SkipListing(Exception):
    """Raised internally when one job payload can't become a valid listing."""


@dataclass(frozen=True)
class ATSIngestOutcome:
    source_key: str
    provider: str
    fetched: int
    stored: int
    deduplicated: int
    skipped: int


@dataclass
class ATSIngestSummary:
    outcomes: list[ATSIngestOutcome] = field(default_factory=list)
    failures: dict[str, str] = field(default_factory=dict)


def ingest_ats_source(db: Session, source: DiscoverySource) -> ATSIngestOutcome:
    """Fetch one allowed employer-ATS source and store its listings in one commit."""
    provider = provider_for_endpoint(source.endpoint_url)
    if source.source_family != "employer_ats" or provider is None:
        raise ATSIngestionRefused("not_an_employer_ats_source")
    slug = board_slug(provider, source.endpoint_url or "")
    if slug is None:
        raise ATSIngestionRefused("invalid_endpoint_path")

    # Re-read immediately before the network request: a kill switch tripped
    # since the run started halts this source's fetch.
    require_ingestion_allowed(db, source)
    content, _content_type = fetch_public_resource(
        source.endpoint_url,
        provider.query,
        _ATS_CONTENT_TYPES,
        timeout_seconds=ATS_TIMEOUT_SECONDS,
        max_bytes=ATS_MAX_RESPONSE_BYTES,
        user_agent=DISCOVERY_USER_AGENT,
    )
    retrieved_at = datetime.now(UTC)
    try:
        raw_jobs = _parse_provider_jobs(provider.name, content)
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        logger.warning(
            "ats ingestion malformed payload provider=%s error_type=%s",
            provider.name,
            type(exc).__name__,
        )
        raw_jobs = []

    bodies: list[DiscoveredListingInput] = []
    skipped = 0
    for raw_job in raw_jobs:
        try:
            bodies.append(
                _map_provider_job(provider.name, raw_job, company=source.display_name, slug=slug)
            )
        except _SkipListing:
            skipped += 1
    counts = store_source_listings(db, source, bodies, retrieved_at=retrieved_at)
    outcome = ATSIngestOutcome(
        source_key=source.source_key,
        provider=provider.name,
        fetched=len(raw_jobs),
        stored=counts.stored,
        deduplicated=counts.deduplicated,
        skipped=skipped + counts.skipped,
    )
    _stamp(source, "ok", counts.stored + counts.deduplicated)
    db.commit()
    return outcome


def run_ats_ingestion(db: Session) -> ATSIngestSummary:
    """Ingest every allowed employer-ATS source, each in isolation."""
    sources = [
        source
        for source in db.query(DiscoverySource)
        .filter(DiscoverySource.source_family == "employer_ats")
        .order_by(DiscoverySource.source_key)
        .all()
        if source.ingestion_allowed
    ]
    summary = ATSIngestSummary()
    for source in sources:
        source_key = source.source_key
        try:
            summary.outcomes.append(ingest_ats_source(db, source))
        except Exception as exc:  # noqa: BLE001 — one source's failure must not stop the rest
            db.rollback()
            summary.failures[source_key] = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "ats ingestion source failed source_key=%s error_type=%s",
                source_key,
                type(exc).__name__,
            )
            # A failed run keeps the source's last listing count.
            _stamp(source, f"failed: {type(exc).__name__}", None)
            db.commit()
    return summary


def run_ats_ingestion_once() -> ATSIngestSummary | None:
    """One full pass on its own session; never raises (scheduler and CLI entry)."""
    db = SessionLocal()
    try:
        summary = run_ats_ingestion(db)
        logger.info(
            "ats ingestion run sources=%d failures=%d",
            len(summary.outcomes),
            len(summary.failures),
        )
        return summary
    except Exception as exc:  # noqa: BLE001 — a scheduled run must not crash the loop
        db.rollback()
        logger.warning("ats ingestion run failed error_type=%s", type(exc).__name__)
        return None
    finally:
        db.close()


async def run_ats_ingestion_scheduler(
    interval_seconds: int = ATS_INGESTION_INTERVAL_SECONDS,
    initial_delay_seconds: int = ATS_INGESTION_INITIAL_DELAY_SECONDS,
) -> None:
    """Run ingestion shortly after startup, then every ``interval_seconds``.

    A no-op unless ``ATS_INGESTION_ENABLED``. Each pass runs in a worker thread so
    its fetches and writes never block the event loop.
    """
    if not settings.ATS_INGESTION_ENABLED:
        return
    await asyncio.sleep(initial_delay_seconds)
    while True:
        await asyncio.to_thread(run_ats_ingestion_once)
        await asyncio.sleep(interval_seconds)


def _stamp(source: DiscoverySource, outcome: str, listing_count: int | None) -> None:
    source.last_fetched_at = datetime.now(UTC)
    source.last_outcome = outcome[:200]
    if listing_count is not None:
        source.listing_count = listing_count


def _parse_provider_jobs(provider: str, content: bytes) -> list[dict]:
    payload = json.loads(content.decode("utf-8"))
    if provider == "greenhouse":
        jobs = payload.get("jobs", []) if isinstance(payload, dict) else []
    elif provider == "lever":
        jobs = payload if isinstance(payload, list) else []
    elif provider == "ashby":
        jobs = payload.get("jobs", []) if isinstance(payload, dict) else []
    else:
        jobs = []
    return [job for job in jobs if isinstance(job, dict)]


def _map_provider_job(
    provider: str, raw: dict, *, company: str, slug: str
) -> DiscoveredListingInput:
    try:
        if provider == "greenhouse":
            return _map_greenhouse_job(raw, company=company, slug=slug)
        if provider == "lever":
            return _map_lever_job(raw, company=company, slug=slug)
        if provider == "ashby":
            return _map_ashby_job(raw, company=company, slug=slug)
    except _SkipListing:
        raise
    except Exception as exc:  # noqa: BLE001 — any mapping surprise just skips this listing
        raise _SkipListing from exc
    raise _SkipListing


def _map_greenhouse_job(raw: dict, *, company: str, slug: str) -> DiscoveredListingInput:
    job_id = raw.get("id")
    title = str(raw.get("title") or "").strip()
    if not job_id or not title:
        raise _SkipListing
    location = None
    raw_location = raw.get("location")
    if isinstance(raw_location, dict):
        location = str(raw_location.get("name") or "").strip() or None
    description = _html_to_text(raw.get("content"))
    if len(description) < 40:
        raise _SkipListing
    department = None
    departments = raw.get("departments")
    if isinstance(departments, list) and departments and isinstance(departments[0], dict):
        department = str(departments[0].get("name") or "").strip() or None
    posted_at = _parse_iso(raw.get("first_published") or raw.get("updated_at"))
    return DiscoveredListingInput(
        source_listing_key=str(job_id),
        title=title[:200],
        company=company[:200],
        description=description[:100_000],
        source_url=f"https://boards.greenhouse.io/{slug}/jobs/{job_id}",
        location=location[:200] if location else None,
        remote=_infer_remote(location),
        posted_at=posted_at,
        apply_url=_safe_https_url(raw.get("absolute_url")),
        department=department[:200] if department else None,
    )


def _map_lever_job(raw: dict, *, company: str, slug: str) -> DiscoveredListingInput:
    job_id = raw.get("id")
    title = str(raw.get("text") or "").strip()
    if not job_id or not title:
        raise _SkipListing
    categories = raw.get("categories") if isinstance(raw.get("categories"), dict) else {}
    location = str(categories.get("location") or "").strip() or None
    department = str(categories.get("team") or categories.get("department") or "").strip() or None
    workplace_type = str(categories.get("workplaceType") or "").strip().lower()
    description_parts = [
        str(raw.get("descriptionPlain") or _html_to_text(raw.get("description")) or ""),
        str(raw.get("additionalPlain") or _html_to_text(raw.get("additional")) or ""),
    ]
    for section in raw.get("lists") or []:
        if not isinstance(section, dict):
            continue
        section_text = str(section.get("text") or "").strip()
        section_body = _html_to_text(section.get("content"))
        combined = f"{section_text}\n{section_body}".strip()
        if combined:
            description_parts.append(combined)
    description = "\n\n".join(part for part in description_parts if part.strip()).strip()
    if len(description) < 40:
        raise _SkipListing
    posted_at = _parse_epoch_ms(raw.get("createdAt"))
    apply_url = raw.get("applyUrl") or raw.get("hostedUrl")
    return DiscoveredListingInput(
        source_listing_key=str(job_id),
        title=title[:200],
        company=company[:200],
        description=description[:100_000],
        source_url=f"https://jobs.lever.co/{slug}/{job_id}",
        location=location[:200] if location else None,
        remote=True if workplace_type == "remote" else _infer_remote(location),
        posted_at=posted_at,
        apply_url=_safe_https_url(apply_url),
        department=department[:200] if department else None,
    )


def _map_ashby_job(raw: dict, *, company: str, slug: str) -> DiscoveredListingInput:
    if raw.get("isListed") is False:
        raise _SkipListing
    job_id = raw.get("id")
    title = str(raw.get("title") or "").strip()
    if not job_id or not title:
        raise _SkipListing
    location = str(raw.get("location") or "").strip() or None
    department = str(raw.get("department") or raw.get("team") or "").strip() or None
    description = str(
        raw.get("descriptionPlain") or _html_to_text(raw.get("descriptionHtml")) or ""
    ).strip()
    if len(description) < 40:
        raise _SkipListing
    posted_at = _parse_iso(raw.get("publishedAt"))
    job_url = raw.get("jobUrl")
    source_url = (
        job_url
        if isinstance(job_url, str) and urlparse(job_url).hostname == "jobs.ashbyhq.com"
        else f"https://jobs.ashbyhq.com/{slug}/{job_id}"
    )
    is_remote = raw.get("isRemote")
    remote = bool(is_remote) if isinstance(is_remote, bool) else _infer_remote(location)
    return DiscoveredListingInput(
        source_listing_key=str(job_id),
        title=title[:200],
        company=company[:200],
        description=description[:100_000],
        source_url=source_url,
        location=location[:200] if location else None,
        remote=remote,
        posted_at=posted_at,
        apply_url=_safe_https_url(raw.get("applyUrl") or job_url),
        department=department[:200] if department else None,
    )


def _html_to_text(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return ""
    unescaped = html.unescape(value)
    return BeautifulSoup(unescaped, "html.parser").get_text(separator="\n", strip=True)


def _infer_remote(location: str | None) -> bool | None:
    # Only ever asserts True (the text plainly says "remote"); a location that
    # doesn't mention it is unknown, not confidently on-site, so this never
    # returns False.
    if location and "remote" in location.lower():
        return True
    return None


def _parse_iso(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _parse_epoch_ms(value: object) -> datetime | None:
    if not isinstance(value, int | float) or isinstance(value, bool):
        return None
    try:
        return datetime.fromtimestamp(value / 1000, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


def _safe_https_url(value: object) -> str | None:
    if not isinstance(value, str) or not value.startswith("https://") or len(value) > 2_048:
        return None
    return value
