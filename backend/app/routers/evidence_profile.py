from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.evidence_profile import (
    ConfirmationAction,
    EvidenceItemCreate,
    EvidenceItemListResponse,
    EvidenceItemResponse,
    EvidenceItemUpdate,
    EvidenceProfileExport,
)
from app.services.evidence_profile import (
    EvidenceItemNotFoundError,
    create_evidence_item,
    delete_evidence_item,
    export_evidence_profile,
    get_evidence_item,
    list_evidence_items,
    set_evidence_confirmation,
    update_evidence_item,
)

router = APIRouter()


def _not_found_as_http(error: EvidenceItemNotFoundError):
    raise HTTPException(status_code=404, detail="Evidence item not found") from error


@router.get("/items", response_model=EvidenceItemListResponse)
def list_items(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return EvidenceItemListResponse(items=list_evidence_items(db, current_user.id))


@router.get("/export", response_model=EvidenceProfileExport)
@limiter.limit("5/minute")
def export_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-serve, machine-readable export of the owner's full Evidence Profile.

    Authenticated-owner-only (``get_current_user`` scopes every row to the caller)
    and rate-limited at the same 5/minute ceiling as the other sensitive
    account-data endpoint (``POST /auth/me/delete``), because a full-profile dump
    is a bulk read of the user's most sensitive stored content (D-065, D-064).
    """
    return export_evidence_profile(db, current_user.id)


@router.post("/items", response_model=EvidenceItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(
    body: EvidenceItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Proposal creation never carries trust state. Confirmation and rejection are
    # separate, authenticated user actions, so automated callers cannot smuggle a
    # confirmed item through this write contract (D-062).
    return create_evidence_item(db, current_user.id, body)


@router.get("/items/{item_id}", response_model=EvidenceItemResponse)
def get_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_evidence_item(db, item_id, current_user.id)
    except EvidenceItemNotFoundError as error:
        _not_found_as_http(error)


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


@router.post("/items/{item_id}/confirmation", response_model=EvidenceItemResponse)
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
