"""Autopilot experiment: fill an approved form, never submit (#325).

Browser tests run headless against the committed fixture forms in
``tests/fixtures/autofill/`` only — never against a live employer site. They call
the fill step directly, which is what lets them use ``file://`` pages without
touching the production host allowlist.
"""

from __future__ import annotations

import re
import threading
from concurrent.futures import Future
from pathlib import Path

import pytest

from app.auth.security import create_access_token, hash_password
from app.config import settings
from app.models.user import User
from app.services import autopilot_autofill
from app.services.autopilot_autofill import (
    AutofillBusy,
    AutofillMaterials,
    AutofillRefused,
    AutofillReport,
    SubmitRefused,
    _run,
    _safe_click,
    assert_allowed_apply_url,
    fill_application,
    form_url,
    start_autofill,
)
from tests.test_packet_approval_snapshot import _approvable_packet, approve_packet

FIXTURES = Path(__file__).parent / "fixtures" / "autofill"
PREFIX = "/api/v1"
MATERIALS = AutofillMaterials(
    url="https://jobs.lever.co/acme/123",
    first_name="Ada",
    last_name="Lovelace",
    email="ada@example.com",
    phone="+44 20 7946 0958",
    linkedin="https://www.linkedin.com/in/ada",
    website="https://ada.dev",
    resume_pdf=b"%PDF-1.4 fixture",
    resume_filename="Ada-Lovelace-CV.pdf",
    cover_letter="Dear Acme, I would like to join.",
    answers=[
        ("Notice period?", "Two weeks."),
        ("Why do you want to work at Acme?", "Reliable systems matter to me."),
    ],
)


# ── Host allowlist ──


@pytest.mark.parametrize(
    "url",
    [
        "https://boards.greenhouse.io/acme/jobs/1",
        "https://job-boards.greenhouse.io/acme/jobs/1",
        "https://jobs.lever.co/acme/123/apply",
        "https://jobs.ashbyhq.com/acme/abc",
    ],
)
def test_allowlisted_https_hosts_pass(url):
    assert assert_allowed_apply_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "http://boards.greenhouse.io/acme/jobs/1",
        "https://boards.greenhouse.io.evil.example/acme",
        "https://evil.example/?next=https://jobs.lever.co",
        "https://user:pw@jobs.lever.co/acme/1",
        "https://jobs.lever.co:8443/acme/1",
        "https://careers.acme.example/apply",
        "file:///etc/passwd",
        "",
    ],
)
def test_other_hosts_are_refused(url):
    with pytest.raises(AutofillRefused):
        assert_allowed_apply_url(url)


def test_form_url_points_at_the_hosted_form():
    assert form_url("https://jobs.lever.co/acme/123") == "https://jobs.lever.co/acme/123/apply"
    assert form_url("https://jobs.lever.co/acme/123/apply") == (
        "https://jobs.lever.co/acme/123/apply"
    )
    assert form_url("https://jobs.ashbyhq.com/acme/abc") == (
        "https://jobs.ashbyhq.com/acme/abc/application"
    )
    assert form_url("https://boards.greenhouse.io/acme/jobs/1") == (
        "https://boards.greenhouse.io/acme/jobs/1"
    )


def test_start_refuses_a_non_allowlisted_url_before_opening_anything(monkeypatch):
    monkeypatch.setattr(autopilot_autofill, "_run", lambda *a: pytest.fail("browser opened"))
    with pytest.raises(AutofillRefused):
        start_autofill("user-1", AutofillMaterials(url="https://careers.acme.example/apply"))


def test_one_run_at_a_time_per_owner(monkeypatch):
    monkeypatch.setattr(autopilot_autofill, "_run", lambda *a: None)
    first = start_autofill("user-1", AutofillMaterials(url=MATERIALS.url))
    with pytest.raises(AutofillBusy):
        start_autofill("user-1", AutofillMaterials(url=MATERIALS.url))
    start_autofill("user-2", AutofillMaterials(url=MATERIALS.url)).set_result(None)
    first.set_result(None)
    start_autofill("user-1", AutofillMaterials(url=MATERIALS.url)).set_result(None)


# ── Never submits: static guard ──


def test_no_code_path_clicks_presses_or_submits():
    source = Path(autopilot_autofill.__file__).read_text()
    # The one click lives inside _safe_click, which refuses submit controls.
    assert source.count(".click(") == 1
    assert re.search(r"def _safe_click\(.*?\n    locator\.click\(\)", source, re.S)
    for forbidden in (".press(", "keyboard", ".submit(", "requestSubmit", "dispatch_event",
                      "dispatchEvent", ".tap(", ".check("):
        assert forbidden not in source, forbidden


# ── Browser tests against local fixture forms (headless) ──


@pytest.fixture(scope="module")
def browser():
    try:
        from playwright.sync_api import sync_playwright

        manager = sync_playwright().start()
    except Exception as exc:  # pragma: no cover — environment without Playwright
        pytest.skip(f"Playwright unavailable: {exc}")
    try:
        chromium = manager.chromium.launch(headless=True)
    except Exception as exc:  # pragma: no cover — Chromium binary not installed
        manager.stop()
        pytest.skip(f"Chromium not installed: {exc}")
    yield chromium
    chromium.close()
    manager.stop()


def _open(browser, name: str):
    page = browser.new_page()
    page.goto((FIXTURES / name).as_uri())
    return page


def test_fills_a_greenhouse_form_and_does_not_submit(browser, tmp_path):
    page = _open(browser, "greenhouse.html")

    report = fill_application(page, MATERIALS, tmp_path)

    assert page.input_value("#first_name") == "Ada"
    assert page.input_value("#last_name") == "Lovelace"
    assert page.input_value("#email") == "ada@example.com"
    assert page.input_value("#phone") == "+44 20 7946 0958"
    assert page.input_value("#question_1") == "https://www.linkedin.com/in/ada"
    assert page.input_value("#question_2") == "https://ada.dev"
    assert page.input_value("#question_3") == "Two weeks."
    assert page.eval_on_selector("#resume", "el => el.files[0].name") == "Ada-Lovelace-CV.pdf"
    assert page.eval_on_selector("#cover_letter", "el => el.files[0].name") == (
        "Cover-letter.txt"
    )
    # The work-authorization choice is the owner's: left empty and highlighted.
    assert report.skipped == ["Are you legally authorized to work in the country? *"]
    assert "3px" in page.eval_on_selector("#question_4", "el => el.style.outline")
    assert "First Name *" in report.filled and "Resume/CV *" in report.filled
    assert page.evaluate("window.__submitted") is False
    assert page.url.startswith("file://")
    page.close()


def test_fills_a_lever_form_and_does_not_submit(browser, tmp_path):
    page = _open(browser, "lever.html")

    report = fill_application(page, MATERIALS, tmp_path)

    assert page.input_value("input[name=name]") == "Ada Lovelace"
    assert page.input_value("input[name=email]") == "ada@example.com"
    assert page.input_value("input[name=phone]") == "+44 20 7946 0958"
    assert page.input_value("input[name='urls[LinkedIn]']") == "https://www.linkedin.com/in/ada"
    assert page.input_value("input[name='urls[Portfolio]']") == "https://ada.dev"
    assert page.input_value("textarea[name='cards[abc][field0]']") == (
        "Reliable systems matter to me."
    )
    assert page.input_value("textarea[name=comments]") == "Dear Acme, I would like to join."
    assert page.eval_on_selector(
        "#resume-upload-input", "el => el.files[0].name"
    ) == "Ada-Lovelace-CV.pdf"
    assert report.skipped == ["Current company"]
    assert page.evaluate("window.__submitted") is False
    page.close()


def test_blank_details_are_left_for_the_owner(browser, tmp_path):
    page = _open(browser, "lever.html")
    report = fill_application(page, AutofillMaterials(url=MATERIALS.url), tmp_path)
    assert report.filled == []
    assert "Full name✱" in report.skipped
    assert page.evaluate("window.__submitted") is False
    page.close()


def test_safe_click_refuses_submit_controls(browser):
    for name, selector in (
        ("greenhouse.html", "#submit_app"),
        ("lever.html", "button.template-btn-submit"),
    ):
        page = _open(browser, name)
        with pytest.raises(SubmitRefused):
            _safe_click(page.locator(selector))
        assert page.evaluate("window.__submitted") is False
        # Sanity check on the fixture: a real press of submit is detected
        # (validation off, since the required fields are still empty).
        page.evaluate("document.forms[0].noValidate = true")
        page.locator(selector).click()
        assert page.evaluate("window.__submitted") is True
        page.close()


def test_worker_fills_then_closes_when_headless(browser, tmp_path):
    """The thread body end to end on a fixture page (the allowlist lives in start_autofill)."""
    result: Future = Future()
    local = AutofillMaterials(**{**MATERIALS.__dict__, "url": (FIXTURES / "lever.html").as_uri()})
    worker = threading.Thread(target=_run, args=(local, result, True))
    worker.start()
    report = result.result(timeout=60)
    worker.join(timeout=30)
    assert isinstance(report, AutofillReport)
    assert "Email✱" in report.filled


# ── Endpoint ──


def _approved(db, user_id: str, source_url: str | None = "https://jobs.lever.co/acme/123"):
    packet = _approvable_packet(db, user_id, source_url=source_url)
    approve_packet(db, user_id, packet.id)
    return packet


def _fake_start(calls: list):
    def fake(user_id, materials, **_kwargs):
        calls.append((user_id, materials))
        future: Future = Future()
        future.set_result(AutofillReport(url=materials.url, filled=["Email"], skipped=["Pronouns"]))
        return future

    return fake


@pytest.fixture
def autopilot_on(monkeypatch):
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", True)


def test_flag_off_is_404(client, db, test_user, auth_headers):
    packet = _approved(db, test_user.id)
    response = client.post(f"{PREFIX}/packets/{packet.id}/autofill", headers=auth_headers)
    assert response.status_code == 404


def test_fills_an_approved_packet_with_its_approved_materials(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    calls: list = []
    monkeypatch.setattr("app.routers.packets.start_autofill", _fake_start(calls))
    packet = _approved(db, test_user.id)

    response = client.post(f"{PREFIX}/packets/{packet.id}/autofill", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "filled": ["Email"],
        "skipped": ["Pronouns"],
        "url": "https://jobs.lever.co/acme/123",
    }
    user_id, materials = calls[0]
    assert user_id == test_user.id
    assert (materials.first_name, materials.last_name) == ("Test", "User")
    assert materials.email == "test@example.com"
    assert materials.cover_letter == "Original cover letter."
    assert materials.resume_pdf.startswith(b"%PDF")
    assert materials.resume_filename == "Test-User-CV.pdf"


def test_pending_packet_is_refused(client, db, test_user, auth_headers, autopilot_on):
    packet = _approvable_packet(db, test_user.id, source_url="https://jobs.lever.co/acme/1")
    response = client.post(f"{PREFIX}/packets/{packet.id}/autofill", headers=auth_headers)
    assert response.status_code == 409


def test_non_allowlisted_destination_is_refused(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    monkeypatch.setattr(
        "app.routers.packets.start_autofill", lambda *a, **k: pytest.fail("browser opened")
    )
    packet = _approved(db, test_user.id, source_url="https://jobs.example/apply/1")
    response = client.post(f"{PREFIX}/packets/{packet.id}/autofill", headers=auth_headers)
    assert response.status_code == 400
    assert "Greenhouse, Lever, or Ashby" in response.json()["detail"]


def test_another_owners_packet_is_404(client, db, test_user, autopilot_on, monkeypatch):
    monkeypatch.setattr(
        "app.routers.packets.start_autofill", lambda *a, **k: pytest.fail("browser opened")
    )
    packet = _approved(db, test_user.id)
    other = User(email="other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    response = client.post(f"{PREFIX}/packets/{packet.id}/autofill", headers=headers)
    assert response.status_code == 404
