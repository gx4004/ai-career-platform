"""Fit to one page (spec docs/cv-templates-spec.md D5, 3.4).

When ``style.fit_one_page`` is on, the CV is printed at a uniform scale chosen by searching
with the real Chromium render: 1.0 first, then the floor, then a binary search between them.
The scale multiplies the density type and gap scales (``--fit-scale`` in ``cv_html``); the
templates clamp their body size with ``--body-min`` so the body never drops under 9pt, which
means below about 0.9 only the spacing keeps shrinking. Page margins are never touched (they
are already at or under the 12mm floor on the templates that have the least room to give).

Never forced and never lossy: a CV that does not fit at the floor is printed at the floor and
reported as "runs to N pages"; nothing is truncated. At most ``MAX_RENDERS`` renders, inside
one ``TIME_BUDGET_SECONDS`` budget (the pool's own 15s timeout); the search stops early on
the best result it has when the budget runs out.
"""

from __future__ import annotations

import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass

import fitz

from app.schemas.cv_documents import CvRenderModel
from app.services.cv_chromium import RENDER_TIMEOUT_SECONDS, print_pdf
from app.services.cv_html import render_cv_html
from app.services.cv_pdf import normalize_pdf

FLOOR_PCT = 50
MIN_BODY_PT = 9.0
MAX_RENDERS = 6
TIME_BUDGET_SECONDS = RENDER_TIMEOUT_SECONDS

Render = Callable[..., bytes]


@dataclass(frozen=True)
class FitResult:
    fits: bool
    pages: int
    scale: float
    body_pt: float

    def as_dict(self) -> dict:
        return {"fits": self.fits, "pages": self.pages, "scale": self.scale, "body_pt": self.body_pt}


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


def fit_to_one_page(
    model: CvRenderModel,
    *,
    prepare_script: str | None = None,
    render: Render = print_pdf,
    clock: Callable[[], float] = time.monotonic,
) -> tuple[FitResult, bytes]:
    """Search the scale; return the result and the PDF printed at the chosen scale.

    ``prepare_script`` is passed to every render (the preview's section probes).
    Raises ``CvRenderUnavailableError`` like any render.
    """
    page_size = str(model.tokens.get("page_size", "a4"))
    started = clock()
    renders = 0

    def attempt(pct: int) -> tuple[int, bytes]:
        nonlocal renders
        renders += 1
        remaining = max(1.0, TIME_BUDGET_SECONDS - (clock() - started))
        html = render_cv_html(with_fit_scale(model, pct), page_size=page_size)
        pdf = render(html, prepare_script, remaining)
        return page_count(pdf), pdf

    def result(pct: int, pages: int, pdf: bytes) -> tuple[FitResult, bytes]:
        return FitResult(pages == 1, pages, pct / 100, body_point_size(pdf)), pdf

    pages, pdf = attempt(100)
    if pages == 1:
        return result(100, pages, pdf)
    out_of_time = lambda: clock() - started >= TIME_BUDGET_SECONDS  # noqa: E731
    if out_of_time():
        return result(100, pages, pdf)
    floor_pages, floor_pdf = attempt(FLOOR_PCT)
    if floor_pages > 1:
        return result(FLOOR_PCT, floor_pages, floor_pdf)
    best = (FLOOR_PCT, floor_pdf)
    low, high = FLOOR_PCT, 100  # low fits, high does not
    while high - low > 1 and renders < MAX_RENDERS and not out_of_time():
        middle = (low + high) // 2
        middle_pages, middle_pdf = attempt(middle)
        if middle_pages == 1:
            low, best = middle, (middle, middle_pdf)
        else:
            high = middle
    return result(best[0], 1, best[1])


def render_pdf_fitted(model: CvRenderModel) -> tuple[bytes, FitResult | None]:
    """The exported PDF: fitted when the style asks for it, otherwise the plain render."""
    from app.services.cv_rendering import render_pdf

    if not wants_fit(model):
        return render_pdf(model), None
    fit, pdf = fit_to_one_page(model)
    return normalize_pdf(pdf), fit
