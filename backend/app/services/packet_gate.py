"""The trust-chain gate that stands between packet preparation and the queue (R15 #184).

Two server-authoritative rules live here (D-097):

1. **No packet reaches the queue with an unresolved fabrication finding.** After a
   packet's materials are composed, :func:`prepare_packets` runs the R13 Application
   Quality Reviewer (:mod:`app.services.campaign_reviewer`) against them. A reviewer
   ``unsupported_claim`` finding is a *fabrication* finding (it is the deterministic
   groundedness check built on :mod:`app.evals.fabrication`). Any such finding leaves
   the packet ``gate_state == "blocked"`` — it is never queue-eligible.

2. **A failing regression evaluation halts preparation pipeline-wide.** When a
   packet-quality (calibration) or fabrication regression evaluation fails, a
   :class:`~app.models.pipeline_halt.PipelineHalt` row is set for the
   ``packet-preparation`` scope and :func:`prepare_packets` refuses to prepare
   anything until it is cleared. Clearing (a subsequent passing eval, or an explicit
   operator clear) lets preparation resume. The evidence is real: every preparation
   run consults the latest on-disk eval report per tool (:mod:`app.evals.report_reader`,
   written by ``python -m app.evals.run_eval``) through
   :func:`apply_report_regression_gate`, so the rule is enforced rather than merely
   available. Those reports include the credential-free ``--deterministic`` ones, so
   the decision never needs a billed provider call.

Every gate state transition (running / passed / blocked / halted / cleared) is
emitted through the shared operational-event seam as an ALLOWLISTED, low-cardinality
event — no packet content, listing text/id, campaign/run id, finding text, or user
identifier ever rides along (``ActivationEventCreate`` enforces this via
``extra="forbid"``). The admin dashboard reads these plus the current halt row.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.evals.calibration import TOOL_JOB_MATCH
from app.evals.fabrication import TOOL_COVER_LETTER
from app.evals.report_reader import latest_reports_by_tool
from app.evals.run_eval import TOOL_RESUME
from app.models.analytics_event import AnalyticsEvent
from app.models.pipeline_halt import PipelineHalt
from app.models.submission_safety import SubmissionSafetyControl
from app.models.user import User
from app.schemas.admin import AdminPacketGateResponse
from app.services.analytics import safe_record_activation_event

# The one scope this ticket governs. A single ``pipeline_halts`` row for this scope
# means preparation is halted; no row means it is running.
PREPARATION_HALT_SCOPE = "packet-preparation"


# The owner-initiated pause (R15 #183). Scoped per user — embedding the user id in
# the ``pipeline_halts`` scope string keeps it on the same halt/consultation seam as
# the pipeline-wide regression halt (``packet-preparation``) while ensuring one
# owner's pause can never halt, or be cleared by, another owner's queue (a single
# shared "queue-pause" scope previously meant any authenticated user could pause or
# resume every other user's queue). Reason is the bounded ``user_paused`` marker.
def _queue_pause_scope(user_id: str) -> str:
    return f"queue-pause:{user_id}"


QUEUE_PAUSE_REASON = "user_paused"


def _lock_submission_control(db: Session) -> None:
    """Acquire the shared operational lock before owner pause-state mutation."""

    control = (
        db.query(SubmissionSafetyControl)
        .filter(SubmissionSafetyControl.id == "global")
        .with_for_update()
        .one_or_none()
    )
    if control is None:
        # Production migrations seed the singleton. create_all-based tests still
        # need the same fail-closed row without importing the safety service and
        # creating a packet_gate <-> submission_safety cycle.
        db.add(SubmissionSafetyControl(id="global", global_kill_switch=True))
        db.flush()


# The reviewer category that represents a fabrication finding (D-097). It is the
# reviewer's groundedness check — a claim not traceable to confirmed evidence or the
# selected source material — and is the only finding category the queue gate blocks on.
FABRICATION_FINDING_CATEGORY = "unsupported_claim"

# Regression thresholds (parent quality program #118). A fabrication regression
# fails the pipeline when the deterministic fabrication check finds ANY untraceable
# claim; a packet-quality regression fails when a heuristic tool's calibration miss
# rate exceeds this ceiling. Documented, deterministic, and injectable via the
# report objects so the decision never needs a live LLM call (D-044).
FABRICATION_REGRESSION_MAX_CANDIDATES = 0
PACKET_QUALITY_MAX_MISS_RATE = 0.5

# The tools whose latest eval report gates packet preparation. A packet's materials
# are cover-letter-shaped drafts, so the cover-letter fabrication figure is this
# pipeline's fabrication evidence; the two heuristic-scored tools carry the only
# calibration (packet-quality) figures the runner produces. A regression in a tool
# preparation never invokes must not halt this queue.
PACKET_REGRESSION_TOOLS: tuple[str, ...] = (TOOL_RESUME, TOOL_JOB_MATCH, TOOL_COVER_LETTER)


# ── Fabrication-finding gate (per packet) ──


def fabrication_findings(findings: list[dict]) -> list[dict]:
    """The reviewer findings that represent a fabrication (D-097)."""
    return [
        finding
        for finding in (findings or [])
        if finding.get("category") == FABRICATION_FINDING_CATEGORY
    ]


def has_unresolved_fabrication(findings: list[dict]) -> bool:
    """True when the reviewer surfaced any fabrication finding.

    The gate runs the reviewer freshly on the just-composed packet materials, so
    every finding it returns is unresolved by construction: nothing has been edited
    or dismissed between the reviewer pass and this check.
    """
    return bool(fabrication_findings(findings))


def gate_state_for(findings: list[dict]) -> str:
    """``"blocked"`` when a fabrication finding is present, else ``"passed"``."""
    return "blocked" if has_unresolved_fabrication(findings) else "passed"


def is_queue_eligible(packet) -> bool:
    """A packet is queue-eligible only once the reviewer gate has passed (D-097)."""
    return getattr(packet, "gate_state", None) == "passed"


# ── Pipeline-wide halt state ──


@dataclass(frozen=True)
class HaltStatus:
    """The current preparation-halt posture for one scope."""

    halted: bool
    reason: str | None = None
    halted_since: datetime | None = None


def _halt_row(db: Session, scope: str = PREPARATION_HALT_SCOPE) -> PipelineHalt | None:
    return db.query(PipelineHalt).filter(PipelineHalt.scope == scope).one_or_none()


def get_halt_status(db: Session, scope: str = PREPARATION_HALT_SCOPE) -> HaltStatus:
    row = _halt_row(db, scope)
    if row is None:
        return HaltStatus(halted=False)
    return HaltStatus(halted=True, reason=row.reason, halted_since=row.halted_at)


def is_preparation_halted(db: Session, scope: str = PREPARATION_HALT_SCOPE) -> bool:
    """True when a halt row exists for the scope (preparation must refuse)."""
    return _halt_row(db, scope) is not None


def set_pipeline_halt(
    db: Session,
    *,
    reason: str,
    scope: str = PREPARATION_HALT_SCOPE,
    now: datetime | None = None,
) -> HaltStatus:
    """Upsert a halt row for the scope and emit an allowlisted ``halted`` event.

    Idempotent: re-halting refreshes the reason/timestamp on the existing row. The
    reason is a bounded ``PacketGateHaltReason`` category, never free text.
    """
    now = now or datetime.now(UTC)
    row = _halt_row(db, scope)
    if row is None:
        row = PipelineHalt(scope=scope, reason=reason, halted_at=now, updated_at=now)
        db.add(row)
    else:
        row.reason = reason
        row.halted_at = now
        row.updated_at = now
    db.commit()
    safe_record_activation_event(
        db,
        event_name="packet_preparation_halt",
        level="error",
        operational_dimension=reason,
        operational_outcome="halted",
    )
    return HaltStatus(halted=True, reason=reason, halted_since=now)


def clear_pipeline_halt(
    db: Session,
    *,
    scope: str = PREPARATION_HALT_SCOPE,
) -> HaltStatus:
    """Clear any halt row for the scope; emit ``cleared`` only if one existed."""
    row = _halt_row(db, scope)
    if row is None:
        return HaltStatus(halted=False)
    db.delete(row)
    db.commit()
    safe_record_activation_event(
        db,
        event_name="packet_preparation_halt",
        operational_outcome="cleared",
    )
    return HaltStatus(halted=False)


# ── Owner-initiated global pause (R15 #183) ──


def delete_queue_pause_state(db: Session, user_id: str) -> None:
    """Delete this owner's pause row, if any, as part of account erasure (D-099).

    Unlike the pipeline-wide regression halt (``packet-preparation``, deliberately
    excluded from the erasure cascade since it is operational, not owner data), a
    per-user pause row IS this owner's data and must not outlive their account. No
    commit here — the caller commits once as part of the larger erasure transaction.
    """
    _lock_submission_control(db)
    db.query(PipelineHalt).filter(PipelineHalt.scope == _queue_pause_scope(user_id)).delete()


def is_queue_paused(db: Session, user_id: str) -> bool:
    """True when this owner has paused their own queue (preparation must refuse).

    Reuses the pipeline-halt consultation seam with a per-user scope, so
    :func:`prepare_packets` genuinely stops preparing the moment a pause is set —
    the pause is not merely cosmetic UI state — without affecting other owners.
    """
    return _halt_row(db, _queue_pause_scope(user_id)) is not None


def pause_preparation(db: Session, user_id: str, *, now: datetime | None = None) -> HaltStatus:
    """Set this owner's pause halt row so their preparation refuses immediately.

    Idempotent: re-pausing refreshes the timestamp on the existing row. This does
    NOT emit the regression ``packet_preparation_halt`` operational event — a user
    pause is not a regression, so it never pollutes that telemetry. The owner-scoped
    audit event (``queue_paused``) is recorded by the caller.
    """
    now = now or datetime.now(UTC)
    # Serialize the owner control with submission's final safety boundary. This
    # makes a pause concurrent with dispatch take effect on one side of a single
    # row lock: either the already-authorized act finishes first, or the pause is
    # visible before the adapter can be called.
    _lock_submission_control(db)
    db.query(User.id).filter(User.id == user_id).with_for_update().one()
    scope = _queue_pause_scope(user_id)
    row = _halt_row(db, scope)
    if row is None:
        row = PipelineHalt(scope=scope, reason=QUEUE_PAUSE_REASON, halted_at=now, updated_at=now)
        db.add(row)
    else:
        row.halted_at = now
        row.updated_at = now
    db.commit()
    return HaltStatus(halted=True, reason=QUEUE_PAUSE_REASON, halted_since=now)


def resume_preparation(db: Session, user_id: str) -> HaltStatus:
    """Clear this owner's pause halt row so their preparation may resume.

    Only clears this owner's ``queue-pause:<user_id>`` scope; a concurrent
    regression halt (``packet-preparation``) is untouched and still blocks
    preparation, and other owners' pauses are untouched. Idempotent.
    """
    _lock_submission_control(db)
    db.query(User.id).filter(User.id == user_id).with_for_update().one()
    row = _halt_row(db, _queue_pause_scope(user_id))
    if row is not None:
        db.delete(row)
        db.commit()
    return HaltStatus(halted=False)


# ── Regression-evaluation gate (pipeline-wide) ──


def evaluate_regression(
    *,
    fabrication_report=None,
    calibration_report=None,
    fabrication_max_candidates: int = FABRICATION_REGRESSION_MAX_CANDIDATES,
    quality_max_miss_rate: float = PACKET_QUALITY_MAX_MISS_RATE,
) -> tuple[bool, str | None]:
    """Decide whether the packet-quality / fabrication regression evals failed.

    Pure and deterministic — takes the report objects produced by
    :mod:`app.evals` so tests (and the offline runner) can drive it without any
    live LLM call. Returns ``(failed, reason)`` where ``reason`` is a bounded
    ``PacketGateHaltReason``. Fabrication is checked first so a fabrication
    regression is never masked by a concurrent quality regression.
    """
    if fabrication_report is not None:
        candidates = sum(tool.candidate_count for tool in fabrication_report.per_tool.values())
        if candidates > fabrication_max_candidates:
            return True, "fabrication_regression"
    if calibration_report is not None:
        worst = max(
            (tool.miss_rate for tool in calibration_report.per_tool.values()),
            default=0.0,
        )
        if worst > quality_max_miss_rate:
            return True, "packet_quality_regression"
    return False, None


def apply_regression_gate(
    db: Session,
    *,
    fabrication_report=None,
    calibration_report=None,
    now: datetime | None = None,
) -> HaltStatus:
    """Run :func:`evaluate_regression` and set/clear the pipeline halt accordingly.

    A failing eval halts preparation pipeline-wide (D-097); a passing eval clears a
    prior halt so preparation resumes. This is the single seam the quality program
    (or a test) calls to gate the pipeline on regression evidence.
    """
    failed, reason = evaluate_regression(
        fabrication_report=fabrication_report, calibration_report=calibration_report
    )
    if failed and reason is not None:
        return set_pipeline_halt(db, reason=reason, now=now)
    return clear_pipeline_halt(db)


def evaluate_report_regression(
    reports: Mapping[str, Mapping[str, Any]],
    *,
    fabrication_max_candidates: int = FABRICATION_REGRESSION_MAX_CANDIDATES,
    quality_max_miss_rate: float = PACKET_QUALITY_MAX_MISS_RATE,
) -> tuple[bool, str | None]:
    """Decide the same verdict as :func:`evaluate_regression`, from on-disk reports.

    The figures are the ones the runner already wrote per tool, so both paths apply
    one set of thresholds to one set of numbers. Two deliberate asymmetries with the
    in-memory path: only :data:`PACKET_REGRESSION_TOOLS` are consulted, and a ``None``
    figure means the check did not run for that report (the credential-free
    ``--deterministic`` runner leaves every generative figure null) — an absent
    measurement is never read as a failure. Fabrication is checked first so a
    fabrication regression is never masked by a concurrent quality regression.
    """
    relevant = [reports[tool] for tool in PACKET_REGRESSION_TOOLS if tool in reports]
    for report in relevant:
        candidates = report.get("fabrication_candidate_count")
        if candidates is not None and candidates > fabrication_max_candidates:
            return True, "fabrication_regression"
    for report in relevant:
        miss_rate = report.get("calibration_miss_rate")
        if miss_rate is not None and miss_rate > quality_max_miss_rate:
            return True, "packet_quality_regression"
    return False, None


def _generated_at(report: Mapping[str, Any]) -> datetime:
    return datetime.fromisoformat(str(report["generated_at"]).replace("Z", "+00:00"))


def _postdates_halt(reports: Mapping[str, Mapping[str, Any]], status: HaltStatus) -> bool:
    """True when the newest consulted report was generated after the standing halt."""
    if status.halted_since is None:
        return False
    halted_since = status.halted_since
    if halted_since.tzinfo is None:
        halted_since = halted_since.replace(tzinfo=UTC)
    newest = max((_generated_at(report) for report in reports.values()), default=None)
    return newest is not None and newest > halted_since


def apply_report_regression_gate(
    db: Session,
    *,
    reports_dir: Path | None = None,
    now: datetime | None = None,
) -> HaltStatus:
    """Halt or resume preparation from the eval reports the runner wrote to disk.

    This is the gate's evidence-backed caller. :func:`apply_regression_gate` decides
    on report *objects* a caller already holds; this one reads the latest report per
    tool from ``reports_dir`` — the artifacts ``python -m app.evals.run_eval`` writes,
    including on its credential-free ``--deterministic`` path — so a halt decision
    costs no provider call. The halt it sets is the same ``pipeline_halts`` row
    :func:`aggregate_packet_gate` already reports to the admin dashboard.

    Two rules keep the automatic verdict from overruling what it cannot see. Absence
    of evidence is not evidence of passing: with no report for any packet-relevant
    tool the current posture is left exactly as it stands. And passing evidence that
    predates a standing halt cannot lift it — only an eval run *after* the halt, or an
    explicit operator clear, resumes preparation.

    Args:
        reports_dir: Report directory to read; defaults to the runner's own.
        now: Clock override for the halt timestamp.
    """
    reports = {
        tool: report
        for tool, report in latest_reports_by_tool(reports_dir).items()
        if tool in PACKET_REGRESSION_TOOLS
    }
    if not reports:
        return get_halt_status(db)

    failed, reason = evaluate_report_regression(reports)
    status = get_halt_status(db)
    if failed and reason is not None:
        # A halt is a state transition, not a heartbeat: re-stamping an identical
        # standing halt would emit one `halted` event per preparation attempt and
        # inflate the admin dashboard's tally.
        if status.halted and status.reason == reason:
            return status
        return set_pipeline_halt(db, reason=reason, now=now)
    if status.halted and not _postdates_halt(reports, status):
        return status
    return clear_pipeline_halt(db)


# ── Per-run / per-packet event emission ──


def emit_gate_running(db: Session) -> None:
    """A preparation run started the trust-chain gate (pipeline-wide ``running``)."""
    safe_record_activation_event(db, event_name="packet_queue_gate", operational_outcome="running")


def emit_gate_outcome(db: Session, *, gate_state: str) -> None:
    """Emit one packet's gate outcome (``passed`` / ``blocked``)."""
    if gate_state not in ("passed", "blocked"):
        return
    safe_record_activation_event(
        db,
        event_name="packet_queue_gate",
        level="warning" if gate_state == "blocked" else "info",
        operational_outcome=gate_state,
    )


# ── Admin visibility (read-only) ──


def aggregate_packet_gate(
    db: Session,
    *,
    window_start: datetime,
    window_end: datetime,
) -> AdminPacketGateResponse:
    """Aggregate gate state for the admin dashboard (D-097, read-only).

    Extends the same first-party operational path every other admin view uses —
    no new vendor. Reports the current pipeline-halt posture (from the
    ``pipeline_halts`` row) plus windowed counts of the allowlisted gate events.
    No packet content, listing text/id, run id, finding text, or user identifier
    is reachable — only bounded outcome strings and integer counts.
    """
    status = get_halt_status(db)

    rows = (
        db.query(
            AnalyticsEvent.event_name,
            AnalyticsEvent.operational_outcome,
            func.count(AnalyticsEvent.id),
        )
        .filter(
            AnalyticsEvent.created_at >= window_start,
            AnalyticsEvent.created_at <= window_end,
            AnalyticsEvent.event_name.in_(("packet_queue_gate", "packet_preparation_halt")),
        )
        .group_by(AnalyticsEvent.event_name, AnalyticsEvent.operational_outcome)
        .all()
    )
    counts = {(name, outcome): count for name, outcome, count in rows}

    return AdminPacketGateResponse(
        window_start=window_start.isoformat(),
        window_end=window_end.isoformat(),
        halted=status.halted,
        halt_reason=status.reason,
        halted_since=_isoformat(status.halted_since),
        gate_running=counts.get(("packet_queue_gate", "running"), 0),
        gate_passed=counts.get(("packet_queue_gate", "passed"), 0),
        gate_blocked=counts.get(("packet_queue_gate", "blocked"), 0),
        pipeline_halted=counts.get(("packet_preparation_halt", "halted"), 0),
        pipeline_cleared=counts.get(("packet_preparation_halt", "cleared"), 0),
    )


def _isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()
