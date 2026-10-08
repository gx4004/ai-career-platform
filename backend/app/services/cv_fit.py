"""Fit to one page (spec docs/cv-templates-spec.md D5, 3.4).

When ``style.fit_one_page`` is on, the CV is printed at a uniform scale chosen by searching
with the real Chromium render: 1.0 first, then the floor, then a binary search between them.
The scale multiplies the density type and gap scales (``--fit-scale`` in ``cv_html``); the
templates clamp their body size with ``--body-min`` so the body never drops under 9pt, which
means below about 0.9 only the spacing keeps shrinking. Page margins are never touched (they
are already at or under the 12mm floor on the templates that have the least room to give).

Never forced and never lossy: a CV that does not fit at the floor is printed at the floor and
reported as "runs to N pages"; nothing is truncated. At most ``MAX_RENDERS`` renders (the
preview asks for fewer), inside one ``TIME_BUDGET_SECONDS`` budget (the pool's own 15s
timeout). A further attempt starts only with ``MIN_ATTEMPT_SECONDS`` left; when the budget
runs low or a later render fails, the search stops on the best result it has (``reason``
"time"). Only a failure of the first render is an error.
"""

from __future__ import annotations

import hashlib
import threading
import time
from collections import Counter, OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import fitz

from app.schemas.cv_documents import CvRenderModel
from app.services.cv_chromium import (
    RENDER_TIMEOUT_SECONDS,
    CvRenderUnavailableError,
    RenderTimeoutError,  # noqa: F401  (re-exported for callers and tests)
    print_pdf,
)
from app.services.cv_html import render_cv_html
from app.services.cv_pdf import normalize_pdf

FLOOR_PCT = 50
MIN_BODY_PT = 9.0
MAX_RENDERS = 6
# The live preview searches with fewer renders (it reruns on every edit); the result is cached,
# so the export and the quality check that follow reuse the scale the person saw.
PREVIEW_MAX_RENDERS = 4
TIME_BUDGET_SECONDS = RENDER_TIMEOUT_SECONDS
# A further attempt is started only with at least this much of the budget left: less would
# give the render a timeout it cannot meet while pretending there is budget.
MIN_ATTEMPT_SECONDS = 3.0

Render = Callable[..., bytes]
FitReason = Literal["time"]


@dataclass(frozen=True)
class FitResult:
    fits: bool
    pages: int
    scale: float
    body_pt: float
    # "time" when the search was cut short (out of budget, or a later render failed or timed
    # out) and this is the best result it had; None when the search ran to its end.
    reason: FitReason | None = None

    def as_dict(self) -> dict:
        return {
            "fits": self.fits, "pages": self.pages, "scale": self.scale, "body_pt": self.body_pt,
            "reason": self.reason,
        }


def body_point_size(pdf: bytes) -> float:
    """The body text size: the most common span size by characters (headings are rarer)."""
    sizes: Counter[float] = Counter()
    with fitz.open(stream=pdf, filetype="pdf") as document:
        for page in document:
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    for span in line["spans"]:
                        sizes[round(span["size"], 2)] += len(span["text"].strip())
    return sizes.most_common(1)[0][0] if sizes else 0.0


def page_count(pdf: bytes) -> int:
    with fitz.open(stream=pdf, filetype="pdf") as document:
        return len(document)


def with_fit_scale(model: CvRenderModel, pct: int) -> CvRenderModel:
    return model.model_copy(update={"tokens": {**model.tokens, "fit_scale_pct": pct}})


def with_fit_option(model: CvRenderModel, fit_one_page: bool) -> CvRenderModel:
    """The model told whether the style asks to fit to one page."""
    return model.model_copy(update={"tokens": {**model.tokens, "fit_one_page": fit_one_page}})


def wants_fit(model: CvRenderModel) -> bool:
    return bool(model.tokens.get("fit_one_page", False))


class _CutShort(Exception):
    """The search cannot make another attempt (no budget left, or a render failed)."""


def fit_to_one_page(
    model: CvRenderModel,
    *,
    prepare_script: str | None = None,
    render: Render = print_pdf,
    clock: Callable[[], float] = time.monotonic,
    max_renders: int = MAX_RENDERS,
    check_cancelled: Callable[[], None] | None = None,
) -> tuple[FitResult, bytes]:
    """Search the scale; return the result and the PDF printed at the chosen scale.

    ``prepare_script`` is passed to every render (the preview's section probes).
    ``check_cancelled`` runs before every render and may raise to abandon the search.
    The first render's errors propagate (``CvRenderUnavailableError`` like any render); a later
    render that fails or times out ends the search with the best result so far, as does the
    budget running low: the best attempt that fits, else the one with the fewest pages, with
    ``reason="time"``.
    """
    page_size = str(model.tokens.get("page_size", "a4"))
    started = clock()
    attempts: list[tuple[int, int, bytes]] = []  # (pct, pages, pdf)

    def attempt(pct: int) -> int:
        if check_cancelled is not None:
            check_cancelled()
        remaining = TIME_BUDGET_SECONDS - (clock() - started)
        first = not attempts
        if not first and (len(attempts) >= max_renders or remaining < MIN_ATTEMPT_SECONDS):
            raise _CutShort
        html = render_cv_html(with_fit_scale(model, pct), page_size=page_size)
        try:
            pdf = render(html, prepare_script, remaining if not first else TIME_BUDGET_SECONDS)
        except CvRenderUnavailableError:
            if first:
                raise
            raise _CutShort from None
        pages = page_count(pdf)
        attempts.append((pct, pages, pdf))
        return pages

    def result(pct: int, pages: int, pdf: bytes, reason: FitReason | None = None):
        return FitResult(pages == 1, pages, pct / 100, body_point_size(pdf), reason), pdf

    def best_so_far() -> tuple[FitResult, bytes]:
        fitting = [a for a in attempts if a[1] == 1]
        pct, pages, pdf = (
            max(fitting, key=lambda a: a[0]) if fitting
            else min(attempts, key=lambda a: (a[1], -a[0]))
        )
        return result(pct, pages, pdf, "time")

    try:
        if attempt(100) == 1:
            return result(*attempts[-1])
        floor_pages = attempt(FLOOR_PCT)
        if floor_pages > 1:
            return result(*attempts[-1])
        low, high = FLOOR_PCT, 100  # low fits, high does not
        while high - low > 1:
            if len(attempts) >= max_renders:
                break
            middle = (low + high) // 2
            if attempt(middle) == 1:
                low = middle
            else:
                high = middle
    except _CutShort:
        return best_so_far()
    pct, pages, pdf = next(a for a in attempts if a[0] == low)
    return result(pct, pages, pdf)


class _Lru:
    """A small thread-safe LRU (renders run on threadpool threads)."""

    def __init__(self, size: int) -> None:
        self.size = size
        self._items: OrderedDict = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            if key not in self._items:
                return None
            self._items.move_to_end(key)
            return self._items[key]

    def put(self, key, value) -> None:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self.size:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


# Keyed by a hash of the whole render model (content, header, template and every style
# token), so "the same document revision in the same style" is one key whatever asked.
# Scales are tiny; the PDFs are about 50-150 KB each.
_fits = _Lru(128)
_pdfs = _Lru(16)


def model_key(model: CvRenderModel) -> str:
    return hashlib.sha256(model.model_dump_json().encode()).hexdigest()


def clear_fit_caches() -> None:
    _fits.clear()
    _pdfs.clear()


def fit_cached(
    model: CvRenderModel,
    *,
    prepare_script: str | None = None,
    render: Render = print_pdf,
    max_renders: int = MAX_RENDERS,
    check_cancelled: Callable[[], None] | None = None,
) -> tuple[FitResult, bytes]:
    """``fit_to_one_page``, reusing a scale already found for this exact model: then only the
    chosen scale is printed (one render, no search). A search cut short is not cached."""
    key = model_key(model)
    known = _fits.get(key)
    if known is not None:
        if check_cancelled is not None:
            check_cancelled()
        page_size = str(model.tokens.get("page_size", "a4"))
        html = render_cv_html(with_fit_scale(model, round(known.scale * 100)), page_size=page_size)
        return known, render(html, prepare_script, TIME_BUDGET_SECONDS)
    fit, pdf = fit_to_one_page(
        model, prepare_script=prepare_script, render=render, max_renders=max_renders,
        check_cancelled=check_cancelled,
    )
    if fit.reason is None:
        _fits.put(key, fit)
    return fit, pdf


def render_pdf_fitted(model: CvRenderModel) -> tuple[bytes, FitResult | None]:
    """The exported PDF: fitted when the style asks for it, otherwise the plain render.

    The PDF is cached by model, so a quality check rerun on an unchanged CV (autosave), or an
    export right after one, prints nothing."""
    from app.services.cv_rendering import render_pdf

    key = model_key(model)
    cached = _pdfs.get(key)
    if cached is not None:
        return cached
    if not wants_fit(model):
        result = render_pdf(model), None
    else:
        fit, pdf = fit_cached(model)
        result = normalize_pdf(pdf), fit
    if result[1] is None or result[1].reason is None:
        _pdfs.put(key, result)
    return result
