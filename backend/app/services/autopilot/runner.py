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


class JobClosed(Exception):
    """The employer's page answered 404 or 410: the posting is gone."""


class BrowserUnavailable(Exception):
    """No browser could be started here (not installed, or no display)."""


class RunCancelled(Exception):
    """The owner cancelled the run while it was filling."""


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


def fill_form(
    page,
    adapter: Adapter,
    materials: AutofillMaterials,
    workdir: Path,
    cancel: threading.Event | None = None,
) -> AutofillReport:
    """Fill the open form with this adapter. Never checks the host and never submits."""
    report = AutofillReport(url=page.url)
    args = adapter.script_args()

    def check_cancelled() -> None:
        if cancel is not None and cancel.is_set():
            raise RunCancelled
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
        check_cancelled()
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
        check_cancelled()
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


def open_form(
    page,
    materials: AutofillMaterials,
    workdir: Path,
    cancel: threading.Event | None = None,
) -> AutofillReport:
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
    response = None
    try:
        response = page.goto(assert_allowed_apply_url(materials.url), wait_until="domcontentloaded")
    except Exception:
        if not blocked:
            raise
    if blocked or not is_allowed(page.url):
        raise AutofillRefused(
            "The application page moved to a site Autopilot does not fill. Nothing was filled."
        )
    if response is not None and response.status in {404, 410}:
        raise JobClosed("The employer's page says this job is no longer there.")
    report = fill_form(page, _find_adapter(page), materials, workdir, cancel)
    page.evaluate(_BANNER, {"text": banner_text(report)})
    page.bring_to_front()
    page.unroute("**/*", guard)  # From here on the owner is in charge of the window.
    return report


# ── Running it: one headed browser per run, in a background thread ──

NEXT_STEP = "Open the apply page yourself."
_FAILURES = {
    "unsupported_destination": "Autopilot only fills Greenhouse, Lever and Ashby application pages.",
    "page_moved": "The application page moved to a site Autopilot does not fill. Nothing was filled.",
    "job_closed": "The employer's page says this job is no longer there.",
    "form_not_found": "The application form did not appear on that page.",
    "browser_unavailable": "Autopilot could not start a browser on this computer.",
    "timed_out": "The employer's page took too long to load.",
    "cancelled": "The run was cancelled and the window closed.",
    "unexpected_error": "Something went wrong while filling the form.",
}
_NEXT_STEPS = {
    "browser_unavailable": (
        "Run python -m playwright install chromium on this computer, or open the apply page yourself."
    ),
}


def classify_failure(error: Exception, *, window_closed: bool = False) -> tuple[str, str, str]:
    """Turn what went wrong into (kind, message, next step) the owner can act on."""
    if isinstance(error, RunCancelled) or window_closed:
        kind = "cancelled"
    elif isinstance(error, AutofillRefused):
        kind = "page_moved"
    elif isinstance(error, JobClosed):
        kind = "job_closed"
    elif isinstance(error, FormNotFound):
        kind = "form_not_found"
    elif isinstance(error, BrowserUnavailable | ImportError):
        kind = "browser_unavailable"
    elif type(error).__name__ == "TimeoutError":
        kind = "timed_out"
    else:
        kind = "unexpected_error"
    message = _FAILURES[kind]
    if kind == "cancelled" and window_closed and not isinstance(error, RunCancelled):
        message = "The window was closed before the form was filled."
    return kind, message, _NEXT_STEPS.get(kind, NEXT_STEP)


class AutofillRun:
    """One background run. The worker thread writes it, requests read ``snapshot()``.

    States: ``running`` (opening and filling), ``review`` (filled, the owner checks
    the window), ``failed`` (typed ``kind``; the window is already closed) and
    ``closed`` (the window is gone: owner closed it, cancelled, or time ran out).
    """

    def __init__(self, application_id: str, url: str) -> None:
        self.application_id = application_id
        self.url = url
        self.state = "running"
        self.kind: str | None = None
        self.message: str | None = None
        self.next_step: str | None = None
        self.report: AutofillReport | None = None
        self.review_deadline: float | None = None
        self._logged = False
        self.cancel = threading.Event()  # asks the worker to stop and close the window
        self.done = threading.Event()  # set only once the browser is gone
        self._lock = threading.Lock()

    def _end(self, state: str, kind: str | None, message: str | None, next_step: str | None) -> None:
        with self._lock:
            if self.state in {"failed", "closed"}:
                return  # first ending wins (a cancel is not overwritten by the wind-down)
            self.state, self.kind = state, kind
            self.message, self.next_step = message, next_step

    def fail(self, error: Exception, *, window_closed: bool = False) -> None:
        self._end("failed", *classify_failure(error, window_closed=window_closed))

    def review(self, report: AutofillReport, deadline: float) -> None:
        with self._lock:
            if self.state in {"failed", "closed"}:
                return  # cancelled while the last field was being filled
            self.report, self.review_deadline, self.state = report, deadline, "review"

    def close(self, kind: str | None = None, message: str | None = None) -> None:
        self._end("closed", kind, message, None)

    def claim_log(self) -> bool:
        """True once, when there is an outcome worth recording on the application."""
        with self._lock:
            if self._logged or (self.report is None and self.state != "failed"):
                return False
            self._logged = True
            return True

    def snapshot(self) -> dict:
        with self._lock:
            left = None
            if self.state == "review" and self.review_deadline is not None:
                left = max(0, int(self.review_deadline - time.monotonic()))
            report = self.report
            return {
                "state": self.state,
                "kind": self.kind,
                "message": self.message,
                "next_step": self.next_step,
                "seconds_left": left,
                "report": None
                if report is None
                else {
                    "filled": list(report.filled),
                    "skipped": list(report.skipped),
                    "mismatched": list(report.mismatched),
                    "url": report.url,
                },
            }


_runs: dict[str, AutofillRun] = {}  # the latest run per owner
_runs_lock = threading.Lock()


def _wait_for_owner(
    page, browser, cancel: threading.Event | None = None, deadline: float | None = None
) -> str:
    """Wait until the owner closes the tab, cancels, or time runs out.

    Returns ``"closed"``, ``"cancelled"`` or ``"expired"``.
    """
    if deadline is None:
        deadline = time.monotonic() + REVIEW_WINDOW_SECONDS
    while not page.is_closed() and browser.is_connected():
        if cancel is not None and cancel.is_set():
            return "cancelled"
        left_ms = (deadline - time.monotonic()) * 1000
        if left_ms <= 0:
            return "expired"
        try:
            page.wait_for_event("close", timeout=max(1, min(1_000, left_ms)))
        except Exception:  # noqa: BLE001 — still open (look again) or the browser is gone
            pass
    return "closed"


def _run(run: AutofillRun, materials: AutofillMaterials, headless: bool) -> None:
    try:
        from playwright.sync_api import sync_playwright

        with tempfile.TemporaryDirectory(prefix="cw-autofill-") as workdir, sync_playwright() as pw:
            try:
                browser = pw.chromium.launch(headless=headless)
            except Exception as exc:  # noqa: BLE001 — not installed, or no display
                raise BrowserUnavailable from exc
            try:
                page = browser.new_context().new_page()
                page.set_default_timeout(ACTION_TIMEOUT_MS)
                try:
                    report = open_form(page, materials, Path(workdir), run.cancel)
                except Exception as exc:  # noqa: BLE001 — typed for the owner below
                    run.fail(exc, window_closed=page.is_closed())
                else:
                    deadline = time.monotonic() + REVIEW_WINDOW_SECONDS
                    run.review(report, deadline)
                    # The owner reviews and submits in this window. Chromium reads the
                    # attached files from ``workdir`` only when the form is sent, so
                    # keep both until they close it. A failed run closes at once.
                    if not headless:
                        reason = _wait_for_owner(page, browser, run.cancel, deadline)
                        if reason == "expired":
                            run.close(
                                "window_expired",
                                "The window closed itself after 30 minutes. Anything typed "
                                "there and not submitted is gone.",
                            )
                        elif reason == "cancelled":
                            run.close("cancelled", _FAILURES["cancelled"])
            finally:
                browser.close()
    except Exception as exc:  # noqa: BLE001 — typed for the owner
        run.fail(exc)
    finally:
        run.close()  # a run that filled and was then closed by the owner
        # Only now is the browser gone, so only now may this owner start another.
        run.done.set()


def start_autofill(
    user_id: str, application_id: str, materials: AutofillMaterials, *, headless: bool = False
) -> AutofillRun:
    """Start one fill for this owner in a background thread and return at once."""
    assert_allowed_apply_url(materials.url)
    with _runs_lock:
        current = _runs.get(user_id)
        if current is not None and not current.done.is_set():
            raise AutofillBusy
        run = _runs[user_id] = AutofillRun(application_id, materials.url)
    threading.Thread(target=_run, args=(run, materials, headless), daemon=True).start()
    return run


def get_run(user_id: str, application_id: str) -> AutofillRun | None:
    """The owner's latest run, if it belongs to this application."""
    with _runs_lock:
        run = _runs.get(user_id)
    return run if run is not None and run.application_id == application_id else None


def cancel_run(user_id: str, application_id: str) -> AutofillRun | None:
    """Stop this application's run and close its window. Returns the run, if any."""
    run = get_run(user_id, application_id)
    if run is None:
        return None
    run.cancel.set()
    run.close("cancelled", _FAILURES["cancelled"])
    run.done.wait(timeout=10)  # let the browser go, so a new run can start right away
    return run
