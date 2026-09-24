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
    _record_profile_event(
        db,
        event_name="profile_item_created",
        item=item,
        confirmation_transition=item.confirmation_state,
    )
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


def record_evidence_proposal_created(
    db: Session, item: EvidenceItem, *, confirmation_transition: str = "unconfirmed"
) -> None:
    """Record the allowlisted adoption event after the caller commits its transaction."""
    _record_profile_event(
        db,
        event_name="profile_item_created",
        item=item,
        confirmation_transition=confirmation_transition,
    )


def update_evidence_item(
    db: Session, item_id: str, user_id: str, body: EvidenceItemUpdate
) -> EvidenceItem:
    """Apply an owner-authored correction and mark it confirmed (Phase 1b, #321).

    Editing is the owner typing the correction themselves right now, so it is
    trusted the same way a manual create is: the item lands confirmed with no
    extra confirm click. Use the reject action to withdraw trust instead.
    """
    item = get_evidence_item(db, item_id, user_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.confirmation_state = "confirmed"
    db.commit()
    db.refresh(item)
    _record_profile_event(
        db,
        event_name="profile_item_updated",
        item=item,
        confirmation_transition="confirmed",
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


def confirm_all_imported_evidence(db: Session, user_id: str) -> list[EvidenceItem]:
    """Confirm every still-unconfirmed imported item in one action (Phase 1b, #321).

    Scoped to `imported` provenance only — the resume-import review is the one
    surface with a batch of same-origin proposals piling up. Imported items are
    never linked to a development item, so there is no dev-lifecycle timeline to
    update here (unlike :func:`set_evidence_confirmation`). One commit for the
    whole batch, then one allowlisted event per item, mirroring
    :func:`delete_evidence_profile`'s commit-then-emit shape.
    """
    items = (
        db.query(EvidenceItem)
        .filter(
            EvidenceItem.user_id == user_id,
            EvidenceItem.provenance == "imported",
            EvidenceItem.confirmation_state == "unconfirmed",
        )
        .order_by(EvidenceItem.created_at.asc())
        .all()
    )
    for item in items:
        item.confirmation_state = "confirmed"
    db.commit()
    for item in items:
        db.refresh(item)
        _record_profile_event(
            db,
            event_name="profile_item_confirmed",
            item=item,
            confirmation_transition="confirmed",
        )
    return items


def delete_evidence_item(db: Session, item_id: str, user_id: str) -> None:
    item = get_evidence_item(db, item_id, user_id)
    kind, provenance = _prepare_evidence_item_deletion(db, item)
    db.commit()
    _record_evidence_item_deleted(db, kind=kind, provenance=provenance)


def _prepare_evidence_item_deletion(
    db: Session, item: EvidenceItem
) -> tuple[str, str]:
    """Stage one item's owner-related cleanup without committing the transaction."""
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
    return kind, provenance


def _record_evidence_item_deleted(
    db: Session, *, kind: str, provenance: str
) -> None:
    safe_record_activation_event(
        db,
        event_name="profile_item_deleted",
        evidence_kind=kind,
        evidence_provenance=provenance,
    )


def delete_evidence_profile(db: Session, user_id: str) -> int:
    """Delete every owner-scoped profile item in one transaction (D-065).

    Development-item links and timelines are staged alongside the evidence-row
    deletes, then one commit makes the whole erasure visible. Telemetry is emitted
    only after that transaction succeeds and carries no content or identifiers.
    """
    items = list_evidence_items(db, user_id)
    deleted_dimensions = [
        _prepare_evidence_item_deletion(db, item) for item in items
    ]
    db.commit()
    for kind, provenance in deleted_dimensions:
        _record_evidence_item_deleted(db, kind=kind, provenance=provenance)
    return len(items)


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
