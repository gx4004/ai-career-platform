from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.submission_authorizations import SubmissionAuthorizationListResponse
from app.services.submission_authorizations import (
    revoke_submission_authorization,
    submission_authorization_list,
)

router = APIRouter()


@router.get("", response_model=SubmissionAuthorizationListResponse)
@limiter.limit("30/minute")
def list_active_grants(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List every active source-specific grant owned by the caller."""
    return submission_authorization_list(db, current_user.id)


@router.delete("/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def revoke_grant(
    grant_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke an owner-scoped grant idempotently without revealing other owners."""
    revoke_submission_authorization(
        db,
        user_id=current_user.id,
        grant_id=grant_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
