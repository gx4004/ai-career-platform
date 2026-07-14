"""Approval guard + stop-answer storage for application packets (R15 #182).

Two server-authoritative rules live here (ADR 0009 / D-095):

1. **Any unresolved question blocks approval.** ``is_packet_approvable`` /
   ``assert_packet_approvable`` are the reusable predicate/validator the approval
   endpoint (#185) will call; a packet is approvable only when every question in its
   ``unresolved_questions`` has been resolved.
2. **A stop question is resolved only by the user's typed answer.** The system never
   drafts a stop field, so the outstanding set shrinks solely as the owner supplies
   answers through ``store_stop_answer`` — stored owner-scoped and excluded from
   telemetry entirely (D-099). ``missing_material`` (no CV variant) is not a stop
   question and cannot be answered here; it clears only by re-preparing with a CV.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.packet_stop_answer import PacketStopAnswer
from app.schemas.application_packets import (
    PacketStopAnswersExport,
    StopAnswerExportItem,
    StopAnswerResult,
    UnresolvedQuestion,
)
from app.services.queue_audit import record_queue_audit_event
from app.services.stop_classifier import is_stop_category


class PacketNotApprovableError(Exception):
    """Raised when a packet still has unresolved questions and cannot be approved."""

    def __init__(self, packet_id: str, outstanding: list[dict]) -> None:
        self.packet_id = packet_id
        self.outstanding = outstanding
        super().__init__(f"Packet {packet_id} has {len(outstanding)} unresolved question(s)")


class StopAnswerError(Exception):
    """Raised when a stop answer targets a field that is not an answerable stop."""


def _packet_for_owner(db: Session, user_id: str, packet_id: str) -> ApplicationPacket | None:
    return (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user_id, ApplicationPacket.id == packet_id)
        .one_or_none()
    )


def _answered_fields(db: Session, user_id: str, packet_id: str) -> set[str]:
    return {
        row.field
        for row in db.query(PacketStopAnswer.field).filter(
            PacketStopAnswer.user_id == user_id,
            PacketStopAnswer.packet_id == packet_id,
        )
    }


def outstanding_questions(packet: ApplicationPacket, answered_fields: set[str]) -> list[dict]:
    """The packet's unresolved questions that no stored answer has resolved yet."""
    return [
        question
        for question in (packet.unresolved_questions or [])
        if question.get("field") not in answered_fields
    ]


def is_packet_approvable(db: Session, user_id: str, packet_id: str) -> bool:
    """True only when no unresolved question remains for this owner's packet (D-095).

    Missing packet → not approvable. Any outstanding question (stop or
    ``missing_material``) → not approvable.
    """
    packet = _packet_for_owner(db, user_id, packet_id)
    if packet is None:
        return False
    answered = _answered_fields(db, user_id, packet_id)
    return not outstanding_questions(packet, answered)


def assert_packet_approvable(db: Session, user_id: str, packet_id: str) -> ApplicationPacket:
    """Validator form of :func:`is_packet_approvable`.

    Returns the packet when it is approvable, otherwise raises
    :class:`PacketNotApprovableError` carrying the outstanding questions. The
    approval endpoint (#185) calls this before it may transition a packet.
    """
    packet = _packet_for_owner(db, user_id, packet_id)
    if packet is None:
        raise PacketNotApprovableError(packet_id, [{"field": "packet", "category": "missing"}])
    answered = _answered_fields(db, user_id, packet_id)
    outstanding = outstanding_questions(packet, answered)
    if outstanding:
        raise PacketNotApprovableError(packet_id, outstanding)
    return packet


def store_stop_answer(
    db: Session, user_id: str, packet_id: str, *, field: str, answer: str
) -> StopAnswerResult:
    """Persist the owner's answer to one stop question; the only way to resolve it.

    Owner-scoped and validated server-side: the field must be an outstanding *stop*
    question actually attached to this packet. ``missing_material`` is rejected (it is
    resolved by selecting a CV, not by typing an answer). Re-answering the same field
    updates the stored answer in place.
    """
    packet = _packet_for_owner(db, user_id, packet_id)
    if packet is None:
        raise StopAnswerError("Application packet not found")

    question = next(
        (q for q in (packet.unresolved_questions or []) if q.get("field") == field),
        None,
    )
    if question is None:
        raise StopAnswerError("No such unresolved question on this packet")
    category = str(question.get("category", ""))
    if not is_stop_category(category):
        raise StopAnswerError("This question is not an answerable stop field")

    existing = (
        db.query(PacketStopAnswer)
        .filter(
            PacketStopAnswer.user_id == user_id,
            PacketStopAnswer.packet_id == packet_id,
            PacketStopAnswer.field == field,
        )
        .one_or_none()
    )
    if existing is None:
        db.add(
            PacketStopAnswer(
                user_id=user_id,
                packet_id=packet_id,
                field=field,
                category=category,
                answer_text=answer,
            )
        )
    else:
        existing.answer_text = answer
    db.commit()

    # Append-only audit of the resolution (D-098, R15 #186). Records only the
    # stop-category class and the packet id by reference — never the field value
    # or the user's typed answer (D-095/D-099).
    record_queue_audit_event(
        db,
        user_id=user_id,
        action="stop_answer_recorded",
        packet_id=packet_id,
        details={"category": category},
    )

    answered = _answered_fields(db, user_id, packet_id)
    outstanding = outstanding_questions(packet, answered)
    return StopAnswerResult(
        packet_id=packet_id,
        resolved_field=field,
        remaining_unresolved=len(outstanding),
        approvable=not outstanding,
        unresolved_questions=[UnresolvedQuestion.model_validate(q) for q in outstanding],
    )


# ── Export + deletion cascade (D-099) ──


def export_packet_stop_answers(db: Session, user_id: str) -> PacketStopAnswersExport:
    """The owner's own stored stop answers, machine-readable (account-scoped export)."""
    rows = (
        db.query(PacketStopAnswer)
        .filter(PacketStopAnswer.user_id == user_id)
        .order_by(PacketStopAnswer.created_at.asc(), PacketStopAnswer.id)
        .all()
    )
    return PacketStopAnswersExport(
        stop_answers=[
            StopAnswerExportItem(
                packet_id=row.packet_id,
                field=row.field,
                category=row.category,
                answer=row.answer_text,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ]
    )


def delete_packet_stop_answers(db: Session, user_id: str) -> dict[str, int]:
    """Owner-scoped hard delete for the account-deletion cascade (D-099)."""
    deleted = (
        db.query(PacketStopAnswer)
        .filter(PacketStopAnswer.user_id == user_id)
        .delete(synchronize_session=False)
    )
    return {"packet_stop_answers": deleted}
