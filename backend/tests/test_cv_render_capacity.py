"""Render capacity (#471 review): one render at a time per user, a newer preview supersedes the
older one, a full queue answers 503 'busy' after a short wait, and a computed fit is reused."""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

from app.models.cv_document import CvDocument
from app.schemas.cv_documents import CvStyle
from app.services import cv_fit, cv_render_lanes
from app.services.cv_chromium import (
    QUEUE_TIMEOUT_SECONDS,
    ChromiumPool,
    RenderBusyError,
    RenderCancelledError,
)
from app.services.cv_fit import PREVIEW_MAX_RENDERS, render_pdf_fitted, with_fit_option
from app.services.cv_preview import PreviewResult, render_preview
from app.services.cv_render_lanes import RenderLanes
from app.services.cv_rendering import build_render_model
from tests import cv_fixtures

PREFIX = "/api/v1/cv-documents"


def _wait_for(condition, seconds: float = 5.0) -> None:
    deadline = time.monotonic() + seconds
    while not condition():
        assert time.monotonic() < deadline, "timed out waiting"
        time.sleep(0.01)


# -- per-user lanes --------------------------------------------------------------------


def test_a_newer_preview_cancels_the_older_one_and_then_runs():
    lanes = RenderLanes(wait_seconds=2)
    holding, outcome = threading.Event(), {}

    def older():
        try:
            with lanes.hold("u1", "preview", supersede=True) as ticket:
                holding.set()
                while True:  # a render loop that checks between renders
                    ticket.check()
                    time.sleep(0.01)
        except RenderCancelledError:
            outcome["older"] = "cancelled"

    thread = threading.Thread(target=older)
    thread.start()
    holding.wait(2)
    with lanes.hold("u1", "preview", supersede=True) as ticket:
        ticket.check()
        outcome["newer"] = "ran"
    thread.join(2)
    assert outcome == {"older": "cancelled", "newer": "ran"}


def test_a_waiting_preview_is_cancelled_by_an_even_newer_one():
    lanes = RenderLanes(wait_seconds=2)
    release = threading.Event()
    results: dict[str, str] = {}

    def holder():
        with lanes.hold("u1", "quality"):
            release.wait(5)

    def preview(name):
        try:
            with lanes.hold("u1", "preview", supersede=True):
                results[name] = "ran"
        except RenderCancelledError:
            results[name] = "cancelled"

    blocking = threading.Thread(target=holder)
    blocking.start()
    _wait_for(lambda: lanes.busy("u1"))
    first = threading.Thread(target=preview, args=("first",))
    first.start()
    _wait_for(lambda: lanes.waiting("u1") == 1)
    second = threading.Thread(target=preview, args=("second",))
    second.start()
    first.join(2)
    release.set()
    for thread in (blocking, second):
        thread.join(2)
    # A quality check is never superseded by a preview; the older preview is.
    assert results == {"first": "cancelled", "second": "ran"}


def test_one_user_at_a_time_and_a_second_user_is_not_starved():
    lanes = RenderLanes(wait_seconds=0.2)
    release = threading.Event()

    def hog():
        with lanes.hold("u1", "quality"):
            release.wait(5)

    thread = threading.Thread(target=hog)
    thread.start()
    _wait_for(lambda: lanes.busy("u1"))
    try:
        started = time.monotonic()
        with pytest.raises(RenderBusyError):  # the same user's second render waits, then gives up
            with lanes.hold("u1", "thumbnails"):
                pass
        assert time.monotonic() - started < 1
        with lanes.hold("u2", "preview", supersede=True) as ticket:  # another user goes at once
            ticket.check()
    finally:
        release.set()
        thread.join(2)
    assert not lanes.busy("u1") and lanes.waiting("u1") == 0


# -- the render slots ------------------------------------------------------------------


async def _fake_browser(self):
    return object()


def test_a_render_waiting_for_a_slot_gives_up_busy_after_the_queue_timeout(monkeypatch):
    assert QUEUE_TIMEOUT_SECONDS == 5.0
    assert issubclass(RenderBusyError, cv_fit.CvRenderUnavailableError)
    assert RenderBusyError.message.endswith(".") and "busy" in RenderBusyError.message

    async def slow(self, html, prepare_script=None, browser=None):
        await asyncio.sleep(1.5)
        return b"%PDF"

    monkeypatch.setattr(ChromiumPool, "_print_once", slow)
    monkeypatch.setattr(ChromiumPool, "_get_browser", _fake_browser)
    pool = ChromiumPool(concurrency=1, queue_timeout=0.2)
    thread = threading.Thread(target=pool.print_pdf, args=("<p>x</p>",))
    try:
        thread.start()
        _wait_for(lambda: pool.in_flight == 1)
        started = time.monotonic()
        with pytest.raises(RenderBusyError):
            pool.print_pdf("<p>y</p>")
        assert time.monotonic() - started < 1
        thread.join(5)
    finally:
        pool.shutdown()


def test_a_busy_preview_is_a_503_with_a_plain_sentence(client, auth_headers, db, test_user, monkeypatch):
    document = _saved(db, test_user)

    def busy(*args, **kwargs):
        raise RenderBusyError()

    monkeypatch.setattr("app.routers.cv_documents.render_preview", busy)
    response = client.post(f"{PREFIX}/{document.id}/preview", json={}, headers=auth_headers)
    assert response.status_code == 503
    assert response.json()["detail"] == RenderBusyError.message


# -- the preview endpoint supersedes -----------------------------------------------------


def _saved(db, user, cv=None) -> CvDocument:
    cv = cv or cv_fixtures.maya()
    document = CvDocument(user_id=user.id, name=cv.name, sections=cv.sections, header=cv.header)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def test_concurrent_previews_from_one_user_supersede(client, auth_headers, db, test_user, monkeypatch):
    document = _saved(db, test_user)
    started = threading.Event()
    calls: list[str] = []

    def fake_render(model, *, width=None, check_cancelled=None):
        calls.append(model.document_name)
        if len(calls) == 1:
            started.set()
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                check_cancelled()  # raises once a newer preview arrives
                time.sleep(0.01)
        return PreviewResult(pages=[], page_count=1, sections=[], truncated=False)

    monkeypatch.setattr("app.routers.cv_documents.render_preview", fake_render)
    first: dict = {}
    thread = threading.Thread(
        target=lambda: first.update(
            response=client.post(f"{PREFIX}/{document.id}/preview", json={"name": "old"}, headers=auth_headers)
        )
    )
    thread.start()
    assert started.wait(5)
    newer = client.post(f"{PREFIX}/{document.id}/preview", json={"name": "new"}, headers=auth_headers)
    thread.join(5)
    assert newer.status_code == 200, newer.text
    assert first["response"].status_code == 409
    assert first["response"].json()["detail"].endswith(".")
    assert calls == ["old", "new"]


# -- fit reuse -------------------------------------------------------------------------


def _slightly_long():
    cv = cv_fixtures.long_cv()
    for entry in cv.sections[1]["entries"]:
        entry["bullets"] = entry["bullets"][:3]
    return cv


def _fit_model():
    style = CvStyle(fit_one_page=True)
    return with_fit_option(build_render_model(_slightly_long(), "classic", style), True)


class _Counter:
    def __init__(self, monkeypatch):
        self.count = 0
        original = ChromiumPool._print_once

        async def counted(pool, html, prepare_script=None, browser=None):
            self.count += 1
            return await original(pool, html, prepare_script, browser)

        monkeypatch.setattr(ChromiumPool, "_print_once", counted)


@pytest.fixture
def renders(monkeypatch):
    cv_fit.clear_fit_caches()
    yield _Counter(monkeypatch)
    cv_fit.clear_fit_caches()


def test_the_preview_spends_at_most_four_renders_on_fitting(renders):
    assert PREVIEW_MAX_RENDERS == 4
    preview = render_preview(_fit_model())
    assert preview.fit is not None and 2 <= renders.count <= PREVIEW_MAX_RENDERS


def test_quality_after_a_preview_reuses_the_fit_and_a_repeat_renders_nothing(renders):
    model = _fit_model()
    preview = render_preview(model)
    before = renders.count
    pdf, fit = render_pdf_fitted(model)
    assert renders.count == before + 1  # the chosen scale is printed once, no new search
    assert fit == preview.fit
    again, fit_again = render_pdf_fitted(model)
    assert renders.count == before + 1 and again == pdf and fit_again == fit  # the PDF is reused


def test_a_different_document_or_style_misses_the_cache(renders):
    model = _fit_model()
    render_pdf_fitted(model)
    first = renders.count
    other = with_fit_option(
        build_render_model(_slightly_long(), "classic", CvStyle(fit_one_page=True, density="compact")), True
    )
    render_pdf_fitted(other)
    assert renders.count > first


def test_a_cut_short_fit_is_not_cached(monkeypatch):
    cv_fit.clear_fit_caches()
    model = _fit_model()
    calls = []

    def flaky(html, script=None, timeout=None):
        calls.append(1)
        if len(calls) == 2:
            raise cv_fit.RenderTimeoutError()
        from tests.test_cv_fit import _fake_pdf

        return _fake_pdf(2 if len(calls) == 1 else 1)

    fit, _ = cv_fit.fit_cached(model, render=flaky)
    assert fit.reason == "time"
    calls.clear()
    fit, _ = cv_fit.fit_cached(model, render=flaky)
    assert len(calls) > 1  # searched again
    cv_fit.clear_fit_caches()


def test_lanes_module_has_one_shared_instance():
    assert isinstance(cv_render_lanes.render_lanes, RenderLanes)
    assert cv_render_lanes.render_lanes.wait_seconds == QUEUE_TIMEOUT_SECONDS
