import asyncio
import logging

import sentry_sdk

from app.config import settings

logger = logging.getLogger(__name__)


def _send_resend_sync(to_email: str, reset_url: str) -> None:
    """Synchronous resend.Emails.send call, safe to off-load with asyncio.to_thread.

    The Resend Python SDK only supports module-level configuration
    (`resend.api_key = ...`); there is no per-instance Client object. Two
    concurrent worker threads would briefly race on this assignment, but
    because `settings.RESEND_API_KEY` is a constant for the process lifetime
    they always write the identical value, so the race is benign. If a
    multi-tenant Resend usage pattern ever appears, switch to the SDK's
    `default_http_client` swap or wrap the call in a process-wide lock.
    """
    import resend

    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send(
        {
            "from": settings.PASSWORD_RESET_FROM_EMAIL,
            "to": [to_email],
            "subject": "Reset your Career Workbench password",
            "html": (
                "<h2>Password Reset</h2>"
                "<p>You requested a password reset for your Career Workbench account.</p>"
                f'<p><a href="{reset_url}">Click here to reset your password</a></p>'
                f"<p>This link expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>"
                "<p>If you didn't request this, you can safely ignore this email.</p>"
            ),
        }
    )


async def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning(
            "RESEND_API_KEY not configured — skipping password reset email to %s", to_email
        )
        return False

    # Off-load the sync resend SDK call to a worker thread so it does not
    # block the event loop while waiting on Resend's HTTPS round-trip.
    try:
        await asyncio.to_thread(_send_resend_sync, to_email, reset_url)
        return True
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logger.exception("Failed to send password reset email to %s", to_email)
        return False
