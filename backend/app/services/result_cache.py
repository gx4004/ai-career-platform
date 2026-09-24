"""In-memory result cache with TTL and a bounded LRU.

Caches tool results by content hash to avoid redundant LLM calls for
identical inputs. Uses SHA-256 of normalized inputs as cache key.

Contract (ADR 0004 / D-054): this is an optional, **fail-open acceleration
layer**. A miss, an eviction, an expiry, or an internal error costs a model call
and nothing else — it must never raise into a request, change a response body,
or influence ownership, authorization, persistence, or regeneration.

Capacity: values are complete tool payloads (resume-derived text and generated
career content), so the mapping is bounded by entry count and evicts the least
recently *used* entry at the bound. Expired entries are swept on every write,
so an entry whose key is never read again cannot linger for the life of the
process. See `RESULT_CACHE_MAX_ENTRIES` in `app/config.py` for the sizing.

Note: This is an in-memory implementation that does not survive process
restarts or scale across instances. A shared/distributed backend is an
explicitly deferred decision (ADR 0004) and requires its own sensitive-data and
lifecycle review — it is not a drop-in swap.

There is deliberately no lock. The pipeline touches the cache from the event
loop, and the worst outcome of a race with a threadpool caller is a lost write
or an extra miss — both already inside the fail-open contract.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections import OrderedDict
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Insertion order doubles as recency order: a hit moves its entry to the end, so
# the front of the mapping is always the least recently used entry. `admin.py`
# reports `len(_cache)` on the health endpoint; OrderedDict keeps that working.
_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()

# Fallback if the settings key is somehow absent (older env, partial config
# reload). Keeping the cache bounded matters more than honouring the exact
# number, and a missing key must not turn into an unbounded mapping.
_DEFAULT_MAX_ENTRIES = 512


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


def _max_entries() -> int:
    """Configured entry bound, defensively coerced to a positive integer."""
    configured = getattr(settings, "RESULT_CACHE_MAX_ENTRIES", _DEFAULT_MAX_ENTRIES)
    try:
        bound = int(configured)
    except (TypeError, ValueError):
        return _DEFAULT_MAX_ENTRIES
    return bound if bound > 0 else 0


def _purge_expired(now: float) -> int:
    """Drop every expired entry, not only the key currently being read.

    Expiry used to be observable only through a lookup of that exact key, so a
    workload with many distinct inputs retained dead payloads indefinitely. The
    sweep is O(len(_cache)) and the mapping is bounded, so it stays cheap next
    to the LLM call it accelerates.
    """
    expired = [key for key, (expires_at, _) in _cache.items() if now > expires_at]
    for key in expired:
        _cache.pop(key, None)
    return len(expired)


def _evict_to_bound(max_entries: int) -> None:
    """Evict least-recently-used entries until the mapping fits the bound."""
    while len(_cache) > max_entries:
        _cache.popitem(last=False)


def get_cached_result(
    content_hash: str,
    *,
    now: float | None = None,
) -> dict[str, Any] | None:
    """Return the cached result if it exists and hasn't expired, else ``None``.

    ``now`` overrides the clock for tests; production callers omit it. Any
    internal failure degrades to a miss (ADR 0004) rather than propagating.
    """
    try:
        if not settings.RESULT_CACHE_ENABLED:
            return None

        current = time.time() if now is None else now

        entry = _cache.get(content_hash)
        if entry is None:
            return None

        expires_at, result = entry
        if current > expires_at:
            _cache.pop(content_hash, None)
            return None

        # Mark as most recently used so the LRU bound evicts cold entries first.
        _cache.move_to_end(content_hash)
        return result
    except Exception:  # noqa: BLE001 — cache is a disposable acceleration layer
        # No key, payload, or hash in the log line: cached values sit inside the
        # same sensitive-data boundary as ToolRun.result_payload (D-054).
        logger.warning("Result cache lookup failed; serving as a cache miss", exc_info=True)
        return None


def set_cached_result(
    content_hash: str,
    result: dict[str, Any],
    ttl: int | None = None,
    *,
    now: float | None = None,
) -> None:
    """Store a result with TTL, sweeping expired entries and enforcing the bound.

    Best-effort by contract: a full cache, an eviction failure, or any other
    internal error is swallowed so the caller's response is unaffected.
    """
    try:
        if not settings.RESULT_CACHE_ENABLED:
            return

        current = time.time() if now is None else now
        actual_ttl = ttl if ttl is not None else settings.RESULT_CACHE_TTL_SECONDS
        max_entries = _max_entries()

        # Reclaim dead payloads first: the write path is the only path that
        # grows the mapping, so it is also where retention is enforced.
        _purge_expired(current)

        if max_entries <= 0:
            # A non-positive bound means "hold nothing"; behave as disabled.
            _cache.clear()
            return

        _cache[content_hash] = (current + actual_ttl, result)
        _cache.move_to_end(content_hash)
        _evict_to_bound(max_entries)
    except Exception:  # noqa: BLE001 — cache write is best-effort
        logger.warning("Result cache write failed; result is not cached", exc_info=True)


def purge_expired(now: float | None = None) -> int:
    """Reclaim every expired entry and return how many were dropped.

    Lets an operator or a future maintenance hook reclaim memory without
    replaying the exact keys. Fail-open: returns 0 if the sweep itself fails.
    """
    try:
        return _purge_expired(time.time() if now is None else now)
    except Exception:  # noqa: BLE001 — reclamation is best-effort
        logger.warning("Result cache purge failed; entries left in place", exc_info=True)
        return 0


def clear_cache() -> None:
    """Clear the entire cache. Useful for testing."""
    _cache.clear()
