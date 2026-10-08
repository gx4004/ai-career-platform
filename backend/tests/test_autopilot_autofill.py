"""Autopilot experiment: fill an approved form, never submit (#325, #375).

Browser tests run headless against the committed fixture forms in
``tests/fixtures/autofill/`` only, served under the real ATS host names by
Playwright routing. Nothing here ever reaches a live site.

The autouse ``hermetic`` guard enforces that: the experiment flag is off unless a
test turns it on, a real browser launches only for tests that request the
``browser`` fixture (and always headless), every browser context serves the
fixtures under their real URLs and refuses anything else, and any non-GET
request (a submission, an upload POST) is recorded and fails the test.
"""

from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

import pytest

from app.auth.security import create_access_token, hash_password
from app.config import settings
from app.models.user import User
from app.services import autopilot
from app.services.autopilot import runner
from app.services.autopilot.policy import (
    AutofillBusy,
    AutofillMaterials,
    AutofillRefused,
    FillDecision,
    assert_allowed_apply_url,
    ats_form_url,
    fill_decision,
)
from app.services.autopilot.runner import (
    AutofillReport,
    AutofillRun,
    BrowserUnavailable,
    FormNotFound,
    JobClosed,
    RunCancelled,
    _run,
    _wait_for_owner,
    cancel_run,
    open_form,
    start_autofill,
)
from tests.test_applications import make_application

try:
    import playwright.sync_api as _playwright_api
    from playwright.sync_api import sync_playwright as _real_sync_playwright
except ImportError:  # pragma: no cover — environment without Playwright
    _playwright_api = None

FIXTURES = Path(__file__).parent / "fixtures" / "autofill"
PREFIX = "/api/v1/applications"
GH_LEGACY = "https://boards.greenhouse.io/embed/job_app?for=acme&token=1001"
GH_MOVED = "https://boards.greenhouse.io/embed/job_app?for=acme&token=1002"
GH_JOB_BOARDS = "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1002"
LEVER = "https://jobs.lever.co/acme/123/apply"
ASHBY = "https://jobs.ashbyhq.com/acme/4f7e2c1a-0000-4000-8000-000000000001/application"
# The fixtures, under the real URLs the form-URL builder produces.
FIXTURE_PAGES = {
    GH_LEGACY: "greenhouse_legacy.html",
    GH_JOB_BOARDS: "greenhouse_job_boards.html",
    LEVER: "lever.html",
    ASHBY: "ashby.html",
}
# Greenhouse sends a board that moved to the new layout on to job-boards.
FIXTURE_REDIRECTS = {GH_MOVED: GH_JOB_BOARDS}

MATERIALS = AutofillMaterials(
    url=LEVER,
    first_name="Ada",
    last_name="Lovelace",
    email="ada@example.com",
    phone="+44 20 7946 0958",
    linkedin="https://www.linkedin.com/in/ada",
    website="https://ada.dev",
    location="London, UK",
    resume_pdf=b"%PDF-1.4 fixture",
    resume_filename="Ada-Lovelace-CV.pdf",
    cover_letter="Dear Acme, I would like to join.",
    answers=[
        ("Notice period?", "Two weeks."),
        ("Why do you want to work at Acme?", "Reliable systems matter to me."),
        # Drafted answers to stop questions: must never be typed anywhere.
        ("What are your salary expectations?", "Drafted figure"),
        ("Will you require visa sponsorship?", "Yes"),
    ],
    standing_answers={"work_authorization": "Yes", "visa_sponsorship": "No"},
)


# ── Hermetic guard: fixtures only, no visible window, flag off by default ──

_off_fixture_requests: list[str] = []
_sent_requests: list[str] = []  # any non-GET: a submission or an upload


def _is_local(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme in {"file", "data", "about", "blob"} or parts.hostname == "127.0.0.1"


def _serve_fixtures(route) -> None:
    """Registered first on every context, so a test's own ``route`` wins."""
    request, url = route.request, route.request.url
    if request.method not in {"GET", "HEAD"}:
        _sent_requests.append(f"{request.method} {url}")
        route.abort()
    elif url in FIXTURE_REDIRECTS:
        # Not a 302: Chromium follows a fulfilled redirect on the real network,
        # bypassing this route. A scripted move is a new, intercepted navigation.
        route.fulfill(
            body=f'<script>location.replace("{FIXTURE_REDIRECTS[url]}")</script>',
            content_type="text/html",
        )
    elif url in FIXTURE_PAGES:
        route.fulfill(path=FIXTURES / FIXTURE_PAGES[url], content_type="text/html")
    elif _is_local(url):
        route.fallback()
    else:
        _off_fixture_requests.append(url)
        route.abort()


class _GuardedBrowser:
    """A real Chromium whose contexts serve only the fixtures."""

    def __init__(self, browser):
        self._browser = browser

    def new_context(self, **kwargs):
        context = self._browser.new_context(**kwargs)
        context.route("**/*", _serve_fixtures)
        return context

    def new_page(self, **kwargs):
        return self.new_context(**kwargs).new_page()

    def __getattr__(self, name):
        return getattr(self._browser, name)


@contextmanager
def _guarded_playwright(opted_in: bool):
    """Stands in for ``sync_playwright`` inside the worker thread (``_run``)."""
    if not opted_in:
        _off_fixture_requests.append("real browser launch without the browser fixture")
        raise RuntimeError("This test did not opt in to a real browser.")
    with _real_sync_playwright() as pw:

        def launch(**_kwargs):  # always headless, whatever the caller asked for
            return _GuardedBrowser(pw.chromium.launch(headless=True))

        yield SimpleNamespace(chromium=SimpleNamespace(launch=launch))


@pytest.fixture(autouse=True)
def hermetic(request, monkeypatch):
    # A local backend/.env may turn the experiment on; tests start with it off.
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", False)
    if _playwright_api is not None:
        opted_in = "browser" in request.fixturenames
        monkeypatch.setattr(
            _playwright_api, "sync_playwright", partial(_guarded_playwright, opted_in)
        )
    _off_fixture_requests.clear()
    _sent_requests.clear()
    yield
    if _off_fixture_requests or _sent_requests:
        pytest.fail(f"Autopilot test left the fixtures: {_off_fixture_requests + _sent_requests}")


# ── URL policy: allowlist and the frozen form URL ──


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


@pytest.mark.parametrize(
    ("candidates", "expected"),
    [
        # Greenhouse: always the hosted form from board + job id, never the employer link.
        (("https://boards.greenhouse.io/acme/jobs/1001",
          "https://careers.acme.example/jobs?gh_jid=1001"), GH_LEGACY),
        (("https://job-boards.greenhouse.io/acme/jobs/1002",), GH_MOVED),
        ((None, "https://boards.greenhouse.io/embed/job_app?for=acme&token=1001"), GH_LEGACY),
        (("https://jobs.lever.co/acme/123",), LEVER),
        (("https://jobs.lever.co/acme/123/apply",), LEVER),
        (("https://jobs.ashbyhq.com/acme/4f7e2c1a-0000-4000-8000-000000000001",), ASHBY),
        # Nothing an ATS form can be built from.
        (("https://careers.acme.example/jobs?gh_jid=1001",), None),
        (("https://boards.greenhouse.io/acme",), None),
        (("https://boards.greenhouse.io/acme/jobs/not-a-number",), None),
        (("http://jobs.lever.co/acme/123",), None),
        (("https://jobs.eu.lever.co/acme/123",), None),
        ((None, None), None),
    ],
)
def test_form_url_is_built_from_board_and_job_id(candidates, expected):
    assert ats_form_url(*candidates) == expected
    if expected:
        assert_allowed_apply_url(expected)


def test_start_refuses_a_non_allowlisted_url_before_opening_anything(monkeypatch):
    monkeypatch.setattr(runner, "_run", lambda *a: pytest.fail("browser opened"))
    with pytest.raises(AutofillRefused):
        start_autofill("user-1", "app-1", AutofillMaterials(url="https://careers.acme.example/apply"))


def test_one_run_at_a_time_per_owner_until_the_browser_is_gone(monkeypatch):
    # The stub never finishes, like a browser window the owner still has open.
    monkeypatch.setattr(runner, "_run", lambda *a: None)
    first = start_autofill("user-1", "app-1", AutofillMaterials(url=LEVER))
    start_autofill("user-2", "app-2", AutofillMaterials(url=LEVER))
    with pytest.raises(AutofillBusy):
        start_autofill("user-1", "app-3", AutofillMaterials(url=LEVER))
    first.done.set()  # what _run does once the browser has closed
    start_autofill("user-1", "app-3", AutofillMaterials(url=LEVER))


# ── Never submits: static guard over every Autopilot module ──


def test_no_code_path_clicks_presses_or_submits():
    package = Path(autopilot.__file__).parent
    for module in package.glob("*.py"):
        source = module.read_text()
        for forbidden in (".click(", ".press(", "keyboard", ".submit(", "requestSubmit",
                          "dispatch_event", "dispatchEvent", ".tap(", ".check(",
                          "set_checked", ".type("):
            assert forbidden not in source, f"{module.name}: {forbidden}"


# ── Fill policy: label → decision ──

POLICY_MATERIALS = AutofillMaterials(
    url=LEVER,
    first_name="Ada",
    last_name="King Lovelace",
    email="ada@example.com",
    phone="+44 20 7946 0958",
    linkedin="https://www.linkedin.com/in/ada",
    website="https://ada.dev",
    location="London, UK",
    resume_pdf=b"%PDF",
    cover_letter="Dear Acme.",
    answers=[
        ("What is your favourite programming language?", "Python"),
        ("Expected salary?", "Drafted figure"),
        ("What is your notice period?", "Two weeks."),
        ("Why do you want to work at Acme?", "Drafted why"),
        ("Age", "41"),
    ],
    owner_answers=[
        ("Do you have a security clearance?", "No"),
        ("What are your salary expectations?", "95k EUR"),
        ("Gender", "Female"),
        ("Do you consent to the privacy policy?", "Yes"),
    ],
    standing_answers={
        "work_authorization": "Yes",
        "visa_sponsorship": "No",
        "salary_expectation": "90k EUR",
        "relocation": "Yes",
        "notice_period": "One month",
    },
)
YES_NO = ["--", "Yes", "No"]


def _control(label, tag="input", type="text", name="", options=(), **extra):
    return {"tag": tag, "type": type, "name": name, "id": "", "label": label,
            "options": list(options), **extra}


@pytest.mark.parametrize(
    ("control", "expected"),
    [
        # Contact fields: only from the owner's application details.
        (_control("Email", type="email"), ("contact:email", "ada@example.com")),
        (_control("First Name"), ("contact:first_name", "Ada")),
        (_control("Last Name"), ("contact:last_name", "King Lovelace")),
        (_control("Full name", name="name"), ("contact:full_name", "Ada King Lovelace")),
        (_control("Phone"), ("contact:phone", "+44 20 7946 0958")),
        (_control("LinkedIn Profile"), ("contact:linkedin", "https://www.linkedin.com/in/ada")),
        (_control("Portfolio URL"), ("contact:website", "https://ada.dev")),
        (_control("Location (City)"), ("contact:location", "London, UK")),
        (_control("Your name", contact="full_name"), ("contact:full_name", "Ada King Lovelace")),
        (_control("Phone interview availability", tag="textarea"), ("needs_you", "")),
        # Stop questions: this application's typed answer, then a standing answer.
        (_control("Do you have a security clearance?"), ("typed", "No")),
        (_control("What are your salary expectations?"), ("typed", "95k EUR")),
        (_control("Expected salary?"), ("standing:salary_expectation", "90k EUR")),
        (_control("What is your current salary?"), ("needs_you", "")),
        (_control("Are you legally authorized to work here?"),
         ("standing:work_authorization", "Yes")),
        (_control("Are you willing to relocate?"), ("standing:relocation", "Yes")),
        (_control("Why do you want to work at Acme?", tag="textarea"), ("needs_you", "")),
        # Drafted answers: non-stop text questions, best whole-word match only.
        (_control("What is your favourite programming language?"), ("drafted", "Python")),
        (_control("What languages do you speak?"), ("needs_you", "")),  # never "Age"
        (_control("What is your notice period?"), ("standing:notice_period", "One month")),
        # Choices: exact option only. A dropdown is set; the rest need a click, so
        # the owner is pointed at the option.
        (_control("Will you require visa sponsorship?", tag="select", options=YES_NO),
         ("standing:visa_sponsorship", "No")),
        (_control("Are you legally authorized to work here?", tag="select",
                  options=["--", "Yes, I am", "No"]), ("needs_you", "")),
        (_control("What is your favourite programming language?", tag="select",
                  options=["Python", "Go"]), ("needs_you", "")),
        (_control("Are you legally authorized to work here?", type="radio",
                  options=["Yes", "No"]), ("pick:standing:work_authorization", "Yes")),
        (_control("Will you require visa sponsorship?", type="combobox", options=[]),
         ("needs_you", "")),
        (_control("Location (City)", type="combobox"), ("needs_you", "")),
        (_control("Which offices could you work from?", type="checkbox",
                  options=["London", "Berlin"]), ("needs_you", "")),
        (_control("Do you have a driving licence?", type="checkbox"), ("needs_you", "")),
        # Never, whatever anyone typed.
        (_control("Gender", tag="select", options=["Male", "Female"]), ("never:eeo", "")),
        (_control("Are you a protected veteran?", tag="select", options=YES_NO),
         ("never:eeo", "")),
        (_control("Voluntary Self-Identification: Race"), ("never:eeo", "")),
        (_control("Your name", name="eeo[disabilitySignature]"), ("never:eeo", "")),
        (_control("I agree to the privacy policy", type="checkbox"), ("never:consent", "")),
        (_control("Do you consent to the privacy policy?", type="radio",
                  options=["Yes", "No"]), ("never:consent", "")),
        (_control("", tag="textarea", name="g-recaptcha-response"), ("never:captcha", "")),
        (_control("Submit application", type="submit"), ("never:control", "")),
        # Files: the resume only where the adapter says; the cover letter by slot or label.
        (_control("Resume/CV", type="file", slot="resume"), ("resume", "file")),
        (_control("Autofill from resume", type="file"), ("needs_you", "")),
        (_control("Cover Letter", type="file"), ("cover_file", "file")),
        (_control("Additional information", tag="textarea"), ("cover_text", "Dear Acme.")),
    ],
    ids=lambda value: value["label"] or value["name"] if isinstance(value, dict) else None,
)
def test_fill_policy(control, expected):
    assert fill_decision(control, POLICY_MATERIALS) == FillDecision(*expected)


def test_without_typed_answers_a_stop_question_is_left_for_the_owner():
    materials = AutofillMaterials(
        url=LEVER, answers=[("What are your salary expectations?", "Drafted figure")]
    )
    decision = fill_decision(_control("What are your salary expectations?"), materials)
    assert decision == FillDecision("needs_you")


# ── Browser: each ATS fixture, served under its real host ──


@pytest.fixture(scope="module")
def browser():
    """The opt-in: a headless Chromium that can only reach fixtures."""
    if _playwright_api is None:  # pragma: no cover — environment without Playwright
        pytest.skip("Playwright unavailable")
    manager = _real_sync_playwright().start()
    try:
        chromium = manager.chromium.launch(headless=True)
    except Exception as exc:  # pragma: no cover — Chromium binary not installed
        manager.stop()
        pytest.skip(f"Chromium not installed: {exc}")
    yield _GuardedBrowser(chromium)
    chromium.close()
    manager.stop()


# Reads a control as a person would, and whether Autopilot marked it for the owner.
_READ = """el => el.type === 'file' ? ((el.files[0] || {}).name || '')
  : (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? 'checked' : '')
  : el.tagName === 'SELECT' ? (el.selectedIndex > 0 ? el.selectedOptions[0].text.trim() : '')
  : el.value"""
_OWN_STATE = "el => el.getAttribute('data-cw-state')"
# The outermost mark wins: a question marked needs-you may hold a suggested option.
_STATE = """el => { let s = ''; for (let n = el; n; n = n.parentElement)
  if (n.hasAttribute('data-cw-state')) s = n.getAttribute('data-cw-state'); return s }"""

CONTRACTS = [
    pytest.param(
        GH_LEGACY, GH_LEGACY,
        {
            "#first_name": "Ada", "#last_name": "Lovelace", "#email": "ada@example.com",
            "#phone": "+44 20 7946 0958", "#job_application_location": "London, UK",
            "#job_application_answers_attributes_0_text_value": "https://www.linkedin.com/in/ada",
            "#job_application_answers_attributes_1_text_value": "https://ada.dev",
            "#job_application_answers_attributes_2_text_value": "Two weeks.",
            "#job_application_answers_attributes_3_boolean_value": "Yes",
            "#job_application_answers_attributes_4_boolean_value": "No",
            "#s3_upload_for_resume input": "Ada-Lovelace-CV.pdf",
            "#s3_upload_for_cover_letter input": "Cover-letter.txt",
        },
        [
            "#job_application_answers_attributes_5_text_value",  # salary: no typed answer
            "#custom_fields input[type=checkbox]",
            "#job_application_answers_attributes_7_text_value",  # relocation
            "#job_application_gender", "#job_application_hispanic_ethnicity",
            "#job_application_veteran_status", "#job_application_disability_status",
            "#gdpr_consent",
        ],
        id="greenhouse-legacy",
    ),
    pytest.param(
        GH_MOVED, GH_JOB_BOARDS,
        {
            "#first_name": "Ada", "#last_name": "Lovelace", "#preferred_name": "Ada",
            "#email": "ada@example.com", "#phone": "+44 20 7946 0958",
            "#question_2001": "https://www.linkedin.com/in/ada",
            "#question_2002": "https://ada.dev",
            "#resume": "Ada-Lovelace-CV.pdf", "#cover_letter": "Cover-letter.txt",
        },
        [
            # Comboboxes are never typed into, even with an owner's answer.
            "#country", "#candidate-location", "#question_2003", "#question_2004",
            "#question_2005", "#question_2006_1",
            "#gender", "#hispanic_ethnicity", "#veteran_status", "#disability_status",
            "#gdpr_demographic_data_consent_given_1",
        ],
        id="greenhouse-job-boards",
    ),
    pytest.param(
        LEVER, LEVER,
        {
            "input[name=name]": "Ada Lovelace", "input[name=email]": "ada@example.com",
            "input[name=phone]": "+44 20 7946 0958", "#location-input": "London, UK",
            "input[name='urls[LinkedIn]']": "https://www.linkedin.com/in/ada",
            "input[name='urls[Portfolio]']": "https://ada.dev",
            "select[name='cards[abc][field1]']": "No",
            "textarea[name=comments]": "Dear Acme, I would like to join.",
            "#resume-upload-input": "Ada-Lovelace-CV.pdf",
        },
        [
            "input[name=org]", "input[name='cards[abc][field0]']",
            "textarea[name='cards[abc][field2]']",
            "select[name='eeo[gender]']", "select[name='eeo[race]']",
            "select[name='eeo[veteran]']", "select[name='eeo[disability]']",
            "input[name='eeo[disabilitySignature]']", "input[name='consent[store]']",
        ],
        id="lever",
    ),
    pytest.param(
        ASHBY, ASHBY,
        {
            # Filled after the resume upload, so the parser's guess is replaced.
            "#_systemfield_name": "Ada Lovelace", "#_systemfield_email": "ada@example.com",
            "[id='8c1f0e1a']": "+44 20 7946 0958", "#a2b3c4d5": "https://www.linkedin.com/in/ada",
            "#notice-1": "Two weeks.",
            "#_systemfield_resume": "Ada-Lovelace-CV.pdf", "#cover-1": "Cover-letter.txt",
            "#_autofill_resume": "",  # never the parse-and-overwrite box
        },
        [
            "#loc-1", "input[name=auth-1]", "input[name=visa-1]", "input[name=heard-1]",
            "#why-1", "input[name=eeo-gender]", "input[name=eeo-race]",
            "input[name=eeo-veteran]", "input[name=consent-1]",
        ],
        id="ashby",
    ),
]


@pytest.mark.parametrize(("url", "final_url", "values", "needs_you"), CONTRACTS)
def test_fixture_contract(browser, tmp_path, url, final_url, values, needs_you):
    context = browser.new_context()
    page = context.new_page()
    materials = AutofillMaterials(**{**MATERIALS.__dict__, "url": url})

    report = open_form(page, materials, tmp_path)

    assert page.url == final_url
    for selector, expected in values.items():
        assert page.eval_on_selector(selector, _READ) == expected, selector
    for selector in needs_you:  # EEO, consent and unanswered questions: empty, highlighted
        assert page.eval_on_selector(selector, _READ) == "", selector
        assert page.eval_on_selector(selector, _STATE) == "needs-you", selector
    assert report.mismatched == []
    assert len(report.filled) == len([v for v in values.values() if v])
    assert page.evaluate("window.__submitted") is False
    assert _sent_requests == []
    banner = page.inner_text("[data-cw-banner]")
    assert f"filled {len(report.filled)} field" in banner and "press Submit yourself" in banner
    context.close()


def test_a_choice_that_needs_a_click_points_at_the_owners_answer(browser, tmp_path):
    page = browser.new_page()
    report = open_form(page, MATERIALS, tmp_path)  # Lever
    question = "li:has(input[name='cards[abc][field0]'])"
    assert "Are you legally authorized to work in the UK?✱ (pick: Yes)" in report.skipped
    assert page.eval_on_selector(f"{question} label:has(input[value=Yes])", _OWN_STATE) == (
        "suggested"
    )
    assert page.eval_on_selector_all(f"{question} input", "els => els.some(e => e.checked)") is (
        False
    )
    page.close()


def test_a_value_the_form_rejects_is_reported_not_counted(browser, tmp_path):
    # A phone field that strips everything but digits, as some React inputs do.
    rejecting = (FIXTURES / "ashby.html").read_text().replace(
        "</body>",
        "<script>document.getElementById('8c1f0e1a').addEventListener('input',"
        " e => { e.target.value = e.target.value.replace(/\\D/g, '') })</script></body>",
    )
    context = browser.new_context()
    context.route(ASHBY, lambda route: route.fulfill(body=rejecting, content_type="text/html"))
    page = context.new_page()

    report = open_form(page, AutofillMaterials(**{**MATERIALS.__dict__, "url": ASHBY}), tmp_path)

    assert report.mismatched == ["Phone Number"]
    assert "Phone Number" not in report.filled
    assert page.eval_on_selector("[id='8c1f0e1a']", _STATE) == "mismatch"
    context.close()


def test_the_no_submission_check_would_see_a_submission(browser):
    page = browser.new_page()
    page.goto(LEVER)
    page.evaluate("const f = document.getElementById('application-form'); f.noValidate = true; f.requestSubmit()")
    page.wait_for_function("window.__submitted === true")
    page.wait_for_timeout(200)
    assert _sent_requests == [f"POST {LEVER}"]
    _sent_requests.clear()  # seen and expected, so this test passes
    page.close()


def test_guard_stops_a_request_to_a_live_host(browser):
    page = browser.new_page()
    with pytest.raises(Exception):  # aborted before it leaves the machine
        page.goto("https://jobs.lever.co/someone-else/999/apply")
    assert _off_fixture_requests == ["https://jobs.lever.co/someone-else/999/apply"]
    _off_fixture_requests.clear()
    page.close()


def test_a_page_without_a_known_form_is_reported(browser, tmp_path):
    context = browser.new_context()
    context.route(LEVER, lambda route: route.fulfill(body="<p>This job is closed.</p>",
                                                     content_type="text/html"))
    page = context.new_page()
    with pytest.raises(FormNotFound):
        open_form(page, AutofillMaterials(**{**MATERIALS.__dict__, "url": LEVER}), tmp_path)
    context.close()


@pytest.fixture
def fixture_server():
    """The fixture forms over plain http on 127.0.0.1: a host that is not allowlisted."""
    handler = partial(SimpleHTTPRequestHandler, directory=str(FIXTURES))
    handler.log_message = lambda *a: None
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def test_a_redirect_off_the_allowlist_is_refused_and_nothing_is_filled(
    browser, tmp_path, fixture_server
):
    context = browser.new_context()
    context.route(
        GH_LEGACY,
        lambda route: route.fulfill(
            status=302, headers={"location": f"{fixture_server}/greenhouse_legacy.html"}
        ),
    )
    page = context.new_page()
    with pytest.raises(AutofillRefused):
        open_form(page, AutofillMaterials(**{**MATERIALS.__dict__, "url": GH_LEGACY}), tmp_path)
    assert not page.url.startswith("https://boards.greenhouse.io")
    assert page.evaluate("document.querySelector('#first_name')?.value || ''") == ""
    assert list(tmp_path.iterdir()) == []  # not even the CV was written out
    context.close()


# ── The background run ──


def _wait(run: AutofillRun, state: str, timeout: float = 60) -> dict:
    deadline = time.monotonic() + timeout
    while run.snapshot()["state"] != state and time.monotonic() < deadline:
        time.sleep(0.05)
    return run.snapshot()


def _work(run: AutofillRun, materials: AutofillMaterials, headless: bool = True) -> None:
    """``_run`` as the app runs it: in its own thread (Playwright's sync API needs one)."""
    worker = threading.Thread(target=_run, args=(run, materials, headless))
    worker.start()
    worker.join(timeout=60)
    assert not worker.is_alive()


def test_worker_cannot_launch_a_browser_without_opting_in():
    run = AutofillRun("app-1", LEVER)
    _work(run, MATERIALS, False)  # headed on a live URL: the old accident
    assert run.snapshot()["state"] == "failed"
    assert run.done.is_set()
    assert _off_fixture_requests
    _off_fixture_requests.clear()


def test_a_run_returns_at_once_fills_the_form_and_frees_the_owner(browser):
    run = start_autofill("user-8", "app-1", MATERIALS, headless=True)
    assert run.done.wait(60)
    status = run.snapshot()
    assert "Email✱" in status["report"]["filled"] and status["report"]["mismatched"] == []
    assert status["state"] == "closed"  # headless: nothing left for the owner to review
    start_autofill("user-8", "app-2", MATERIALS, headless=True).done.wait(60)


def test_the_owner_can_cancel_a_run_in_review_and_the_window_closes(browser):
    run = start_autofill("user-10", "app-1", MATERIALS, headless=False)
    assert _wait(run, "review")["report"]["filled"]
    assert run.snapshot()["seconds_left"] > 0
    cancel_run("user-10", "app-1")
    assert run.done.is_set()
    status = run.snapshot()
    assert (status["state"], status["kind"]) == ("closed", "cancelled")
    assert status["report"]["filled"]  # what was filled stays on record


def test_a_cancel_stops_the_fill_before_anything_more_is_typed(browser, tmp_path):
    page = browser.new_page()
    cancelled = threading.Event()
    cancelled.set()
    with pytest.raises(RunCancelled):
        open_form(page, MATERIALS, tmp_path, cancelled)
    assert page.evaluate("document.querySelector('input[name=email]')?.value || ''") == ""
    page.close()


def test_the_review_window_says_when_it_closed_itself(browser, monkeypatch):
    monkeypatch.setattr(runner, "REVIEW_WINDOW_SECONDS", 0.5)
    run = start_autofill("user-11", "app-1", MATERIALS, headless=False)
    assert run.done.wait(30)
    status = run.snapshot()
    assert (status["state"], status["kind"]) == ("closed", "window_expired")
    assert "30 minutes" in status["message"]


def test_waiting_for_the_owner_ends_when_the_tab_closes_or_time_runs_out(browser):
    page = browser.new_page()
    started = time.monotonic()
    deadline = started + 0.5
    assert _wait_for_owner(page, browser, deadline=deadline) == "expired"
    assert time.monotonic() - started < 10
    page.close()
    assert _wait_for_owner(page, browser) == "closed"  # already closed: returns at once


def test_worker_refuses_an_off_list_page_then_closes_and_frees_the_owner(browser, monkeypatch):
    monkeypatch.setattr(runner, "fill_form", lambda *a, **k: pytest.fail("filled anyway"))
    local = AutofillMaterials(**{**MATERIALS.__dict__, "url": (FIXTURES / "lever.html").as_uri()})
    run = AutofillRun("app-1", local.url)
    _work(run, local)
    status = run.snapshot()
    assert (status["state"], status["kind"]) == ("failed", "page_moved")
    assert status["next_step"] == "Open the apply page yourself."
    assert run.done.is_set()


@pytest.mark.parametrize(
    ("error", "kind"),
    [
        (AutofillRefused("moved"), "page_moved"),
        (JobClosed("gone"), "job_closed"),
        (FormNotFound("no form"), "form_not_found"),
        (BrowserUnavailable(), "browser_unavailable"),
        (type("TimeoutError", (Exception,), {})(), "timed_out"),
        (RuntimeError("boom"), "unexpected_error"),
    ],
)
def test_each_failure_kind_gets_a_message_and_a_next_step(browser, monkeypatch, error, kind):
    def broken(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(runner, "open_form", broken)
    run = AutofillRun("app-1", LEVER)
    _work(run, MATERIALS)
    status = run.snapshot()
    assert (status["state"], status["kind"]) == ("failed", kind)
    assert status["message"] and "yourself" in status["next_step"]


def test_a_closed_job_page_is_reported_as_closed(browser, tmp_path):
    context = browser.new_context()
    context.route(LEVER, lambda route: route.fulfill(status=404, body="<p>Gone</p>",
                                                     content_type="text/html"))
    with pytest.raises(JobClosed):
        open_form(context.new_page(), MATERIALS, tmp_path)
    context.close()


# ── Endpoint ──


def _ready(db, user_id: str, apply_url: str | None = "https://jobs.lever.co/acme/123"):
    return make_application(db, user_id, apply_url=apply_url, cv=True, drafts=True)


def _fake_start(calls: list):
    def fake(user_id, application_id, materials, **_kwargs):
        calls.append((user_id, application_id, materials))
        run = AutofillRun(application_id, materials.url)
        run.review(
            AutofillReport(
                url=materials.url, filled=["Email"], skipped=["Pronouns"], mismatched=["Phone"]
            ),
            time.monotonic() + 1800,
        )
        return run

    return fake


def _no_browser(monkeypatch):
    monkeypatch.setattr(
        "app.routers.applications.start_autofill", lambda *a, **k: pytest.fail("browser opened")
    )


@pytest.fixture
def autopilot_on(monkeypatch):
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", True)


def test_flag_off_is_404(client, db, test_user, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", False)
    _no_browser(monkeypatch)
    application = _ready(db, test_user.id)
    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)
    assert response.status_code == 404


def test_fills_with_the_applications_chosen_materials_and_answers(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    calls: list = []
    monkeypatch.setattr("app.routers.applications.start_autofill", _fake_start(calls))
    application = _ready(db, test_user.id)
    application.selected_cv_variant.document.header = {"name": "Ada King Lovelace", "email": "ada@example.com"}
    application.open_questions = [
        {"key": "q-1", "question": "What are your salary expectations?", "category": "salary"}
    ]
    application.answers = {"q-1": "90k EUR"}
    db.commit()
    saved = client.put(
        f"{PREFIX}/details",
        json={
            "full_name": "Ada King Lovelace",
            "email": "ada@example.com",
            "phone": "+44 20 7946 0958",
            "linkedin": "https://www.linkedin.com/in/ada",
            "website": "https://ada.dev",
            "location": "London, UK",
            "visa_sponsorship": "No",
            "notice_period": "One month",
        },
        headers=auth_headers,
    )
    assert saved.status_code == 200

    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)

    assert response.status_code == 202  # accepted: the fill runs in the background
    body = response.json()
    assert body["state"] == "review" and 1700 < body["seconds_left"] <= 1800
    assert body["report"] == {
        "filled": ["Email"],
        "skipped": ["Pronouns"],
        "mismatched": ["Phone"],
        "url": LEVER,
    }
    user_id, application_id, materials = calls[0]
    assert (user_id, application_id) == (test_user.id, application.id)
    assert (materials.first_name, materials.last_name) == ("Ada", "King Lovelace")
    assert (materials.email, materials.phone) == ("ada@example.com", "+44 20 7946 0958")
    assert (materials.linkedin, materials.website) == (
        "https://www.linkedin.com/in/ada",
        "https://ada.dev",
    )
    assert materials.location == "London, UK"
    assert materials.standing_answers == {"visa_sponsorship": "No", "notice_period": "One month"}
    assert materials.cover_letter == "Original cover letter."
    assert materials.answers == [("What is your notice period?", "Two weeks.")]
    assert materials.owner_answers == [("What are your salary expectations?", "90k EUR")]
    import fitz
    with fitz.open(stream=materials.resume_pdf, filetype="pdf") as pdf:
        resume_text = "\n".join(page.get_text() for page in pdf)
    assert "Ada King Lovelace" in resume_text
    assert "ada@example.com" in resume_text
    assert materials.resume_pdf.startswith(b"%PDF")
    assert materials.resume_filename == "Ada-King-Lovelace-CV.pdf"


def test_without_saved_details_only_the_account_name_and_email_are_used(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    calls: list = []
    monkeypatch.setattr("app.routers.applications.start_autofill", _fake_start(calls))
    application = _ready(db, test_user.id)

    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)

    assert response.status_code == 202
    materials = calls[0][2]
    assert (materials.first_name, materials.last_name) == ("Test", "User")
    assert materials.email == "test@example.com"
    # Nothing is guessed from the CV text.
    assert (materials.phone, materials.linkedin, materials.website, materials.location) == (
        "",
        "",
        "",
        "",
    )
    assert materials.standing_answers == {}


def test_a_greenhouse_employer_link_opens_the_hosted_greenhouse_form(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    calls: list = []
    monkeypatch.setattr("app.routers.applications.start_autofill", _fake_start(calls))
    application = _ready(db, test_user.id)
    application.listing.source_url = "https://boards.greenhouse.io/acme/jobs/1001"
    application.listing.apply_url = "https://careers.acme.example/jobs?gh_jid=1001"
    db.commit()

    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)

    assert response.status_code == 202
    assert calls[0][2].url == GH_LEGACY


def test_unanswered_open_questions_are_refused(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    _no_browser(monkeypatch)
    application = _ready(db, test_user.id)
    application.open_questions = [
        {"key": "q-1", "question": "Do you need a visa?", "category": "work_authorization"}
    ]
    db.commit()
    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)
    assert response.status_code == 409


def test_non_ats_destination_is_refused(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    _no_browser(monkeypatch)
    application = _ready(db, test_user.id, apply_url="https://jobs.example/apply/1")
    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)
    assert response.status_code == 400
    assert "Greenhouse, Lever, or Ashby" in response.json()["detail"]


def test_once_applied_it_opens_the_frozen_form_not_a_later_link(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    calls: list = []
    monkeypatch.setattr("app.routers.applications.start_autofill", _fake_start(calls))
    application = _ready(db, test_user.id)
    applied = client.post(f"{PREFIX}/{application.id}/applied", headers=auth_headers)
    assert applied.status_code == 200
    assert applied.json()["snapshot"]["content"]["listing"]["form_url"] == LEVER
    application.listing.source_url = "https://jobs.lever.co/someone-else/999"  # edited later
    application.listing.apply_url = "https://jobs.lever.co/someone-else/999"
    db.commit()

    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)

    assert response.status_code == 202
    assert calls[0][2].url == LEVER


def test_a_second_run_while_one_is_open_is_refused(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    def busy(*_args, **_kwargs):
        raise AutofillBusy

    monkeypatch.setattr("app.routers.applications.start_autofill", busy)
    application = _ready(db, test_user.id)
    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)
    assert response.status_code == 409


def test_status_is_idle_until_a_run_then_reports_failures_with_a_next_step(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    application = _ready(db, test_user.id)
    url = f"{PREFIX}/{application.id}/autofill"
    assert client.get(url, headers=auth_headers).json() == {
        "state": "idle", "kind": None, "message": None, "next_step": None,
        "seconds_left": None, "report": None,
    }

    run = AutofillRun(application.id, LEVER)
    run.fail(FormNotFound("The application form did not appear on that page."))
    monkeypatch.setitem(runner._runs, test_user.id, run)
    status = client.get(url, headers=auth_headers).json()
    assert (status["state"], status["kind"]) == ("failed", "form_not_found")
    assert status["message"] == "The application form did not appear on that page."
    assert status["next_step"] == "Open the apply page yourself."

    other = _ready(db, test_user.id)  # the run belongs to a different application
    assert client.get(f"{PREFIX}/{other.id}/autofill", headers=auth_headers).json()["state"] == "idle"


def test_delete_cancels_the_run_and_closes_the_window(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    application = _ready(db, test_user.id)
    run = AutofillRun(application.id, LEVER)
    run.done.set()  # the worker has nothing left to wind down
    monkeypatch.setitem(runner._runs, test_user.id, run)

    response = client.delete(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)

    assert response.status_code == 200
    assert (response.json()["state"], response.json()["kind"]) == ("closed", "cancelled")
    assert run.cancel.is_set()


@pytest.mark.parametrize("method", ["get", "delete"])
def test_status_and_cancel_follow_the_flag_and_the_owner(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch, method
):
    application = _ready(db, test_user.id)
    url = f"{PREFIX}/{application.id}/autofill"
    other = User(email="other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    stranger = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert getattr(client, method)(url, headers=stranger).status_code == 404
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", False)
    assert getattr(client, method)(url, headers=auth_headers).status_code == 404


def test_another_owners_application_is_404(client, db, test_user, autopilot_on, monkeypatch):
    _no_browser(monkeypatch)
    application = _ready(db, test_user.id)
    other = User(email="other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    response = client.post(f"{PREFIX}/{application.id}/autofill", headers=headers)
    assert response.status_code == 404


# ── On the application: support flag and the logged report ──


def _detail(client, auth_headers, application):
    response = client.get(f"{PREFIX}/{application.id}", headers=auth_headers)
    assert response.status_code == 200
    return response.json()


def test_the_application_says_whether_autopilot_can_fill_its_form(
    client, db, test_user, auth_headers, monkeypatch
):
    application = _ready(db, test_user.id)
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", False)
    assert _detail(client, auth_headers, application)["autofill_supported"] is False

    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", True)
    assert _detail(client, auth_headers, application)["autofill_supported"] is True

    elsewhere = _ready(db, test_user.id, apply_url="https://jobs.example/apply/1")
    assert _detail(client, auth_headers, elsewhere)["autofill_supported"] is False


def test_the_report_is_logged_once_on_the_application_without_values(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    application = _ready(db, test_user.id)
    run = AutofillRun(application.id, LEVER)
    run.review(
        AutofillReport(
            filled=["Email"],
            skipped=["Salary (pick: 90k EUR)", "Pronouns"],
            mismatched=["Phone"],
            url=LEVER,
        ),
        time.monotonic() + 1800,
    )
    monkeypatch.setitem(runner._runs, test_user.id, run)
    url = f"{PREFIX}/{application.id}/autofill"

    for _ in range(2):  # polling again does not log again
        assert client.get(url, headers=auth_headers).status_code == 200

    events = [e for e in _detail(client, auth_headers, application)["events"] if e["event_type"] == "autofill"]
    assert len(events) == 1
    details = events[0]["details"]
    assert (details["filled_count"], details["needs_you_count"], details["check_count"]) == (1, 2, 1)
    assert details["needs_you"] == ["Salary", "Pronouns"]
    assert "90k" not in str(events[0])


def test_a_failed_run_is_logged_with_its_kind(
    client, db, test_user, auth_headers, autopilot_on, monkeypatch
):
    application = _ready(db, test_user.id)
    run = AutofillRun(application.id, LEVER)
    run.fail(FormNotFound("The application form did not appear on that page."))
    monkeypatch.setitem(runner._runs, test_user.id, run)

    client.get(f"{PREFIX}/{application.id}/autofill", headers=auth_headers)

    (event,) = [e for e in _detail(client, auth_headers, application)["events"] if e["event_type"] == "autofill"]
    assert (event["details"]["outcome"], event["details"]["kind"]) == ("failed", "form_not_found")
