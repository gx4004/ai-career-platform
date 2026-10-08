"""Adaptive page balance: a short one-page CV spreads down the page by spacing alone.

A CV with little to say would otherwise print as a block of text over an empty half page.
Balance widens the layout, never the type: section and entry gaps, the space under section
headings, a little line height, the header's spacing and the page's top and bottom margins
(``--fill``, ``--fill-soft`` and ``--lead``; see ``cv_templates/_base.css`` and
``cv_html.balance_vars``). The goal is ink down to about ``TARGET`` of the printable height.

Rules:

* Only a one-page CV that stops short of ``TARGET - TOLERANCE`` is balanced. A full CV, a
  CV of two or more pages, and a CV that fit to one page had to shrink are printed exactly
  as before (fit shrinks, balance widens: never both).
* Never gappy: ``--fill`` is capped per template (manifest ``balance_max``) and lower for
  compact and spacious spacing. A very short CV stops at the cap, short of the target.
* Never a second page, never over ``TARGET + TOLERANCE``: a candidate is kept only when the
  real PDF verifies it (one page, fill read back with PyMuPDF). Otherwise the CV prints at 1.
* Cheap: the base print (needed anyway) gives the starting fill; spacing grows about
  linearly with ``--fill``, so a first guess from a prior slope, then a secant step, then a
  bracketed step: at most ``MAX_EXTRA_RENDERS`` extra prints. A render that fails, times
  out or would start with too little budget left ends the search on the best verified
  result, so balance never turns a printable CV into a 503.
* Deterministic: the same model always takes the same steps to the same ``--fill``.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass

from app.schemas.cv_documents import CvRenderModel
from app.services.cv_chromium import RENDER_TIMEOUT_SECONDS, CvRenderUnavailableError
from app.services.cv_html import html_template_id, load_manifest, render_cv_html
from app.services.cv_length import last_page_fill

TARGET = 0.90
TOLERANCE = 0.04
MAX_EXTRA_RENDERS = 3
# The share of a template's cap (manifest ``balance_max``, above 1) each density may use:
# compact asked for density, so it opens up least; spacious is already open.
DENSITY_SHARE = {"compact": 0.5, "normal": 1.0, "spacious": 2 / 3}
# Spacing is about this share of a short CV's height at fill 1 (measured 0.16-0.36 across
# the seven templates), so the first guess usually lands within one secant step.
PRIOR_SLOPE_SHARE = 0.28
# Balance starts only while the base print left this much of the render budget, and each
# further print needs this much left (a slow or busy renderer prints the CV unbalanced).
MIN_ATTEMPT_SECONDS = 3.0
BUDGET_SECONDS = RENDER_TIMEOUT_SECONDS

Render = Callable[..., bytes]


@dataclass(frozen=True)
class BalanceResult:
    fill: float  # --fill printed (1.0: not balanced)
    page_fill: float  # how far down the printable height the ink reaches
    renders: int  # extra prints this search made
    # True when the budget ran low or a render failed: the result is the best verified print
    # so far, and is not cached (a later request searches again).
    cut_short: bool = False


def with_fill(model: CvRenderModel, fill: float) -> CvRenderModel:
    return model.model_copy(update={"tokens": {**model.tokens, "fill_pct": round(fill * 100)}})


def with_balance_option(model: CvRenderModel, balance: bool) -> CvRenderModel:
    """Tests only: ``False`` turns page balance off for this model (it is on by default)."""
    return model.model_copy(update={"tokens": {**model.tokens, "balance": balance}})


def wants_balance(model: CvRenderModel) -> bool:
    return bool(model.tokens.get("balance", True))


def balance_cap(model: CvRenderModel) -> float:
    manifest = load_manifest(html_template_id(model.template_id))
    density = {88: "compact", 100: "normal", 115: "spacious"}.get(
        int(model.tokens.get("type_scale_pct", 100)), "normal"
    )
    return round(1 + (manifest.balance_max - 1) * DENSITY_SHARE[density], 2)


def measure(model: CvRenderModel, pdf: bytes) -> tuple[int, float]:
    """(pages, fill of the last page) of a print of ``model``: of its main column on a
    sidebar template (the sidebar keeps its spacing; its colour strip already fills)."""
    import fitz

    manifest = load_manifest(html_template_id(model.template_id))
    with fitz.open(stream=pdf, filetype="pdf") as document:
        pages = len(document)
    return pages, last_page_fill(
        pdf, manifest.margin_top_mm, manifest.margin_bottom_mm, from_x_mm=manifest.balance_main_from_mm
    )


def balance_page(
    model: CvRenderModel,
    base_pdf: bytes,
    *,
    prepare_script: str | None = None,
    render: Render,
    clock: Callable[[], float] = time.monotonic,
    started: float | None = None,
    check_cancelled: Callable[[], None] | None = None,
) -> tuple[BalanceResult, bytes]:
    """Balance ``model`` (printed at fill 1 as ``base_pdf``); return the result and its PDF.

    ``started`` is when the caller's render budget began (the base print and any fit search
    count against it). ``check_cancelled`` may raise to abandon the search (a superseded
    preview); render failures never raise, they end the search."""
    started = clock() if started is None else started
    pages, base_fill = measure(model, base_pdf)
    if pages != 1 or base_fill >= TARGET - TOLERANCE:
        return BalanceResult(1.0, base_fill, 0), base_pdf
    cap = balance_cap(model)
    page_size = str(model.tokens.get("page_size", "a4"))
    tried: dict[int, tuple[int, float, bytes]] = {100: (1, base_fill, base_pdf)}
    cut_short = False

    def attempt(fill: float) -> tuple[int, float] | None:
        nonlocal cut_short
        pct = round(min(max(fill, 1.0), cap) * 100)
        if pct in tried:
            return tried[pct][:2]
        if len(tried) > MAX_EXTRA_RENDERS:
            return None
        remaining = BUDGET_SECONDS - (clock() - started)
        if remaining < MIN_ATTEMPT_SECONDS:
            cut_short = True
            return None
        if check_cancelled is not None:
            check_cancelled()
        try:
            html = render_cv_html(with_fill(model, pct / 100), page_size=page_size)
            pdf = render(html, prepare_script, remaining)
        except CvRenderUnavailableError:
            cut_short = True
            return None
        got = measure(model, pdf)
        tried[pct] = (*got, pdf)
        return got

    def verified(pct: int) -> bool:
        pages, fill, _ = tried[pct]
        return pages == 1 and fill <= TARGET + TOLERANCE

    def close_enough(pct: int) -> bool:
        return verified(pct) and (tried[pct][1] >= TARGET - TOLERANCE or pct >= round(cap * 100))

    # 1. A first guess from the prior slope (spacing is a share of the content's height).
    slope = max(base_fill, 0.05) * PRIOR_SLOPE_SHARE
    guess = 1 + (TARGET - base_fill) / slope
    while True:
        pct = round(min(max(guess, 1.0), cap) * 100)
        if pct in tried or attempt(guess) is None or close_enough(pct):
            break
        # 2. Next guess: within the bracket of the best attempt under the target and the
        # closest one over it (or a second page), else the secant through fill 1.
        under = [(p, f) for p, (n, f, _) in tried.items() if n == 1 and f < TARGET]
        over = [(p, f) for p, (n, f, _) in tried.items() if not (n == 1 and f < TARGET)]
        low_pct, low_fill = max(under)
        if over:
            high_pct, high_fill = min(over)
            if tried[high_pct][0] > 1 or high_fill >= 0.999:
                guess = (low_pct + high_pct) / 200  # a second page or a full page: bisect
            else:
                share = (TARGET - low_fill) / (high_fill - low_fill)
                guess = (low_pct + share * (high_pct - low_pct)) / 100
            if round(guess * 100) in (low_pct, high_pct):
                break
        else:
            if low_pct >= round(cap * 100):
                break
            rise = (low_fill - base_fill) / ((low_pct - 100) / 100) if low_pct > 100 else slope
            guess = low_pct / 100 + (TARGET - low_fill) / max(rise, 1e-3)

    # 3. The verified print closest to the target (fill 1 is always verified).
    best = min(
        (p for p in tried if verified(p)),
        key=lambda p: (abs(TARGET - tried[p][1]), p),
    )
    _, page_fill, pdf = tried[best]
    return BalanceResult(best / 100, page_fill, len(tried) - 1, cut_short), pdf
