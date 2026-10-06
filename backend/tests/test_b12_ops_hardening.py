"""B12: production topology and ops hardening (decision-free part).

- ABU-1: request limits key on the real client once the proxy hop in front of the
  backend is trusted (FORWARDED_ALLOW_IPS), and a forged X-Forwarded-For from an
  untrusted peer cannot buy a fresh bucket (the safe default).
- FE-1 (backend half): JSON responses are gzip-compressed for clients that accept it.
- REL-2: the request id ties a client's complaint to a log line across hops.
"""

import gzip
import json
import logging
import os
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from uvicorn.config import Config

from app.main import app

PREFIX = "/api/v1"
BACKEND_DIR = Path(__file__).resolve().parents[1]
PROXY_PEER = ("10.0.0.5", 50000)


def _served_app(monkeypatch, forwarded_allow_ips: str | None):
    """The ASGI app exactly as uvicorn wraps it at runtime (proxy headers on)."""
    if forwarded_allow_ips is None:
        monkeypatch.delenv("FORWARDED_ALLOW_IPS", raising=False)
    else:
        monkeypatch.setenv("FORWARDED_ALLOW_IPS", forwarded_allow_ips)
    config = Config(app=app, proxy_headers=True, log_config=None, lifespan="off")
    config.load()
    return config.loaded_app


def _reset_request(http: TestClient, forwarded_for: str) -> int:
    return http.post(
        f"{PREFIX}/auth/password-reset/request",
        json={"email": "nobody@example.com"},
        headers={"X-Forwarded-For": forwarded_for},
    ).status_code


def test_limits_key_on_the_forwarded_client_when_the_proxy_is_trusted(client, monkeypatch):
    served = _served_app(monkeypatch, "10.0.0.0/8")
    http = TestClient(served, client=PROXY_PEER)

    # password-reset/request allows 3 per minute per client.
    assert [_reset_request(http, "198.51.100.1") for _ in range(3)] == [200, 200, 200]
    assert _reset_request(http, "198.51.100.1") == 429
    # A different visitor behind the same proxy has their own allowance.
    assert _reset_request(http, "198.51.100.2") == 200
    # The left-most entry is client-controlled; only the hop the proxy appended counts.
    assert _reset_request(http, "198.51.100.9, 198.51.100.1") == 429


def test_a_forged_forwarded_for_from_an_untrusted_peer_is_ignored_by_default(
    client, monkeypatch
):
    served = _served_app(monkeypatch, None)
    http = TestClient(served, client=PROXY_PEER)

    assert [_reset_request(http, f"198.51.100.{i}") for i in range(1, 4)] == [200, 200, 200]
    # Rotating the header does not escape the limit: the key is the peer address.
    assert _reset_request(http, "198.51.100.77") == 429


def test_the_rate_limited_response_tells_the_client_when_to_retry(client):
    for _ in range(3):
        client.post(f"{PREFIX}/auth/password-reset/request", json={"email": "a@example.com"})
    limited = client.post(f"{PREFIX}/auth/password-reset/request", json={"email": "a@example.com"})

    assert limited.status_code == 429
    assert 1 <= int(limited.headers["retry-after"]) <= 60


# ── start.sh / Dockerfile: the proxy trust is configured by environment ──


def _uvicorn_args_from_start_sh(tmp_path, extra_env: dict[str, str]) -> list[str]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir(exist_ok=True)
    uvicorn = fake_bin / "uvicorn"
    uvicorn.write_text('#!/bin/sh\nfor a in "$@"; do echo "ARG: $a"; done\n')
    uvicorn.chmod(0o755)
    env = {key: value for key, value in os.environ.items() if key != "FORWARDED_ALLOW_IPS"}
    result = subprocess.run(
        ["sh", "start.sh"],
        cwd=BACKEND_DIR,
        env={
            **env,
            "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
            "RUN_MIGRATIONS": "false",
            **extra_env,
        },
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    return [
        line.removeprefix("ARG: ")
        for line in result.stdout.splitlines()
        if line.startswith("ARG: ")
    ]


def test_start_script_trusts_only_loopback_proxies_unless_configured(tmp_path):
    args = _uvicorn_args_from_start_sh(tmp_path, {})

    assert "--proxy-headers" in args
    assert args[args.index("--forwarded-allow-ips") + 1] == "127.0.0.1"


def test_start_script_trusts_the_configured_proxy_range(tmp_path):
    args = _uvicorn_args_from_start_sh(tmp_path, {"FORWARDED_ALLOW_IPS": "10.0.0.0/8,fd12::/16"})

    assert args[args.index("--forwarded-allow-ips") + 1] == "10.0.0.0/8,fd12::/16"


def test_dockerfile_default_command_reads_proxy_trust_from_the_environment():
    import re

    dockerfile = (BACKEND_DIR / "Dockerfile").read_text()
    cmd = json.loads(re.search(r"^CMD (\[.*\])$", dockerfile, re.M).group(1))

    assert "--proxy-headers" in cmd
    # A literal list here would override FORWARDED_ALLOW_IPS, which uvicorn
    # reads from the environment when the flag is absent.
    assert "--forwarded-allow-ips" not in cmd


# ── FE-1 backend half: compression ──


def test_large_json_responses_are_gzip_compressed_with_security_headers_intact(client):
    response = client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert "accept-encoding" in response.headers["vary"].lower()
    assert response.json()["info"]["title"] == "Career Workbench API"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert response.headers["x-request-id"]

    raw = client.get("/openapi.json", headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in raw.headers
    assert len(gzip.compress(raw.content)) < len(raw.content) / 3


def test_small_responses_are_not_compressed(client):
    response = client.get(f"{PREFIX}/auth/providers", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert "content-encoding" not in response.headers


# ── REL-2: request ids ──


def test_a_well_formed_incoming_request_id_is_kept_for_correlation(client, caplog):
    with caplog.at_level(logging.INFO, logger="app.request"):
        response = client.get(
            f"{PREFIX}/auth/providers", headers={"X-Request-ID": "edge-7f3a9c1b2d4e"}
        )

    assert response.headers["x-request-id"] == "edge-7f3a9c1b2d4e"
    logged = [json.loads(r.getMessage()) for r in caplog.records if r.name == "app.request"]
    assert any(event.get("request_id") == "edge-7f3a9c1b2d4e" for event in logged)


@pytest.mark.parametrize(
    "incoming",
    ["short", "x" * 129, "has space-in-it-0123", 'quote"injection-0123', "line\tbreak-0123456"],
)
def test_a_malformed_incoming_request_id_is_replaced(client, incoming):
    response = client.get(f"{PREFIX}/auth/providers", headers={"X-Request-ID": incoming})

    request_id = response.headers["x-request-id"]
    assert request_id != incoming
    assert len(request_id) == 16


@pytest.fixture
def exploding_route():
    async def explode():
        raise RuntimeError("secret internal detail")

    app.add_api_route("/api/v1/_test_b12_explode", explode, methods=["GET"])
    yield "/api/v1/_test_b12_explode"
    app.router.routes[:] = [
        r for r in app.router.routes if getattr(r, "path", "") != "/api/v1/_test_b12_explode"
    ]


def test_an_unhandled_error_body_carries_the_request_id_support_can_search_for(exploding_route):
    http = TestClient(app, raise_server_exceptions=False)
    response = http.get(exploding_route)

    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "Internal server error"
    assert body["request_id"] == response.headers["x-request-id"]
    assert "secret internal detail" not in response.text


def test_range_requests_are_never_gzipped_so_content_range_stays_true():
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient as StarletteClient

    from app.main import _GZipUnlessRanged

    body = "x" * 5000

    async def big(_request):
        return PlainTextResponse(body)

    probe = Starlette(routes=[Route("/big", big)])
    probe.add_middleware(_GZipUnlessRanged, minimum_size=1000, compresslevel=6)
    client = StarletteClient(probe)

    plain = client.get("/big", headers={"Accept-Encoding": "gzip"})
    assert plain.headers.get("content-encoding") == "gzip"

    ranged = client.get("/big", headers={"Accept-Encoding": "gzip", "Range": "bytes=0-99"})
    assert ranged.headers.get("content-encoding") is None
    assert ranged.text == body
