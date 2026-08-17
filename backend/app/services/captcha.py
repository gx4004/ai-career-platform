from __future__ import annotations

import logging
from enum import StrEnum

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# The only challenge provider the client integration knows how to satisfy.
# Advertised to the frontend so a deployment cannot silently require a
# challenge the register form has no way to produce.
CAPTCHA_PROVIDER = "recaptcha"

# A registration must not hang on the provider. Verification is a small
# server-to-server POST; anything slower than this is an outage, not latency,
# and the caller fails closed rather than holding the request open.
CAPTCHA_TIMEOUT_SECONDS = 5.0


class CaptchaVerdict(StrEnum):
    """Tri-state outcome of a challenge check.

    `REJECTED` and `UNAVAILABLE` are both failures, but they are different
    failures: one is "you did not pass the challenge", the other is "we could
    not ask". Callers need the distinction to log and alert correctly even when
    they deliberately answer both with the same client-visible response.
    """

    VERIFIED = "verified"
    REJECTED = "rejected"
    UNAVAILABLE = "unavailable"


def challenge_provider() -> str | None:
    """The challenge provider a client must satisfy, or None when disabled."""
    return CAPTCHA_PROVIDER if settings.CAPTCHA_ENABLED else None


async def verify_captcha(token: str) -> CaptchaVerdict:
    """Verify a CAPTCHA token with the provider (Google reCAPTCHA v2/v3)."""
    if not settings.CAPTCHA_ENABLED:
        return CaptchaVerdict.VERIFIED

    if not settings.CAPTCHA_SECRET_KEY:
        # Enabled but unconfigured: the challenge cannot be asked at all.
        logger.warning("CAPTCHA is enabled but CAPTCHA_SECRET_KEY is not configured")
        return CaptchaVerdict.UNAVAILABLE

    if not token:
        return CaptchaVerdict.REJECTED

    try:
        async with httpx.AsyncClient(timeout=CAPTCHA_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.CAPTCHA_VERIFY_URL,
                data={
                    "secret": settings.CAPTCHA_SECRET_KEY,
                    "response": token,
                },
            )
    except (httpx.HTTPError, httpx.InvalidURL, httpx.CookieConflict) as exc:
        # Timeouts, connection failures, protocol errors, and a misconfigured
        # verify URL are all "we could not ask". Log the class only — provider
        # prose never reaches a caller or a client.
        logger.warning("CAPTCHA provider request failed: %s", type(exc).__name__)
        return CaptchaVerdict.UNAVAILABLE

    if response.status_code != 200:
        logger.warning("CAPTCHA provider returned HTTP %s", response.status_code)
        return CaptchaVerdict.UNAVAILABLE

    try:
        result = response.json()
    except ValueError:
        logger.warning("CAPTCHA provider returned a non-JSON body")
        return CaptchaVerdict.UNAVAILABLE

    if not isinstance(result, dict):
        logger.warning("CAPTCHA provider returned an unexpected payload shape")
        return CaptchaVerdict.UNAVAILABLE

    return CaptchaVerdict.VERIFIED if result.get("success") is True else CaptchaVerdict.REJECTED
