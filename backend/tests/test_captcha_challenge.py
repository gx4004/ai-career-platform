"""Registration challenge contract: advertisement, provider failure, and ordering.

Three defects motivate this file:

1. `CAPTCHA_ENABLED=true` was unreachable for real clients — the register form
   never obtained a token, so enabling the flag rejected every registration.
   The deployment now advertises the requirement on `GET /auth/providers`,
   the same endpoint that already tells the client which OAuth providers are
   configured.
2. The provider call had no timeout and no error handling, so an outage
   surfaced as an unhandled 500. Verification is now tri-state
   (verified / rejected / provider unavailable) and the router fails closed on
   "we could not ask", matching the existing enabled-but-unconfigured posture.
3. The duplicate-email 409 was returned *before* the challenge ran, so the
   challenge never protected the case it exists for. The challenge is now
   satisfied before any response that reveals whether an address exists.
"""

import httpx
import pytest

from app.config import settings
from app.models.user import User

PREFIX = "/api/v1/auth"

VALID_PROVIDER_REPLY = {"success": True}
REJECTING_PROVIDER_REPLY = {"success": False, "error-codes": ["invalid-input-response"]}


class _FakeProviderResponse:
    """Minimal stand-in for the provider's HTTP response."""

    def __init__(self, status_code: int, payload=None, *, malformed_json: bool = False):
        self.status_code = status_code
        self._payload = payload
        self._malformed_json = malformed_json

    def json(self):
        if self._malformed_json:
            raise ValueError("Expecting value: line 1 column 1 (char 0)")
        return self._payload


@pytest.fixture
def provider(monkeypatch):
    """Intercept the outbound provider call and record every attempt.

    `calls` is the ordering evidence: it proves whether the challenge ran
    before the endpoint produced its response.
    """
    state = {"calls": [], "responder": None}

    async def fake_post(self, url, **kwargs):
        state["calls"].append({"url": url, "data": kwargs.get("data")})
        responder = state["responder"]
        if responder is None:
            raise AssertionError("provider was contacted without an installed responder")
        return responder()

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return state


@pytest.fixture
def challenge_enabled(monkeypatch):
    monkeypatch.setattr(settings, "CAPTCHA_ENABLED", True)
    monkeypatch.setattr(settings, "CAPTCHA_SECRET_KEY", "test-secret")


def _accepts():
    return lambda: _FakeProviderResponse(200, VALID_PROVIDER_REPLY)


def _rejects():
    return lambda: _FakeProviderResponse(200, REJECTING_PROVIDER_REPLY)


def _register(client, email: str, **extra):
    body = {"email": email, "password": "secret123", "tos_accepted": True}
    body.update(extra)
    return client.post(f"{PREFIX}/register", json=body)


# --- 1. advertisement -------------------------------------------------------


def test_challenge_is_advertised_as_off_by_default(client):
    response = client.get(f"{PREFIX}/providers")

    assert response.status_code == 200
    body = response.json()
    assert body["providers"] == []
    assert body["captcha_required"] is False
    assert body["captcha_provider"] is None


def test_enabled_challenge_is_advertised_without_leaking_the_secret(
    client, challenge_enabled
):
    response = client.get(f"{PREFIX}/providers")

    assert response.status_code == 200
    body = response.json()
    assert body["captcha_required"] is True
    assert body["captcha_provider"] == "recaptcha"
    assert "test-secret" not in response.text


# --- 2. disabled challenge behaves exactly as before ------------------------


def test_disabled_challenge_registers_without_contacting_a_provider(client, provider, db):
    response = _register(client, "plain@example.com", full_name="Plain")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "plain@example.com"
    assert body["full_name"] == "Plain"
    assert body["is_active"] is True
    assert provider["calls"] == []
    assert db.query(User).filter(User.email == "plain@example.com").first() is not None


def test_disabled_challenge_ignores_a_supplied_token(client, provider):
    response = _register(client, "ignored-token@example.com", captcha_token="whatever")

    assert response.status_code == 201
    assert provider["calls"] == []


# --- 3. enabled challenge: happy path and missing token ---------------------


def test_enabled_challenge_accepts_registration_with_a_valid_token(
    client, challenge_enabled, provider, db
):
    provider["responder"] = _accepts()

    response = _register(client, "verified@example.com", captcha_token="browser-token")

    assert response.status_code == 201
    assert len(provider["calls"]) == 1
    assert provider["calls"][0]["data"]["response"] == "browser-token"
    assert db.query(User).filter(User.email == "verified@example.com").first() is not None


def test_enabled_challenge_rejects_registration_without_a_token(
    client, challenge_enabled, provider, db
):
    response = _register(client, "tokenless@example.com")

    assert response.status_code == 400
    assert response.json() == {"detail": "CAPTCHA token is required"}
    assert provider["calls"] == []
    assert db.query(User).filter(User.email == "tokenless@example.com").first() is None


def test_enabled_challenge_rejects_a_token_the_provider_refuses(
    client, challenge_enabled, provider, db
):
    provider["responder"] = _rejects()

    response = _register(client, "refused@example.com", captcha_token="stale-token")

    assert response.status_code == 400
    assert response.json() == {"detail": "CAPTCHA verification failed"}
    assert len(provider["calls"]) == 1
    assert db.query(User).filter(User.email == "refused@example.com").first() is None


# --- 4. provider outage fails closed, never 500 -----------------------------


def _raise(exc: Exception):
    def responder():
        raise exc

    return responder


@pytest.mark.parametrize(
    "responder,label",
    [
        (_raise(httpx.TimeoutException("timed out waiting for siteverify")), "timeout"),
        (_raise(httpx.ConnectError("nodename nor servname provided")), "connect-error"),
        (lambda: _FakeProviderResponse(503, {"error": "upstream unavailable"}), "http-503"),
        (lambda: _FakeProviderResponse(200, None, malformed_json=True), "malformed-json"),
    ],
)
def test_provider_outage_fails_closed_without_leaking_detail(
    client, challenge_enabled, provider, db, responder, label
):
    provider["responder"] = responder
    email = f"outage-{label}@example.com"

    response = _register(client, email, captcha_token="browser-token")

    assert response.status_code == 400
    assert response.json() == {"detail": "CAPTCHA verification failed"}
    # No stack trace, provider prose, exception class, or secret in the body.
    for leak in (
        "Traceback",
        "timed out",
        "nodename",
        "upstream unavailable",
        "Expecting value",
        "httpx",
        "siteverify",
        "test-secret",
    ):
        assert leak not in response.text
    assert db.query(User).filter(User.email == email).first() is None


# --- 5. enumeration ordering ------------------------------------------------


def test_duplicate_email_is_not_revealed_before_the_challenge_is_satisfied(
    client, challenge_enabled, provider, test_user
):
    """The 409 oracle must be unreachable until the challenge passes.

    Ordering is asserted directly: a request that never satisfies the
    challenge must not reach the existence check, and must not be answered
    with a response that distinguishes a registered address.
    """
    tokenless = _register(client, test_user.email)

    assert tokenless.status_code == 400
    assert tokenless.json() == {"detail": "CAPTCHA token is required"}
    assert "already registered" not in tokenless.text
    assert provider["calls"] == []

    provider["responder"] = _rejects()
    refused = _register(client, test_user.email, captcha_token="stale-token")

    assert refused.status_code == 400
    assert refused.json() == {"detail": "CAPTCHA verification failed"}
    assert "already registered" not in refused.text
    # The challenge ran; the existence check did not answer first.
    assert len(provider["calls"]) == 1


def test_duplicate_email_still_conflicts_once_the_challenge_is_satisfied(
    client, challenge_enabled, provider, test_user
):
    provider["responder"] = _accepts()

    response = _register(client, test_user.email, captcha_token="browser-token")

    assert response.status_code == 409
    assert "already registered" in response.json()["detail"]
    # Ordering evidence: the conflict was produced *after* the challenge ran.
    assert len(provider["calls"]) == 1


def test_disposable_email_is_not_revealed_before_the_challenge_is_satisfied(
    client, challenge_enabled, provider, monkeypatch
):
    monkeypatch.setattr(settings, "DISPOSABLE_EMAIL_BLOCK_ENABLED", True)
    provider["responder"] = _rejects()

    response = _register(client, "throwaway@mailinator.com", captcha_token="stale-token")

    assert response.status_code == 400
    assert response.json() == {"detail": "CAPTCHA verification failed"}
    assert len(provider["calls"]) == 1


# --- 6. the service contract itself -----------------------------------------


async def test_verify_captcha_reports_verified_and_rejected_distinctly(
    challenge_enabled, provider
):
    from app.services.captcha import CaptchaVerdict, verify_captcha

    provider["responder"] = _accepts()
    assert await verify_captcha("browser-token") is CaptchaVerdict.VERIFIED

    provider["responder"] = _rejects()
    assert await verify_captcha("stale-token") is CaptchaVerdict.REJECTED


async def test_verify_captcha_reports_provider_unavailable_separately(
    challenge_enabled, provider
):
    from app.services.captcha import CaptchaVerdict, verify_captcha

    provider["responder"] = _raise(httpx.TimeoutException("timed out"))
    assert await verify_captcha("browser-token") is CaptchaVerdict.UNAVAILABLE

    provider["responder"] = lambda: _FakeProviderResponse(500, {})
    assert await verify_captcha("browser-token") is CaptchaVerdict.UNAVAILABLE


async def test_verify_captcha_treats_missing_configuration_as_unavailable(
    monkeypatch, provider
):
    from app.services.captcha import CaptchaVerdict, verify_captcha

    monkeypatch.setattr(settings, "CAPTCHA_ENABLED", True)
    monkeypatch.setattr(settings, "CAPTCHA_SECRET_KEY", "")

    assert await verify_captcha("browser-token") is CaptchaVerdict.UNAVAILABLE
    assert provider["calls"] == []


async def test_verify_captcha_bounds_the_provider_call_with_a_timeout(
    challenge_enabled, monkeypatch
):
    from app.services.captcha import CAPTCHA_TIMEOUT_SECONDS, verify_captcha

    seen = {}
    real_init = httpx.AsyncClient.__init__

    def recording_init(self, *args, **kwargs):
        seen["timeout"] = kwargs.get("timeout")
        real_init(self, *args, **kwargs)

    async def fake_post(self, url, **kwargs):
        return _FakeProviderResponse(200, VALID_PROVIDER_REPLY)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", recording_init)
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    await verify_captcha("browser-token")

    assert seen["timeout"] is not None
    assert CAPTCHA_TIMEOUT_SECONDS > 0
