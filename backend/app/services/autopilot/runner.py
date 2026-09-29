"""Autopilot runner: open the frozen form, fill it, re-read it, then stop (#325, #375).

Local-only and off by default (``AUTOPILOT_EXPERIMENT_ENABLED``). A headed
Chromium opens on the machine running the backend and stays open for the owner.
It never submits: the only interactions are ``fill``, ``select_option`` and
``set_input_files``; nothing is ever clicked or pressed.

Order per form: upload the resume first (some ATSs parse it and overwrite
fields), then fill, then re-read every written value and report any that did
not stick.
"""

from __future__ import annotations

import tempfile
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass, field
from pathlib import Path

from app.services.autopilot.adapters import DESCRIBE_CONTROLS, Adapter, adapters_for
from app.services.autopilot.policy import (
    AutofillBusy,
    AutofillMaterials,
    AutofillRefused,
    assert_allowed_apply_url,
    fill_decision,
    is_allowed,
)

ACTION_TIMEOUT_MS = 15_000
SETTLE_TIMEOUT_MS = 5_000  # an ATS may parse the uploaded resume before we fill
REVIEW_WINDOW_SECONDS = 30 * 60  # the window closes itself after this

# Marks a control (or its question, for choices) for the owner to see.
_MARK = """(el, a) => {
  const colors = {filled: '#16a34a', 'needs-you': '#f59e0b', mismatch: '#dc2626'};
  const target = a.block ? (el.closest(a.block) || el) : el;
  target.setAttribute('data-cw-state', a.state);
  target.style.outline = '3px solid ' + colors[a.state];
  target.style.outlineOffset = '2px';
  if (a.pick) {
    const scope = a.block ? (el.closest(a.block) || el.parentElement) : el.parentElement;
    const clean = t => (t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const option = [...scope.querySelectorAll('label, button, [role=radio], [role=option]')]
      .find(n => clean(n.innerText || n.textContent) === clean(a.pick));
    if (option) {
      option.setAttribute('data-cw-state', 'suggested');
      option.style.outline = '3px dashed #16a34a';
    }
  }
}"""
# What a control holds now, as a person would read it.
_READ_BACK = """(el) => el.type === 'file' ? ((el.files[0] || {}).name || '')
  : el.tagName === 'SELECT' ? ((el.selectedOptions[0] || {}).text || '').trim()
  : el.value"""


# A fixed note at the top of the page: what happened and whose turn it is.
_BANNER = """(a) => {
  document.querySelectorAll('[data-cw-banner]').forEach(n => n.remove());
  const bar = document.createElement('div');
  bar.setAttribute('data-cw-banner', '');
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;'
    + 'background:#0f172a;color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:center';
  bar.textContent = a.text;
  document.body.appendChild(bar);
}"""


class FormNotFound(Exception):
    """The page opened, but no application form Autopilot knows appeared on it."""


@dataclass
class AutofillReport:
    url: str
    filled: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)  # left for the owner, highlighted
    mismatched: list[str] = field(default_factory=list)  # written, but did not stick


def _find_adapter(page) -> Adapter:
    candidates = adapters_for(page.url)
    if candidates:
        try:
            page.wait_for_selector(
                ", ".join(adapter.form for adapter in candidates), timeout=ACTION_TIMEOUT_MS
            )
        except Exception:  # noqa: BLE001 — reported as a missing form below
            pass
    for adapter in candidates:
        if page.locator(adapter.form).count():
            return adapter
    raise FormNotFound(
        "The application form did not appear on that page. Open the apply page yourself."
    )


def _label(control: dict) -> str:
    return control["label"] or control["name"] or "Unlabelled field"


def fill_form(page, adapter: Adapter, materials: AutofillMaterials, workdir: Path) -> AutofillReport:
    """Fill the open form with this adapter. Never checks the host and never submits."""
    report = AutofillReport(url=page.url)
    args = adapter.script_args()
    locate = lambda control: page.locator(f'[data-cw-autofill="{control["idx"]}"]').first  # noqa: E731

    def mark(control: dict, state: str, pick: str = "") -> None:
        choice = control["type"] in {"radio", "checkbox", "combobox"}
        locate(control).evaluate(_MARK, {"state": state, "pick": pick,
                                         "block": adapter.question if choice else ""})

    # 1. Files first: an ATS may parse the resume and overwrite what we type.
    resume_path = workdir / materials.resume_filename
    cover_path = workdir / "Cover-letter.txt"
    resume_path.write_bytes(materials.resume_pdf)
    cover_path.write_text(materials.cover_letter, encoding="utf-8")
    files = {"resume": resume_path, "cover_file": cover_path}
    written: list[tuple[dict, str]] = []  # (control, what it should now read)
    cover_done = False
    for control in page.evaluate(DESCRIBE_CONTROLS, args):
        decision = fill_decision(control, materials)
        if decision.source in files and not (decision.source == "cover_file" and cover_done):
            locate(control).set_input_files(str(files[decision.source]))
            written.append((control, files[decision.source].name))
            cover_done = cover_done or decision.source == "cover_file"
    if written:
        try:
            page.wait_for_load_state("networkidle", timeout=SETTLE_TIMEOUT_MS)
        except Exception:  # noqa: BLE001 — a busy page is fine; the re-read catches overwrites
            pass

    # 2. Everything else, described again in case the upload re-rendered the form.
    for control in page.evaluate(DESCRIBE_CONTROLS, args):
        decision = fill_decision(control, materials)
        if not control["visible"] or decision.source in {"never:control", "never:captcha", *files}:
            continue
        if decision.source == "cover_text" and not cover_done:
            locate(control).fill(decision.value)
            written.append((control, decision.value))
            cover_done = True
        elif decision.value and control["type"] == "select":
            locate(control).select_option(label=decision.value)
            written.append((control, decision.value))
        elif decision.value and decision.source.startswith("pick:"):
            mark(control, "needs-you", pick=decision.value)
            report.skipped.append(f"{_label(control)} (pick: {decision.value})")
        elif decision.value and decision.source != "cover_text":
            locate(control).fill(decision.value)
            written.append((control, decision.value))
        elif control["visible"] and control["empty"]:
            mark(control, "needs-you")
            if _label(control) not in report.skipped:
                report.skipped.append(_label(control))

    # 3. Re-read every value: a controlled input may reject it, a parser may overwrite it.
    for control, expected in written:
        actual = locate(control).evaluate(_READ_BACK)
        if " ".join(str(actual).split()) == " ".join(expected.split()):
            report.filled.append(_label(control))
            if control["type"] != "file":
                mark(control, "filled")
        else:
            report.mismatched.append(_label(control))
            mark(control, "mismatch")
    return report


def banner_text(report: AutofillReport) -> str:
    text = f"Career Workbench filled {len(report.filled)} field{'s' * (len(report.filled) != 1)}."
    if report.skipped or report.mismatched:
        text += " Amber and red fields need you."
    return f"{text} Check everything, then press Submit yourself. This window closes itself in 30 minutes."


def open_form(page, materials: AutofillMaterials, workdir: Path) -> AutofillReport:
    """Open the frozen form URL and fill it, only while the page stays on an allowlisted host.

    A guard aborts main-frame navigations to other hosts while we work, and the
    final URL is checked again after any redirects, before anything is written.
    """
    blocked: list[str] = []

    def guard(route) -> None:
        request = route.request
        if (
            request.is_navigation_request()
            and request.frame.parent_frame is None
            and not is_allowed(request.url)
        ):
            blocked.append(request.url)
            route.abort()
        else:
            route.fallback()

    page.route("**/*", guard)
    try:
        page.goto(assert_allowed_apply_url(materials.url), wait_until="domcontentloaded")
    except Exception:
        if not blocked:
            raise
    if blocked or not is_allowed(page.url):
        raise AutofillRefused(
            "The application page moved to a site Autopilot does not fill. Nothing was filled."
        )
    report = fill_form(page, _find_adapter(page), materials, workdir)
    page.evaluate(_BANNER, {"text": banner_text(report)})
    page.bring_to_front()
    page.unroute("**/*", guard)  # From here on the owner is in charge of the window.
    return report


# ── Running it: one headed browser per run, off the event loop ──

_busy: set[str] = set()
_busy_lock = threading.Lock()


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
                    result.set_result(open_form(page, materials, Path(workdir)))
                except Exception as exc:  # noqa: BLE001 — surfaced to the waiting request
                    result.set_exception(exc)
                # The owner reviews and submits in this window. Chromium reads the
                # attached files from ``workdir`` only when the form is sent, so
                # keep both until they close it. A failed run closes at once.
                if not headless and result.exception() is None:
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
