"""In-memory tool-result cache with a TTL and a least-recently-used entry bound.

An optional, fail-open acceleration layer (ADR 0004): the tool pipeline treats a
lookup or write error as a miss, so nothing here may change a response. Values
are complete tool payloads, so the mapping is bounded by
`RESULT_CACHE_MAX_ENTRIES` and expired entries are swept on every write. The
cache is process-local; it does not survive restarts or span instances.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any

from app.config import settings

# Insertion order doubles as recency order: a hit moves its entry to the end, so
# the front is always the least recently used entry. The admin health endpoint
# reports `len(_cache)`.
_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


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
    """Return the cached result if present and unexpired, else ``None``."""
    entry = _cache.get(content_hash)
    if entry is None:
        return None
    expires_at, result = entry
    if time.time() > expires_at:
        del _cache[content_hash]
        return None
    _cache.move_to_end(content_hash)
    return result


def set_cached_result(content_hash: str, result: dict[str, Any]) -> None:
    """Store a result, sweeping expired entries and evicting down to the bound."""
    now = time.time()
    for key in [key for key, (expires_at, _) in _cache.items() if now > expires_at]:
        del _cache[key]
    _cache[content_hash] = (now + settings.RESULT_CACHE_TTL_SECONDS, result)
    _cache.move_to_end(content_hash)
    while len(_cache) > settings.RESULT_CACHE_MAX_ENTRIES:
        _cache.popitem(last=False)


def clear_cache() -> None:
    """Clear the entire cache."""
    _cache.clear()
