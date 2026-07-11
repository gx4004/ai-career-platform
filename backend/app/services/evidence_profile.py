from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.schemas.evidence_profile import EvidenceItemCreate, EvidenceItemUpdate


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


def create_evidence_item(db: Session, user_id: str, body: EvidenceItemCreate) -> EvidenceItem:
    item = EvidenceItem(
        user_id=user_id,
        kind=body.kind,
        content=body.content,
        provenance=body.provenance,
        confirmation_state="unconfirmed",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_evidence_item(
    db: Session, item_id: str, user_id: str, body: EvidenceItemUpdate
) -> EvidenceItem:
    item = get_evidence_item(db, item_id, user_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    # Editing any trust-bearing field creates a new unconfirmed proposal. A
    # prior confirmation cannot silently vouch for materially different data.
    item.confirmation_state = "unconfirmed"
    db.commit()
    db.refresh(item)
    return item


def set_evidence_confirmation(
    db: Session, item_id: str, user_id: str, *, confirmed: bool
) -> EvidenceItem:
    item = get_evidence_item(db, item_id, user_id)
    item.confirmation_state = "confirmed" if confirmed else "rejected"
    db.commit()
    db.refresh(item)
    return item


def delete_evidence_item(db: Session, item_id: str, user_id: str) -> None:
    db.delete(get_evidence_item(db, item_id, user_id))
    db.commit()
