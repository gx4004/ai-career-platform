from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.development_item import DevelopmentItem
from app.models.evidence_item import EvidenceItem
from app.schemas.evidence_profile import (
    EvidenceItemCreate,
    EvidenceItemResponse,
    EvidenceItemUpdate,
    EvidenceProfileExport,
)


class EvidenceItemNotFoundError(Exception):
    pass


def list_evidence_items(db: Session, user_id: str) -> list[EvidenceItem]:
    return (
        db.query(EvidenceItem)
        .filter(EvidenceItem.user_id == user_id)
        .order_by(EvidenceItem.created_at.asc())
        .all()
    )


def get_evidence_item(db: Session, item_id: str, user_id: str) -> EvidenceItem:
    item = (
        db.query(EvidenceItem)
        .filter(EvidenceItem.id == item_id, EvidenceItem.user_id == user_id)
        .first()
    )
    if item is None:
        raise EvidenceItemNotFoundError
    return item


def create_evidence_item(
    db: Session,
    user_id: str,
    body: EvidenceItemCreate,
    *,
    confirmation_state: str = "unconfirmed",
) -> EvidenceItem:
    """Create one item, defaulting to an unconfirmed proposal (D-062).

    Callers that know the owner typed the content themselves right now — a
    manual create of a `user-entered` item — may pass ``confirmation_state=
    "confirmed"`` so the item lands already trusted, with no extra confirm
    click (Phase 1b, #321). Import and inferred proposals keep the default.
    """
    item = stage_evidence_proposal(db, user_id, body, confirmation_state=confirmation_state)
    db.commit()
    db.refresh(item)
    return item


def stage_evidence_proposal(
    db: Session,
    user_id: str,
    body: EvidenceItemCreate,
    *,
    confirmation_state: str = "unconfirmed",
) -> EvidenceItem:
    """Stage one proposal in the caller's transaction (D-062).

    Defaults to unconfirmed; a caller that is staging content the owner
    supplied themselves right now may pass ``confirmation_state="confirmed"``.
    """
    item = EvidenceItem(
        user_id=user_id,
        kind=body.kind,
        content=body.content,
        provenance=body.provenance,
        confirmation_state=confirmation_state,
    )
    db.add(item)
    db.flush()
    return item


def stage_evidence_items(
    db: Session, user_id: str, bodies: list[EvidenceItemCreate]
) -> list[EvidenceItem]:
    """Store a batch of unconfirmed suggestions in one commit (resume import)."""
    items = [stage_evidence_proposal(db, user_id, body) for body in bodies]
    db.commit()
    return items


def update_evidence_item(
    db: Session, item_id: str, user_id: str, body: EvidenceItemUpdate
) -> EvidenceItem:
    """Apply an owner-authored content correction and mark it confirmed (#321).

    Editing is the owner typing the correction themselves right now, so it is
    trusted the same way a manual create is. Only content changes: kind and
    provenance keep the item's recorded origin.
    """
    item = get_evidence_item(db, item_id, user_id)
    item.content = body.content
    item.confirmation_state = "confirmed"
    db.commit()
    db.refresh(item)
    return item


def confirm_evidence_items(db: Session, user_id: str, item_ids: list[str]) -> list[EvidenceItem]:
    """Confirm the owner's listed items in one commit.

    Confirmation is always an explicit owner action (D-062). Ids the owner does
    not hold are ignored, never confirmed.
    """
    items = (
        db.query(EvidenceItem)
        .filter(EvidenceItem.user_id == user_id, EvidenceItem.id.in_(item_ids))
        .order_by(EvidenceItem.created_at.asc())
        .all()
    )
    for item in items:
        item.confirmation_state = "confirmed"
    db.commit()
    return items


def delete_evidence_items(db: Session, user_id: str, item_ids: list[str] | None = None) -> int:
    """Delete the owner's listed items (or all of them) in one commit (D-065).

    Rejecting a suggestion and removing a fact are both a delete, so nothing
    dismissed lingers. Development items that produced a deleted item keep
    their own record; only the link is cleared.
    """
    query = db.query(EvidenceItem.id).filter(EvidenceItem.user_id == user_id)
    if item_ids is not None:
        query = query.filter(EvidenceItem.id.in_(item_ids))
    ids = [row.id for row in query.all()]
    if not ids:
        return 0
    db.query(DevelopmentItem).filter(
        DevelopmentItem.user_id == user_id, DevelopmentItem.evidence_item_id.in_(ids)
    ).update({DevelopmentItem.evidence_item_id: None}, synchronize_session=False)
    db.query(EvidenceItem).filter(EvidenceItem.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return len(ids)


def delete_evidence_item(db: Session, item_id: str, user_id: str) -> None:
    if not delete_evidence_items(db, user_id, [item_id]):
        raise EvidenceItemNotFoundError


def export_evidence_profile(db: Session, user_id: str) -> EvidenceProfileExport:
    """Assemble the complete, portable snapshot of one user's Evidence Profile.

    Reuses the same owner-scoped query as the list surface so the export can never
    reach across accounts, and emits every item in full (provenance and
    confirmation state included) per D-065 / user story 15.
    """
    items = list_evidence_items(db, user_id)
    exported = [EvidenceItemResponse.model_validate(item) for item in items]
    return EvidenceProfileExport(
        exported_at=datetime.now(UTC),
        item_count=len(exported),
        items=exported,
    )
