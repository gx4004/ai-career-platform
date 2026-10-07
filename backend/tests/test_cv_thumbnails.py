"""Template gallery thumbnails: page 1 of the built-in English sample CV in every template."""

from __future__ import annotations

import base64
import io
import re

import fitz
import pytest
from PIL import Image

from app.schemas.cv_documents import CvStyle
from app.services import cv_thumbnails
from app.services.cv_chromium import ChromiumPool, ChromiumUnavailableError
from app.services.cv_html import available_template_ids, load_manifest
from app.services.cv_sample import TRIM_ORDER, sample_cv, trimmed_sample

URL = "/api/v1/cv-documents/template-thumbnails"
WEBP = "data:image/webp;base64,"
MM = 72 / 25.4
FONTS = ["inter", "source-sans-3", "ibm-plex-sans", "source-serif-4", "lora", "eb-garamond"]


@pytest.fixture(autouse=True)
def fresh_caches():
    cv_thumbnails.clear_caches()
    yield
    cv_thumbnails.clear_caches()


def _get(client, headers, **params):
    return client.get(URL, params=params, headers=headers)


def _image(thumbnail: dict) -> Image.Image:
    assert thumbnail["url"].startswith(WEBP)
    data = base64.b64decode(thumbnail["url"][len(WEBP) :])
    return Image.open(io.BytesIO(data)).convert("RGB")


def _colour_count(image: Image.Image, rgb: tuple[int, int, int], tolerance: int = 24) -> int:
    pixels = zip(*[iter(image.tobytes())] * 3, strict=True)
    return sum(
        1 for p in pixels if all(abs(c - w) <= tolerance for c, w in zip(p, rgb, strict=True))
    )


# -- the sample ----------------------------------------------------------------


def _all_text(cv) -> str:
    parts = [str(value) for value in cv.header.values() if isinstance(value, str)]
    parts += cv.header["links"]
    for section in cv.sections:
        parts.append(section["title"])
        for entry in section["entries"]:
            parts += [str(entry.get(k) or "") for k in ("body", "heading", "subheading", "location")]
            parts += entry["bullets"]
    return " ".join(parts)


def test_the_sample_is_english_and_fictional():
    cv = sample_cv()
    text = _all_text(cv)
    # Plain English only: printable ASCII plus the bullet; no Cyrillic or any other script.
    assert re.fullmatch(r"[\x20-\x7e•]+", text)
    assert cv.header["email"].endswith("@example.com")
    assert all("example" in link for link in cv.header["links"])
    kinds = [section["kind"] for section in cv.sections]
    assert kinds == [
        "summary", "experience", "projects", "education", "certifications", "skills", "custom",
    ]
    experience = cv.sections[1]["entries"]
    assert len(experience) == 3 and all(3 <= len(e["bullets"]) <= 4 for e in experience)
    skills = cv.sections[5]["entries"][0]["body"].split(" • ")
    assert 14 <= len(skills) <= 18
    assert len(cv.sections[6]["entries"][0]["body"].split(", ")) == 3


def test_trimming_drops_lines_in_order_and_never_the_core():
    full, most = trimmed_sample(0), trimmed_sample(len(TRIM_ORDER))
    assert _all_text(full) == _all_text(sample_cv())
    assert len(_all_text(most)) < len(_all_text(full))
    # The header, summary, every role, skills and languages survive any trim.
    assert most.header == full.header
    assert [s["id"] for s in most.sections if s["entries"]] == [
        "summary", "experience", "education", "certifications", "skills", "languages",
    ]
    assert len(most.sections[1]["entries"]) == 3


@pytest.mark.parametrize("page_size", ["a4", "letter"])
@pytest.mark.parametrize("template_id", available_template_ids())
def test_the_sample_fills_one_page_in_every_template(template_id, page_size):
    """Full but never over: page 1 is inked to near its bottom margin and there is no page 2."""
    style = cv_thumbnails.gallery_style(CvStyle(page_size=page_size), template_id)
    _drop, pdf = cv_thumbnails.sample_trim(template_id, style)
    manifest = load_manifest(template_id)
    with fitz.open(stream=pdf, filetype="pdf") as document:
        assert len(document) == 1
        page = document[0]
        bottom = max(word[3] for word in page.get_text("words"))
        top, foot = manifest.margin_top_mm * MM, manifest.margin_bottom_mm * MM
        fill = (bottom - top) / (page.rect.height - top - foot)
    assert fill >= 0.85, fill


@pytest.mark.parametrize("font_id", FONTS)
def test_the_sample_stays_on_one_page_with_every_typeface(font_id):
    for template_id in available_template_ids():
        style = cv_thumbnails.gallery_style(CvStyle(font_id=font_id), template_id)
        _drop, pdf = cv_thumbnails.sample_trim(template_id, style)
        with fitz.open(stream=pdf, filetype="pdf") as document:
            assert len(document) == 1, (template_id, font_id)


# -- the endpoint ----------------------------------------------------------------


def test_every_catalog_template_has_a_page_one_thumbnail(client, auth_headers):
    response = _get(client, auth_headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, max-age=3600"
    body = response.json()
    assert [t["template_id"] for t in body["thumbnails"]] == list(available_template_ids())
    for thumbnail in body["thumbnails"]:
        assert thumbnail["error"] is None
        # A4, 320 px wide.
        assert _image(thumbnail).size == (thumbnail["width"], thumbnail["height"]) == (320, 453)


def test_letter_page_size_changes_the_thumbnail_shape(client, auth_headers):
    body = _get(client, auth_headers, page_size="letter").json()
    assert {(t["width"], t["height"]) for t in body["thumbnails"]} == {(320, 414)}


@pytest.mark.parametrize(
    "params", [{}, {"accent_color": "#9D174D", "font_id": "eb-garamond", "density": "spacious"}]
)
def test_the_gallery_stays_within_the_mobile_budget(client, auth_headers, params):
    """Owner budget: about 8 KB of WebP a thumbnail and 80 KB for the whole response."""
    response = _get(client, auth_headers, **params)
    assert len(response.content) <= 80 * 1024
    for thumbnail in response.json()["thumbnails"]:
        size = len(base64.b64decode(thumbnail["url"][len(WEBP) :]))
        assert size <= cv_thumbnails.THUMBNAIL_MAX_BYTES, (thumbnail["template_id"], size)


def test_the_accent_is_drawn(client, auth_headers):
    plain = _get(client, auth_headers, templates="lagoon").json()["thumbnails"][0]
    red = _get(client, auth_headers, templates="lagoon", accent_color="#B91C1C").json()
    target = (0xB9, 0x1C, 0x1C)
    assert _colour_count(_image(red["thumbnails"][0]), target) > 500
    assert _colour_count(_image(plain), target) < 500


def test_a_client_can_ask_for_some_templates_first(client, auth_headers):
    body = _get(client, auth_headers, templates="lagoon,classic").json()
    # Catalog order, only those asked for.
    assert [t["template_id"] for t in body["thumbnails"]] == ["classic", "lagoon"]
    for bad in ("nope", "classic,nope", ","):
        assert _get(client, auth_headers, templates=bad).status_code == 422


def test_a_second_request_is_served_from_the_cache_without_chromium(
    client, auth_headers, monkeypatch
):
    first = _get(client, auth_headers, accent_color="#075985").json()
    prints = []
    monkeypatch.setattr(cv_thumbnails, "print_pdf", lambda *a, **k: prints.append(1))
    second = _get(client, auth_headers, accent_color="#075985").json()
    assert second == first and prints == []


def test_the_cache_is_bounded():
    assert cv_thumbnails.CACHE_SIZE == 256
    lru = cv_thumbnails._Lru(2)
    for key in "abc":
        lru.put(key, key)
    assert len(lru) == 2 and lru.get("a") is None and lru.get("c") == "c"


def test_a_new_accent_reuses_the_cached_trim(client, auth_headers, monkeypatch):
    _get(client, auth_headers, templates="classic")
    prints = []
    original = cv_thumbnails.print_pdf

    def counting(*args, **kwargs):
        prints.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr(cv_thumbnails, "print_pdf", counting)
    _get(client, auth_headers, templates="classic", accent_color="#166534")
    assert prints == [1]


# -- failure isolation ---------------------------------------------------------


def test_one_failing_template_does_not_take_the_others_down(client, auth_headers, monkeypatch):
    original = cv_thumbnails.render_cv_html

    def broken_for_slate(model, **kwargs):
        if model.template_id == "slate":
            raise RuntimeError("boom")
        return original(model, **kwargs)

    monkeypatch.setattr(cv_thumbnails, "render_cv_html", broken_for_slate)
    by_id = {t["template_id"]: t for t in _get(client, auth_headers).json()["thumbnails"]}
    assert by_id["slate"]["url"] is None
    assert by_id["slate"]["error"] == cv_thumbnails.FAILED_MESSAGE
    assert all(t["url"] for tid, t in by_id.items() if tid != "slate")
    # A failure is not cached: the next request draws it.
    monkeypatch.setattr(cv_thumbnails, "render_cv_html", original)
    assert all(t["url"] for t in _get(client, auth_headers).json()["thumbnails"])


def test_the_budget_marks_late_templates_instead_of_waiting(monkeypatch):
    clock = iter(range(0, 1000, 10))
    monkeypatch.setattr(cv_thumbnails.time, "monotonic", lambda: next(clock))

    def render(template_id, style, remaining):
        remaining()
        return cv_thumbnails.Thumbnail(template_id, "x")

    monkeypatch.setattr(cv_thumbnails, "_render_one", render)
    errors = [t.error for t in cv_thumbnails.render_thumbnails(CvStyle(), budget=25)]
    # Deadline 25 from t=0: two templates start in time (t=10, 20), the rest are past it.
    assert errors[:2] == [None, None]
    assert set(errors[2:]) == {cv_thumbnails.TIMEOUT_MESSAGE}


def test_missing_chromium_is_a_503(client, auth_headers, monkeypatch):
    async def unavailable(self):
        raise ChromiumUnavailableError()

    monkeypatch.setattr(ChromiumPool, "_get_browser", unavailable)
    response = _get(client, auth_headers)
    assert response.status_code == 503
    assert response.json()["detail"] == ChromiumUnavailableError.message


# -- access --------------------------------------------------------------------


def test_requires_authentication(client):
    assert client.get(URL).status_code == 401


@pytest.mark.parametrize(
    "params",
    [{"accent_color": "red"}, {"font_id": "comic-sans"}, {"density": "huge"}, {"page_size": "a3"}],
)
def test_invalid_styles_are_422(client, auth_headers, params):
    assert _get(client, auth_headers, **params).status_code == 422


def test_rate_limit_is_30_per_minute(client, auth_headers, monkeypatch):
    calls = []

    def fake(style, **kwargs):
        calls.append(1)
        return []

    monkeypatch.setattr("app.routers.cv_documents.render_thumbnails", fake)
    statuses = [_get(client, auth_headers).status_code for _ in range(32)]
    assert statuses[:30] == [200] * 30 and statuses[30:] == [429, 429]
    assert len(calls) == 30
