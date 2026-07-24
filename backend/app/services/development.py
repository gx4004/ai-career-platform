"""R17 development-plan service (#199, D-112/D-114; #201, D-113).

CRUD over a user's bounded development items. Mirrors the Evidence Profile
service shape: owner-scoped queries, a not-found sentinel, and an export/delete
pair that joins the account-deletion cascade and the portable data export.

Completion into evidence (#201): marking an item completed stages an unconfirmed
Evidence Profile proposal through the existing R11 seam
(:func:`app.services.evidence_profile.stage_evidence_proposal`) — nothing here
writes a confirmed fact. Confirming or declining that proposal routes back through
this service so the item's own timeline records what happened, and declining
hard-deletes the proposal so no rejected trace lingers in the profile (D-113).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.development_item import DevelopmentItem
from app.models.evidence_item import EvidenceItem
from app.models.gap_classification import GapClassification
from app.schemas.development import (
    RESPONSE_FOR_GAP,
    DevelopmentEvidenceProposalResponse,
    DevelopmentItemCreate,
    DevelopmentItemResponse,
    DevelopmentItemUpdate,
    DevelopmentPlanExport,
)
from app.schemas.evidence_profile import EvidenceItemCreate
from app.services.analytics import safe_record_activation_event
from app.services.evidence_profile import (
    record_evidence_proposal_created,
    set_evidence_confirmation,
    stage_evidence_proposal,
)
from app.services.gap_response import trace_seed

#: Honest, non-fabricated fallback statement per response kind, used only when
#: neither the item's own notes nor its (possibly reconciled-away) gap
#: classification trace supplies a more specific seed.
_RESPONSE_FALLBACK_SEED = {
    "reword": "Improved the clarity of application materials",
    "capture_evidence": "Captured evidence that was already demonstrated",
    "produce_evidence": "Produced a deliverable demonstrating a required capability",
    "learn_skill": "Developed a new skill",
}


class DevelopmentItemNotFoundError(Exception):
    pass


class GapClassificationNotFoundError(Exception):
    pass


class NoEvidenceProposalError(Exception):
    """The item has no linked proposal to confirm or decline (not completed, or
    already resolved)."""


def _record_item_event(
    db: Session,
    *,
    event_name: str,
    item: DevelopmentItem,
    state_from: str | None = None,
    state_to: str | None = None,
) -> None:
    """Emit one content-free, bounded development lifecycle event (D-114)."""
    safe_record_activation_event(
        db,
        event_name=event_name,
        development_gap_kind=item.gap_kind,
        development_response_kind=item.response_kind,
        development_state_from=state_from,
        development_state_to=state_to,
    )


def _event(name: str, **fields) -> dict:
    return {"event": name, "at": datetime.now(UTC).isoformat(), **fields}


def _hydrate_evidence_proposal(
    db: Session, items: list[DevelopmentItem]
) -> list[DevelopmentItem]:
    """Attach each item's linked proposal as a transient, non-persisted value.

    Batched into a single query regardless of list size (D-112 bounded model).
    """
    ids = [item.evidence_item_id for item in items if item.evidence_item_id]
    proposals: dict[str, EvidenceItem] = {}
    if ids:
        rows = db.query(EvidenceItem).filter(EvidenceItem.id.in_(ids)).all()
        proposals = {row.id: row for row in rows}
    for item in items:
        proposal = proposals.get(item.evidence_item_id) if item.evidence_item_id else None
        # A hard-deleted/absent proposal reads as no linked evidence. Linked
        # development evidence is never persisted as rejected (D-113).
        item.evidence_proposal = (
            DevelopmentEvidenceProposalResponse(
                id=proposal.id,
                content=proposal.content,
                confirmation_state=proposal.confirmation_state,
            )
            if proposal is not None
            and proposal.confirmation_state in ("unconfirmed", "confirmed")
            else None
        )
    return items


def list_development_items(db: Session, user_id: str) -> list[DevelopmentItem]:
    items = (
        db.query(DevelopmentItem)
        .filter(DevelopmentItem.user_id == user_id)
        .order_by(DevelopmentItem.created_at.asc())
        .all()
    )
    return _hydrate_evidence_proposal(db, items)


def get_development_item(db: Session, item_id: str, user_id: str) -> DevelopmentItem:
    item = (
        db.query(DevelopmentItem)
        .filter(DevelopmentItem.id == item_id, DevelopmentItem.user_id == user_id)
        .first()
    )
    if item is None:
        raise DevelopmentItemNotFoundError
    return item


def create_development_item(
    db: Session, user_id: str, body: DevelopmentItemCreate
) -> DevelopmentItem:
    classification = (
        db.query(GapClassification)
        .filter(
            GapClassification.id == body.gap_classification_id,
            GapClassification.user_id == user_id,
        )
        .first()
    )
    if classification is None:
        raise GapClassificationNotFoundError
    item = DevelopmentItem(
        user_id=user_id,
        gap_classification_id=classification.id,
        gap_kind=classification.gap_kind,
        response_kind=RESPONSE_FOR_GAP[classification.gap_kind],
        source_finding_id=classification.finding_id,
        state="planned",
        target_date=body.target_date,
        notes=body.notes,
        timeline=[_event("created", state="planned")],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    _record_item_event(
        db,
        event_name="development_item_created",
        item=item,
        state_to=item.state,
    )
    return _hydrate_evidence_proposal(db, [item])[0]


def _completion_seed(db: Session, item: DevelopmentItem) -> str:
    """The most specific, non-fabricated statement available for the proposal.

    Prefers the user's own notes, then the (possibly still-present) gap
    classification's cited trace, then an honest generic fallback per response
    kind — never invented specifics.
    """
    if item.notes:
        return item.notes
    if item.gap_classification_id:
        classification = (
            db.query(GapClassification)
            .filter(GapClassification.id == item.gap_classification_id)
            .first()
        )
        if classification is not None:
            return trace_seed(classification.cited_trace, classification.message)
    return _RESPONSE_FALLBACK_SEED[item.response_kind]


def _stage_completion_proposal(db: Session, item: DevelopmentItem) -> EvidenceItem:
    """Stage the unconfirmed proposal completion produces (D-113) and link it.

    Stages only (add + flush, no commit) — the caller commits atomically with the
    rest of the item's own update.
    """
    proposal = stage_evidence_proposal(
        db,
        item.user_id,
        EvidenceItemCreate(
            kind="achievement",
            content={"statement": _completion_seed(db, item)},
            provenance="inferred",
        ),
    )
    item.evidence_item_id = proposal.id
    item.timeline = [
        *item.timeline,
        _event("evidence_proposal_created", evidence_item_id=proposal.id),
    ]
    return proposal


def update_development_item(
    db: Session, item_id: str, user_id: str, body: DevelopmentItemUpdate
) -> DevelopmentItem:
    item = get_development_item(db, item_id, user_id)
    changes = body.model_dump(exclude_unset=True)
    staged_proposal: EvidenceItem | None = None
    state_from: str | None = None
    # Apply user-authored proposal material before processing completion so one
    # combined PATCH stages exactly the text the user just submitted.
    if "target_date" in changes:
        item.target_date = changes["target_date"]
    if "notes" in changes:
        item.notes = changes["notes"]
    if "state" in changes and changes["state"] != item.state:
        state_from = item.state
        item.timeline = [
            *item.timeline,
            _event("state_changed", from_state=item.state, to_state=changes["state"]),
        ]
        item.state = changes["state"]
        # Only the transition INTO completed, and only while no proposal remains
        # linked, stages a proposal.
        if item.state == "completed" and item.evidence_item_id is None:
            staged_proposal = _stage_completion_proposal(db, item)
    db.commit()
    db.refresh(item)
    if staged_proposal is not None:
        record_evidence_proposal_created(db, staged_proposal)
    if state_from is not None:
        _record_item_event(
            db,
            event_name="development_item_state_changed",
            item=item,
            state_from=state_from,
            state_to=item.state,
        )
    return _hydrate_evidence_proposal(db, [item])[0]


def _pending_evidence_proposal(db: Session, item: DevelopmentItem) -> EvidenceItem:
    """Return the owner's still-unconfirmed proposal, never a confirmed fact."""
    if item.evidence_item_id is None:
        raise NoEvidenceProposalError
    proposal = (
        db.query(EvidenceItem)
        .filter(
            EvidenceItem.id == item.evidence_item_id,
            EvidenceItem.user_id == item.user_id,
            EvidenceItem.confirmation_state == "unconfirmed",
        )
        .first()
    )
    if proposal is None:
        raise NoEvidenceProposalError
    return proposal


def confirm_development_evidence(db: Session, item_id: str, user_id: str) -> DevelopmentItem:
    """Confirm the item's linked proposal (D-113: confirmation is user-only, D-062)."""
    item = get_development_item(db, item_id, user_id)
    proposal = _pending_evidence_proposal(db, item)
    # The canonical R11 seam also records the linked development lifecycle, so
    # confirmation from either UI has identical semantics.
    set_evidence_confirmation(db, proposal.id, user_id, confirmed=True)
    db.refresh(item)
    return _hydrate_evidence_proposal(db, [item])[0]


def decline_development_evidence(db: Session, item_id: str, user_id: str) -> DevelopmentItem:
    """Decline the item's linked proposal: hard-delete it so no rejected trace
    remains in the profile, but leave the completed item itself intact (D-113)."""
    item = get_development_item(db, item_id, user_id)
    proposal = _pending_evidence_proposal(db, item)
    # The canonical R11 seam hard-deletes linked unconfirmed proposals, clears
    # the link, and records the timeline atomically.
    set_evidence_confirmation(db, proposal.id, user_id, confirmed=False)
    db.refresh(item)
    return _hydrate_evidence_proposal(db, [item])[0]


def delete_development_item(db: Session, item_id: str, user_id: str) -> None:
    item = get_development_item(db, item_id, user_id)
    gap_kind = item.gap_kind
    response_kind = item.response_kind
    state = item.state
    db.delete(item)
    db.commit()
    safe_record_activation_event(
        db,
        event_name="development_item_deleted",
        development_gap_kind=gap_kind,
        development_response_kind=response_kind,
        development_state_from=state,
    )


def delete_development_items(db: Session, user_id: str) -> int:
    """Remove all of a user's development items (erasure cascade, D-114)."""
    return (
        db.query(DevelopmentItem)
        .filter(DevelopmentItem.user_id == user_id)
        .delete(synchronize_session=False)
    )


def export_development_plan(db: Session, user_id: str) -> DevelopmentPlanExport:
    items = list_development_items(db, user_id)
    return DevelopmentPlanExport(
        item_count=len(items),
        items=[DevelopmentItemResponse.model_validate(item) for item in items],
    )
