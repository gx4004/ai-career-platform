"""Map a job-posting URL to a bounded source-family label.

Campaign listing events record which ATS family a listing came from without
storing the raw hostname or path.
"""
from __future__ import annotations

from typing import Literal
from urllib.parse import urlparse

ImportSourceFamily = Literal[
    "greenhouse",
    "lever",
    "workday",
    "ashby",
    "smartrecruiters",
    "other",
]

_FAMILY_HOST_MARKERS: tuple[tuple[str, ImportSourceFamily], ...] = (
    ("greenhouse.io", "greenhouse"),
    ("lever.co", "lever"),
    ("myworkdayjobs.com", "workday"),
    ("workday.com", "workday"),
    ("ashbyhq.com", "ashby"),
    ("smartrecruiters.com", "smartrecruiters"),
)


def map_source_family(url: str) -> ImportSourceFamily:
    """Return the allowlisted family for `url`, or `other` (also for unparseable URLs)."""
    try:
        hostname = (urlparse(url).hostname or "").lower()
    except ValueError:
        return "other"
    for marker, family in _FAMILY_HOST_MARKERS:
        if marker in hostname:
            return family
    return "other"
