"""Employer-ATS ingestion, the listing store, expiry and the source registry.

Every fetch is served by ``httpx.MockTransport`` with stubbed public DNS; no test
touches the network.
"""

from __future__ import annotations

import json
import socket
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import event

from app.models.discovered_listing import DiscoveredListing, DiscoveredListingAttribution
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.services.ats_ingestion import (
    ATSIngestionRefused,
    ingest_ats_source,
    run_ats_ingestion,
    run_ats_ingestion_scheduler,
)
from app.services.discovered_listings import expire_discovered_listings
from app.services.discovery_fetch import DISCOVERY_USER_AGENT, fetch_public_resource
from app.services.discovery_sources import (
    SourceNotAllowedError,
    register_source,
    update_source,
)
from tests.conftest import engine

FIXTURES = Path(__file__).parent / "fixtures/ats"
SOURCES = "/api/v1/admin/discovery-sources"
_JSON = frozenset({"application/json"})


def _serve(monkeypatch, handler, *, addresses=("93.184.216.34",)):
    """Route every discovery fetch to ``handler``; returns the requests seen."""
    requests: list[httpx.Request] = []

    def dns(_host, port, _family, _socktype):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in addresses]

    def recording(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", dns)
    monkeypatch.setattr(
        "app.services.discovery_fetch.httpx.HTTPTransport",
        lambda **_kwargs: httpx.MockTransport(recording),
    )
    return requests


def _json(payload) -> callable:
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return lambda _request: httpx.Response(
        200, content=body, headers={"content-type": "application/json"}
    )


def _fixture(provider: str) -> bytes:
    return (FIXTURES / f"{provider}_jobs.json").read_bytes()


def _greenhouse_jobs(count: int) -> dict:
    return {
        "jobs": [
            {
                "id": 1000 + index,
                "title": f"Engineer {index}",
                "content": f"<p>Build services number {index} with a small, friendly team.</p>",
                "location": {"name": "Berlin, Germany"},
                "absolute_url": f"https://acme.example/jobs/{index}",
            }
            for index in range(count)
        ]
    }


# ── Adapters ──


@pytest.mark.parametrize(
    ("provider", "fetched", "title", "expected"),
    [
        (
            "greenhouse",
            2,  # the second job's description is under 40 characters
            "Senior Backend Engineer",
            {
                "location": "Berlin, Germany",
                "department": "Engineering",
                "apply_url": "https://www.examplecorp.com/careers/1234567-senior-backend-engineer",
                "source_url": "https://boards.greenhouse.io/examplecorp/jobs/1234567",
            },
        ),
        (
            "lever",
            1,
            "Product Designer",
            {
                "location": "London, UK",
                "department": "Design",
                "remote": True,  # from workplaceType
                "source_url": "https://jobs.lever.co/examplecorp/abc-123",
            },
        ),
        (
            "ashby",
            2,  # the second job is unlisted
            "Staff Data Engineer",
            {"department": "Data", "remote": True},
        ),
    ],
)
def test_each_provider_adapter_maps_one_listing_and_skips_the_rest(
    db, discovery, monkeypatch, provider, fetched, title, expected
):
    source = discovery.source("examplecorp", provider=provider, display_name="Example Corp")
    requests = _serve(monkeypatch, _json(_fixture(provider)))

    outcome = ingest_ats_source(db, source)

    assert (outcome.fetched, outcome.stored, outcome.skipped) == (fetched, 1, fetched - 1)
    assert requests[0].headers["user-agent"] == DISCOVERY_USER_AGENT
    listing = db.query(DiscoveredListing).filter_by(title=title).one()
    assert listing.company == "Example Corp"
    for field, value in expected.items():
        actual = listing.attributions[0].source_url if field == "source_url" else getattr(listing, field)
        assert actual == value, field


# ── Store ──


def test_refetch_is_an_upsert_whose_cost_does_not_grow_with_the_board(
    db, discovery, monkeypatch
):
    source = discovery.source()

    def refetch_statements(count: int) -> int:
        _serve(monkeypatch, _json(_greenhouse_jobs(count)))
        ingest_ats_source(db, source)  # first fetch stores
        statements: list[str] = []
        listener = lambda *args: statements.append(args[2])  # noqa: E731
        event.listen(engine, "before_cursor_execute", listener)
        try:
            outcome = ingest_ats_source(db, source)  # unchanged re-fetch
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        assert (outcome.stored, outcome.deduplicated) == (0, count)
        return len(statements)

    small = refetch_statements(2)
    large = refetch_statements(30)

    assert small == large
    assert db.query(DiscoveredListing).count() == 30
    assert db.query(DiscoveredListingAttribution).count() == 30
    db.refresh(source)
    assert (source.last_outcome, source.listing_count) == ("ok", 30)


def test_same_text_for_another_office_does_not_overwrite_the_first_office(
    db, discovery, monkeypatch
):
    source = discovery.source("examplecorp")
    berlin = json.loads(_fixture("greenhouse"))["jobs"][0]
    london = {**berlin, "id": 9999999, "location": {"name": "London, UK"}}
    _serve(monkeypatch, _json({"jobs": [berlin, london]}))

    outcome = ingest_ats_source(db, source)

    assert (outcome.stored, outcome.deduplicated) == (1, 1)
    listing = db.query(DiscoveredListing).one()
    assert listing.location == "Berlin, Germany"
    assert len(listing.attributions) == 2


def test_an_edited_posting_moves_its_attribution_and_drops_the_orphan(
    db, discovery, monkeypatch
):
    source = discovery.source()
    jobs = _greenhouse_jobs(1)
    _serve(monkeypatch, _json(jobs))
    ingest_ats_source(db, source)
    jobs["jobs"][0]["content"] = "<p>Rewritten: build payment services with a small team.</p>"
    _serve(monkeypatch, _json(jobs))

    outcome = ingest_ats_source(db, source)

    assert outcome.stored == 1
    listing = db.query(DiscoveredListing).one()
    assert listing.description.startswith("Rewritten")
    assert db.query(DiscoveredListingAttribution).one().listing_id == listing.id


def test_expiry_follows_each_sources_retention_keeps_the_boundary_and_removes_orphans(
    db, discovery
):
    now = datetime.now(UTC)
    short = discovery.source("short", retention_days=3)
    long = discovery.source("long", provider="lever", retention_days=30)
    discovery.listing(short, title="Expired", retrieved_days_ago=4)
    boundary = discovery.listing(short, title="Boundary", retrieved_days_ago=1)
    db.query(DiscoveredListingAttribution).filter_by(listing_id=boundary.id).update(
        {"retrieved_at": now - timedelta(days=3)}
    )
    discovery.listing(long, title="Kept", retrieved_days_ago=10)
    # Shared text: the long source keeps the canonical listing alive.
    discovery.listing(short, title="Shared", retrieved_days_ago=5)
    discovery.listing(long, title="Shared", retrieved_days_ago=5)
    db.commit()

    result = expire_discovered_listings(db, now=now)

    assert (result.attributions_deleted, result.listings_deleted) == (2, 1)
    assert sorted(title for (title,) in db.query(DiscoveredListing.title)) == [
        "Boundary",
        "Kept",
        "Shared",
    ]


# ── Runs, governance and the fetch boundary ──


def test_one_failing_board_does_not_stop_the_others_and_each_run_is_stamped(
    db, discovery, monkeypatch
):
    good = discovery.source("examplecorp")
    bad = discovery.source("deadboard", provider="lever")
    greenhouse = _fixture("greenhouse")

    def handler(request: httpx.Request) -> httpx.Response:
        if "lever.co" in request.headers["host"]:
            return httpx.Response(503)
        return httpx.Response(200, content=greenhouse, headers={"content-type": "application/json"})

    _serve(monkeypatch, handler)
    summary = run_ats_ingestion(db)

    assert [outcome.source_key for outcome in summary.outcomes] == [good.source_key]
    assert list(summary.failures) == [bad.source_key]
    db.refresh(good)
    db.refresh(bad)
    assert (good.last_outcome, good.listing_count) == ("ok", 1)
    assert (bad.last_outcome, bad.listing_count) == ("failed: HTTPStatusError", None)

    # A later failed run keeps the last good count.
    _serve(monkeypatch, lambda _request: httpx.Response(503))
    run_ats_ingestion(db)
    db.refresh(good)
    assert (good.last_outcome, good.listing_count) == ("failed: HTTPStatusError", 1)


def test_killed_unreviewed_and_non_ats_sources_are_never_fetched(
    db, discovery, monkeypatch
):
    killed = discovery.source("killed")
    killed.kill_switch = True
    db.commit()
    discovery.source("pending", allowed=False)
    requests = _serve(monkeypatch, _json(_fixture("greenhouse")))

    summary = run_ats_ingestion(db)

    assert summary.outcomes == [] and summary.failures == {} and requests == []
    with pytest.raises(SourceNotAllowedError):
        ingest_ats_source(db, killed)
    licensed = discovery.source("licensed")
    licensed.source_family = "licensed"
    db.commit()
    with pytest.raises(ATSIngestionRefused):
        ingest_ats_source(db, licensed)
    assert requests == []


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(302, headers={"location": "https://other.example/jobs"}),
        httpx.Response(200, headers={"content-type": "text/html"}, content=b"not a feed"),
        httpx.Response(
            200,
            headers={"content-type": "application/json", "content-length": "2000001"},
            content=b"{}",
        ),
    ],
)
def test_fetch_refuses_redirects_wrong_types_and_oversized_bodies(monkeypatch, response):
    requests = _serve(monkeypatch, lambda _request: response)
    with pytest.raises(httpx.HTTPError):
        fetch_public_resource("https://fixture.example/jobs", {}, _JSON)
    assert len(requests) == 1


def test_fetch_blocks_mixed_public_and_private_dns(monkeypatch):
    requests = _serve(monkeypatch, _json({}), addresses=("93.184.216.34", "127.0.0.1"))
    with pytest.raises(ValueError, match="private/internal"):
        fetch_public_resource("https://fixture.example/jobs", {}, _JSON)
    assert requests == []


async def test_scheduler_is_a_no_op_while_disabled():
    await run_ats_ingestion_scheduler(initial_delay_seconds=3600)


# ── Registry ──


def test_a_source_registers_dark_and_activates_only_after_an_admin_terms_review(
    db, discovery
):
    body = DiscoverySourceCreate(
        source_key="employer-ats-lever-new",
        display_name="New Co",
        source_family="employer_ats",
        owner="Discovery Operations",
        allowed_behavior="ats_integration",
        endpoint_url="https://api.lever.co/v0/postings/new",
        rate_limit_per_minute=20,
        attribution_rule="Show company, source name and original link",
        retention_days=30,
    )
    source = register_source(db, body)
    assert source.ingestion_allowed is False
    with pytest.raises(ValueError, match="cannot activate"):
        update_source(db, source, DiscoverySourceUpdate(kill_switch=False))
    with pytest.raises(ValueError, match="admin reviewer"):
        update_source(db, source, DiscoverySourceUpdate(terms_status="accepted"))


def test_admin_sources_table_and_kill_switch_are_admin_only(client, auth_headers, discovery):
    source = discovery.source()
    admin = discovery.user_headers("admin@example.com", admin=True)
    kill = f"{SOURCES}/{source.id}/kill-switch"

    assert client.get(SOURCES, headers=auth_headers).status_code == 403
    assert client.post(kill, params={"tripped": True}, headers=auth_headers).status_code == 403
    item = client.get(SOURCES, headers=admin).json()["items"][0]
    assert item["source_key"] == source.source_key and item["ingestion_allowed"] is True
    assert "allowed_query_parameters" not in item and "robots_policy" not in item

    tripped = client.post(kill, params={"tripped": True}, headers=admin).json()
    assert tripped["kill_switch"] is True and tripped["ingestion_allowed"] is False
    assert client.post(kill, params={"tripped": False}, headers=admin).json()["kill_switch"] is False
