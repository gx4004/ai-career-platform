"""Seed `discovery_sources` rows for the curated employer-ATS candidate list (#323).

Usage:
    python -m app.scripts.seed_ats_sources

Reads `app/scripts/ats_sources.json`. For each candidate not already
registered (matched by the derived `source_key`), does a real, live GET
against the provider's public job-board API before inserting anything: a slug
that doesn't resolve to HTTP 200 with at least one job is skipped, never
registered. Already-registered source keys are left untouched (idempotent —
safe to re-run; re-running only adds candidates that are new since the last
run or that were previously dead and have since gone live).

Every inserted row is registered *active*: `terms_status="accepted"` (public
job-board APIs intended for embedding on the employer's own careers site,
reviewed by this seed script as the deliberate act of an operator running it)
and `kill_switch=False`, so ingestion can run immediately after seeding. This
intentionally bypasses the normal dark-by-default `register_source` path
(which always starts `pending`+killed) via the same `update_source` API an
admin reviewer would use, with a dedicated system reviewer account as the
actor of record.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
from pathlib import Path

from app.auth.security import hash_password
from app.database import SessionLocal
from app.models.discovery_source import DiscoverySource
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.services.ats_ingestion import _QUERY_BY_PROVIDER, _parse_provider_jobs
from app.services.discovery_sources import register_source, update_source
from app.services.licensed_source_ingestion import DISCOVERY_USER_AGENT, _fetch_resource

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed_ats_sources")

DATA_FILE = Path(__file__).parent / "ats_sources.json"
SEED_REVIEWER_EMAIL = "ats-seed-reviewer@system.internal"

_ENDPOINT_BY_PROVIDER = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
    "lever": "https://api.lever.co/v0/postings/{slug}",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{slug}",
}
_TIMEOUT_SECONDS = 15.0
_MAX_RESPONSE_BYTES = 10_000_000


def _source_key(provider: str, slug: str) -> str:
    return f"employer-ats-{provider}-{slug}"


def _system_reviewer(db) -> User:
    reviewer = db.query(User).filter_by(email=SEED_REVIEWER_EMAIL).first()
    if reviewer is not None:
        return reviewer
    reviewer = User(
        email=SEED_REVIEWER_EMAIL,
        # Not a login path this account is ever meant to use — a random,
        # never-communicated, cryptographically strong password, exactly like
        # any other system actor's credential.
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        is_admin=True,
    )
    db.add(reviewer)
    db.commit()
    db.refresh(reviewer)
    return reviewer


async def _is_live(provider: str, endpoint_url: str) -> bool:
    query = _QUERY_BY_PROVIDER[provider]
    try:
        content, _content_type = await _fetch_resource(
            endpoint_url,
            query,
            frozenset({"application/json"}),
            timeout_seconds=_TIMEOUT_SECONDS,
            max_bytes=_MAX_RESPONSE_BYTES,
            user_agent=DISCOVERY_USER_AGENT,
        )
    except Exception as exc:  # noqa: BLE001 — any fetch failure means "not live"
        logger.info("  dead: %s", type(exc).__name__)
        return False
    try:
        jobs = _parse_provider_jobs(provider, content)
    except Exception:  # noqa: BLE001 — malformed payload also means "not live"
        return False
    return len(jobs) > 0


def _register_active(db, reviewer: User, *, source_key: str, entry: dict, endpoint_url: str):
    query_param = next(iter(_QUERY_BY_PROVIDER[entry["provider"]]))
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key=source_key,
            display_name=entry["display_name"],
            source_family="employer_ats",
            owner="Discovery Operations",
            allowed_behavior="ats_integration",
            endpoint_url=endpoint_url,
            allowed_query_parameters=[query_param],
            robots_policy="not_applicable",
            rate_limit_per_minute=20,
            attribution_rule=(
                "Show the company name, the source name "
                f"({entry['provider'].capitalize()}) and the original listing link"
            ),
            retention_days=45,
        ),
    )
    update_source(db, source, DiscoverySourceUpdate(terms_status="accepted"), actor=reviewer)
    update_source(db, source, DiscoverySourceUpdate(kill_switch=False))


async def main() -> None:
    candidates = json.loads(DATA_FILE.read_text())["sources"]
    db = SessionLocal()
    registered = already_present = dead = invalid = 0
    try:
        reviewer = _system_reviewer(db)
        existing_keys = {row.source_key for row in db.query(DiscoverySource.source_key).all()}
        for entry in candidates:
            provider = entry.get("provider")
            slug = entry.get("slug")
            if provider not in _ENDPOINT_BY_PROVIDER or not slug:
                logger.info("skip (invalid entry): %r", entry)
                invalid += 1
                continue
            source_key = _source_key(provider, slug)
            if source_key in existing_keys:
                already_present += 1
                continue
            endpoint_url = _ENDPOINT_BY_PROVIDER[provider].format(slug=slug)
            logger.info("checking %s (%s/%s)...", entry["display_name"], provider, slug)
            if not await _is_live(provider, endpoint_url):
                dead += 1
                continue
            _register_active(db, reviewer, source_key=source_key, entry=entry, endpoint_url=endpoint_url)
            registered += 1
            logger.info("  registered: %s", source_key)
    finally:
        db.close()

    logger.info(
        "\nDone. registered=%d already_present=%d dead=%d invalid=%d total_candidates=%d",
        registered,
        already_present,
        dead,
        invalid,
        len(candidates),
    )


if __name__ == "__main__":
    asyncio.run(main())
