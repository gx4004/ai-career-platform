"""The preview endpoint (T3, #462): page images and section rectangles of an unsaved draft."""

from __future__ import annotations

import base64
import io

import fitz
import pytest
from PIL import Image, ImageChops

from app.auth.security import hash_password
from app.models.cv_document import CvDocument
from app.models.user import User
from app.schemas.cv_documents import CvStyle
from app.services import cv_preview
from app.services.cv_chromium import ChromiumPool, ChromiumUnavailableError
from app.services.cv_rendering import build_render_model, render_pdf
from tests import cv_fixtures

PREFIX = "/api/v1/cv-documents"


def _saved(db, user, fixture="maya") -> CvDocument:
    cv = cv_fixtures.ALL[fixture]()
    document = CvDocument(user_id=user.id, name=cv.name, sections=cv.sections, header=cv.header)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def _draft(fixture: str, **extra) -> dict:
    cv = cv_fixtures.ALL[fixture]()
    return {"sections": cv.sections, "header": cv.header, **extra}


def _post(client, headers, document_id, body):
    return client.post(f"{PREFIX}/{document_id}/preview", json=body, headers=headers)


def _image(page: dict) -> Image.Image:
    prefix = "data:image/webp;base64,"
    assert page["url"].startswith(prefix)
    return Image.open(io.BytesIO(base64.b64decode(page["url"][len(prefix) :])))


@pytest.fixture
def document(db, test_user):
    return _saved(db, test_user)


# -- shape ---------------------------------------------------------------------


def test_one_page_cv_returns_a_webp_page_and_section_rectangles(client, auth_headers, document):
    response = _post(client, auth_headers, document.id, _draft("maya"))
    assert response.status_code == 200
    body = response.json()
    assert body["page_count"] == 1 and body["truncated"] is False and body["warnings"] == []
    assert response.headers["cache-control"] == "private, no-store"
    page = body["pages"][0]
    image = _image(page)
    # A4 at 110 dpi.
    assert (page["width"], page["height"]) == image.size == (909, 1287)
    ids = [s["id"] for s in body["sections"]]
    assert ids == ["header", "s", "x", "p", "ed", "sk", "l"]
    kinds = {s["id"]: s["kind"] for s in body["sections"]}
    assert kinds["header"] == "header" and kinds["x"] == "experience"
    tops = [s["y"] for s in body["sections"]]
    assert tops == sorted(tops)


@pytest.mark.parametrize("width", [480, 768, 1600])
def test_pages_can_be_sized_to_the_display(client, auth_headers, document, width):
    """A phone asks for its own width (CSS width times pixel ratio), not 110 dpi."""
    response = client.post(
        f"{PREFIX}/{document.id}/preview?width={width}", json=_draft("maya"), headers=auth_headers
    )
    page = response.json()["pages"][0]
    assert _image(page).size[0] == page["width"] == width
    assert abs(page["height"] - width * 297 / 210) <= 3


def test_a_phone_sized_preview_is_small(client, auth_headers, document):
    small = client.post(
        f"{PREFIX}/{document.id}/preview?width=640", json=_draft("long"), headers=auth_headers
    )
    default = _post(client, auth_headers, document.id, _draft("long"))
    assert len(small.content) < len(default.content) * 0.7


@pytest.mark.parametrize("width", [0, 100, 5000, "wide"])
def test_an_out_of_range_width_is_422(client, auth_headers, document, width):
    response = client.post(
        f"{PREFIX}/{document.id}/preview?width={width}", json=_draft("maya"), headers=auth_headers
    )
    assert response.status_code == 422


def test_the_draft_is_what_renders_and_nothing_is_saved(client, auth_headers, db, document):
    before = (list(document.sections), dict(document.header), document.style, document.updated_at)
    draft = _draft("cyrillic", style={"accent_color": "#075985"})
    assert _post(client, auth_headers, document.id, draft).status_code == 200
    db.expire_all()
    fresh = db.get(CvDocument, document.id)
    assert (list(fresh.sections), dict(fresh.header), fresh.style, fresh.updated_at) == before
    assert db.query(CvDocument).count() == 1


def test_omitted_fields_fall_back_to_the_saved_cv(client, auth_headers, document):
    response = _post(client, auth_headers, document.id, {})
    assert response.status_code == 200
    assert response.json()["page_count"] == 1


# -- section rectangles --------------------------------------------------------


@pytest.mark.parametrize("fixture", list(cv_fixtures.ALL))
def test_rectangles_fall_inside_their_pages(client, auth_headers, document, fixture):
    body = _post(client, auth_headers, document.id, _draft(fixture)).json()
    assert body["sections"]
    for s in body["sections"]:
        assert 0 <= s["page"] < len(body["pages"])
        assert 0 <= s["x"] and 0 <= s["y"] and s["w"] > 0 and s["h"] > 0
        assert s["x"] + s["w"] <= 1.0001 and s["y"] + s["h"] <= 1.0001


def test_a_section_over_a_page_break_has_a_rectangle_per_page_ending_at_its_text(
    client, auth_headers, document
):
    body = _post(client, auth_headers, document.id, _draft("long")).json()
    assert body["page_count"] >= 2
    experience = sorted((s for s in body["sections"] if s["id"] == "x"), key=lambda s: s["page"])
    assert [s["page"] for s in experience][:2] == [0, 1]
    first, last = experience[0], experience[-1]
    # Page 1 runs to the bottom margin, the continuation starts at the top margin and
    # stops above the next section, not at the page bottom.
    assert first["y"] + first["h"] > 0.9 and last["y"] < 0.1
    projects = next(s for s in body["sections"] if s["id"] == "p" and s["page"] == last["page"])
    assert last["y"] + last["h"] <= projects["y"] + 0.001
    assert last["h"] < 0.9

    # The rectangles enclose the section's words in the PDF itself.
    pdf = render_pdf(build_render_model(cv_fixtures.long_cv(), "classic", CvStyle()))
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        for s in experience:
            page = doc[s["page"]]
            rect = fitz.Rect(
                s["x"] * page.rect.width,
                s["y"] * page.rect.height,
                (s["x"] + s["w"]) * page.rect.width,
                (s["y"] + s["h"]) * page.rect.height,
            ) + (-2, -2, 2, 2)
            inside = [w for w in page.get_text("words") if rect.contains(fitz.Rect(w[:4]))]
            assert inside, "no text inside the section rectangle"
    # Section contents of page 2 sit within the second rectangle, not the project text.
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        page = doc[last["page"]]
        project_words = page.search_for("Open source project 1")
        assert (
            project_words
            and project_words[0].y0 / page.rect.height >= last["y"] + last["h"] - 0.001
        )


def test_multi_page_returns_every_page(client, auth_headers, document):
    body = _post(client, auth_headers, document.id, _draft("long")).json()
    assert len(body["pages"]) == body["page_count"] >= 2


def test_more_than_eight_pages_is_truncated(client, auth_headers, document, monkeypatch):
    original = cv_preview.print_pdf

    def many_pages(html, script=None):
        pdf = original(html, script)
        with fitz.open(stream=pdf, filetype="pdf") as source, fitz.open() as doc:
            for _ in range(10):
                doc.insert_pdf(source, from_page=0, to_page=0)
            return doc.tobytes()

    monkeypatch.setattr(cv_preview, "print_pdf", many_pages)
    body = _post(client, auth_headers, document.id, _draft("maya")).json()
    assert body["page_count"] == 10 and len(body["pages"]) == 8 and body["truncated"] is True
    assert all(s["page"] < 8 for s in body["sections"])


def test_cyrillic_renders_with_its_own_text(client, auth_headers, document):
    response = _post(client, auth_headers, document.id, _draft("cyrillic"))
    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert any(s["id"] == "s" and s["kind"] == "summary" for s in body["sections"])


def test_unsupported_characters_are_reported_as_a_warning(client, auth_headers, document):
    draft = _draft("maya")
    draft["header"] = {**draft["header"], "headline": "Engineer กข"}
    body = _post(client, auth_headers, document.id, draft).json()
    assert [w["code"] for w in body["warnings"]] == ["unsupported_characters"]
    assert "ก" in body["warnings"][0]["characters"]


# -- parity --------------------------------------------------------------------


def test_preview_page_one_is_the_pdf_page_one_raster(client, auth_headers, document):
    body = _post(client, auth_headers, document.id, _draft("maya")).json()
    pdf = render_pdf(build_render_model(cv_fixtures.maya(), "classic", CvStyle()))
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        pix = doc[0].get_pixmap(dpi=cv_preview.PREVIEW_DPI, alpha=False)
        expected = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    actual = _image(body["pages"][0]).convert("RGB")
    assert actual.size == expected.size
    difference = ImageChops.difference(actual, expected).convert("L")
    # The probes draw nothing; only WebP's lossy coding differs.
    assert sum(difference.getdata()) / (actual.size[0] * actual.size[1]) < 1.0
    # The lossless raster of the measured PDF is the plain PDF's raster, pixel for pixel.
    from app.services.cv_chromium import print_pdf
    from app.services.cv_html import render_cv_html

    model = build_render_model(cv_fixtures.maya(), "classic", CvStyle())
    measured = print_pdf(render_cv_html(model), cv_preview.MEASURE_SCRIPT)
    with fitz.open(stream=measured, filetype="pdf") as doc:
        pix2 = doc[0].get_pixmap(dpi=cv_preview.PREVIEW_DPI, alpha=False)
    assert pix2.samples == pix.samples


# -- access --------------------------------------------------------------------


def test_requires_authentication(client, document):
    assert client.post(f"{PREFIX}/{document.id}/preview", json=_draft("maya")).status_code == 401


def test_another_users_cv_is_a_404(client, auth_headers, db, document):
    other = User(email="preview-other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    foreign = _saved(db, other)
    assert _post(client, auth_headers, foreign.id, _draft("maya")).status_code == 404
    assert _post(client, auth_headers, "does-not-exist", _draft("maya")).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"sections": "nope"},
        {"style": {"template_id": "no-such-template"}},
        {"header": {"name": "x" * 500}},
        {"unknown": 1},
        {
            "sections": [{"id": "a", "kind": "summary", "title": "T", "position": 0, "entries": []}]
            * 2
        },
    ],
)
def test_invalid_drafts_are_422(client, auth_headers, document, body):
    assert _post(client, auth_headers, document.id, body).status_code == 422


def test_an_oversized_body_is_refused(client, auth_headers, document):
    big = {"header": {"name": "A", "headline": "x" * 20}, "pad": "y" * 1_100_000}
    assert _post(client, auth_headers, document.id, big).status_code in {413, 422}


def test_missing_chromium_is_a_503(client, auth_headers, document, monkeypatch):
    async def unavailable(self):
        raise ChromiumUnavailableError()

    monkeypatch.setattr(ChromiumPool, "_get_browser", unavailable)
    response = _post(client, auth_headers, document.id, _draft("maya"))
    assert response.status_code == 503
    assert response.json()["detail"] == ChromiumUnavailableError.message


def test_rate_limit_is_60_per_minute(client, auth_headers, document, monkeypatch):
    calls = []

    def fake(model, **kwargs):  # noqa: ARG001
        calls.append(1)
        return cv_preview.PreviewResult(pages=[], page_count=0, sections=[], truncated=False)

    monkeypatch.setattr("app.routers.cv_documents.render_preview", fake)
    statuses = [_post(client, auth_headers, document.id, {}).status_code for _ in range(62)]
    assert statuses[:60] == [200] * 60 and statuses[60:] == [429, 429]
    assert len(calls) == 60
