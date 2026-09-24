"""Real listing ingestion from public employer-ATS job-board APIs (#323).

Three adapters — Greenhouse, Lever, Ashby — each a public, unauthenticated GET
API intended for embedding on the employer's own careers site. Every fetch
still goes through the same governance seam as the licensed path
(`require_ingestion_allowed`, kill switch, terms review, rate limit, SSRF-safe
`_fetch_resource`), so an `employer_ats` source is refused exactly like a
licensed one unless an operator has reviewed and activated it.

Design notes:
- The provider is derived only from the governed source's own `endpoint_url`
  host (never from anything a caller supplies), so ingestion can only ever
  reach one of the three fixed provider API hosts below.
- A listing's *attribution* `source_url` is always built on the provider's own
  hosted-board host (`boards.greenhouse.io` / `jobs.lever.co` /
  `jobs.ashbyhq.com`) — never the employer's custom careers domain — so
  `discovered_listings._canonical_source_url`'s host check still holds. The
  provider's own "apply here" link (which *can* be a custom domain) is carried
  separately as `apply_url`, which is not host-validated.
- Each source is ingested in isolation (`run_ats_ingestion`): one dead board or
  one malformed payload never stops the others.
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
from app.feature_gates import outcome_enabled
from app.models.discovery_source import DiscoverySource
from app.schemas.discovered_listings import DiscoveredListingInput
from app.services.analytics import safe_record_activation_event
from app.services.discovered_listings import store_discovered_listing
from app.services.discovery_sources import SourceIngestionRefused, require_ingestion_allowed
from app.services.licensed_source_ingestion import (
    DISCOVERY_USER_AGENT,
    _claim_rate,
    _fetch_resource,
    _validate_query,
)

logger = logging.getLogger("app.ats_ingestion")

ATS_TIMEOUT_SECONDS = 15.0
# Greenhouse `content=true` inlines full HTML job descriptions for every open
# role on the board; a large board can comfortably exceed the licensed path's
# 2MB default, so ATS ingestion gets its own, deliberately wider cap.
ATS_MAX_RESPONSE_BYTES = 10_000_000
ATS_INGESTION_INTERVAL_SECONDS = 6 * 60 * 60
ATS_INGESTION_INITIAL_DELAY_SECONDS = 60

_ATS_CONTENT_TYPES = frozenset({"application/json"})

_PROVIDER_BY_API_HOST = {
    "boards-api.greenhouse.io": "greenhouse",
    "api.lever.co": "lever",
    "api.ashbyhq.com": "ashby",
}
# One fixed, deliberate query per provider — never derived from user input.
# These parameter names must also be present in the governing source's
# `allowed_query_parameters` (checked via `_validate_query` below) so a source
# row can never silently drift from what it was reviewed for.
_QUERY_BY_PROVIDER = {
    "greenhouse": {"content": "true"},
    "lever": {"mode": "json"},
    "ashby": {"includeCompensation": "false"},
}


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
    errored: int


@dataclass
class ATSIngestSummary:
    outcomes: list[ATSIngestOutcome] = field(default_factory=list)
    failures: dict[str, str] = field(default_factory=dict)


async def ingest_ats_source(db: Session, *, source_key: str) -> ATSIngestOutcome:
    """Fetch and store one governed employer-ATS source's current listings."""
    source_row = db.query(DiscoverySource).filter_by(source_key=source_key).first()
    source_family = source_row.source_family if source_row is not None else None
    try:
        authorization = require_ingestion_allowed(db, source_key, "ats_integration")
        if authorization.source_family != "employer_ats":
            raise ATSIngestionRefused("not_an_employer_ats_source")
        provider = _PROVIDER_BY_API_HOST.get(urlparse(authorization.endpoint_url).hostname or "")
        if provider is None:
            raise ATSIngestionRefused("unrecognized_ats_provider")
        slug = _extract_slug(provider, authorization.endpoint_url)
        query = _QUERY_BY_PROVIDER[provider]
        _validate_query(authorization, query)

        policy_fingerprint = authorization.policy_fingerprint
        _claim_rate(db, authorization.source_id, 1)

        # Re-check immediately before the network request, matching the
        # licensed-source pattern: a kill switch flipped between the rate
        # claim and the fetch halts this source only.
        authorization = require_ingestion_allowed(db, source_key, "ats_integration")
        if authorization.policy_fingerprint != policy_fingerprint:
            raise ATSIngestionRefused("source_policy_changed_during_fetch")

        content, _content_type = await _fetch_resource(
            authorization.endpoint_url,
            query,
            _ATS_CONTENT_TYPES,
            timeout_seconds=ATS_TIMEOUT_SECONDS,
            max_bytes=ATS_MAX_RESPONSE_BYTES,
            user_agent=DISCOVERY_USER_AGENT,
        )
    except (ATSIngestionRefused, SourceIngestionRefused):
        if source_family is not None:
            _record_ats_fetch_outcome(db, source_family, "blocked")
        raise
    except Exception:
        if source_family is not None:
            _record_ats_fetch_outcome(db, source_family, "failure")
        raise

    _record_ats_fetch_outcome(db, authorization.source_family, "success")

    company = source_row.display_name
    retrieved_at = datetime.now(UTC)
    try:
        raw_jobs = _parse_provider_jobs(provider, content)
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        logger.warning(
            "ats ingestion malformed payload provider=%s error_type=%s",
            provider,
            type(exc).__name__,
        )
        raw_jobs = []

    stored = deduplicated = skipped = errored = 0
    for raw_job in raw_jobs:
        try:
            listing_input = _map_provider_job(provider, raw_job, company=company, slug=slug)
        except _SkipListing:
            skipped += 1
            continue
        try:
            result = store_discovered_listing(
                db,
                source_key=source_key,
                body=listing_input,
                retrieved_at=retrieved_at,
            )
        except Exception as exc:  # noqa: BLE001 — one bad listing must not stop the batch
            errored += 1
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
            logger.warning(
                "ats ingestion listing store failed provider=%s error_type=%s",
                provider,
                type(exc).__name__,
            )
            continue
        if result.deduplicated:
            deduplicated += 1
        else:
            stored += 1

    return ATSIngestOutcome(
        source_key=source_key,
        provider=provider,
        fetched=len(raw_jobs),
        stored=stored,
        deduplicated=deduplicated,
        skipped=skipped,
        errored=errored,
    )


async def run_ats_ingestion(db: Session) -> ATSIngestSummary:
    """Ingest every kill-switch-clear, terms-accepted employer-ATS source.

    Each source is isolated: one provider outage or one malformed board never
    stops the rest.
    """
    source_keys = [
        row.source_key
        for row in db.query(DiscoverySource)
        .filter(DiscoverySource.source_family == "employer_ats")
        .order_by(DiscoverySource.source_key)
        .all()
        if row.ingestion_allowed
    ]
    summary = ATSIngestSummary()
    for source_key in source_keys:
        try:
            summary.outcomes.append(await ingest_ats_source(db, source_key=source_key))
        except Exception as exc:  # noqa: BLE001 — one source's failure must not stop the rest
            summary.failures[source_key] = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "ats ingestion source failed source_key=%s error_type=%s",
                source_key,
                type(exc).__name__,
            )
    return summary


# ── Recurring scheduler (follows `app.services.retention`'s pattern) ──


async def run_ats_ingestion_scheduler(
    interval_seconds: int = ATS_INGESTION_INTERVAL_SECONDS,
    initial_delay_seconds: int = ATS_INGESTION_INITIAL_DELAY_SECONDS,
) -> None:
    """Run ATS ingestion shortly after startup, then every `interval_seconds`.

    Gated by both the R14 discovery outcome flag and `ATS_INGESTION_ENABLED`
    (default False) — a dead loop when either is off, so enabling discovery
    routes alone never starts a background network-fetching task.
    """
    if not (outcome_enabled("r14") and settings.ATS_INGESTION_ENABLED):
        return
    await asyncio.sleep(initial_delay_seconds)
    while True:
        await _run_ats_ingestion_once()
        await asyncio.sleep(interval_seconds)


async def _run_ats_ingestion_once() -> ATSIngestSummary | None:
    """Run one full ingestion pass off the event loop.

    `run_ats_ingestion` mixes real network I/O (async, wants the loop) with
    hundreds of synchronous DB writes (`store_discovered_listing`'s
    queries/commits) that would otherwise block every other request on this
    process for however long the run takes — minutes against a fully seeded
    source list. `asyncio.to_thread` moves the whole pass to a worker thread,
    where `asyncio.run` gives it its own event loop for the fetches.
    """
    return await asyncio.to_thread(_run_ats_ingestion_once_sync)


def _run_ats_ingestion_once_sync() -> ATSIngestSummary | None:
    db = SessionLocal()
    try:
        summary = asyncio.run(run_ats_ingestion(db))
        logger.info(
            "ats ingestion run sources=%d failures=%d",
            len(summary.outcomes),
            len(summary.failures),
        )
        return summary
    except Exception as exc:  # noqa: BLE001 — a scheduled run must not crash the loop
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        logger.warning("ats ingestion run failed error_type=%s", type(exc).__name__)
        return None
    finally:
        db.close()


async def run_ats_ingestion_off_loop(db: Session) -> ATSIngestSummary:
    """Run ingestion for an already-open session without blocking the event loop.

    For a caller (the admin on-demand refresh) that already holds a
    request-scoped `db`: the run happens in a worker thread with its own event
    loop for the fetches, and `db` is used there and back on the main thread
    only sequentially (this coroutine awaits the thread before touching it
    again), so it is never accessed from two threads at once.
    """
    return await asyncio.to_thread(lambda: asyncio.run(run_ats_ingestion(db)))


def _record_ats_fetch_outcome(db: Session, source_family: str, outcome: str) -> None:
    safe_record_activation_event(
        db,
        event_name="discovery_source_fetch_outcome",
        operational_dimension=source_family,
        operational_outcome=outcome,
    )


def _extract_slug(provider: str, endpoint_url: str) -> str:
    path_segment = {
        "greenhouse": "boards",
        "lever": "postings",
        "ashby": "job-board",
    }[provider]
    parts = [part for part in urlparse(endpoint_url).path.split("/") if part]
    try:
        index = parts.index(path_segment)
        return parts[index + 1]
    except (ValueError, IndexError) as exc:
        raise ATSIngestionRefused("invalid_endpoint_path") from exc


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
