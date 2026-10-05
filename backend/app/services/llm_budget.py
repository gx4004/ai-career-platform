"""Circuit breaker for anonymous (guest) model usage.

Guests need no account, so nothing but this bounds how many model calls the
public demo can trigger in a day. The cap is generous on purpose: it exists to
stop a runaway bill, not to meter users. It is process-local (a restart or a
second worker has its own counter) and signed-in users are never affected.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

_day: str | None = None
_count = 0


def _seconds_until_utc_midnight(now: datetime) -> int:
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((tomorrow - now).total_seconds()))


def reserve_anonymous_model_call() -> None:
    """Count one anonymous model call, or raise a friendly 503 once the day's cap is spent."""
    global _day, _count
    limit = settings.ANONYMOUS_LLM_DAILY_LIMIT
    if limit <= 0:
        return
    now = datetime.now(UTC)
    today = now.date().isoformat()
    if _day != today:
        _day, _count = today, 0
    if _count >= limit:
        logger.warning("Anonymous model-call breaker open limit=%d", limit)
        raise HTTPException(
            status_code=503,
            detail=(
                "The free demo has reached its daily limit. Sign in to keep going "
                "or try again tomorrow."
            ),
            headers={"Retry-After": str(_seconds_until_utc_midnight(now))},
        )
    _count += 1


def reset_anonymous_budget() -> None:
    """Forget today's count (tests)."""
    global _day, _count
    _day, _count = None, 0
