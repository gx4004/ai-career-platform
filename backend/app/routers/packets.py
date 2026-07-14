from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.application_packets import (
    ApplicationPacketItem,
    ApplicationPacketList,
    PacketPreparationResult,
    QueueReviewState,
    StopAnswerRequest,
    StopAnswerResult,
)
from app.services.application_packets import (
    PacketNotFoundError,
    get_packet,
    list_packets,
    prepare_packets,
)
from app.services.packet_approval import (
    PacketNotApprovableError,
    StopAnswerError,
    store_stop_answer,
)
from app.services.queue_review import (
    PacketDecisionLockedError,
    PacketGateBlockedError,
    accept_packet,
    edit_packet,
    pause_queue,
    queue_review_state,
    reject_packet,
    resume_queue,
    skip_packet,
)
from app.services.queue_review import (
    PacketNotFoundError as PacketDecisionNotFoundError,
)

router = APIRouter()


@router.post("/prepare", response_model=PacketPreparationResult)
async def prepare(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Prepare a reference-based packet for every candidate passing the owner's rules.

    Server-authoritative: candidate filtering, the volume cap, and the cost ceiling
    are enforced during preparation (D-094). Preparation is preparation-only — no
    submission is performed (ADR 0009).
    """
    return await prepare_packets(db, current_user.id)


@router.get("", response_model=ApplicationPacketList)
def get_packets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The owner's prepared packets, each a set of references to existing entities."""
    return list_packets(db, current_user.id)


# ── Global pause (R15 #183) ──
# Declared before ``/{packet_id}`` so the static path wins the route match.


@router.get("/queue-state", response_model=QueueReviewState)
def get_queue_state(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The queue's current preparation posture (paused / regression-halted).

    The review surface reads this to reflect the pause toggle and to show that
    preparation is halted while paused (ADR 0009).
    """
    return queue_review_state(db)


@router.post("/pause", response_model=QueueReviewState)
def pause(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pause the whole queue: preparation refuses immediately (D-098 audit recorded)."""
    return pause_queue(db, current_user.id)


@router.post("/resume", response_model=QueueReviewState)
def resume(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resume the queue: clears the owner's pause (a regression halt still blocks)."""
    return resume_queue(db, current_user.id)


@router.get("/{packet_id}", response_model=ApplicationPacketItem)
def get_one_packet(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_packet(db, current_user.id, packet_id)
    except PacketNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error


@router.post("/{packet_id}/stop-answers", response_model=StopAnswerResult)
def answer_stop_question(
    packet_id: str,
    payload: StopAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store the owner's typed answer to one mandatory-stop question (D-095, D-099).

    The user's answer is the ONLY way to resolve a stop question — the system never
    drafts these fields. Stored owner-scoped and excluded from telemetry entirely.
    Returns what remains unresolved and whether approval is now unlocked.
    """
    try:
        return store_stop_answer(
            db, current_user.id, packet_id, field=payload.field, answer=payload.answer
        )
    except StopAnswerError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ── Per-packet review decisions (R15 #183) ──


@router.post("/{packet_id}/accept", response_model=ApplicationPacketItem)
def accept(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept a packet — refused (409) while any unresolved question remains (D-095).

    Accept is a server-authoritative decision transition + audit event only; the
    immutable approval snapshot and submission handoff are #185.
    """
    try:
        return accept_packet(db, current_user.id, packet_id)
    except PacketDecisionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
    except PacketGateBlockedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except PacketNotApprovableError as error:
        raise HTTPException(
            status_code=409,
            detail="Answer every unresolved question before accepting this packet.",
        ) from error


@router.post("/{packet_id}/skip", response_model=ApplicationPacketItem)
def skip(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Skip a packet — an owner dismissal; records ``packet_skipped``.

    Refused (409) once the packet is already accepted.
    """
    try:
        return skip_packet(db, current_user.id, packet_id)
    except PacketDecisionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
    except PacketDecisionLockedError as error:
        raise HTTPException(
            status_code=409, detail="This packet has already been accepted."
        ) from error


@router.post("/{packet_id}/reject", response_model=ApplicationPacketItem)
def reject(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reject a packet — an owner dismissal; records ``packet_rejected``.

    Refused (409) once the packet is already accepted.
    """
    try:
        return reject_packet(db, current_user.id, packet_id)
    except PacketDecisionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
    except PacketDecisionLockedError as error:
        raise HTTPException(
            status_code=409, detail="This packet has already been accepted."
        ) from error


@router.post("/{packet_id}/edit", response_model=ApplicationPacketItem)
def edit(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reopen a packet's materials under the existing diff/confirmation rules (D-073).

    Returns the packet to ``pending`` and records ``packet_edited``. No material
    content is copied or mutated — the owner edits the referenced CV variant / drafts
    through their existing guarded flows.
    """
    try:
        return edit_packet(db, current_user.id, packet_id)
    except PacketDecisionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
    except PacketDecisionLockedError as error:
        raise HTTPException(
            status_code=409, detail="This packet has already been accepted."
        ) from error
