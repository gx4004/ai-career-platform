from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.schemas.evidence_profile import (
    EvidenceItemCreate,
    EvidenceItemResponse,
    EvidenceItemUpdate,
    EvidenceProfileExport,
)
from app.services.analytics import safe_record_activation_event


class EvidenceItemNotFoundError(Exception):
    pass


def _record_profile_event(
    db: Session,
    *,
    event_name: str,
    item: EvidenceItem,
    confirmation_transition: str | None,
) -> None:
    """Emit one allowlisted profile-adoption event from the shared write seam (D-067).

    Best-effort telemetry that must never break the user-facing profile action.
    Carries only the three low-cardinality dimensions — item kind, provenance
    class, and the resulting confirmation state of the transition — and never any
    evidence content, employer/institution name, or stable content identifier.
    """
    safe_record_activation_event(
        db,
        event_name=event_name,
        evidence_kind=item.kind,
        evidence_provenance=item.provenance,
        confirmation_transition=confirmation_transition,
    )


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
    # A new proposal is always unconfirmed (D-062); record the adoption event.
    _record_profile_event(
        db,
        event_name="profile_item_created",
        item=item,
        confirmation_transition="unconfirmed",
    )
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
    _record_profile_event(
        db,
        event_name="profile_item_updated",
        item=item,
        confirmation_transition="unconfirmed",
    )
    return item


def set_evidence_confirmation(
    db: Session, item_id: str, user_id: str, *, confirmed: bool
) -> EvidenceItem:
    item = get_evidence_item(db, item_id, user_id)
    item.confirmation_state = "confirmed" if confirmed else "rejected"
    db.commit()
    db.refresh(item)
    _record_profile_event(
        db,
        event_name="profile_item_confirmed" if confirmed else "profile_item_rejected",
        item=item,
        confirmation_transition=item.confirmation_state,
    )
    return item


def delete_evidence_item(db: Session, item_id: str, user_id: str) -> None:
    item = get_evidence_item(db, item_id, user_id)
    # Capture the low-cardinality dimensions before the row is gone; deletion has
    # no resulting confirmation state, so the transition dimension stays null.
    kind, provenance = item.kind, item.provenance
    db.delete(item)
    db.commit()
    safe_record_activation_event(
        db,
        event_name="profile_item_deleted",
        evidence_kind=kind,
        evidence_provenance=provenance,
    )


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
