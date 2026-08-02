from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

from app.auth.security import create_access_token
from app.limiter import (
    _get_abuse_identity,
    _get_client_ip,
    _get_source_identity,
    abuse_counters,
    clear_auth_failures,
    limiter,
    record_account_pressure,
    record_auth_failure,
    validate_abuse_control_config,
)
from app.schemas.tools import ImportedJobResponse


def _make_request(*, client_host: str, forwarded_for: str | None = None) -> Request:
    headers = []
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode("utf-8")))

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/auth/login",
        "headers": headers,
        "client": (client_host, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
        "query_string": b"",
    }
    return Request(scope)


def test_limiter_ignores_forwarded_header_by_default(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", False)
    monkeypatch.setattr("app.limiter.settings.TRUSTED_PROXY_CIDRS", "")

    request = _make_request(
        client_host="8.8.8.8",
        forwarded_for="203.0.113.10",
    )

    assert _get_client_ip(request) == "8.8.8.8"


def test_limiter_uses_forwarded_header_for_trusted_proxy(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(
        "app.limiter.settings.TRUSTED_PROXY_CIDRS", "127.0.0.0/8"
    )

    request = _make_request(
        client_host="127.0.0.1",
        forwarded_for="203.0.113.10, 127.0.0.1",
    )

    assert _get_client_ip(request) == "203.0.113.10"


def test_limiter_does_not_implicitly_trust_private_proxy(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr("app.limiter.settings.TRUSTED_PROXY_CIDRS", "")

    request = _make_request(
        client_host="127.0.0.1",
        forwarded_for="203.0.113.10",
    )

    assert _get_client_ip(request) == "127.0.0.1"


def test_limiter_ignores_forwarded_header_from_untrusted_proxy(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr("app.limiter.settings.TRUSTED_PROXY_CIDRS", "")

    request = _make_request(
        client_host="8.8.8.8",
        forwarded_for="203.0.113.10",
    )

    assert _get_client_ip(request) == "8.8.8.8"


def test_limiter_uses_forwarded_header_for_configured_public_proxy(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr("app.limiter.settings.TRUSTED_PROXY_CIDRS", "8.8.8.0/24")

    request = _make_request(
        client_host="8.8.8.8",
        forwarded_for="203.0.113.10, 8.8.8.8",
    )

    assert _get_client_ip(request) == "203.0.113.10"


def test_limiter_walks_trusted_proxy_chain_from_right_to_left(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(
        "app.limiter.settings.TRUSTED_PROXY_CIDRS",
        "10.0.0.0/8,192.168.0.0/16",
    )
    request = _make_request(
        client_host="10.0.0.5",
        forwarded_for="198.51.100.7, 192.168.1.10",
    )

    assert _get_client_ip(request) == "198.51.100.7"


def test_limiter_ignores_spoofed_leftmost_forwarded_value(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(
        "app.limiter.settings.TRUSTED_PROXY_CIDRS", "10.0.0.0/8"
    )
    request = _make_request(
        client_host="10.0.0.5",
        forwarded_for="spoofed, 198.51.100.7",
    )

    assert _get_client_ip(request) == "198.51.100.7"


def test_abuse_identity_hides_raw_guest_ip(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.ABUSE_IDENTITY_HMAC_KEY", "test-key")
    request = _make_request(client_host="203.0.113.10")

    identity = _get_abuse_identity(request)

    assert identity.startswith("guest:")
    assert "203.0.113.10" not in identity
    assert identity == _get_abuse_identity(request)


def test_abuse_identity_uses_verified_account_subject(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.ABUSE_IDENTITY_HMAC_KEY", "test-key")
    request = _make_request(client_host="203.0.113.10")
    request.scope["headers"] = [
        (b"authorization", f"Bearer {create_access_token('user-123')}".encode())
    ]

    identity = _get_abuse_identity(request)

    assert identity.startswith("account:")
    assert "user-123" not in identity


def test_authenticated_account_and_source_identities_are_independent(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.ABUSE_IDENTITY_HMAC_KEY", "test-key")
    first = _make_request(client_host="203.0.113.10")
    second = _make_request(client_host="203.0.113.10")
    first.scope["headers"] = [
        (b"authorization", f"Bearer {create_access_token('user-1')}".encode())
    ]
    second.scope["headers"] = [
        (b"authorization", f"Bearer {create_access_token('user-2')}".encode())
    ]

    assert _get_abuse_identity(first) != _get_abuse_identity(second)
    assert _get_source_identity(first) == _get_source_identity(second)


def test_invalid_token_falls_back_to_guest_identity(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.ABUSE_IDENTITY_HMAC_KEY", "test-key")
    request = _make_request(client_host="203.0.113.10")
    request.scope["headers"] = [(b"authorization", b"Bearer invalid")]

    assert _get_abuse_identity(request).startswith("guest:")


def test_production_requires_distributed_rate_limit_storage(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.limiter.settings.RATE_LIMIT_STORAGE_URI", "memory://")

    with pytest.raises(RuntimeError, match="shared storage"):
        validate_abuse_control_config()


def test_development_allows_in_memory_rate_limit_storage(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.ENVIRONMENT", "development")
    monkeypatch.setattr("app.limiter.settings.RATE_LIMIT_STORAGE_URI", "memory://")

    validate_abuse_control_config()


def test_resource_import_limit_is_shared_and_returns_429(client, monkeypatch):
    monkeypatch.setattr("app.limiter.settings.RESOURCE_IMPORT_LIMIT", "2/minute")
    limiter._storage.reset()
    scrape = AsyncMock(
        return_value=ImportedJobResponse(
            job_title="Engineer",
            company_name="Example",
            job_description="A safe imported job description.",
            source_url="https://example.com/job",
        )
    )
    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", scrape)
    recorded = []
    monkeypatch.setattr(
        "app.main.record_rate_limit_event",
        lambda **fields: recorded.append(fields),
    )

    responses = [
        client.post(
            "/api/v1/job-posts/import-url",
            json={"url": "https://example.com/job"},
        )
        for _ in range(3)
    ]

    assert [response.status_code for response in responses] == [200, 200, 429]
    assert scrape.await_count == 2
    assert recorded == [{"route_family": "imports", "identity_type": "guest"}]


def test_model_cost_limit_returns_429_before_second_tool_run(
    client, monkeypatch, mock_ai_result
):
    monkeypatch.setattr("app.limiter.settings.MODEL_COST_LIMIT", "1/minute")
    limiter._storage.reset()
    mock_ai_result(
        {
            "summary": {
                "headline": "A useful resume review.",
                "verdict": "Promising",
                "confidence_note": "Directional only.",
            },
            "strengths": ["Clear skills"],
            "issues": [],
        }
    )
    payload = {
        "resume_text": (
            "Professional Summary\nPython engineer.\n"
            "Experience\n- Built APIs.\nSkills\nPython"
        )
    }

    first = client.post("/api/v1/resume/analyze", json=payload)
    second = client.post("/api/v1/resume/analyze", json=payload)

    assert first.status_code == 200
    assert second.status_code == 429


@pytest.mark.asyncio
async def test_auth_failures_add_bounded_progressive_delay_without_lockout(
    monkeypatch,
):
    counts = iter([1, 3, 4, 20])
    sleep = AsyncMock()
    monkeypatch.setattr(
        abuse_counters, "increment", lambda *_args, **_kwargs: next(counts)
    )
    monkeypatch.setattr("app.limiter.anyio.sleep", sleep)

    observed = [
        await record_auth_failure("person@example.com") for _ in range(4)
    ]

    assert observed == [0.0, 0.0, 0.5, 4.0]
    assert [call.args[0] for call in sleep.await_args_list] == [0.5, 4.0]


def test_successful_auth_clears_hashed_failure_counter(monkeypatch):
    cleared = []
    monkeypatch.setattr(
        abuse_counters,
        "clear",
        lambda namespace, identity: cleared.append((namespace, identity)),
    )

    clear_auth_failures("person@example.com")

    assert len(cleared) == 1
    assert cleared[0] == ("auth-failure", "person@example.com")


def test_counter_store_hashes_identity_and_passes_expiry(monkeypatch):
    observed = {}

    def increment(key, *, expiry):
        observed.update(key=key, expiry=expiry)
        return 1

    monkeypatch.setattr(abuse_counters._storage, "incr", increment)

    abuse_counters.increment("test", "person@example.com", expiry=42)

    assert observed["expiry"] == 42
    assert "person@example.com" not in observed["key"]


@pytest.mark.asyncio
async def test_account_pressure_delays_without_blocking_action(monkeypatch):
    counts = iter([1, 3, 4, 20])
    sleep = AsyncMock()
    monkeypatch.setattr(
        abuse_counters, "increment", lambda *_args, **_kwargs: next(counts)
    )
    monkeypatch.setattr("app.limiter.anyio.sleep", sleep)

    observed = [
        await record_account_pressure("password-reset", "person@example.com")
        for _ in range(4)
    ]

    assert observed == [0.0, 0.0, 0.5, 2.0]
    assert [call.args[0] for call in sleep.await_args_list] == [0.5, 2.0]


def test_registration_account_pressure_does_not_block_registration(
    client, monkeypatch
):
    monkeypatch.setattr(
        "app.routers.auth.record_account_pressure",
        AsyncMock(return_value=2.0),
    )

    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "person@example.com",
            "password": "password123",
            "tos_accepted": True,
        },
    )

    assert response.status_code == 201


def test_password_reset_account_pressure_never_suppresses_recovery_email(
    client, test_user, monkeypatch
):
    send = AsyncMock()
    monkeypatch.setattr(
        "app.routers.auth.record_account_pressure",
        AsyncMock(return_value=2.0),
    )
    monkeypatch.setattr("app.routers.auth.send_password_reset_email", send)

    response = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": test_user.email},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "If an account with this email exists, a reset link has been sent."
    }
    send.assert_awaited_once()
