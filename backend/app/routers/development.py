from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.development import (
    DevelopmentItemCreate,
    DevelopmentItemResponse,
    DevelopmentItemUpdate,
    DevelopmentPlanResponse,
)
from app.services.development import (
    DevelopmentItemNotFoundError,
    GapClassificationNotFoundError,
    NoEvidenceProposalError,
    confirm_development_evidence,
    create_development_item,
    decline_development_evidence,
    delete_development_item,
    list_development_items,
    update_development_item,
)

router = APIRouter()


@router.get("", response_model=DevelopmentPlanResponse)
def get_plan(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return DevelopmentPlanResponse(items=list_development_items(db, current_user.id))


@router.post("", response_model=DevelopmentItemResponse, status_code=201)
def create_item(
    body: DevelopmentItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return create_development_item(db, current_user.id, body)
    except GapClassificationNotFoundError as error:
        raise HTTPException(status_code=404, detail="Gap classification not found") from error


@router.patch("/{item_id}", response_model=DevelopmentItemResponse)
def update_item(
    item_id: str,
    body: DevelopmentItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return update_development_item(db, item_id, current_user.id, body)
    except DevelopmentItemNotFoundError as error:
        raise HTTPException(status_code=404, detail="Development item not found") from error


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        delete_development_item(db, item_id, current_user.id)
    except DevelopmentItemNotFoundError as error:
        raise HTTPException(status_code=404, detail="Development item not found") from error


@router.post("/{item_id}/confirm-evidence", response_model=DevelopmentItemResponse)
def confirm_evidence(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm the proposal completion produced (R17 #201, D-113: user-only)."""
    try:
        return confirm_development_evidence(db, item_id, current_user.id)
    except DevelopmentItemNotFoundError as error:
        raise HTTPException(status_code=404, detail="Development item not found") from error
    except NoEvidenceProposalError as error:
        raise HTTPException(status_code=409, detail="No evidence proposal to confirm") from error


@router.post("/{item_id}/decline-evidence", response_model=DevelopmentItemResponse)
def decline_evidence(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Decline the proposal: hard-deleted, leaving no trace in the profile; the
    completed item itself is left intact (R17 #201, D-113)."""
    try:
        return decline_development_evidence(db, item_id, current_user.id)
    except DevelopmentItemNotFoundError as error:
        raise HTTPException(status_code=404, detail="Development item not found") from error
    except NoEvidenceProposalError as error:
        raise HTTPException(status_code=409, detail="No evidence proposal to decline") from error
