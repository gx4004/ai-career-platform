"""Length advice for a rendered CV (spec docs/cv-templates-spec.md D5): plain sentences, no scores.

One page is the norm for people with under about eight years of experience; mid and senior
CVs are fine at two. The advice is only ever a suggestion: a CV just over a page for a
junior reader offers "fit to one page" (the user's choice), two pages for anyone else says
nothing, and a longer CV gets neutral guidance. Pure functions; the preview endpoint feeds
them the real page count and the ink height of the last page.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

import fitz

SENIOR_YEARS = 8.0
# A second page up to about this full counts as "just over a page".
JUST_OVER_FILL = 0.3

_MONTHS = {m: i for i, m in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
_YEAR = r"(?:19|20)\d{2}"
_POINT = re.compile(
    rf"(?:(?P<month>[A-Za-z]{{3,9}})\.?\s+)?(?P<year>{_YEAR})|(?P<num>\d{{1,2}})/(?P<nyear>{_YEAR})"
)
_OPEN_END = re.compile(r"\b(present|current|now|today|ongoing)\b", re.IGNORECASE)
_SEPARATOR = re.compile(r"\s*(?:[–—-]|\bto\b|\buntil\b)\s*", re.IGNORECASE)


@dataclass(frozen=True)
class LengthAdvice:
    code: str
    message: str
    # The one-click action the advice offers, if any.
    action: str | None = None


def _month_index(text: str, today: date) -> float | None:
    """A date as months since year 0 (a bare year counts from its start), or None."""
    if _OPEN_END.search(text):
        return today.year * 12 + today.month - 1
    match = _POINT.search(text)
    if not match:
        return None
    if match["num"]:
        month, year = int(match["num"]), int(match["nyear"])
        return year * 12 + min(max(month, 1), 12) - 1
    month = _MONTHS.get((match["month"] or "")[:3].lower())
    return int(match["year"]) * 12 + ((month or 1) - 1)


def _interval(dates: str, today: date) -> tuple[float, float] | None:
    parts = _SEPARATOR.split(dates.strip(), maxsplit=1)
    start = _month_index(parts[0], today)
    if start is None:
        return None
    end = _month_index(parts[1], today) if len(parts) > 1 else start
    if end is None or end < start:
        return None
    return start, end


def years_of_experience(sections, *, today: date | None = None) -> float | None:
    """Years covered by the dated experience entries (overlaps counted once), or None when
    no entry has dates that read. ``sections`` are render sections (kind, entries with dates)."""
    today = today or date.today()
    spans = []
    for section in sections:
        if getattr(section, "kind", None) != "experience":
            continue
        for entry in section.entries:
            if entry.dates and (span := _interval(entry.dates, today)):
                spans.append(span)
    if not spans:
        return None
    spans.sort()
    total, (start, end) = 0.0, spans[0]
    for next_start, next_end in spans[1:]:
        if next_start <= end:
            end = max(end, next_end)
        else:
            total, start, end = total + (end - start), next_start, next_end
    return round((total + (end - start)) / 12, 1)


def length_advice(
    pages: int, last_page_fill: float, years: float | None, *, fit_one_page: bool = False
) -> LengthAdvice | None:
    """The sentence worth saying about this length, or None. ``last_page_fill`` is how far
    down its printable area the last page is inked (0..1)."""
    if pages <= 1:
        return None
    if pages > 2:
        return LengthAdvice(
            "long",
            f"This CV runs to {pages} pages. Most readers decide on the first two, "
            "so lead with your strongest work.",
        )
    junior = years is None or years < SENIOR_YEARS
    if junior and last_page_fill <= JUST_OVER_FILL and not fit_one_page:
        length = f"{1 + last_page_fill:.1f}"
        return LengthAdvice(
            "just_over_one_page",
            f"Runs to {length} pages. One page is the usual length early in a career, "
            "so you may want to fit it to one page.",
            action="fit_one_page",
        )
    return None


def last_page_fill(pdf: bytes, top_mm: float, bottom_mm: float) -> float:
    """How far down the printable area the last page's text reaches (0..1)."""
    with fitz.open(stream=pdf, filetype="pdf") as document:
        page = document[len(document) - 1]
        top = top_mm / 25.4 * 72
        printable = page.rect.height - top - bottom_mm / 25.4 * 72
        lowest = max((b[3] for b in page.get_text("blocks")), default=top)
        return round(min(max((lowest - top) / printable, 0.0), 1.0), 3)
