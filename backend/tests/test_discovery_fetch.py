"""The SSRF-safe, bounded GET every discovery fetch goes through."""

import socket

import httpx
import pytest

from app.services.discovery_fetch import DISCOVERY_USER_AGENT, fetch_public_resource

_JSON = frozenset({"application/json"})
_URL = "https://fixture.example/jobs"


def _install_transport(monkeypatch, handler, *, addresses=("93.184.216.34",)):
    def dns(_host, port, _family, _socktype):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in addresses]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", dns)
    monkeypatch.setattr(
        "app.services.discovery_fetch.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_fetch_returns_body_and_sends_the_discovery_identity(monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request):
        requests.append(request)
        return httpx.Response(
            200, content=b'{"jobs": []}', headers={"content-type": "application/json"}
        )

    _install_transport(monkeypatch, handler)

    body, content_type = await fetch_public_resource(_URL, {"content": "true"}, _JSON)

    assert body == b'{"jobs": []}'
    assert content_type == "application/json"
    assert requests[0].headers["user-agent"] == DISCOVERY_USER_AGENT
    assert requests[0].headers["host"] == "fixture.example"
    assert requests[0].url.params["content"] == "true"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (
            httpx.Response(
                302,
                headers={"location": "https://other.example/jobs"},
                request=httpx.Request("GET", _URL),
            ),
            httpx.HTTPStatusError,
        ),
        (
            httpx.Response(200, headers={"content-type": "text/html"}, content=b"not a feed"),
            httpx.HTTPError,
        ),
        (
            httpx.Response(
                200,
                headers={"content-type": "application/json", "content-length": "2000001"},
                content=b"{}",
            ),
            httpx.HTTPError,
        ),
    ],
)
async def test_redirect_content_type_and_size_controls(monkeypatch, response, expected):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request):
        requests.append(request)
        return response

    _install_transport(monkeypatch, handler)
    with pytest.raises(expected):
        await fetch_public_resource(_URL, {}, _JSON)
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_fetch_blocks_mixed_public_private_dns(monkeypatch):
    requests: list[httpx.Request] = []
    _install_transport(
        monkeypatch, requests.append, addresses=("93.184.216.34", "127.0.0.1")
    )
    with pytest.raises(ValueError, match="private/internal"):
        await fetch_public_resource(_URL, {}, _JSON)
    assert requests == []
