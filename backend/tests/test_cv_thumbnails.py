"""Template gallery thumbnails: page 1 of the draft in every available template."""

from __future__ import annotations

import base64
import io

import pytest
from PIL import Image

from app.auth.security import hash_password
from app.models.cv_document import CvDocument
from app.models.user import User
from app.services import cv_thumbnails
from app.services.cv_chromium import ChromiumPool, ChromiumUnavailableError
from app.services.cv_html import available_template_ids
from tests import cv_fixtures

PREFIX = "/api/v1/cv-documents"
WEBP = "data:image/webp;base64,"


def _saved(db, user, fixture="maya", **overrides) -> CvDocument:
    cv = cv_fixtures.ALL[fixture]()
    fields = {"name": cv.name, "sections": cv.sections, "header": cv.header, **overrides}
    document = CvDocument(user_id=user.id, **fields)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def _post(client, headers, document_id, body=None):
    url = f"{PREFIX}/{document_id}/template-thumbnails"
    if body is None:
        return client.post(url, headers=headers)
    return client.post(url, json=body, headers=headers)


def _image(thumbnail: dict) -> Image.Image:
    assert thumbnail["url"].startswith(WEBP)
    return Image.open(io.BytesIO(base64.b64decode(thumbnail["url"][len(WEBP) :]))).convert("RGB")


def _colour_count(image: Image.Image, rgb: tuple[int, int, int], tolerance: int = 24) -> int:
    return sum(
        1
        for pixel in zip(*[iter(image.tobytes())] * 3, strict=True)
        if all(abs(channel - want) <= tolerance for channel, want in zip(pixel, rgb, strict=True))
    )


@pytest.fixture
def document(db, test_user):
    return _saved(db, test_user)


# -- shape ---------------------------------------------------------------------


def test_every_catalog_template_has_a_small_page_one_thumbnail(client, auth_headers, document):
    response = _post(client, auth_headers, document.id)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert body["sample"] is False
    ids = [t["template_id"] for t in body["thumbnails"]]
    assert ids == list(available_template_ids())
    for thumbnail in body["thumbnails"]:
        assert thumbnail["error"] is None and thumbnail["pages"] == 1
        image = _image(thumbnail)
        # A4 at 40 dpi.
        assert image.size == (thumbnail["width"], thumbnail["height"]) == (331, 468)
        # Small enough to send all of them in one response.
        assert len(thumbnail["url"]) < 24_000


def test_the_draft_style_is_used_but_each_template_is_its_own(client, auth_headers, document):
    plain = _post(client, auth_headers, document.id).json()["thumbnails"]
    red = "#b91c1c"
    styled = _post(
        client,
        auth_headers,
        document.id,
        {"style": {"accent_color": red, "template_id": "classic"}},
    ).json()["thumbnails"]
    # The chosen template does not limit the gallery.
    assert [t["template_id"] for t in styled] == list(available_template_ids())
    lagoon_plain = _image(next(t for t in plain if t["template_id"] == "lagoon"))
    lagoon_red = _image(next(t for t in styled if t["template_id"] == "lagoon"))
    target = (0xB9, 0x1C, 0x1C)
    assert _colour_count(lagoon_red, target) > 500 > _colour_count(lagoon_plain, target)


def test_letter_page_size_changes_the_thumbnail_shape(client, auth_headers, document):
    body = _post(client, auth_headers, document.id, {"style": {"page_size": "letter"}}).json()
    assert {(t["width"], t["height"]) for t in body["thumbnails"]} == {(340, 440)}


def test_the_draft_content_renders_not_the_saved_one(client, auth_headers, db, document):
    before = (list(document.sections), dict(document.header), document.style, document.updated_at)
    long = cv_fixtures.long_cv()
    body = _post(
        client, auth_headers, document.id, {"sections": long.sections, "header": long.header}
    ).json()
    assert all(t["pages"] >= 2 for t in body["thumbnails"])
    db.expire_all()
    fresh = db.get(CvDocument, document.id)
    assert (list(fresh.sections), dict(fresh.header), fresh.style, fresh.updated_at) == before


def test_cyrillic_content_renders(client, auth_headers, document):
    cv = cv_fixtures.cyrillic()
    body = _post(
        client, auth_headers, document.id, {"sections": cv.sections, "header": cv.header}
    ).json()
    assert all(t["url"] for t in body["thumbnails"])


def test_a_cv_without_entries_shows_the_sample_cv(client, auth_headers, db, test_user):
    empty = _saved(db, test_user, sections=[], header={"name": "Only A Name"})
    body = _post(client, auth_headers, empty.id).json()
    assert body["sample"] is True
    assert all(t["url"] and t["error"] is None for t in body["thumbnails"])
    # An empty section is no content either.
    draft = {
        "sections": [
            {"id": "a", "kind": "summary", "title": "Summary", "position": 0, "entries": []}
        ]
    }
    assert _post(client, auth_headers, empty.id, draft).json()["sample"] is True


def test_has_content_counts_only_visible_entries():
    cv = cv_fixtures.maya()
    assert cv_thumbnails.has_content(cv)
    for section in cv.sections:
        section["visible"] = False
    assert not cv_thumbnails.has_content(cv)


# -- failure isolation ---------------------------------------------------------


def test_one_failing_template_does_not_take_the_others_down(
    client, auth_headers, document, monkeypatch
):
    original = cv_thumbnails.render_cv_html

    def broken_for_slate(model, **kwargs):
        if model.template_id == "slate":
            raise RuntimeError("boom")
        return original(model, **kwargs)

    monkeypatch.setattr(cv_thumbnails, "render_cv_html", broken_for_slate)
    body = _post(client, auth_headers, document.id).json()
    by_id = {t["template_id"]: t for t in body["thumbnails"]}
    assert by_id["slate"]["url"] is None and by_id["slate"]["error"] == cv_thumbnails.FAILED_MESSAGE
    assert all(t["url"] for tid, t in by_id.items() if tid != "slate")


def test_the_budget_marks_late_templates_instead_of_waiting(monkeypatch):
    clock = iter(range(0, 1000, 10))
    monkeypatch.setattr(cv_thumbnails.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(
        cv_thumbnails,
        "_render_one",
        lambda document, style, template_id, timeout: cv_thumbnails.Thumbnail(template_id, "x"),
    )
    from app.schemas.cv_documents import CvStyle

    result = cv_thumbnails.render_thumbnails(cv_fixtures.maya(), CvStyle(), budget=25)
    errors = [t.error for t in result.thumbnails]
    # Deadline 25: two templates start in time (t=10, 20), the rest are past it.
    assert errors[:2] == [None, None]
    assert set(errors[2:]) == {cv_thumbnails.TIMEOUT_MESSAGE}


def test_missing_chromium_is_a_503(client, auth_headers, document, monkeypatch):
    async def unavailable(self):
        raise ChromiumUnavailableError()

    monkeypatch.setattr(ChromiumPool, "_get_browser", unavailable)
    response = _post(client, auth_headers, document.id)
    assert response.status_code == 503
    assert response.json()["detail"] == ChromiumUnavailableError.message


# -- access --------------------------------------------------------------------


def test_requires_authentication(client, document):
    assert client.post(f"{PREFIX}/{document.id}/template-thumbnails").status_code == 401


def test_another_users_cv_is_a_404(client, auth_headers, db, document):
    other = User(email="thumbs-other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    foreign = _saved(db, other)
    assert _post(client, auth_headers, foreign.id).status_code == 404
    assert _post(client, auth_headers, "does-not-exist").status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"sections": "nope"},
        {"style": {"template_id": "no-such-template"}},
        {"style": {"accent_color": "red"}},
        {"unknown": 1},
    ],
)
def test_invalid_drafts_are_422(client, auth_headers, document, body):
    assert _post(client, auth_headers, document.id, body).status_code == 422


def test_rate_limit_is_20_per_minute(client, auth_headers, document, monkeypatch):
    calls = []

    def fake(source, style):
        calls.append(1)
        return cv_thumbnails.ThumbnailSet(thumbnails=[], sample=False)

    monkeypatch.setattr("app.routers.cv_documents.render_thumbnails", fake)
    statuses = [_post(client, auth_headers, document.id).status_code for _ in range(22)]
    assert statuses[:20] == [200] * 20 and statuses[20:] == [429, 429]
    assert len(calls) == 20
