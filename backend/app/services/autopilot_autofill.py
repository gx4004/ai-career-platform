"""Autopilot experiment: fill an application form, then stop (#325).

Local-only and off by default (``AUTOPILOT_EXPERIMENT_ENABLED``). A headed
Chromium opens on the machine running the backend, so this only makes sense when
the backend runs on the owner's own computer. It fills what it can and leaves
the window open. It never submits: the only interactions are ``fill``,
``select_option`` and ``set_input_files``; nothing is ever clicked or pressed.

What goes into which field is decided in one place, :func:`fill_decision`.
"""

from __future__ import annotations

import re
import tempfile
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from types import SimpleNamespace
from typing import Literal
from urllib.parse import urlsplit

from app.schemas.applications import ApplicationDetailsResponse
from app.schemas.cv_documents import CvStyle
from app.services.cv_rendering import build_render_model, render_pdf
from app.services.stop_classifier import classify_stop_category

ALLOWED_HOSTS = frozenset(
    {"boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"}
)
ACTION_TIMEOUT_MS = 15_000
REVIEW_WINDOW_SECONDS = 30 * 60  # the window closes itself after this
_HIGHLIGHT = "el => { el.style.outline = '3px solid #f59e0b'; el.style.outlineOffset = '2px' }"

# Tags every form control and returns what a person would read as its label.
_DESCRIBE_CONTROLS = """() => [...document.querySelectorAll('input, textarea, select')].map((el, i) => {
  el.setAttribute('data-cw-autofill', String(i));
  const box = el.closest('.application-question, .field, li, fieldset');
  const label = (el.labels && el.labels[0] && el.labels[0].innerText)
    || el.getAttribute('aria-label')
    || (box && box.querySelector('label, .application-label, legend') || {}).innerText
    || el.placeholder || el.name || el.id || '';
  const style = getComputedStyle(el);
  const type = (el.type || '').toLowerCase();
  return {
    idx: i, tag: el.tagName.toLowerCase(), type,
    name: el.name || '', id: el.id || '', label: label.replace(/\\s+/g, ' ').trim(),
    options: el.tagName === 'SELECT' ? [...el.options].map(o => o.text.trim()) : [],
    visible: style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null,
    empty: type === 'file' ? el.files.length === 0
      : (type === 'checkbox' || type === 'radio') ? !el.checked : !el.value,
  };
})"""


class AutofillRefused(Exception):
    """The destination is not a host the experiment may open."""


class AutofillBusy(Exception):
    """This owner already has a fill running."""


StandingTopic = Literal[
    "work_authorization", "visa_sponsorship", "notice_period", "salary_expectation", "relocation"
]
STANDING_TOPICS: tuple[StandingTopic, ...] = (
    "work_authorization",
    "visa_sponsorship",
    "notice_period",
    "salary_expectation",
    "relocation",
)


@dataclass
class AutofillMaterials:
    url: str
    # Contact details, exactly as the owner typed them in their application details.
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    location: str = ""
    resume_pdf: bytes = b""
    resume_filename: str = "CV.pdf"
    cover_letter: str = ""
    # Drafted screening answers: only ever for questions that are not stops.
    answers: list[tuple[str, str]] = field(default_factory=list)
    # The owner's typed answers to this application's open questions.
    owner_answers: list[tuple[str, str]] = field(default_factory=list)
    # The owner's typed standing answers, by topic, from their application details.
    standing_answers: dict[str, str] = field(default_factory=dict)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


@dataclass
class AutofillReport:
    url: str
    filled: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def assert_allowed_apply_url(url: str) -> str:
    parts = urlsplit(url or "")
    if (
        parts.scheme != "https"
        or parts.username
        or parts.password
        or parts.port
        or parts.hostname not in ALLOWED_HOSTS
    ):
        raise AutofillRefused(
            "Autopilot only opens Greenhouse, Lever, or Ashby application pages over https."
        )
    return url


def form_url(url: str) -> str:
    """Hosted job pages keep the form one step deeper on Lever and Ashby."""
    parts = urlsplit(url)
    path = parts.path.rstrip("/")
    if parts.hostname == "jobs.lever.co" and not path.endswith("/apply"):
        return f"https://{parts.hostname}{path}/apply"
    if parts.hostname == "jobs.ashbyhq.com" and not path.endswith("/application"):
        return f"https://{parts.hostname}{path}/application"
    return url


# ── Fill policy: what may go into which field ──


def _norm(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())


def _mentions(text: str, terms: tuple[str, ...]) -> bool:
    """Whole-word (or whole-phrase) match on normalised text."""
    padded = f" {_norm(text)} "
    return any(f" {term} " in padded for term in terms)


# Always the human's act, whatever the owner typed anywhere.
_EEO_TERMS = (
    "gender", "sex", "race", "racial", "ethnicity", "ethnic", "hispanic", "latino",
    "veteran", "disability", "disabled", "sexual orientation", "transgender", "pronoun",
    "pronouns", "self identification", "self identify", "voluntary self", "eeo",
    "equal employment", "equal opportunity", "lgbtq",
)
_CONSENT_TERMS = (
    "consent", "i agree", "agree to", "privacy policy", "privacy notice", "terms",
    "acknowledge", "acknowledgement", "gdpr", "data processing", "i certify", "i confirm",
    "i understand", "i accept",
)
_SKIPPED_TYPES = frozenset({"hidden", "submit", "button", "image", "reset"})
_SELECT_TAG = "select"


@dataclass(frozen=True)
class FillDecision:
    """What happens to one form control.

    ``source`` names the rule: ``contact:<field>``, ``resume``, ``cover_file``,
    ``cover_text``, ``typed``, ``standing:<topic>``, ``drafted``, ``needs_you``
    or ``never:<why>``. Only a decision with a ``value`` (or a file source) is
    written; everything else is left for the owner.
    """

    source: str
    value: str = ""


_NEEDS_YOU = FillDecision("needs_you")


def standing_topic(label: str) -> StandingTopic | None:
    """Which standing answer, if any, answers this question."""
    category = classify_stop_category(label)
    if _mentions(label, ("sponsor", "sponsorship", "visa")):
        return "visa_sponsorship"
    if category in {"work_authorization", "eligibility"} and _mentions(
        label,
        ("authorized", "authorised", "authorization", "authorisation", "right to work",
         "eligible to work", "work permit", "legally"),
    ):
        return "work_authorization"
    if category == "salary" and not _mentions(
        label, ("current", "history", "previous", "last", "present")
    ):
        return "salary_expectation"
    if category == "relocation":
        return "relocation"
    if _mentions(
        label,
        ("notice period", "notice", "earliest start", "start date", "when can you start",
         "available to start"),
    ):
        return "notice_period"
    return None


def _contact_kind(control: dict) -> str | None:
    """Which contact field a single-line input or select is, from its name, id and label."""
    key = _norm(f"{control['name']} {control['id']} {control['label']}".replace("_", " "))
    if "first name" in key or "given name" in key:
        return "first_name"
    if "last name" in key or "surname" in key or "family name" in key:
        return "last_name"
    if control["type"] == "email" or re.search(r"\bemail\b", key):
        return "email"
    if control["type"] == "tel" or re.search(r"\b(phone|mobile)\b", key):
        return "phone"
    if "linkedin" in key:
        return "linkedin"
    if re.search(r"\b(website|portfolio|github|personal site)\b", key):
        return "website"
    if re.search(r"\b(city|location)\b", key):
        return "location"
    if control["name"] == "name" or _norm(control["label"]) in {"name", "full name"}:
        return "full_name"
    return None


def _exact_option(value: str, options: list[str]) -> str | None:
    wanted = _norm(value)
    return next((option for option in options if wanted and _norm(option) == wanted), None)


def fill_decision(control: dict, materials: AutofillMaterials) -> FillDecision:
    """The fill policy, for one control (#374).

    - Never: EEO / voluntary self-identification, consent boxes, CAPTCHAs,
      buttons and submit controls, whatever anyone typed.
    - Contact fields come only from the owner's application details.
    - A stop-category question (salary, visa, relocation…) gets only an answer
      the owner typed: this application's answer first, then a standing answer.
    - Drafted answers go only into non-stop free-text questions.
    - Dropdowns are set only on an exact option match; checkboxes and radios are
      never set.
    """
    tag, kind = control["tag"], control["type"]
    label = control["label"] or control["name"] or ""
    key = f"{control['name']} {control['id']} {label}".replace("_", " ")
    if kind in _SKIPPED_TYPES:
        return FillDecision("never:control")
    if "captcha" in key.lower():
        return FillDecision("never:captcha")
    if _mentions(key, _EEO_TERMS):
        return FillDecision("never:eeo")
    if _mentions(key, _CONSENT_TERMS):
        return FillDecision("never:consent")
    if kind in {"checkbox", "radio"}:
        return _NEEDS_YOU
    if kind == "file":
        if "cover" in _norm(key):
            return FillDecision("cover_file", "file") if materials.cover_letter else _NEEDS_YOU
        if re.search(r"resume|\bcv\b", _norm(key)):
            return FillDecision("resume", "file") if materials.resume_pdf else _NEEDS_YOU
        return _NEEDS_YOU
    if tag == "textarea" and re.search(r"cover|comments|additional information", _norm(key)):
        if not materials.cover_letter:
            return _NEEDS_YOU
        return FillDecision("cover_text", materials.cover_letter)

    is_stop = classify_stop_category(label) is not None
    decision = _NEEDS_YOU
    contact = None if (is_stop or tag == "textarea") else _contact_kind(control)
    if contact:
        value = materials.full_name if contact == "full_name" else getattr(materials, contact)
        decision = FillDecision(f"contact:{contact}", value)
    elif (owned := _best_answer(label, materials.owner_answers)) is not None:
        decision = FillDecision("typed", owned)
    elif (topic := standing_topic(label)) and materials.standing_answers.get(topic):
        decision = FillDecision(f"standing:{topic}", materials.standing_answers[topic])
    elif not is_stop and tag != _SELECT_TAG:
        drafted = _best_answer(label, materials.answers)
        if drafted is not None:
            decision = FillDecision("drafted", drafted)

    if tag == _SELECT_TAG and decision.value:
        option = _exact_option(decision.value, control.get("options") or [])
        decision = FillDecision(decision.source, option) if option else _NEEDS_YOU
    return decision if decision.value else _NEEDS_YOU


# Words too common to say two questions are the same question.
_FILLER_WORDS = frozenset(
    "a an and are at can do does for have how i if in is it of on or our please "
    "the this to us we what when where which who why will with would you your".split()
)
ANSWER_MATCH_THRESHOLD = 0.8


def _words(text: str) -> frozenset[str]:
    return frozenset(_norm(text).split()) - _FILLER_WORDS


def _match_score(label: str, question: str) -> float:
    """How surely a form label asks the prepared question, from 0 to 1.

    Whole words only, so "age" never matches "language". Near-identical wording
    scores by character similarity; otherwise the shared words must cover both
    sides, or one side's words (two or more) must all appear in the other.
    """
    label_words, question_words = _words(label), _words(question)
    if not label_words or not question_words:
        return 0.0
    shared = label_words & question_words
    overlap = len(shared) / len(label_words | question_words)
    smaller = min(len(label_words), len(question_words))
    if len(shared) == smaller >= 2:  # every word of the shorter one is in the longer
        overlap = max(overlap, ANSWER_MATCH_THRESHOLD + 0.2 * overlap)
    return max(overlap, SequenceMatcher(None, _norm(label), _norm(question)).ratio())


def _best_answer(label: str, answers: list[tuple[str, str]]) -> str | None:
    best_score, best_answer = 0.0, None
    for question, answer in answers:
        score = _match_score(label, question)
        if score >= ANSWER_MATCH_THRESHOLD and score > best_score:
            best_score, best_answer = score, answer
    return best_answer


def fill_application(page, materials: AutofillMaterials, workdir: Path) -> AutofillReport:
    """Fill the open form. Never checks the host (the caller did) and never submits."""
    report = AutofillReport(url=page.url)
    page.wait_for_selector("form input", timeout=ACTION_TIMEOUT_MS)

    resume_path = workdir / materials.resume_filename
    resume_path.write_bytes(materials.resume_pdf)
    cover_path = workdir / "Cover-letter.txt"
    cover_path.write_text(materials.cover_letter, encoding="utf-8")

    cover_done = False
    for control in page.evaluate(_DESCRIBE_CONTROLS):
        if not control["visible"] and control["type"] != "file":
            continue
        decision = fill_decision(control, materials)
        if decision.source in {"never:control", "never:captcha"}:  # not even highlighted
            continue
        locator = page.locator(f'[data-cw-autofill="{control["idx"]}"]')
        label = control["label"] or control["name"] or "Unlabelled field"
        if decision.source == "resume":
            locator.set_input_files(str(resume_path))
        elif decision.source in {"cover_file", "cover_text"} and not cover_done:
            if decision.source == "cover_file":
                locator.set_input_files(str(cover_path))
            else:
                locator.fill(decision.value)
            cover_done = True
        elif decision.value and control["tag"] == _SELECT_TAG:
            locator.select_option(label=decision.value)
        elif decision.value and decision.source not in {"cover_file", "cover_text"}:
            locator.fill(decision.value)
        else:
            if control["empty"] and control["visible"]:
                locator.evaluate(_HIGHLIGHT)
                if label not in report.skipped:
                    report.skipped.append(label)
            continue
        report.filled.append(label)
    return report


# ── Running it: one headed browser per run, off the event loop ──

_busy: set[str] = set()
_busy_lock = threading.Lock()


def _open_form(page, materials: AutofillMaterials, workdir: Path) -> AutofillReport:
    """Open the form and fill it, but only while the page stays on an allowlisted host.

    A guard aborts main-frame navigations to other hosts while we work, and the
    final URL is checked again after any redirects, before anything is typed.
    """
    blocked: list[str] = []

    def guard(route) -> None:
        request = route.request
        if (
            request.is_navigation_request()
            and request.frame.parent_frame is None
            and not _allowed(request.url)
        ):
            blocked.append(request.url)
            route.abort()
        else:
            route.fallback()

    page.route("**/*", guard)
    try:
        page.goto(form_url(materials.url), wait_until="domcontentloaded")
    except Exception:
        if not blocked:
            raise
    if blocked or not _allowed(page.url):
        raise AutofillRefused(
            "The application page moved to a site Autopilot does not fill. Nothing was filled."
        )
    report = fill_application(page, materials, workdir)
    page.unroute("**/*", guard)  # From here on the owner is in charge of the window.
    return report


def _wait_for_owner(page, browser) -> None:
    """Wait until the owner closes the tab or quits the browser, but not forever."""
    deadline = time.monotonic() + REVIEW_WINDOW_SECONDS
    while not page.is_closed() and browser.is_connected() and time.monotonic() < deadline:
        try:
            left_ms = (deadline - time.monotonic()) * 1000
            page.wait_for_event("close", timeout=max(1, min(5_000, left_ms)))
        except Exception:  # noqa: BLE001 — still open (look again) or the browser is gone
            pass


def _run(user_id: str, materials: AutofillMaterials, result: Future, headless: bool) -> None:
    try:
        from playwright.sync_api import sync_playwright

        with tempfile.TemporaryDirectory(prefix="cw-autofill-") as workdir, sync_playwright() as pw:
            browser = pw.chromium.launch(headless=headless)
            try:
                page = browser.new_context().new_page()
                page.set_default_timeout(ACTION_TIMEOUT_MS)
                try:
                    result.set_result(_open_form(page, materials, Path(workdir)))
                except Exception as exc:  # noqa: BLE001 — surfaced to the waiting request
                    result.set_exception(exc)
                # The owner reviews and submits in this window. Chromium reads the
                # attached files from ``workdir`` only when the form is sent, so
                # keep both until they close it (a refused page closes at once).
                if not headless and not isinstance(result.exception(), AutofillRefused):
                    _wait_for_owner(page, browser)
            finally:
                browser.close()
    except Exception as exc:  # noqa: BLE001 — surfaced to the waiting request
        if not result.done():
            result.set_exception(exc)
    finally:
        # Only now is the browser gone, so only now may this owner start another.
        _release(user_id)


def _release(user_id: str) -> None:
    with _busy_lock:
        _busy.discard(user_id)


def start_autofill(user_id: str, materials: AutofillMaterials, *, headless: bool = False) -> Future:
    """Start one fill for this owner in a background thread; the Future holds the report."""
    assert_allowed_apply_url(materials.url)
    with _busy_lock:
        if user_id in _busy:
            raise AutofillBusy
        _busy.add(user_id)
    result: Future = Future()
    threading.Thread(target=_run, args=(user_id, materials, result, headless), daemon=True).start()
    return result


# ── Materials: exactly what the application will send ──



def _allowed(url: str | None) -> bool:
    try:
        assert_allowed_apply_url(url or "")
    except AutofillRefused:
        return False
    return True


def build_materials(details: ApplicationDetailsResponse, content: dict) -> AutofillMaterials:
    """Collect what to fill, in the request thread.

    Contact details and standing answers come only from the owner's application
    details, never from CV text. ``content`` is the application's frozen
    snapshot once it is marked applied, otherwise its current materials
    (``applications.application_content``). The worker thread never touches the
    database.
    """
    listing = content.get("listing") or {}
    url = listing.get("apply_url") or ""
    if not _allowed(url):
        raise AutofillRefused(
            "Autopilot only opens Greenhouse, Lever, or Ashby application pages over https."
        )

    variant = content.get("cv_variant") or {}
    first, _, last = details.full_name.strip().partition(" ")
    resume_pdf = b""
    if variant.get("sections"):
        document = SimpleNamespace(
            id=variant.get("document_id") or content.get("application_id") or "cv",
            name=variant.get("name") or "CV",
            sections=variant["sections"],
        )
        resume_pdf = render_pdf(
            build_render_model(document, "ats-essential", CvStyle(ats_mode=True))
        )
    safe_name = re.sub(r"[^A-Za-z0-9]+", "-", details.full_name).strip("-")
    return AutofillMaterials(
        url=url,
        first_name=first,
        last_name=last.strip(),
        email=details.email,
        phone=details.phone,
        linkedin=details.linkedin,
        website=details.website,
        location=details.location,
        resume_pdf=resume_pdf,
        resume_filename=f"{safe_name}-CV.pdf" if safe_name else "CV.pdf",
        cover_letter=str((content.get("cover_letter") or {}).get("text") or ""),
        answers=[
            (str(item.get("question", "")), str(item.get("answer", "")))
            for item in content.get("screening_answers") or []
            if isinstance(item, dict) and item.get("answer")
        ],
        owner_answers=[
            (str(item.get("question", "")), str(item.get("answer", "")))
            for item in content.get("answers") or []
            if isinstance(item, dict) and item.get("answer")
        ],
        standing_answers={
            topic: getattr(details, topic) for topic in STANDING_TOPICS if getattr(details, topic)
        },
    )
