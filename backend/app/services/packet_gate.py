"""The trust-chain gate that stands between packet preparation and the queue (R15 #184).

**No packet reaches the queue with an unresolved fabrication finding** (D-097). After a
packet's materials are composed, :func:`prepare_packets` runs the R13 Application
Quality Reviewer (:mod:`app.services.campaign_reviewer`) against them. A reviewer
``unsupported_claim`` finding is a *fabrication* finding (it is the deterministic
groundedness check built on :mod:`app.services.fabrication`). Any such finding leaves
the packet ``gate_state == "blocked"`` — it is never queue-eligible.

Every gate state transition (running / passed / blocked) is emitted through the
shared operational-event seam as an ALLOWLISTED, low-cardinality event — no packet
content, listing text/id, campaign/run id, finding text, or user identifier ever
rides along (``ActivationEventCreate`` enforces this via ``extra="forbid"``). The
admin dashboard reads these counts.

This module also owns the owner-initiated global queue pause (R15 #183, below),
which reuses the same ``pipeline_halts`` consultation seam under a per-user scope.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.analytics_event import AnalyticsEvent
from app.models.pipeline_halt import PipelineHalt
from app.models.user import User
from app.schemas.admin import AdminPacketGateResponse
from app.services.analytics import safe_record_activation_event


# The owner-initiated pause (R15 #183). Scoped per user — embedding the user id in
# the ``pipeline_halts`` scope string keeps it on the same halt/consultation seam
# while ensuring one owner's pause can never halt, or be cleared by, another owner's
# queue (a single shared "queue-pause" scope previously meant any authenticated user
# could pause or resume every other user's queue). Reason is the bounded
# ``user_paused`` marker.
def _queue_pause_scope(user_id: str) -> str:
    return f"queue-pause:{user_id}"


QUEUE_PAUSE_REASON = "user_paused"


# The reviewer category that represents a fabrication finding (D-097). It is the
# reviewer's groundedness check — a claim not traceable to confirmed evidence or the
# selected source material — and is the only finding category the queue gate blocks on.
FABRICATION_FINDING_CATEGORY = "unsupported_claim"


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


# ── Owner-initiated global pause (R15 #183) ──


@dataclass(frozen=True)
class HaltStatus:
    """The current pause posture for one owner's queue-pause scope."""

    halted: bool
    reason: str | None = None
    halted_since: datetime | None = None


def _halt_row(db: Session, scope: str) -> PipelineHalt | None:
    return db.query(PipelineHalt).filter(PipelineHalt.scope == scope).one_or_none()


def delete_queue_pause_state(db: Session, user_id: str) -> None:
    """Delete this owner's pause row, if any, as part of account erasure (D-099).

    A per-user pause row IS this owner's data and must not outlive their
    account. No commit here — the caller commits once as part of the larger
    erasure transaction.
    """
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

    Idempotent: re-pausing refreshes the timestamp on the existing row. The
    owner-scoped audit event (``queue_paused``) is recorded by the caller.
    """
    now = now or datetime.now(UTC)
    # Lock the owner row so a concurrent pause/resume call for the same user
    # serializes instead of racing.
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

    Only clears this owner's ``queue-pause:<user_id>`` scope; other owners'
    pauses are untouched. Idempotent.
    """
    db.query(User.id).filter(User.id == user_id).with_for_update().one()
    row = _halt_row(db, _queue_pause_scope(user_id))
    if row is not None:
        db.delete(row)
        db.commit()
    return HaltStatus(halted=False)


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
    no new vendor. Windowed counts of the allowlisted per-packet gate events. No
    packet content, listing text/id, run id, finding text, or user identifier is
    reachable — only bounded outcome strings and integer counts.
    """
    rows = (
        db.query(
            AnalyticsEvent.event_name,
            AnalyticsEvent.operational_outcome,
            func.count(AnalyticsEvent.id),
        )
        .filter(
            AnalyticsEvent.created_at >= window_start,
            AnalyticsEvent.created_at <= window_end,
            AnalyticsEvent.event_name == "packet_queue_gate",
        )
        .group_by(AnalyticsEvent.event_name, AnalyticsEvent.operational_outcome)
        .all()
    )
    counts = {(name, outcome): count for name, outcome, count in rows}

    return AdminPacketGateResponse(
        window_start=window_start.isoformat(),
        window_end=window_end.isoformat(),
        gate_running=counts.get(("packet_queue_gate", "running"), 0),
        gate_passed=counts.get(("packet_queue_gate", "passed"), 0),
        gate_blocked=counts.get(("packet_queue_gate", "blocked"), 0),
    )
