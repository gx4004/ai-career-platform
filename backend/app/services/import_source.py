"""Job-import source-family mapping + request-scoped outcome (issue #136).

The R10 job-import concentration trigger (D-059) must measure import reliability
by an *allowlisted source family*, never by full URL — raw hostnames and paths
can carry identifying data. This module is the local mapping seam: it turns a
URL into one bounded family label (or `other`) and then the caller discards the
raw URL before any analytics row is written.

`scrape_job_posting` records what actually happened into a request-scoped
`ContextVar` (#142): the first-tier HTTP fetch producing a substantive posting is
`success`, a first-tier fetch and parse that work but yield a short description
are `success_low_quality`, the bounded Playwright fallback is `fallback`, and
each failure the scraper can distinguish carries its bounded
`ImportFailureCategory`. The import router maps the family from the URL it
already holds, reads the outcome, and emits one `r10_import_outcome` event
carrying only the family + outcome class. Consumers asking the coarse question
"did this import fail?" test membership in `IMPORT_FAILURE_OUTCOMES`
(`app/schemas/analytics.py`) rather than comparing against the bare `failure`
literal.
"""
from __future__ import annotations

from contextvars import ContextVar
from urllib.parse import urlparse

# Single source of truth for the closed family/outcome sets is the allowlist
# schema, so the mapper and the write seam can never drift apart (#136 review).
from app.schemas.analytics import ImportOutcome, ImportSourceFamily

# Hostname-substring → allowlisted family. Deliberately small and closed: an
# unrecognised ATS/careers host maps to the single bounded `other` bucket, which
# is exactly what the concentration trigger needs to decide whether any one
# family dominates. Order is irrelevant — matches are by substring membership.
_FAMILY_HOST_MARKERS: tuple[tuple[str, ImportSourceFamily], ...] = (
    ("greenhouse.io", "greenhouse"),
    ("lever.co", "lever"),
    ("myworkdayjobs.com", "workday"),
    ("workday.com", "workday"),
    ("ashbyhq.com", "ashby"),
    ("smartrecruiters.com", "smartrecruiters"),
)

# Request-scoped import outcome for the current import attempt. `None` until the
# scraper records which tier produced the result.
_import_outcome: ContextVar[ImportOutcome | None] = ContextVar(
    "import_outcome", default=None
)


def map_source_family(url: str) -> ImportSourceFamily:
    """Map a job-posting URL to one allowlisted source family.

    Only the lowercased hostname is inspected, and only to select a closed-set
    label; the raw hostname/path/query is never returned or stored. Anything not
    matching a known ATS marker — including an unparseable URL — becomes `other`.
    """
    try:
        hostname = (urlparse(url).hostname or "").lower()
    except ValueError:
        return "other"
    for marker, family in _FAMILY_HOST_MARKERS:
        if marker in hostname:
            return family
    return "other"


def reset_import_outcome() -> None:
    """Clear the accumulator for the current import request."""
    _import_outcome.set(None)


def set_import_outcome(outcome: ImportOutcome) -> None:
    """Record which tier produced the current import's result."""
    _import_outcome.set(outcome)


def get_import_outcome() -> ImportOutcome | None:
    """Return the recorded import outcome, or `None` if none was recorded."""
    return _import_outcome.get()
