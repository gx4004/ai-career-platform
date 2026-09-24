import json
import socket
from pathlib import Path

import httpx
import pytest

from app.auth.security import create_access_token, hash_password
from app.models.discovered_listing import DiscoveredListing
from app.models.discovery_source import DiscoverySource
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.services.ats_ingestion import (
    _QUERY_BY_PROVIDER,
    ATSIngestionRefused,
    ingest_ats_source,
    run_ats_ingestion,
    run_ats_ingestion_scheduler,
)
from app.services.discovery_sources import (
    SourceIngestionRefused,
    register_source,
    update_source,
)

PREFIX = "/api/v1"
FIXTURES_DIR = Path(__file__).parent / "fixtures/ats"

_ENDPOINT_BY_PROVIDER = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
    "lever": "https://api.lever.co/v0/postings/{slug}",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{slug}",
}


def _reviewer(db, email: str = "ats-reviewer@example.com") -> User:
    reviewer = User(email=email, hashed_password=hash_password("password123"), is_admin=True)
    db.add(reviewer)
    db.commit()
    db.refresh(reviewer)
    return reviewer


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _activate_ats_source(
    db,
    reviewer: User,
    *,
    provider: str,
    slug: str,
    display_name: str = "Example Corp",
    rate_limit: int = 10,
):
    query_param = next(iter(_QUERY_BY_PROVIDER[provider]))
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key=f"employer-ats-{provider}-{slug}",
            display_name=display_name,
            source_family="employer_ats",
            owner="Discovery Operations",
            allowed_behavior="ats_integration",
            endpoint_url=_ENDPOINT_BY_PROVIDER[provider].format(slug=slug),
            allowed_query_parameters=[query_param],
            robots_policy="not_applicable",
            rate_limit_per_minute=rate_limit,
            attribution_rule="Show company, source name and original link",
            retention_days=30,
        ),
    )
    update_source(db, source, DiscoverySourceUpdate(terms_status="accepted"), actor=reviewer)
    update_source(db, source, DiscoverySourceUpdate(kill_switch=False))
    return source


def _install_fixture_transport(monkeypatch, handler):
    def public_dns(_host, port, _family, _socktype):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", public_dns)
    monkeypatch.setattr(
        "app.services.licensed_source_ingestion.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )


def _json_handler(fixture_path: Path):
    body = fixture_path.read_bytes()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body, headers={"content-type": "application/json"})

    return handler


@pytest.mark.asyncio
async def test_greenhouse_adapter_parses_fixture_maps_fields_and_skips_short_listing(
    db, monkeypatch
):
    source = _activate_ats_source(db, _reviewer(db), provider="greenhouse", slug="examplecorp")
    _install_fixture_transport(
        monkeypatch, _json_handler(FIXTURES_DIR / "greenhouse_jobs.json")
    )

    outcome = await ingest_ats_source(db, source_key=source.source_key)

    assert outcome.fetched == 2
    assert outcome.stored == 1
    assert outcome.skipped == 1  # "Too Short Listing" content is under 40 chars
    assert outcome.deduplicated == 0
    assert outcome.errored == 0

    listing = db.query(DiscoveredListing).filter_by(title="Senior Backend Engineer").one()
    assert listing.company == "Example Corp"
    assert listing.location == "Berlin, Germany"
    assert listing.department == "Engineering"
    assert listing.apply_url == "https://www.examplecorp.com/careers/1234567-senior-backend-engineer"
    assert listing.posted_at is not None
    attribution = listing.attributions[0]
    assert attribution.source_url == "https://boards.greenhouse.io/examplecorp/jobs/1234567"


@pytest.mark.asyncio
async def test_lever_adapter_parses_fixture_and_infers_remote_from_workplace_type(
    db, monkeypatch
):
    source = _activate_ats_source(db, _reviewer(db), provider="lever", slug="examplecorp")
    _install_fixture_transport(monkeypatch, _json_handler(FIXTURES_DIR / "lever_jobs.json"))

    outcome = await ingest_ats_source(db, source_key=source.source_key)

    assert outcome.fetched == 1
    assert outcome.stored == 1
    listing = db.query(DiscoveredListing).filter_by(title="Product Designer").one()
    assert listing.remote is True
    assert listing.location == "London, UK"
    assert listing.department == "Design"
    assert "Product Designer" in listing.description
    assert "5+ years product design experience" in listing.description
    attribution = listing.attributions[0]
    assert attribution.source_url == "https://jobs.lever.co/examplecorp/abc-123"


@pytest.mark.asyncio
async def test_ashby_adapter_skips_unlisted_jobs(db, monkeypatch):
    source = _activate_ats_source(db, _reviewer(db), provider="ashby", slug="examplecorp")
    _install_fixture_transport(monkeypatch, _json_handler(FIXTURES_DIR / "ashby_jobs.json"))

    outcome = await ingest_ats_source(db, source_key=source.source_key)

    assert outcome.fetched == 2
    assert outcome.stored == 1
    assert outcome.skipped == 1  # job-2 has isListed=False

    listing = db.query(DiscoveredListing).filter_by(title="Staff Data Engineer").one()
    assert listing.remote is True
    assert listing.department == "Data"


@pytest.mark.asyncio
async def test_refetching_the_same_board_deduplicates(db, monkeypatch):
    source = _activate_ats_source(db, _reviewer(db), provider="greenhouse", slug="examplecorp")
    _install_fixture_transport(
        monkeypatch, _json_handler(FIXTURES_DIR / "greenhouse_jobs.json")
    )

    first = await ingest_ats_source(db, source_key=source.source_key)
    second = await ingest_ats_source(db, source_key=source.source_key)

    assert first.stored == 1
    assert second.stored == 0
    assert second.deduplicated == 1
    assert db.query(DiscoveredListing).count() == 1


@pytest.mark.asyncio
async def test_one_source_failure_does_not_stop_others(db, monkeypatch):
    reviewer = _reviewer(db)
    good = _activate_ats_source(db, reviewer, provider="greenhouse", slug="examplecorp")
    bad = _activate_ats_source(db, reviewer, provider="lever", slug="deadboard")

    good_body = (FIXTURES_DIR / "greenhouse_jobs.json").read_bytes()

    def handler(request: httpx.Request) -> httpx.Response:
        if "lever.co" in request.headers.get("host", ""):
            return httpx.Response(503)
        return httpx.Response(200, content=good_body, headers={"content-type": "application/json"})

    _install_fixture_transport(monkeypatch, handler)

    summary = await run_ats_ingestion(db)

    outcome_keys = {outcome.source_key for outcome in summary.outcomes}
    assert good.source_key in outcome_keys
    assert bad.source_key in summary.failures
    assert bad.source_key not in outcome_keys


@pytest.mark.asyncio
async def test_ingest_refuses_a_killed_source(db, monkeypatch):
    reviewer = _reviewer(db)
    source = _activate_ats_source(db, reviewer, provider="greenhouse", slug="examplecorp")
    update_source(db, source, DiscoverySourceUpdate(kill_switch=True))

    with pytest.raises(SourceIngestionRefused):
        await ingest_ats_source(db, source_key=source.source_key)


@pytest.mark.asyncio
async def test_ingest_refuses_a_non_employer_ats_source(db):
    reviewer = _reviewer(db)
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key="licensed-not-ats",
            display_name="Licensed Feed",
            source_family="licensed",
            owner="Discovery Operations",
            allowed_behavior="ats_integration",
            endpoint_url="https://boards-api.greenhouse.io/v1/boards/notreal/jobs",
            allowed_query_parameters=["content"],
            robots_policy="not_applicable",
            rate_limit_per_minute=10,
            attribution_rule="n/a",
            retention_days=30,
        ),
    )
    update_source(db, source, DiscoverySourceUpdate(terms_status="accepted"), actor=reviewer)
    update_source(db, source, DiscoverySourceUpdate(kill_switch=False))

    with pytest.raises(ATSIngestionRefused):
        await ingest_ats_source(db, source_key=source.source_key)


@pytest.mark.asyncio
async def test_scheduler_is_a_no_op_when_its_flags_are_off(monkeypatch):
    # Both ATS_INGESTION_ENABLED and R14_DISCOVERY_ENABLED default False; the
    # scheduler must return immediately rather than looping/sleeping forever.
    await run_ats_ingestion_scheduler()


@pytest.mark.asyncio
async def test_scheduler_runs_when_both_flags_are_enabled(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "ATS_INGESTION_ENABLED", True)
    monkeypatch.setattr(settings, "R14_DISCOVERY_ENABLED", True)

    calls = {"count": 0}

    async def fake_run_once():
        calls["count"] += 1
        if calls["count"] >= 1:
            raise asyncio_cancel_sentinel

    import app.services.ats_ingestion as ats_ingestion_module

    class _StopLoop(Exception):
        pass

    asyncio_cancel_sentinel = _StopLoop()

    monkeypatch.setattr(ats_ingestion_module, "_run_ats_ingestion_once", fake_run_once)

    with pytest.raises(_StopLoop):
        await run_ats_ingestion_scheduler(initial_delay_seconds=0)

    assert calls["count"] == 1


def test_admin_refresh_requires_admin(client, db):
    plain = User(
        email="ats-refresh-user@example.com",
        hashed_password=hash_password("password123"),
        is_admin=False,
    )
    db.add(plain)
    db.commit()
    db.refresh(plain)

    response = client.post(f"{PREFIX}/admin/discovery-sources/refresh", headers=_headers(plain))
    assert response.status_code == 403


def test_admin_refresh_runs_ingestion_now(client, db, monkeypatch):
    admin = _reviewer(db, email="ats-refresh-admin@example.com")
    source = _activate_ats_source(db, admin, provider="greenhouse", slug="examplecorp")
    _install_fixture_transport(
        monkeypatch, _json_handler(FIXTURES_DIR / "greenhouse_jobs.json")
    )

    response = client.post(f"{PREFIX}/admin/discovery-sources/refresh", headers=_headers(admin))
    assert response.status_code == 200
    body = response.json()
    outcomes = {item["source_key"]: item for item in body["outcomes"]}
    assert outcomes[source.source_key]["stored"] == 1
    assert body["failures"] == {}


def test_greenhouse_query_parameter_extension_present_in_schema():
    # `content`/`mode`/`includeCompensation` must be accepted governance query
    # parameters or `DiscoverySourceCreate` in `_activate_ats_source` above
    # would already have failed validation for every test in this file.
    from typing import get_args

    from app.schemas.discovery_sources import DiscoveryQueryParameter

    assert {"content", "mode", "includeCompensation"} <= set(get_args(DiscoveryQueryParameter))
