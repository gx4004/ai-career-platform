from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.queue_rules import (
    QueuePreview,
    QueueRuleItem,
    QueueRuleList,
    QueueRuleUpsert,
    QueueSettingsResponse,
    QueueSettingsUpsert,
)
from app.services.queue_rules import (
    QueueRuleNotFoundError,
    delete_rule,
    get_settings,
    list_rules,
    preview_queue_candidates,
    upsert_rule,
    upsert_settings,
)

router = APIRouter()


@router.get("/rules", response_model=QueueRuleList)
def get_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The owner's queue rules — the filters a job must pass to become a packet."""
    return list_rules(db, current_user.id)


@router.put("/rules", response_model=QueueRuleItem)
def put_rule(
    body: QueueRuleUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or replace the rule for one dimension (role, location, …)."""
    return upsert_rule(db, current_user.id, body)


@router.delete("/rules/{rule_type}", status_code=status.HTTP_204_NO_CONTENT)
def remove_rule(
    rule_type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        delete_rule(db, current_user.id, rule_type)
    except QueueRuleNotFoundError as error:
        raise HTTPException(status_code=404, detail="Queue rule not found") from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/settings", response_model=QueueSettingsResponse)
def read_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The effective volume cap and cost ceiling (defaults until the user sets them)."""
    return get_settings(db, current_user.id)


@router.put("/settings", response_model=QueueSettingsResponse)
def put_settings(
    body: QueueSettingsUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return upsert_settings(db, current_user.id, body)


@router.get("/preview", response_model=QueuePreview)
def preview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Candidate listings that pass every rule, within the volume cap and cost ceiling.

    Server-authoritative: a listing failing any rule never appears here, so it can
    never become a packet. With no rules defined the queue prepares nothing.
    """
    return preview_queue_candidates(db, current_user.id)
