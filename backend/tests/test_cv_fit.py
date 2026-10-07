"""CV T9 (#468): fit to one page (the scale search) and the length advice."""

from __future__ import annotations

import re
from datetime import date
from types import SimpleNamespace

import fitz
import pytest

from app.models.cv_document import CvDocument
from app.schemas.cv_documents import CvStyle
from app.services import cv_fit
from app.services.cv_fit import (
    FLOOR_PCT,
    MAX_RENDERS,
    fit_to_one_page,
    render_pdf_fitted,
    with_fit_option,
)
from app.services.cv_html import load_manifest
from app.services.cv_length import LengthAdvice, last_page_fill, length_advice, years_of_experience
from app.services.cv_preview import render_preview
from app.services.cv_rendering import build_render_model
from tests import cv_fixtures

PREFIX = "/api/v1/cv-documents"
TEMPLATES = ("classic", "scholar", "frame", "lagoon", "lilac", "rail", "slate")


def _slightly_long(bullets: int = 3):
    """The long fixture with fewer bullets: just over a page, so fitting has something to do."""
    cv = cv_fixtures.long_cv()
    for entry in cv.sections[1]["entries"]:
        entry["bullets"] = entry["bullets"][:bullets]
    return cv


def _model(template: str, cv=None, fit: bool = True, **style):
    cv = cv or _slightly_long()
    model = build_render_model(cv, template, CvStyle(template_id=template, fit_one_page=fit, **style))
    return with_fit_option(model, fit)


# -- the search, with a fake render ---------------------------------------------


def _fake_pdf(pages: int, size: float = 10.0) -> bytes:
    document = fitz.open()
    for _ in range(pages):
        document.new_page().insert_text((72, 100), "Body text line", fontsize=size)
    return document.tobytes()


class FakeRender:
    """Prints one page up to ``threshold`` percent and ``over`` pages above it."""

    def __init__(self, threshold: int, over: int = 2):
        self.threshold, self.over, self.scales = threshold, over, []

    def __call__(self, html, script=None, timeout=None):
        scale = re.search(r"--fit-scale: ([\d.]+)", html)
        pct = round(float(scale.group(1)) * 100) if scale else 100
        self.scales.append(pct)
        return _fake_pdf(1 if pct <= self.threshold else self.over)


@pytest.mark.parametrize("threshold", [100, 99, 97, 80, 71, 62, 51, 50])
def test_search_finds_the_largest_scale_that_fits_within_the_render_budget(threshold):
    render = FakeRender(threshold)
    fit, pdf = fit_to_one_page(_model("classic"), render=render)
    assert fit.fits and fit.pages == 1
    assert len(render.scales) <= MAX_RENDERS
    assert FLOOR_PCT / 100 <= fit.scale <= threshold / 100
    # Resolution of a six-render search over the 50..100 range.
    assert threshold / 100 - fit.scale <= 0.04
    assert fitz.open(stream=pdf, filetype="pdf").page_count == 1


def test_a_cv_that_fits_at_full_size_takes_one_render_and_keeps_scale_one():
    render = FakeRender(100)
    fit, _ = fit_to_one_page(_model("classic"), render=render)
    assert (fit.fits, fit.scale, render.scales) == (True, 1.0, [100])


def test_a_cv_that_cannot_fit_is_printed_at_the_floor_and_reports_the_pages():
    render = FakeRender(10, over=3)
    fit, pdf = fit_to_one_page(_model("classic"), render=render)
    assert (fit.fits, fit.pages, fit.scale) == (False, 3, FLOOR_PCT / 100)
    assert render.scales == [100, FLOOR_PCT]
    assert fitz.open(stream=pdf, filetype="pdf").page_count == 3  # nothing truncated


def test_the_search_is_deterministic():
    runs = [fit_to_one_page(_model("classic"), render=FakeRender(73))[0] for _ in range(3)]
    assert runs[0] == runs[1] == runs[2]


def test_the_search_stops_and_keeps_its_best_fit_when_the_time_budget_runs_out():
    ticks = iter([0.0, 0.0, 1.0, 1.0, 2.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0])
    render = FakeRender(60)
    fit, _ = fit_to_one_page(_model("classic"), render=render, clock=lambda: next(ticks))
    assert fit.fits and len(render.scales) <= 3 and fit.scale <= 0.6


def test_each_render_is_given_what_is_left_of_the_budget():
    seen = []

    def render(html, script=None, timeout=None):
        seen.append(timeout)
        return _fake_pdf(1)

    fit_to_one_page(_model("classic"), render=render, clock=lambda: 0.0)
    assert seen == [cv_fit.TIME_BUDGET_SECONDS]


def test_the_fit_scale_reaches_the_css_and_body_is_held_at_nine_points():
    from app.services.cv_html import render_cv_html

    html = render_cv_html(cv_fit.with_fit_scale(_model("lagoon"), 70))
    assert "--fit-scale: 0.7;" in html and "--body-min: 9pt;" in html
    assert "--fit-scale" not in render_cv_html(_model("lagoon"))


# -- the real render, every template ----------------------------------------------


@pytest.mark.parametrize("template", TEMPLATES)
def test_every_template_fits_the_slightly_long_cv_or_reports_its_pages(template):
    model = _model(template)
    plain = render_pdf_fitted(_model(template, fit=False))[0]
    assert fitz.open(stream=plain, filetype="pdf").page_count == 2  # it does need fitting
    fit, pdf = fit_to_one_page(model)
    assert fit.body_pt >= 9.0 - 0.01
    assert FLOOR_PCT / 100 <= fit.scale <= 1.0
    assert fitz.open(stream=pdf, filetype="pdf").page_count == fit.pages
    assert fit.fits == (fit.pages == 1)
    if not fit.fits:
        assert fit.scale == FLOOR_PCT / 100  # never shrunk below the floor, never truncated
    # The same input gives the same scale.
    assert fit_to_one_page(model)[0] == fit


@pytest.mark.parametrize("template", TEMPLATES)
def test_fitting_keeps_every_word_and_the_page_margins(template):
    cv = _slightly_long()
    fit, pdf = fit_to_one_page(_model(template, cv))
    assert fit.fits
    manifest = load_manifest(template)
    with fitz.open(stream=pdf, filetype="pdf") as document:
        page = document[0]
        text = page.get_text()
        for entry in cv.sections[1]["entries"]:
            assert entry["subheading"] in text
            assert entry["bullets"][-1][:40] in text
        right = page.rect.width - manifest.margin_right_mm / 25.4 * 72
        bottom = page.rect.height - manifest.margin_bottom_mm / 25.4 * 72
        for x0, y0, x1, y1, *_ in page.get_text("blocks"):
            assert x1 <= right + 1 and y1 <= bottom + 1


def test_a_cv_too_long_to_fit_runs_to_its_pages_at_the_floor_on_a_sidebar_template():
    model = _model("lagoon", cv_fixtures.long_cv())
    fit, pdf = fit_to_one_page(model)
    assert not fit.fits and fit.pages == 2 and fit.scale == 0.5 and fit.body_pt >= 9.0 - 0.01


def test_preview_and_pdf_agree_on_the_page_count_and_the_fit():
    for template in ("classic", "slate"):
        model = _model(template)
        preview = render_preview(model)
        fit, pdf = fit_to_one_page(model)
        assert preview.page_count == fitz.open(stream=pdf, filetype="pdf").page_count == fit.pages
        assert preview.fit == fit


def test_without_the_option_nothing_is_fitted():
    pdf, fit = render_pdf_fitted(_model("classic", fit=False))
    assert fit is None and fitz.open(stream=pdf, filetype="pdf").page_count == 2


# -- seniority and advice (pure) -----------------------------------------------------


def _experience(*dates):
    entries = [SimpleNamespace(dates=d) for d in dates]
    return [SimpleNamespace(kind="experience", entries=entries)]


TODAY = date(2026, 10, 7)


@pytest.mark.parametrize(
    ("dates", "years"),
    [
        (["Mar 2022 – Present"], 4.6),
        (["2019 – 2021"], 2.0),
        (["Jan 2016 – Jul 2019", "Aug 2019 – Feb 2022", "Mar 2022 – Present"], 10.6),
        (["03/2018 – 06/2020"], 2.2),
        (["Jan 2020 – Dec 2022", "Jun 2021 – Dec 2021"], 2.9),  # overlap counted once
        (["2015 – 2016", "2020 – 2021"], 2.0),  # a gap is not counted
        (["Sept 2020 – Current"], 6.1),
        (["2021"], 0.0),
    ],
)
def test_years_of_experience(dates, years):
    assert years_of_experience(_experience(*dates), today=TODAY) == years


def test_years_of_experience_is_unknown_without_readable_dates():
    assert years_of_experience(_experience(None, "recently"), today=TODAY) is None
    assert years_of_experience([], today=TODAY) is None
    education = [SimpleNamespace(kind="education", entries=[SimpleNamespace(dates="2010 – 2014")])]
    assert years_of_experience(education, today=TODAY) is None


def test_a_junior_cv_just_over_a_page_is_offered_one_page():
    advice = length_advice(2, 0.2, 3.0)
    assert isinstance(advice, LengthAdvice) and advice.action == "fit_one_page"
    assert "1.2 pages" in advice.message and "one page" in advice.message
    assert length_advice(2, 0.2, None) == advice  # unknown seniority counts as junior


def test_just_over_the_line_for_juniors():
    assert length_advice(2, 0.3, 2.0) is not None
    assert length_advice(2, 0.31, 2.0) is None  # a genuine second page is fine


def test_mid_and_senior_cvs_at_two_pages_get_no_nudge():
    assert length_advice(2, 0.1, 8.0) is None
    assert length_advice(2, 0.2, 15.0) is None
    assert length_advice(2, 0.9, 12.0) is None


def test_one_page_and_fitted_cvs_get_no_nudge():
    assert length_advice(1, 0.9, 1.0) is None
    assert length_advice(2, 0.2, 1.0, fit_one_page=True) is None


@pytest.mark.parametrize("years", [None, 2.0, 20.0])
def test_a_cv_over_two_pages_gets_neutral_advice_with_no_action(years):
    advice = length_advice(3, 0.5, years)
    assert advice is not None and advice.action is None and "3 pages" in advice.message
    assert not re.search(r"\d+\s*/\s*100|score", advice.message, re.IGNORECASE)


def test_last_page_fill_reads_the_ink_height_of_the_last_page():
    document = fitz.open()
    page = document.new_page()  # A4, 842pt tall
    page.insert_text((72, 36 + 0.5 * (842 - 72)), "x", fontsize=10)
    fill = last_page_fill(document.tobytes(), 12.7, 12.7)
    assert 0.48 <= fill <= 0.54
    assert last_page_fill(_fake_pdf(1), 14, 13) < 0.2


# -- endpoints -----------------------------------------------------------------------


def _saved(db, user, cv):
    document = CvDocument(user_id=user.id, name=cv.name, sections=cv.sections, header=cv.header)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def _body(cv, **extra):
    return {"sections": cv.sections, "header": cv.header, **extra}


def test_preview_reports_fit_and_length(client, auth_headers, db, test_user):
    document = _saved(db, test_user, _slightly_long())
    body = _body(_slightly_long(), style={"fit_one_page": True})
    data = client.post(f"{PREFIX}/{document.id}/preview", json=body, headers=auth_headers).json()
    assert data["page_count"] == 1
    assert data["fit"]["fits"] is True and data["fit"]["pages"] == 1 and data["fit"]["body_pt"] >= 9
    assert data["length"]["pages"] == 1 and data["length"]["advice"] is None


def test_preview_nudges_a_junior_cv_just_over_a_page_and_not_a_senior_one(client, auth_headers, db, test_user):
    junior = _slightly_long()
    for entry, (start, end) in zip(
        junior.sections[1]["entries"], [("Mar 2025", "Present"), ("Jun 2024", "Feb 2025"), ("Jan 2023", "May 2024")], strict=True
    ):
        entry["start_date"], entry["end_date"] = start, end
    document = _saved(db, test_user, junior)
    url = f"{PREFIX}/{document.id}/preview"
    data = client.post(url, json=_body(junior), headers=auth_headers).json()
    assert data["fit"] is None and data["length"]["pages"] == data["page_count"] == 2
    assert 0 < data["length"]["last_page_fill"] <= 0.3
    assert data["length"]["advice"]["action"] == "fit_one_page"
    # The same CV with fit on is one page and says nothing more.
    fitted = client.post(url, json=_body(junior, style={"fit_one_page": True}), headers=auth_headers).json()
    assert fitted["page_count"] == 1 and fitted["length"]["advice"] is None
    # Ten years of dated experience: two pages are fine.
    senior = client.post(url, json=_body(_slightly_long()), headers=auth_headers).json()
    assert senior["page_count"] == 2 and senior["length"]["advice"] is None


def test_preview_gives_a_long_cv_neutral_advice_and_no_fit_without_the_option(client, auth_headers, db, test_user):
    cv = cv_fixtures.long_cv()
    for _ in range(2):  # three pages
        cv.sections[1]["entries"] += [dict(e, id=e["id"] + "x" * (_ + 1)) for e in cv.sections[1]["entries"][:3]]
    document = _saved(db, test_user, cv)
    data = client.post(f"{PREFIX}/{document.id}/preview", json=_body(cv), headers=auth_headers).json()
    assert data["page_count"] >= 3
    assert data["length"]["advice"]["code"] == "long" and data["length"]["advice"]["action"] is None


def test_pdf_export_applies_the_saved_fit_and_says_so_in_headers(client, auth_headers, db, test_user):
    cv = _slightly_long()
    document = _saved(db, test_user, cv)
    document.style = {"fit_one_page": True}
    db.commit()
    response = client.get(f"{PREFIX}/{document.id}/artifacts/pdf", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["X-CV-Fit"] == "fits" and response.headers["X-CV-Pages"] == "1"
    assert 0.5 <= float(response.headers["X-CV-Fit-Scale"]) <= 1
    assert fitz.open(stream=response.content, filetype="pdf").page_count == 1
    document.style = {}
    db.commit()
    plain = client.get(f"{PREFIX}/{document.id}/artifacts/pdf", headers=auth_headers)
    assert "X-CV-Fit" not in plain.headers
    assert fitz.open(stream=plain.content, filetype="pdf").page_count == 2
