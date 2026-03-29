"""In-memory result cache with TTL.

Caches tool results by content hash to avoid redundant LLM calls for
identical inputs. Uses SHA-256 of normalized inputs as cache key.

Note: This is an in-memory implementation that does not survive process
restarts or scale across instances. Migrate to Redis/Vercel KV for
production at scale.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from app.config import settings

_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def compute_content_hash(
    tool_name: str,
    resume_text: str,
    job_description: str | None = None,
    **kwargs: Any,
) -> str:
    """Compute a deterministic SHA-256 hash of the normalized inputs."""
    normalized = {
        "tool": tool_name,
        "resume": resume_text.strip().lower(),
        "jd": (job_description or "").strip().lower(),
        **{k: v for k, v in sorted(kwargs.items()) if v is not None},
    }
    content = json.dumps(normalized, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(content.encode()).hexdigest()


def get_cached_result(content_hash: str) -> dict[str, Any] | None:
    """Return cached result if it exists and hasn't expired."""
    if not settings.RESULT_CACHE_ENABLED:
        return None

    entry = _cache.get(content_hash)
    if entry is None:
        return None

    expires_at, result = entry
    if time.time() > expires_at:
        _cache.pop(content_hash, None)
        return None

    return result


def set_cached_result(
    content_hash: str,
    result: dict[str, Any],
    ttl: int | None = None,
) -> None:
    """Store a result in the cache with TTL."""
    if not settings.RESULT_CACHE_ENABLED:
        return

    actual_ttl = ttl if ttl is not None else settings.RESULT_CACHE_TTL_SECONDS
    _cache[content_hash] = (time.time() + actual_ttl, result)


def clear_cache() -> None:
    """Clear the entire cache. Useful for testing."""
    _cache.clear()
