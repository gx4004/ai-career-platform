from __future__ import annotations

import httpx

from app.config import settings


async def verify_captcha(token: str) -> bool:
    """Verify a CAPTCHA token with the provider (Google reCAPTCHA v2/v3)."""
    if not settings.CAPTCHA_ENABLED:
        return True

    if not settings.CAPTCHA_SECRET_KEY:
        return True

    if not token:
        return False

    async with httpx.AsyncClient() as client:
        response = await client.post(
            settings.CAPTCHA_VERIFY_URL,
            data={
                "secret": settings.CAPTCHA_SECRET_KEY,
                "response": token,
            },
        )
        if response.status_code != 200:
            return False

        result = response.json()
        return result.get("success", False)
