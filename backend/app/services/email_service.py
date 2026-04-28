import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def _send_resend_sync(to_email: str, reset_url: str) -> None:
    """Synchronous resend.Emails.send call, safe to off-load with asyncio.to_thread."""
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
    except Exception:
        logger.exception("Failed to send password reset email to %s", to_email)
        return False
