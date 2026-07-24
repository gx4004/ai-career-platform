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
from app.services.analytics import safe_record_activation_event


class EvidenceItemNotFoundError(Exception):
    pass


def _development_event(name: str, evidence_item_id: str) -> dict:
    return {
        "event": name,
        "at": datetime.now(UTC).isoformat(),
        "evidence_item_id": evidence_item_id,
    }


def _linked_development_item(
    db: Session, item: EvidenceItem
) -> DevelopmentItem | None:
    """Resolve the owner-scoped R17 item that produced this R11 proposal."""
    return (
        db.query(DevelopmentItem)
        .filter(
            DevelopmentItem.evidence_item_id == item.id,
            DevelopmentItem.user_id == item.user_id,
        )
        .first()
    )


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
    item = stage_evidence_proposal(db, user_id, body)
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


def stage_evidence_proposal(
    db: Session, user_id: str, body: EvidenceItemCreate
) -> EvidenceItem:
    """Stage one unconfirmed proposal in the caller's transaction (D-062)."""
    item = EvidenceItem(
        user_id=user_id,
        kind=body.kind,
        content=body.content,
        provenance=body.provenance,
        confirmation_state="unconfirmed",
    )
    db.add(item)
    db.flush()
    return item


def record_evidence_proposal_created(db: Session, item: EvidenceItem) -> None:
    """Record the allowlisted adoption event after the caller commits its transaction."""
    _record_profile_event(
        db,
        event_name="profile_item_created",
        item=item,
        confirmation_transition="unconfirmed",
    )


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
) -> EvidenceItem | EvidenceItemResponse:
    item = get_evidence_item(db, item_id, user_id)
    development_item = _linked_development_item(db, item)

    if development_item is not None and not confirmed:
        # A completed-work proposal has a stronger lifecycle than a general R11
        # item: declining it must leave no profile trace (D-113). Return a
        # rejected snapshot as the action acknowledgement, but atomically clear
        # the link and delete the persisted row. Retraction after confirmation
        # follows the same no-dangling-link rule with a distinct timeline event.
        response = EvidenceItemResponse.model_validate(item).model_copy(
            update={"confirmation_state": "rejected"}
        )
        event_name = (
            "evidence_declined"
            if item.confirmation_state == "unconfirmed"
            else "evidence_retracted"
        )
        development_item.evidence_item_id = None
        development_item.timeline = [
            *development_item.timeline,
            _development_event(event_name, item.id),
        ]
        db.delete(item)
        db.commit()
        _record_profile_event(
            db,
            event_name="profile_item_rejected",
            item=item,
            confirmation_transition="rejected",
        )
        return response

    if (
        development_item is not None
        and confirmed
        and item.confirmation_state != "confirmed"
    ):
        development_item.timeline = [
            *development_item.timeline,
            _development_event("evidence_confirmed", item.id),
        ]
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
    development_item = _linked_development_item(db, item)
    if development_item is not None:
        development_item.evidence_item_id = None
        development_item.timeline = [
            *development_item.timeline,
            _development_event(
                "evidence_declined"
                if item.confirmation_state == "unconfirmed"
                else "evidence_deleted",
                item.id,
            ),
        ]
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
