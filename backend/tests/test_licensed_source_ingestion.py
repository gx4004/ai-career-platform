import socket

import httpx
import pytest
from pydantic import ValidationError

from app.auth.security import hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User
from app.schemas.discovery_sources import (
    DiscoverySourceCreate,
    DiscoverySourceUpdate,
    LicensedSourceQuery,
)
from app.services.discovery_sources import (
    IngestionRefusal,
    SourceIngestionRefused,
    register_source,
    update_source,
)
from app.services.licensed_source_ingestion import (
    DISCOVERY_USER_AGENT,
    LicensedSourceFetchRefused,
    fetch_licensed_source,
)


def _reviewer(db) -> User:
    reviewer = User(
        email="licensed-reviewer@example.com",
        hashed_password=hash_password("password123"),
        is_admin=True,
    )
    db.add(reviewer)
    db.commit()
    db.refresh(reviewer)
    return reviewer


def _activate_source(
    db,
    reviewer: User,
    *,
    source_key: str = "licensed-feed",
    endpoint_url: str = "https://fixture.example/jobs",
    rate_limit: int = 10,
    robots_policy: str = "required",
):
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key=source_key,
            display_name=f"Fixture {source_key}",
            source_family="licensed",
            owner="Discovery Operations",
            allowed_behavior="feed",
            endpoint_url=endpoint_url,
            allowed_query_parameters=["role", "location", "limit"],
            robots_policy=robots_policy,
            rate_limit_per_minute=rate_limit,
            attribution_rule="Show source name and original link",
            retention_days=30,
        ),
    )
    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="accepted"),
        actor=reviewer,
    )
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


@pytest.mark.asyncio
async def test_licensed_feed_honors_robots_user_agent_query_contract_and_rate(
    db, monkeypatch, caplog
):
    source = _activate_source(db, _reviewer(db), rate_limit=2)
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request):
        requests.append(request)
        if request.url.path == "/robots.txt":
            return httpx.Response(
                200,
                headers={"content-type": "text/plain"},
                text="User-agent: *\nAllow: /\n",
            )
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            content=b'{"jobs": []}',
        )

    _install_fixture_transport(monkeypatch, handler)
    result = await fetch_licensed_source(
        db,
        source_key=source.source_key,
        behavior="feed",
        query=LicensedSourceQuery(role="platform engineer", limit=20),
    )

    assert result.content == b'{"jobs": []}'
    assert [request.url.path for request in requests] == ["/robots.txt", "/jobs"]
    assert dict(requests[1].url.params) == {
        "role": "platform engineer",
        "limit": "20",
    }
    assert all(request.headers["user-agent"] == DISCOVERY_USER_AGENT for request in requests)
    assert all(request.headers["host"] == "fixture.example" for request in requests)
    assert "platform engineer" not in caplog.text

    with pytest.raises(LicensedSourceFetchRefused, match="source_rate_limit_exceeded"):
        await fetch_licensed_source(
            db,
            source_key=source.source_key,
            behavior="feed",
            query=LicensedSourceQuery(role="engineer"),
        )
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_query_privacy_and_robots_disallow_block_before_source_fetch(db, monkeypatch):
    source = _activate_source(db, _reviewer(db))
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request):
        requests.append(request)
        return httpx.Response(
            200,
            headers={"content-type": "text/plain"},
            text="User-agent: *\nDisallow: /jobs\n",
        )

    _install_fixture_transport(monkeypatch, handler)
    with pytest.raises(ValidationError):
        LicensedSourceQuery.model_validate(
            {"profile_text": "Acme employment history", "identity": "Robin Alcott"}
        )
    assert requests == []

    with pytest.raises(LicensedSourceFetchRefused, match="robots_disallowed"):
        await fetch_licensed_source(
            db,
            source_key=source.source_key,
            behavior="feed",
            query=LicensedSourceQuery(role="engineer"),
        )
    assert [request.url.path for request in requests] == ["/robots.txt"]


@pytest.mark.asyncio
async def test_kill_switch_halts_one_source_without_affecting_another(db, monkeypatch):
    reviewer = _reviewer(db)
    killed = _activate_source(
        db,
        reviewer,
        source_key="killed-feed",
        endpoint_url="https://killed.example/jobs",
        robots_policy="not_applicable",
    )
    healthy = _activate_source(
        db,
        reviewer,
        source_key="healthy-feed",
        endpoint_url="https://healthy.example/jobs",
        robots_policy="not_applicable",
    )
    update_source(db, killed, DiscoverySourceUpdate(kill_switch=True))

    requests: list[httpx.Request] = []

    def handler(request: httpx.Request):
        requests.append(request)
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            content=b'{"jobs": ["healthy"]}',
        )

    _install_fixture_transport(monkeypatch, handler)
    with pytest.raises(SourceIngestionRefused) as refused:
        await fetch_licensed_source(
            db,
            source_key=killed.source_key,
            behavior="feed",
            query=LicensedSourceQuery(role="engineer"),
        )
    assert refused.value.reason == IngestionRefusal.KILL_SWITCHED

    result = await fetch_licensed_source(
        db,
        source_key=healthy.source_key,
        behavior="feed",
        query=LicensedSourceQuery(role="engineer"),
    )
    assert result.content == b'{"jobs": ["healthy"]}'
    assert [request.headers["host"] for request in requests] == ["healthy.example"]


@pytest.mark.asyncio
async def test_fetch_outcomes_use_only_source_family_and_bounded_class(db, monkeypatch):
    source = _activate_source(
        db,
        _reviewer(db),
        robots_policy="not_applicable",
    )

    def handler(request: httpx.Request):
        return httpx.Response(503, request=request)

    _install_fixture_transport(monkeypatch, handler)
    with pytest.raises(httpx.HTTPStatusError):
        await fetch_licensed_source(
            db,
            source_key=source.source_key,
            behavior="feed",
            query=LicensedSourceQuery(location="Warsaw"),
        )

    event = db.query(AnalyticsEvent).filter_by(event_name="discovery_source_fetch_outcome").one()
    assert event.operational_dimension == "licensed"
    assert event.operational_outcome == "failure"
    assert source.source_key not in str(event.__dict__)


@pytest.mark.asyncio
async def test_in_flight_kill_and_policy_changes_stop_after_robots(db, monkeypatch):
    reviewer = _reviewer(db)

    for change in ("kill", "endpoint"):
        source = _activate_source(
            db,
            reviewer,
            source_key=f"changing-{change}",
            endpoint_url=f"https://{change}.example/jobs",
        )
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request):
            requests.append(request)
            if change == "kill":
                update_source(db, source, DiscoverySourceUpdate(kill_switch=True))
            else:
                update_source(
                    db,
                    source,
                    DiscoverySourceUpdate(endpoint_url="https://replacement.example/jobs"),
                )
            return httpx.Response(
                200,
                headers={"content-type": "text/plain"},
                text="User-agent: *\nAllow: /\n",
            )

        _install_fixture_transport(monkeypatch, handler)
        expected = SourceIngestionRefused if change == "kill" else LicensedSourceFetchRefused
        with pytest.raises(expected):
            await fetch_licensed_source(
                db,
                source_key=source.source_key,
                behavior="feed",
                query=LicensedSourceQuery(role="engineer"),
            )
        assert [request.url.path for request in requests] == ["/robots.txt"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (
            httpx.Response(
                302,
                headers={"location": "https://other.example/jobs"},
                request=httpx.Request("GET", "https://fixture.example/jobs"),
            ),
            httpx.HTTPStatusError,
        ),
        (
            httpx.Response(
                200,
                headers={"content-type": "text/html"},
                content=b"not a feed",
            ),
            httpx.HTTPError,
        ),
        (
            httpx.Response(
                200,
                headers={
                    "content-type": "application/json",
                    "content-length": "2000001",
                },
                content=b"{}",
            ),
            httpx.HTTPError,
        ),
    ],
)
async def test_redirect_content_type_and_size_controls(db, monkeypatch, response, expected):
    source = _activate_source(
        db,
        _reviewer(db),
        robots_policy="not_applicable",
    )
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request):
        requests.append(request)
        return response

    _install_fixture_transport(monkeypatch, handler)
    with pytest.raises(expected):
        await fetch_licensed_source(
            db,
            source_key=source.source_key,
            behavior="feed",
            query=LicensedSourceQuery(role="engineer"),
        )
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_discovery_fetch_blocks_mixed_public_private_dns(db, monkeypatch):
    source = _activate_source(
        db,
        _reviewer(db),
        robots_policy="not_applicable",
    )
    requests: list[httpx.Request] = []

    def mixed_dns(_host, port, _family, _socktype):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port)),
        ]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", mixed_dns)
    monkeypatch.setattr(
        "app.services.licensed_source_ingestion.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(lambda request: requests.append(request)),
    )
    with pytest.raises(ValueError, match="private/internal"):
        await fetch_licensed_source(
            db,
            source_key=source.source_key,
            behavior="feed",
            query=LicensedSourceQuery(role="engineer"),
        )
    assert requests == []
