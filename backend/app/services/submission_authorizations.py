from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy.orm import Session, joinedload

from app.models.submission_authorization import SubmissionAuthorizationGrant
from app.models.user import User
from app.schemas.submission_authorizations import (
    SubmissionAuthorizationListResponse,
    SubmissionAuthorizationResponse,
    SubmissionAuthorizationsExport,
    VerifiedSourceAuthorization,
)
from app.services.submission_sources import require_submission_allowed


class SubmissionAuthorizationRefusal(StrEnum):
    GRANT_NOT_ACTIVE = "grant_not_active"


class UserSubmissionNotAuthorized(RuntimeError):
    def __init__(self, reason: SubmissionAuthorizationRefusal):
        self.reason = reason
        super().__init__(reason.value)


@dataclass(frozen=True)
class ActiveSubmissionAuthorization:
    """Pinned user-gate fact that a worker must re-check before every outward act."""

    grant_id: str
    user_id: str
    source_id: str


def record_submission_authorization(
    db: Session,
    *,
    user_id: str,
    source_key: str,
    authorization: VerifiedSourceAuthorization,
) -> SubmissionAuthorizationGrant:
    """Record a completed source-provided OAuth flow without storing its credentials.

    This internal seam is deliberately absent from the HTTP router. A future
    source-specific callback adapter may call it only after validating the
    provider response and explicit user consent. The complete #189 source gate is
    re-read first, so queue use or an unsupported source can never infer a grant.
    """
    source_authorization = require_submission_allowed(db, source_key)
    # The grant row may not exist yet, so locking it cannot serialize concurrent
    # callbacks. Lock the stable owner row before deciding whether to reuse or
    # replace the one-per-owner/source grant. A waiting identical callback then
    # observes and returns the committed winner instead of racing the unique key.
    if (
        db.query(User.id)
        .filter(User.id == user_id)
        .with_for_update()
        .one_or_none()
        is None
    ):
        raise ValueError("Submission authorization requires an authenticated user")

    existing = (
        db.query(SubmissionAuthorizationGrant)
        .populate_existing()
        .filter(
            SubmissionAuthorizationGrant.user_id == user_id,
            SubmissionAuthorizationGrant.discovery_source_id
            == source_authorization.discovery_source_id,
        )
        .with_for_update()
        .one_or_none()
    )
    if (
        existing is not None
        and existing.mechanism == authorization.mechanism
        and existing.scope == authorization.scope
    ):
        return existing
    if existing is not None:
        db.delete(existing)
        db.flush()

    grant = SubmissionAuthorizationGrant(
        user_id=user_id,
        discovery_source_id=source_authorization.discovery_source_id,
        mechanism=authorization.mechanism,
        scope=authorization.scope,
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return grant


def list_submission_authorizations(
    db: Session,
    user_id: str,
) -> list[SubmissionAuthorizationResponse]:
    rows = (
        db.query(SubmissionAuthorizationGrant)
        .options(joinedload(SubmissionAuthorizationGrant.discovery_source))
        .filter(SubmissionAuthorizationGrant.user_id == user_id)
        .order_by(
            SubmissionAuthorizationGrant.granted_at.asc(),
            SubmissionAuthorizationGrant.id.asc(),
        )
        .all()
    )
    return [_response(row) for row in rows]


def submission_authorization_list(
    db: Session,
    user_id: str,
) -> SubmissionAuthorizationListResponse:
    return SubmissionAuthorizationListResponse(
        items=list_submission_authorizations(db, user_id)
    )


def revoke_submission_authorization(
    db: Session,
    *,
    user_id: str,
    grant_id: str,
) -> bool:
    """Delete one owner-scoped grant; stale work pinned to its id fails immediately."""
    grant = (
        db.query(SubmissionAuthorizationGrant)
        .populate_existing()
        .filter(
            SubmissionAuthorizationGrant.id == grant_id,
            SubmissionAuthorizationGrant.user_id == user_id,
        )
        .with_for_update()
        .one_or_none()
    )
    if grant is None:
        return False
    db.delete(grant)
    db.commit()
    return True


def require_active_submission_authorization(
    db: Session,
    *,
    user_id: str,
    source_id: str,
    grant_id: str,
) -> ActiveSubmissionAuthorization:
    """Re-read the exact grant pinned by queued/in-flight work.

    A worker must call this at dispatch and immediately before each outward act,
    including any retry after waiting. Revocation physically removes the row and
    re-granting creates a new id, so cached ORM state and an ABA re-grant cannot
    revive old work.
    """
    grant = (
        db.query(SubmissionAuthorizationGrant)
        .populate_existing()
        .filter(
            SubmissionAuthorizationGrant.id == grant_id,
            SubmissionAuthorizationGrant.user_id == user_id,
            SubmissionAuthorizationGrant.discovery_source_id == source_id,
        )
        .one_or_none()
    )
    if grant is None:
        raise UserSubmissionNotAuthorized(
            SubmissionAuthorizationRefusal.GRANT_NOT_ACTIVE
        )
    return ActiveSubmissionAuthorization(
        grant_id=grant.id,
        user_id=grant.user_id,
        source_id=grant.discovery_source_id,
    )


def export_submission_authorizations(
    db: Session,
    user_id: str,
) -> SubmissionAuthorizationsExport:
    grants = list_submission_authorizations(db, user_id)
    return SubmissionAuthorizationsExport(
        grant_count=len(grants),
        grants=grants,
    )


def delete_submission_authorizations(db: Session, user_id: str) -> int:
    return (
        db.query(SubmissionAuthorizationGrant)
        .filter(SubmissionAuthorizationGrant.user_id == user_id)
        .delete(synchronize_session=False)
    )


def _response(
    grant: SubmissionAuthorizationGrant,
) -> SubmissionAuthorizationResponse:
    source = grant.discovery_source
    return SubmissionAuthorizationResponse(
        id=grant.id,
        source_id=source.id,
        source_key=source.source_key,
        source_display_name=source.display_name,
        source_family=source.source_family,
        mechanism=grant.mechanism,
        scope=grant.scope,
        granted_at=grant.granted_at,
    )
