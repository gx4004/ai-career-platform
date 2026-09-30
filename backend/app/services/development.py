"""R17 development-plan service (#199, D-112/D-114; #201, D-113).

CRUD over a user's bounded development items. Mirrors the Evidence Profile
service shape: owner-scoped queries, a not-found sentinel, and an export/delete
pair that joins the account-deletion cascade and the portable data export.

Completion into evidence (#201): marking an item completed stages an Evidence
Profile proposal through the existing R11 seam
(:func:`app.services.evidence_profile.stage_evidence_proposal`). When the owner
supplied the evidence text themselves (their own notes), the proposal is staged
already confirmed — nothing here fabricates a fact, it is the owner's own words
(Phase 1b, #321). Otherwise the seed comes from the gap classification's cited
trace or an honest generic statement, and the proposal stays unconfirmed: it
shows up as an ordinary profile suggestion, where saving confirms it and
dismissing deletes it (D-113).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.development_item import DevelopmentItem
from app.models.gap_classification import GapClassification
from app.schemas.development import (
    RESPONSE_FOR_GAP,
    DevelopmentItemCreate,
    DevelopmentItemResponse,
    DevelopmentItemUpdate,
    DevelopmentPlanExport,
)
from app.schemas.evidence_profile import EvidenceItemCreate
from app.services.evidence_profile import stage_evidence_proposal
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


def list_development_items(db: Session, user_id: str) -> list[DevelopmentItem]:
    return (
        db.query(DevelopmentItem)
        .filter(DevelopmentItem.user_id == user_id)
        .order_by(DevelopmentItem.created_at.asc())
        .all()
    )


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
        state="planned",
        target_date=body.target_date,
        notes=body.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


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


def _stage_completion_proposal(db: Session, item: DevelopmentItem) -> None:
    """Stage the proposal completion produces (D-113) and link it.

    Stages only (add + flush, no commit) — the caller commits atomically with the
    rest of the item's own update. When the owner supplied the evidence text
    themselves (``item.notes``), the proposal lands already confirmed — no extra
    confirm step (Phase 1b, #321). Otherwise the seed falls back to the gap
    classification's cited trace or an honest generic statement, neither of
    which the owner authored, so it stays an unconfirmed profile suggestion.
    """
    user_supplied = bool(item.notes)
    proposal = stage_evidence_proposal(
        db,
        item.user_id,
        EvidenceItemCreate(
            kind="achievement",
            content={"statement": _completion_seed(db, item)},
            provenance="inferred",
        ),
        confirmation_state="confirmed" if user_supplied else "unconfirmed",
    )
    item.evidence_item_id = proposal.id


def update_development_item(
    db: Session, item_id: str, user_id: str, body: DevelopmentItemUpdate
) -> DevelopmentItem:
    item = get_development_item(db, item_id, user_id)
    changes = body.model_dump(exclude_unset=True)
    # Apply user-authored proposal material before processing completion so one
    # combined PATCH stages exactly the text the user just submitted.
    if "target_date" in changes:
        item.target_date = changes["target_date"]
    if "notes" in changes:
        item.notes = changes["notes"]
    if "state" in changes and changes["state"] != item.state:
        item.state = changes["state"]
        # Only the transition INTO completed, and only while no proposal remains
        # linked, stages a proposal.
        if item.state == "completed" and item.evidence_item_id is None:
            _stage_completion_proposal(db, item)
    db.commit()
    db.refresh(item)
    return item


def delete_development_item(db: Session, item_id: str, user_id: str) -> None:
    item = get_development_item(db, item_id, user_id)
    db.delete(item)
    db.commit()


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
