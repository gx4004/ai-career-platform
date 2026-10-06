"""Per-route request limits.

slowapi's in-memory per-route limits, keyed by ``request.client``. Behind a
proxy that is the proxy's address unless uvicorn is told to trust it: start.sh
runs uvicorn with ``--proxy-headers --forwarded-allow-ips $FORWARDED_ALLOW_IPS``
(default loopback only), so the key becomes the client the trusted hop reported
in X-Forwarded-For and a forged header from an untrusted peer is ignored.
Storage is per process; shared storage is an open owner decision before a
multi-instance launch.
"""

import math
import time

from fastapi import Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)


def _retry_after_seconds(request: Request, exc: RateLimitExceeded) -> int:
    """Seconds until the window that was hit frees up (at least 1)."""
    try:
        limit_item, args = request.state.view_rate_limit
        reset_at, _remaining = limiter.limiter.get_window_stats(limit_item, *args)
        return max(1, math.ceil(reset_at - time.time()))
    except Exception:
        # Fall back to the whole window rather than failing the 429 itself.
        return max(1, int(exc.limit.limit.get_expiry()))


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """429 with a stable body clients can show: {code, message, retry_after}.

    ``detail`` repeats the message because existing clients read only that key.
    """
    retry_after = _retry_after_seconds(request, exc)
    message = f"Too many attempts. Try again in {_human_wait(retry_after)}."
    return JSONResponse(
        {
            "code": "rate_limited",
            "message": message,
            "retry_after": retry_after,
            "detail": message,
        },
        status_code=429,
        headers={"Retry-After": str(retry_after)},
    )


def _human_wait(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    minutes = math.ceil(seconds / 60)
    return f"{minutes} minute{'s' if minutes != 1 else ''}"
