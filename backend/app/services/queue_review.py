"""Queue review surface actions: per-packet decisions + global pause (R15 #183).

The owner reviews prepared packets and acts on each — accept / edit / skip / reject —
or pauses the entire queue instantly. Every action is server-authoritative and records
an append-only audit event through the single write seam (D-098, #186):

- **accept** is guarded by the approval predicate (D-095, ADR 0009): a packet with any
  unresolved question is not approvable and accept is refused server-side. This ticket
  makes accept a decision transition + audit event ONLY; freezing the immutable approval
  snapshot, preventing duplicates, and opening the submission destination is #185.
- **edit** reopens the packet's referenced materials under the existing diff/confirmation
  rules (D-073). A packet is a reference-only composition (D-093): its materials are the
  CV variant (edited through CV Studio's D-073 tailoring flow, where new wording requires
  explicit evidence confirmation) and the drafts (regenerated through the shared
  pipeline). This action copies or mutates NO material content — it returns the packet to
  ``pending`` so the owner can edit those referenced materials through their existing
  guarded flows, and records the reopen.
- **skip** / **reject** are the two owner dismissals; both are always allowed.
- **pause** / **resume** flip the owner's global pause, which halts preparation
  immediately through the pipeline-halt consultation seam (#184) so
  :func:`prepare_packets` refuses to prepare — and spend — anything while paused.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.schemas.application_packets import ApplicationPacketItem, QueueReviewState
from app.services.packet_approval import (
    PacketNotApprovableError,
    answered_fields_for_packet,
    assert_packet_approvable,
    packet_item_with_true_unresolved,
)
from app.services.packet_gate import (
    is_preparation_halted,
    is_queue_eligible,
    is_queue_paused,
    pause_preparation,
    resume_preparation,
)
from app.services.queue_audit import record_queue_audit_event

__all__ = [
    "PacketNotApprovableError",
    "PacketNotFoundError",
    "PacketDecisionLockedError",
    "PacketGateBlockedError",
    "accept_packet",
    "edit_packet",
    "skip_packet",
    "reject_packet",
    "pause_queue",
    "resume_queue",
    "queue_review_state",
]


class PacketGateBlockedError(Exception):
    """Raised when accept targets a packet the reviewer gate has not passed (D-097).

    The trust chain (#184) marks a packet ``gate_state="blocked"`` when the reviewer
    found an unresolved fabrication finding. Such a packet is never queue-eligible and
    must never be accepted, independent of whether mandatory-stop questions (D-095)
    remain — the two guards are orthogonal.
    """


class PacketNotFoundError(Exception):
    """The referenced packet does not exist for this owner."""


class PacketDecisionLockedError(Exception):
    """Raised when skip/reject/edit targets a packet already ``accepted``.

    An acceptance is the owner's considered decision to proceed with a packet; once
    recorded, only a fresh decision path (not yet built — #185 was reverted) may
    change it, never an ordinary dismissal/reopen action.
    """

    def __init__(self, packet_id: str) -> None:
        self.packet_id = packet_id
        super().__init__(f"Packet {packet_id} was already accepted")


def _load_owned_packet(db: Session, user_id: str, packet_id: str) -> ApplicationPacket:
    packet = (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user_id, ApplicationPacket.id == packet_id)
        .one_or_none()
    )
    if packet is None:
        raise PacketNotFoundError(packet_id)
    return packet


def _require_unaccepted(packet: ApplicationPacket) -> None:
    if packet.decision == "accepted":
        raise PacketDecisionLockedError(packet.id)


def _set_decision(
    db: Session,
    packet: ApplicationPacket,
    *,
    decision: str,
    action: str,
    details: dict | None = None,
) -> ApplicationPacketItem:
    """Apply a decision transition, then append its immutable audit event.

    The decision is committed first so the audit row (written on its own commit — the
    audit log has no update path) always reflects a persisted transition.
    """
    packet.decision = decision
    db.commit()
    db.refresh(packet)
    record_queue_audit_event(
        db,
        user_id=packet.user_id,
        action=action,
        packet_id=packet.id,
        details={"decision": decision, **(details or {})},
    )
    answered = answered_fields_for_packet(db, packet.user_id, packet.id)
    return packet_item_with_true_unresolved(packet, answered)


def accept_packet(db: Session, user_id: str, packet_id: str) -> ApplicationPacketItem:
    """Accept a packet — refused server-side unless it is approvable (D-095).

    ``assert_packet_approvable`` raises :class:`PacketNotApprovableError` (carrying the
    outstanding questions) when any unresolved question remains, so accept can never
    slip past a mandatory stop. On success the decision becomes ``accepted`` and a
    ``packet_accepted`` audit event is recorded. Snapshot/handoff is #185.
    """
    packet = _load_owned_packet(db, user_id, packet_id)
    # Reviewer-gate guard (#184, D-097): a packet the reviewer left blocked on an
    # unresolved fabrication finding is never queue-eligible and must never be
    # accepted — enforced independently of the mandatory-stop guard below.
    if not is_queue_eligible(packet):
        raise PacketGateBlockedError(
            "This packet was blocked by the application quality reviewer and cannot be accepted."
        )
    # Server-authoritative approval guard (#182): unresolved question → not approvable.
    assert_packet_approvable(db, user_id, packet_id)
    return _set_decision(db, packet, decision="accepted", action="packet_accepted")


def skip_packet(db: Session, user_id: str, packet_id: str) -> ApplicationPacketItem:
    """Skip a packet — an always-allowed owner dismissal; records ``packet_skipped``.

    Refused (409) once the packet is already ``accepted`` (D-095 companion rule):
    an accepted decision is the owner's considered call and is never silently
    overwritten by a later dismissal.
    """
    packet = _load_owned_packet(db, user_id, packet_id)
    _require_unaccepted(packet)
    return _set_decision(db, packet, decision="skipped", action="packet_skipped")


def reject_packet(db: Session, user_id: str, packet_id: str) -> ApplicationPacketItem:
    """Reject a packet — an always-allowed owner dismissal; records ``packet_rejected``.

    Refused (409) once the packet is already ``accepted``; see :func:`skip_packet`.
    """
    packet = _load_owned_packet(db, user_id, packet_id)
    _require_unaccepted(packet)
    return _set_decision(db, packet, decision="rejected", action="packet_rejected")


def edit_packet(db: Session, user_id: str, packet_id: str) -> ApplicationPacketItem:
    """Reopen a packet's materials for editing under the existing rules (D-073).

    Returns the packet to ``pending`` and records ``packet_edited``. The packet
    references its materials (CV variant, drafts run); this action never copies or
    mutates their content — the owner edits them through their existing D-073-guarded
    flows (CV Studio tailoring / draft regeneration), which is exactly why editing
    "reopens materials under the existing diff/confirmation rules". Refused (409)
    once the packet is already ``accepted``; see :func:`skip_packet`.
    """
    packet = _load_owned_packet(db, user_id, packet_id)
    _require_unaccepted(packet)
    return _set_decision(
        db, packet, decision="pending", action="packet_edited", details={"reopened": True}
    )


# ── Global pause (R15 #183) ──


def queue_review_state(db: Session) -> QueueReviewState:
    """The queue's current preparation posture the UI reads to reflect pause/halt."""
    return QueueReviewState(
        paused=is_queue_paused(db),
        preparation_halted=is_preparation_halted(db),
    )


def pause_queue(db: Session, user_id: str) -> QueueReviewState:
    """Pause the queue: halt preparation immediately, then record ``queue_paused``."""
    pause_preparation(db)
    record_queue_audit_event(db, user_id=user_id, action="queue_paused")
    return queue_review_state(db)


def resume_queue(db: Session, user_id: str) -> QueueReviewState:
    """Resume the queue: clear the pause, then record ``queue_resumed``.

    A concurrent regression halt (#184) is untouched and still blocks preparation.
    """
    resume_preparation(db)
    record_queue_audit_event(db, user_id=user_id, action="queue_resumed")
    return queue_review_state(db)
