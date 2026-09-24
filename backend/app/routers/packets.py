from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.application_packets import (
    ApplicationPacketItem,
    ApplicationPacketList,
    AutofillReport,
    PacketApprovalPreview,
    PacketApprovalRequest,
    PacketApprovalResult,
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
from app.services.autopilot_autofill import (
    AutofillBusy,
    AutofillRefused,
    PacketNotApprovedError,
    build_materials,
    start_autofill,
)
from app.services.packet_approval import (
    PacketNotApprovableError,
    StopAnswerError,
    store_stop_answer,
)
from app.services.packet_approval_snapshot import (
    DuplicatePacketApprovalError,
    PacketApprovalChangedError,
    approve_packet,
    preview_packet_approval,
)
from app.services.queue_review import (
    PacketDecisionLockedError,
    PacketGateBlockedError,
    PacketNotAcceptedError,
    edit_packet,
    mark_packet_applied,
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
    """This owner's current preparation posture (paused or not).

    The review surface reads this to reflect the pause toggle and to show that
    preparation is halted while paused (ADR 0009).
    """
    return queue_review_state(db, current_user.id)


@router.post("/pause", response_model=QueueReviewState)
def pause(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pause this owner's queue: their preparation refuses immediately (D-098 audit recorded)."""
    return pause_queue(db, current_user.id)


@router.post("/resume", response_model=QueueReviewState)
def resume(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resume this owner's queue: clears their pause."""
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


@router.get("/{packet_id}/approval-preview", response_model=PacketApprovalPreview)
def get_approval_preview(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dereference the exact materials the owner is being asked to approve."""
    try:
        return preview_packet_approval(db, current_user.id, packet_id)
    except PacketDecisionNotFoundError as error:
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


@router.post("/{packet_id}/accept", response_model=PacketApprovalResult)
def accept(
    packet_id: str,
    payload: PacketApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approve a packet, freeze it by value, and return the manual handoff.

    No submission occurs. The source URL is returned only so the owner can open the
    official destination and submit the immutable approved content themselves.
    """
    try:
        return approve_packet(
            db,
            current_user.id,
            packet_id,
            expected_material_sha256=payload.expected_material_sha256,
        )
    except PacketDecisionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
    except PacketGateBlockedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except PacketNotApprovableError as error:
        raise HTTPException(
            status_code=409,
            detail="Answer every unresolved question before accepting this packet.",
        ) from error
    except DuplicatePacketApprovalError as error:
        raise HTTPException(status_code=409, detail=error.message) from error
    except PacketApprovalChangedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


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


@router.post("/{packet_id}/applied", response_model=ApplicationPacketItem)
def mark_applied(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The owner confirms they submitted this approved application themselves.

    Records the confirmation on the packet's campaign. Refused (409) until the
    packet is accepted — there is no official destination to have applied on
    before then.
    """
    try:
        return mark_packet_applied(db, current_user.id, packet_id)
    except PacketDecisionNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
    except PacketNotAcceptedError as error:
        raise HTTPException(
            status_code=409, detail="Accept this application before marking it applied."
        ) from error


# ── Autopilot experiment (#325): local-only, off by default, stops before submit ──

AUTOFILL_TIMEOUT_SECONDS = 90


@router.post("/{packet_id}/autofill", response_model=AutofillReport)
def autofill(
    packet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Open the approved application's form in a browser on this computer and fill it.

    Never submits: the owner reviews the open window and presses submit themselves.
    """
    if not settings.AUTOPILOT_EXPERIMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        materials = build_materials(db, current_user, packet_id)
        report = start_autofill(current_user.id, materials)
    except PacketNotFoundError as error:
        raise HTTPException(status_code=404, detail="Application packet not found") from error
    except PacketNotApprovedError as error:
        raise HTTPException(
            status_code=409, detail="Approve this application before filling the form."
        ) from error
    except AutofillRefused as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except AutofillBusy as error:
        raise HTTPException(
            status_code=409, detail="A form is already being filled. Finish that one first."
        ) from error
    try:
        result = report.result(timeout=AUTOFILL_TIMEOUT_SECONDS)
    except TimeoutError as error:
        raise HTTPException(
            status_code=504, detail="The form took too long. Check the open browser window."
        ) from error
    except AutofillRefused as error:  # the page moved to a site Autopilot does not fill
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001 — Playwright missing or the page failed
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not fill the form. This only works when the app runs on your own "
                "computer with a browser installed (python -m playwright install chromium)."
            ),
        ) from error
    return AutofillReport(filled=result.filled, skipped=result.skipped, url=result.url)
