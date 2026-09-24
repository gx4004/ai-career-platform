from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.feature_gates import require_r11_enabled
from app.limiter import limiter, model_abuse_limits
from app.models.user import User
from app.schemas.data_export import CareerDataExport
from app.schemas.evidence_profile import (
    ConfirmationAction,
    EvidenceImportProposalsResponse,
    EvidenceImportRequest,
    EvidenceItemCreate,
    EvidenceItemListResponse,
    EvidenceItemResponse,
    EvidenceItemUpdate,
)
from app.services.data_export import export_career_data
from app.services.evidence_import import generate_import_proposals
from app.services.evidence_profile import (
    EvidenceItemNotFoundError,
    confirm_all_imported_evidence,
    create_evidence_item,
    delete_evidence_item,
    delete_evidence_profile,
    get_evidence_item,
    list_evidence_items,
    set_evidence_confirmation,
    update_evidence_item,
)

router = APIRouter()


def _not_found_as_http(error: EvidenceItemNotFoundError):
    raise HTTPException(status_code=404, detail="Evidence item not found") from error


@router.get(
    "/items",
    response_model=EvidenceItemListResponse,
    dependencies=[Depends(require_r11_enabled)],
)
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
    "/import/proposals",
    response_model=EvidenceImportProposalsResponse,
    dependencies=[Depends(require_r11_enabled)],
)
@limiter.limit("10/minute")
@model_abuse_limits
async def propose_import(
    request: Request,
    body: EvidenceImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Derive reviewable evidence proposals from an uploaded resume (R11, #146).

    Authenticated-owner-only: ``get_current_user`` rejects guests with 401/403, so
    guest uploads never trigger proposals or any profile write (D-064). Proposals
    are derived from the resume text and returned for review only — this endpoint
    persists nothing, so a proposal the user discards or skips leaves no
    server-side trace of its content. Accepting a proposal is a separate call to
    ``POST /items`` that stores it `unconfirmed` with `imported` provenance
    (D-062).
    """
    proposals = await generate_import_proposals(body.resume_text)
    return EvidenceImportProposalsResponse(proposals=proposals)


@router.post(
    "/items",
    response_model=EvidenceItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_r11_enabled)],
)
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
    confirmation_state = "confirmed" if body.provenance == "user-entered" else "unconfirmed"
    return create_evidence_item(
        db, current_user.id, body, confirmation_state=confirmation_state
    )


@router.post(
    "/items/confirm-imported",
    response_model=EvidenceItemListResponse,
    dependencies=[Depends(require_r11_enabled)],
)
def confirm_imported_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk-confirm every still-unconfirmed imported item at once (#321)."""
    return EvidenceItemListResponse(
        items=confirm_all_imported_evidence(db, current_user.id)
    )


@router.delete("/items", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def delete_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Immediately erase the owner's whole Evidence Profile atomically (D-065)."""
    delete_evidence_profile(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/items/{item_id}",
    response_model=EvidenceItemResponse,
    dependencies=[Depends(require_r11_enabled)],
)
def get_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_evidence_item(db, item_id, current_user.id)
    except EvidenceItemNotFoundError as error:
        _not_found_as_http(error)


@router.patch(
    "/items/{item_id}",
    response_model=EvidenceItemResponse,
    dependencies=[Depends(require_r11_enabled)],
)
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


@router.post(
    "/items/{item_id}/confirmation",
    response_model=EvidenceItemResponse,
    dependencies=[Depends(require_r11_enabled)],
)
def set_confirmation(
    item_id: str,
    body: ConfirmationAction,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return set_evidence_confirmation(
            db, item_id, current_user.id, confirmed=body.action == "confirm"
        )
    except EvidenceItemNotFoundError as error:
        _not_found_as_http(error)


@router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_r11_enabled)],
)
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
