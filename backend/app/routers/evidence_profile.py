from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.data_export import CareerDataExport
from app.schemas.evidence_profile import (
    EvidenceImportRequest,
    EvidenceItemCreate,
    EvidenceItemIds,
    EvidenceItemListResponse,
    EvidenceItemResponse,
    EvidenceItemUpdate,
)
from app.services.data_export import export_career_data
from app.services.evidence_import import extract_resume_evidence
from app.services.evidence_profile import (
    EvidenceItemNotFoundError,
    confirm_evidence_items,
    create_evidence_item,
    delete_evidence_item,
    delete_evidence_items,
    list_evidence_items,
    stage_evidence_items,
    suggest_evidence_item,
    update_evidence_item,
)

router = APIRouter()


def _not_found_as_http(error: EvidenceItemNotFoundError):
    raise HTTPException(status_code=404, detail="Evidence item not found") from error


@router.get("/items", response_model=EvidenceItemListResponse)
def list_items(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return EvidenceItemListResponse(items=list_evidence_items(db, current_user.id))


@router.get("/export", response_model=CareerDataExport)
@limiter.limit("5/minute")
def export_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-serve export of the owner's Evidence Profile and CV Studio data.

    Authenticated-owner-only (``get_current_user`` scopes every row to the caller)
    and rate-limited at the same 5/minute ceiling as the other sensitive
    account-data endpoint (``POST /auth/me/delete``), because a full-profile dump
    is a bulk read of the user's most sensitive stored content (D-065, D-064).
    """
    return export_career_data(db, current_user.id)


@router.post(
    "/import", response_model=EvidenceItemListResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def import_from_resume(
    request: Request,
    body: EvidenceImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract facts from an uploaded resume and store them as suggestions (R11, #146).

    Idempotent: facts the profile already holds are skipped, and only the newly
    staged suggestions are returned.

    Authenticated-owner-only: ``get_current_user`` rejects guests, so guest uploads
    never write to a profile (D-064). Every extracted fact lands `unconfirmed` with
    `imported` provenance, so nothing is trusted until the owner saves it on the
    profile; dismissing a suggestion deletes it (D-062).
    """
    extracted = await extract_resume_evidence(body.resume_text)
    return EvidenceItemListResponse(items=stage_evidence_items(db, current_user.id, extracted))


@router.post("/items", response_model=EvidenceItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(
    body: EvidenceItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # The request body never carries trust state directly (D-062) — a client
    # cannot smuggle a confirmed item through the payload. A `user-entered` item
    # is the owner typing it themselves right now, so it is trusted immediately
    # with no extra confirm click; `imported`/`inferred` items still land
    # unconfirmed for review (Phase 1b, #321).
    if body.provenance != "user-entered":
        # A repeated "Add to profile" returns the suggestion already there.
        return suggest_evidence_item(db, current_user.id, body)
    return create_evidence_item(db, current_user.id, body, confirmation_state="confirmed")


@router.post("/items/confirm", response_model=EvidenceItemListResponse)
def confirm_items(
    body: EvidenceItemIds,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save (confirm) the listed suggestions in one commit (D-062)."""
    return EvidenceItemListResponse(items=confirm_evidence_items(db, current_user.id, body.ids))


@router.delete("/items", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def delete_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Immediately erase the owner's whole Evidence Profile atomically (D-065)."""
    delete_evidence_items(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/items/{item_id}", response_model=EvidenceItemResponse)
def update_item(
    item_id: str,
    body: EvidenceItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return update_evidence_item(db, item_id, current_user.id, body)
    except EvidenceItemNotFoundError as error:
        _not_found_as_http(error)


@router.post("/items/{item_id}/confirm", response_model=EvidenceItemResponse)
def confirm_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save one suggestion. Rejecting a suggestion is ``DELETE /items/{id}``."""
    confirmed = confirm_evidence_items(db, current_user.id, [item_id])
    if not confirmed:
        raise HTTPException(status_code=404, detail="Evidence item not found")
    return confirmed[0]


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        delete_evidence_item(db, item_id, current_user.id)
    except EvidenceItemNotFoundError as error:
        _not_found_as_http(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
