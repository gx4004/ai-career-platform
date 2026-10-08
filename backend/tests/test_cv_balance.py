"""Adaptive page balance (cv_balance): a short one-page CV spreads down the page by spacing.

The solver runs against a fake renderer first (fill is a function of ``--fill``), then the
real templates: short fixtures land in the target band or at the cap, never on a second page,
with the body type unchanged; full and multi-page CVs print byte for byte as before.
Regenerate the balanced golden images deliberately with
``CV_UPDATE_GOLDEN=1 pytest tests/test_cv_balance.py -k golden``.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import fitz
import pytest
from PIL import Image, ImageChops

from app.schemas.cv_documents import CvStyle
from app.services import cv_balance, cv_fit
from app.services.cv_balance import (
    MAX_EXTRA_RENDERS,
    TARGET,
    TOLERANCE,
    balance_cap,
    balance_page,
    measure,
    with_balance_option,
)
from app.services.cv_chromium import RenderTimeoutError
from app.services.cv_fit import (
    body_point_size,
    layout_cached,
    render_pdf_fitted,
    solve_layout,
    with_fit_option,
)
from app.services.cv_html import load_manifest, render_cv_html
from app.services.cv_rendering import build_render_model, render_pdf
from tests import cv_fixtures

TEMPLATES = ("classic", "scholar", "frame", "slate", "lagoon", "lilac", "rail")
GOLDEN_DIR = Path(__file__).parent / "golden" / "cv"
LOW, HIGH = TARGET - TOLERANCE, TARGET + TOLERANCE


@pytest.fixture(autouse=True)
def _fresh_caches():
    cv_fit.clear_fit_caches()
    yield
    cv_fit.clear_fit_caches()


def _model(fixture="junior", template="classic", **style):
    return build_render_model(cv_fixtures.SHORT.get(fixture, getattr(cv_fixtures, fixture))(), template,
                              CvStyle(template_id=template, **style))


# -- the solver, with a fake renderer ------------------------------------------------------------


def _fill_of(html: str) -> float:
    match = re.search(r"--fill: ([\d.]+)", html)
    return float(match.group(1)) if match else 1.0


def _page_pdf(fill: float, pages: int = 1, template: str = "classic") -> bytes:
    """A one-column A4 PDF whose last page is inked down to ``fill`` of the printable height."""
    manifest = load_manifest(template)
    top = manifest.margin_top_mm / 25.4 * 72
    printable = 842 - top - manifest.margin_bottom_mm / 25.4 * 72
    document = fitz.open()
    for _ in range(pages):
        page = document.new_page(width=595, height=842)
        page.insert_text((72, top + 12), "Heading", fontsize=10)
        bottom = top + min(fill, 1.0) * printable
        page.insert_text((72, bottom - 2.3), "Last line", fontsize=10)  # descender to ``bottom``
    return document.tobytes()


class FakeRender:
    """Ink reaches ``base + slope * (fill - 1)``; past ``overflow`` the CV runs to two pages."""

    def __init__(self, base: float, slope: float, overflow: float = 99.0, curve: float = 0.0):
        self.base, self.slope, self.overflow, self.curve = base, slope, overflow, curve
        self.fills: list[float] = []

    def height(self, fill: float) -> float:
        return self.base + self.slope * (fill - 1) + self.curve * (fill - 1) ** 2

    def __call__(self, html, script=None, timeout=None):
        fill = _fill_of(html)
        self.fills.append(fill)
        if fill > self.overflow:
            return _page_pdf(0.2, pages=2)
        return _page_pdf(self.height(fill))


def _balance(render: FakeRender, model=None, **kwargs):
    model = model or _model()
    base = render(render_cv_html(model))
    render.fills.clear()
    return balance_page(model, base, render=render, **kwargs)


def test_the_fake_page_measures_what_it_was_asked_for():
    for fill in (0.3, 0.6, 0.9):
        assert measure(_model(), _page_pdf(fill)) == (1, pytest.approx(fill, abs=0.01))


@pytest.mark.parametrize(
    ("base", "slope", "curve"),
    [(0.5, 0.35, 0.0), (0.7, 0.2, 0.0), (0.8, 0.15, 0.0), (0.6, 0.25, 0.06), (0.75, 0.4, -0.05), (0.62, 0.9, 0.0)],
)
def test_a_short_cv_lands_in_the_target_band_within_three_extra_renders(base, slope, curve):
    render = FakeRender(base, slope, curve=curve)
    result, pdf = _balance(render)
    assert len(render.fills) <= MAX_EXTRA_RENDERS and result.renders == len(render.fills)
    assert LOW <= result.page_fill <= HIGH
    assert measure(_model(), pdf) == (1, result.page_fill)
    assert 1 < result.fill <= balance_cap(_model())


def test_a_full_cv_is_not_touched():
    render = FakeRender(0.88, 0.3)
    base = _page_pdf(0.88)
    result, pdf = balance_page(_model(), base, render=render)
    assert (result.fill, result.renders, render.fills) == (1.0, 0, [])
    assert pdf is base


def test_a_cv_of_two_pages_is_not_touched():
    render = FakeRender(0.3, 0.3)
    base = _page_pdf(0.3, pages=2)
    result, pdf = balance_page(_model(), base, render=render)
    assert (result.fill, render.fills, pdf) == (1.0, [], base)


def test_a_very_short_cv_stops_at_the_cap_short_of_the_target():
    render = FakeRender(0.2, 0.1)
    result, _ = _balance(render)
    assert result.fill == balance_cap(_model()) == 2.2
    assert result.page_fill < LOW and len(render.fills) <= MAX_EXTRA_RENDERS


def test_balance_never_prints_a_second_page_or_overshoots():
    # Steep, and two pages past fill 1.3: every candidate over the band or on two pages is dropped.
    render = FakeRender(0.6, 1.5, overflow=1.3)
    result, pdf = _balance(render)
    pages, fill = measure(_model(), pdf)
    assert pages == 1 and fill <= HIGH
    assert result.fill <= 1.3


@pytest.mark.parametrize("base", [0.3, 0.55, 0.7, 0.85])
def test_the_search_is_deterministic(base):
    runs = [_balance(FakeRender(base, 0.3, curve=0.04)) for _ in range(3)]
    assert len({(r.fill, r.page_fill, r.renders) for r, _ in runs}) == 1
    assert len({measure(_model(), pdf) for _, pdf in runs}) == 1


def test_a_render_that_times_out_falls_back_to_the_unbalanced_print():
    model = _model()
    base = _page_pdf(0.5)

    def timing_out(html, script=None, timeout=None):
        raise RenderTimeoutError()

    result, pdf = balance_page(model, base, render=timing_out)
    assert (result.fill, result.cut_short, pdf) == (1.0, True, base)


def test_a_short_budget_skips_balance():
    now = [0.0]
    render = FakeRender(0.5, 0.3)
    base = _page_pdf(0.5)
    result, pdf = balance_page(
        _model(), base, render=render, clock=lambda: now[0], started=-(cv_balance.BUDGET_SECONDS - 2.0)
    )
    assert (result.fill, result.cut_short, render.fills, pdf) == (1.0, True, [], base)


def test_a_superseded_preview_stops_the_search():
    class Cancelled(Exception):
        pass

    def cancel():
        raise Cancelled

    with pytest.raises(Cancelled):
        _balance(FakeRender(0.5, 0.3), check_cancelled=cancel)


def test_the_cap_follows_the_template_and_the_density():
    assert balance_cap(_model()) == 2.2
    assert balance_cap(_model(density="compact")) == 1.6
    assert balance_cap(_model(density="spacious")) == 1.8
    assert balance_cap(_model(template="lagoon")) == load_manifest("lagoon").balance_max == 2.5
    assert balance_cap(_model(template="lagoon", density="compact")) == 1.75


def test_the_fill_widens_spacing_only():
    html = render_cv_html(cv_balance.with_fill(_model(), 2.2))
    assert "--fill: 2.2; --fill-soft: 1.6; --lead: 0.2;" in html
    assert not re.search(r"--fill: \d", render_cv_html(_model()))  # unbalanced HTML is as before
    assert "@page { size: A4; margin: 21.76mm 17mm 19.04mm 17mm; }" in html  # top/bottom only


# -- the layout solver: fit and balance never both act; the cache -----------------------------------


def test_a_cv_that_fit_had_to_shrink_is_never_balanced():
    model = with_fit_option(_model("long_cv"), True)
    fills = []

    def render(html, script=None, timeout=None):
        fills.append(_fill_of(html))
        scale = re.search(r"--fit-scale: ([\d.]+)", html)
        return _page_pdf(0.5, pages=1 if scale and float(scale.group(1)) < 0.8 else 2)

    layout, _ = solve_layout(model, render=render)
    assert layout.fit is not None and layout.fit.scale < 1 and layout.fill == 1.0
    assert set(fills) == {1.0}


def test_a_short_cv_with_fit_on_is_balanced_at_scale_one():
    model = with_fit_option(_model(), True)
    layout, _ = solve_layout(model, render=FakeRender(0.6, 0.3))
    assert layout.fit is not None and layout.fit.scale == 1.0 and layout.fill > 1


def test_balance_can_be_turned_off_for_tests():
    render = FakeRender(0.5, 0.3)
    layout, _ = solve_layout(with_balance_option(_model(), False), render=render)
    assert (layout.fill, render.fills) == (1.0, [1.0])


def test_a_repeat_of_the_same_model_prints_the_known_layout_once():
    model = _model()
    render = FakeRender(0.6, 0.3)
    first, _ = layout_cached(model, render=render)
    searched = len(render.fills)
    assert searched >= 2 and first.fill > 1
    again, _ = layout_cached(model, render=render)
    assert again == first and render.fills[searched:] == [first.fill]


def test_a_cut_short_balance_is_not_cached():
    model = _model()
    calls, failed = [], []

    def flaky(html, script=None, timeout=None):
        calls.append(_fill_of(html))
        if len(calls) == 2 and not failed:
            failed.append(1)
            raise RenderTimeoutError()
        return _page_pdf(0.5 + 0.3 * (_fill_of(html) - 1))

    layout, _ = layout_cached(model, render=flaky)
    assert (layout.fill, layout.complete) == (1.0, False)
    calls.clear()
    layout, _ = layout_cached(model, render=flaky)
    assert len(calls) > 1 and layout.complete  # searched again


# -- the real templates ---------------------------------------------------------------------------


SHORT = ("junior", "graduate", "no_summary", "maya")


@pytest.mark.parametrize("fixture", SHORT)
@pytest.mark.parametrize("template", TEMPLATES)
def test_short_cvs_fill_the_page_on_one_page_with_the_same_type(template, fixture):
    model = _model(fixture, template)
    plain = render_pdf(model)
    _, plain_fill = measure(model, plain)
    layout, pdf = solve_layout(model)
    pages, fill = measure(model, pdf)
    assert pages == 1 and fill <= HIGH
    assert fill >= LOW or layout.fill == balance_cap(model) or plain_fill >= LOW
    assert fill >= plain_fill
    assert body_point_size(pdf) == body_point_size(plain)  # spacing moved, never the text size


@pytest.mark.parametrize("page_size", ["a4", "letter"])
@pytest.mark.parametrize("density", ["compact", "spacious"])
@pytest.mark.parametrize("template", TEMPLATES)
def test_every_density_and_page_size_stays_on_one_page(template, density, page_size):
    model = _model("graduate", template, density=density, page_size=page_size)
    layout, pdf = solve_layout(model)
    pages, fill = measure(model, pdf)
    assert pages == 1 and fill <= HIGH and layout.fill <= balance_cap(model)


@pytest.mark.parametrize("template", TEMPLATES)
def test_a_two_page_cv_prints_byte_for_byte_as_before(template):
    model = _model("long_cv", template)
    assert render_pdf_fitted(model)[0] == render_pdf(model)


@pytest.mark.parametrize("template", ["classic", "scholar", "frame", "slate"])
def test_a_full_cv_prints_byte_for_byte_as_before(template):
    model = _model("long_name", template)
    assert measure(model, render_pdf(model))[1] >= LOW
    assert render_pdf_fitted(model)[0] == render_pdf(model)


def test_the_export_after_a_preview_reuses_its_layout_in_one_render():
    from app.services.cv_chromium import print_pdf
    from app.services.cv_preview import render_preview

    model = _model("graduate")
    preview = render_preview(model)
    assert preview.fill > 1
    calls = []

    def counted(*args):
        calls.append(1)
        return print_pdf(*args)

    layout, _ = layout_cached(model, render=counted)
    assert layout.fill == preview.fill and len(calls) == 1


# -- golden images (balanced short CV) ------------------------------------------------------------


@pytest.mark.parametrize("template", TEMPLATES)
def test_golden_image_of_a_balanced_junior_cv(template):
    pdf, _ = render_pdf_fitted(_model("junior", template))
    with fitz.open(stream=pdf, filetype="pdf") as document:
        pixmap = document[0].get_pixmap(dpi=80, colorspace=fitz.csRGB, alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    golden = GOLDEN_DIR / f"balanced-{template}-junior.png"
    if os.environ.get("CV_UPDATE_GOLDEN") == "1":
        image.save(golden, optimize=True)
    assert golden.exists(), f"missing golden image; run with CV_UPDATE_GOLDEN=1 ({golden})"
    expected = Image.open(golden).convert("RGB")
    assert image.size == expected.size
    difference = ImageChops.difference(image, expected).convert("L")
    changed = sum(1 for value in difference.getdata() if value > 48)
    assert changed / (image.size[0] * image.size[1]) < 0.002
