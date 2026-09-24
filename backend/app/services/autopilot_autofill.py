"""Autopilot experiment: fill an approved application form, then stop (#325).

Local-only and off by default (``AUTOPILOT_EXPERIMENT_ENABLED``). A headed
Chromium opens on the machine running the backend, so this only makes sense when
the backend runs on the owner's own computer. It fills what it can and leaves
the window open. It never submits: the only interactions are ``fill`` and
``set_input_files``, and ``_safe_click`` (the one permitted click, currently
unused) refuses anything that looks like a submit control.
"""

from __future__ import annotations

import json
import re
import tempfile
import threading
from concurrent.futures import Future
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.user import User
from app.services.application_packets import PacketNotFoundError
from app.services.cv_rendering import build_render_model, render_pdf

ALLOWED_HOSTS = frozenset(
    {"boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"}
)
ACTION_TIMEOUT_MS = 15_000
_HIGHLIGHT = "el => { el.style.outline = '3px solid #f59e0b'; el.style.outlineOffset = '2px' }"
_SUBMIT_TEXT = re.compile(r"submit|send application|apply now", re.IGNORECASE)
_PHONE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
_URL = re.compile(r"https?://[^\s<>()\"']+[^\s<>()\"'.,;:!?]")

# Tags every form control and returns what a person would read as its label.
_DESCRIBE_CONTROLS = """() => [...document.querySelectorAll('input, textarea, select')].map((el, i) => {
  el.setAttribute('data-cw-autofill', String(i));
  const box = el.closest('.application-question, .field, li, fieldset');
  const label = (el.labels && el.labels[0] && el.labels[0].innerText)
    || el.getAttribute('aria-label')
    || (box && box.querySelector('label, .application-label, legend') || {}).innerText
    || el.placeholder || el.name || el.id || '';
  const style = getComputedStyle(el);
  return {
    idx: i, tag: el.tagName.toLowerCase(), type: (el.type || '').toLowerCase(),
    name: el.name || '', id: el.id || '', label: label.replace(/\\s+/g, ' ').trim(),
    visible: style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null,
    empty: el.type === 'file' ? el.files.length === 0 : !el.value,
  };
})"""


class AutofillRefused(Exception):
    """The destination is not a host the experiment may open."""


class SubmitRefused(Exception):
    """Something tried to click a submit control. Autopilot never submits."""


class AutofillBusy(Exception):
    """This owner already has a fill running."""


@dataclass
class AutofillMaterials:
    url: str
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    website: str = ""
    resume_pdf: bytes = b""
    resume_filename: str = "CV.pdf"
    cover_letter: str = ""
    answers: list[tuple[str, str]] = field(default_factory=list)

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


def contact_from_text(text: str) -> tuple[str, str, str]:
    """(phone, linkedin, website) found in the CV text, blank when absent."""
    phone_match = _PHONE.search(text)
    links = _URL.findall(text)
    linkedin = next((link for link in links if "linkedin.com" in link), "")
    website = next((link for link in links if "linkedin.com" not in link), "")
    return (phone_match.group(0).strip() if phone_match else ""), linkedin, website


def _norm(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())


def _answer_for(label: str, answers: list[tuple[str, str]]) -> str | None:
    target = _norm(label)
    if len(target) < 4:
        return None
    for question, answer in answers:
        prepared = _norm(question)
        if prepared and (
            prepared in target
            or target in prepared
            or SequenceMatcher(None, prepared, target).ratio() >= 0.8
        ):
            return answer
    return None


def _field_kind(control: dict) -> str | None:
    """Which standard field a control is, from its name, id, label, and type."""
    key = _norm(f"{control['name']} {control['id']} {control['label']}".replace("_", " "))
    if control["type"] == "file":
        if "cover" in key:
            return "cover_file"
        return "resume" if re.search(r"resume|\bcv\b", key) else None
    if control["tag"] == "textarea" and re.search(r"cover|comments|additional information", key):
        return "cover_text"
    if "first name" in key:
        return "first_name"
    if "last name" in key or "surname" in key:
        return "last_name"
    if control["type"] == "email" or "email" in key:
        return "email"
    if control["type"] == "tel" or "phone" in key:
        return "phone"
    if "linkedin" in key:
        return "linkedin"
    if re.search(r"website|portfolio|github|personal site", key):
        return "website"
    if control["name"] == "name" or _norm(control["label"]) in {"name", "full name"}:
        return "full_name"
    return None


def _safe_click(locator) -> None:
    """The only permitted click. Refuses any submit-looking control."""
    info = locator.evaluate(
        "el => ({tag: el.tagName.toLowerCase(), type: (el.type || '').toLowerCase(),"
        " text: el.innerText || el.value || ''})"
    )
    if info["type"] in {"submit", "image"} or (
        info["tag"] in {"button", "input"} and _SUBMIT_TEXT.search(info["text"])
    ):
        raise SubmitRefused("Autopilot never presses submit. You do that yourself.")
    locator.click()


def fill_application(page, materials: AutofillMaterials, workdir: Path) -> AutofillReport:
    """Fill the open form. Never checks the host (the caller did) and never submits."""
    report = AutofillReport(url=page.url)
    page.wait_for_selector("form input", timeout=ACTION_TIMEOUT_MS)

    resume_path = workdir / materials.resume_filename
    resume_path.write_bytes(materials.resume_pdf)
    cover_path = workdir / "Cover-letter.txt"
    cover_path.write_text(materials.cover_letter, encoding="utf-8")

    values = {
        "first_name": materials.first_name,
        "last_name": materials.last_name,
        "full_name": materials.full_name,
        "email": materials.email,
        "phone": materials.phone,
        "linkedin": materials.linkedin,
        "website": materials.website,
        "cover_text": materials.cover_letter,
    }
    controls = page.evaluate(_DESCRIBE_CONTROLS)
    cover_done = False
    for control in controls:
        if control["type"] in {"hidden", "submit", "button", "image", "reset"}:
            continue
        if not control["visible"] and control["type"] != "file":
            continue
        locator = page.locator(f'[data-cw-autofill="{control["idx"]}"]')
        label = control["label"] or control["name"] or "Unlabelled field"
        kind = _field_kind(control)
        typeable = control["tag"] == "textarea" or (
            control["tag"] == "input" and control["type"] not in {"checkbox", "radio", "file"}
        )
        if kind == "resume" and materials.resume_pdf:
            locator.set_input_files(str(resume_path))
        elif kind == "cover_file" and materials.cover_letter and not cover_done:
            locator.set_input_files(str(cover_path))
            cover_done = True
        elif kind == "cover_text" and materials.cover_letter and not cover_done:
            locator.fill(materials.cover_letter)
            cover_done = True
        elif kind in values and values[kind] and typeable:
            locator.fill(values[kind])
        elif kind is None and typeable and (answer := _answer_for(label, materials.answers)):
            locator.fill(answer)
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


def _run(materials: AutofillMaterials, result: Future, headless: bool) -> None:
    try:
        from playwright.sync_api import sync_playwright

        with tempfile.TemporaryDirectory(prefix="cw-autofill-") as workdir, sync_playwright() as pw:
            browser = pw.chromium.launch(headless=headless)
            context = browser.new_context()
            page = context.new_page()
            page.set_default_timeout(ACTION_TIMEOUT_MS)
            try:
                page.goto(form_url(materials.url), wait_until="domcontentloaded")
                result.set_result(fill_application(page, materials, Path(workdir)))
            except Exception as exc:  # noqa: BLE001 — the window stays open either way
                result.set_exception(exc)
            # The owner reviews and submits in this window. Wait until they close
            # it: Chromium reads the attached files from ``workdir`` only when the
            # form is sent.
            if not headless:
                context.wait_for_event("close", timeout=0)
            browser.close()
    except Exception as exc:  # noqa: BLE001 — surfaced to the waiting request
        if not result.done():
            result.set_exception(exc)


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
    result.add_done_callback(lambda _: _release(user_id))
    threading.Thread(target=_run, args=(materials, result, headless), daemon=True).start()
    return result


# ── Materials: exactly what the owner approved (the frozen snapshot) ──


class PacketNotApprovedError(Exception):
    """Only an approved packet can be filled in."""


def _allowed(url: str | None) -> bool:
    try:
        assert_allowed_apply_url(url or "")
    except AutofillRefused:
        return False
    return True


def build_materials(db: Session, user: User, packet_id: str) -> AutofillMaterials:
    """Collect the approved materials in the request thread (the worker never touches the DB)."""
    packet = (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user.id, ApplicationPacket.id == packet_id)
        .one_or_none()
    )
    if packet is None:
        raise PacketNotFoundError(packet_id)
    snapshot = (
        db.query(PacketApprovalSnapshot)
        .filter(
            PacketApprovalSnapshot.user_id == user.id,
            PacketApprovalSnapshot.packet_id == packet_id,
        )
        .one_or_none()
    )
    if packet.decision != "accepted" or snapshot is None:
        raise PacketNotApprovedError(packet_id)

    # Prefer the listing's own apply link; fall back to the approved destination.
    listing_url = packet.listing.apply_url if packet.listing else None
    url = next((c for c in (listing_url, snapshot.destination_url) if _allowed(c)), None)
    if url is None:
        raise AutofillRefused(
            "Autopilot only opens Greenhouse, Lever, or Ashby application pages over https."
        )

    content = json.loads(snapshot.content_json)
    variant = content.get("cv_variant") or {}
    drafts = content.get("drafts") or {}
    first, _, last = (user.full_name or "").strip().rpartition(" ")
    if not first:
        first, last = last, ""
    cv_text = " ".join(
        " ".join([str(entry.get("body", "")), *map(str, entry.get("bullets") or [])])
        for section in variant.get("sections") or []
        for entry in section.get("entries") or []
    )
    phone, linkedin, website = contact_from_text(cv_text)
    resume_pdf = b""
    if variant.get("sections"):
        document = SimpleNamespace(
            id=variant.get("document_id") or packet_id,
            name=variant.get("name") or "CV",
            sections=variant["sections"],
        )
        resume_pdf = render_pdf(build_render_model(document, "ats-essential"))
    safe_name = re.sub(r"[^A-Za-z0-9]+", "-", user.full_name or "").strip("-")
    return AutofillMaterials(
        url=url,
        first_name=first,
        last_name=last,
        email=user.email,
        phone=phone,
        linkedin=linkedin,
        website=website,
        resume_pdf=resume_pdf,
        resume_filename=f"{safe_name}-CV.pdf" if safe_name else "CV.pdf",
        cover_letter=str((drafts.get("cover_letter") or {}).get("body") or ""),
        answers=[
            (str(item.get("question", "")), str(item.get("answer", "")))
            for item in drafts.get("screening_answers") or []
            if isinstance(item, dict) and item.get("answer")
        ],
    )
