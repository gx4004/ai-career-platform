"""R17 development-plan service (#199, D-112/D-114; #201, D-113).

CRUD over a user's bounded development items. Mirrors the Evidence Profile
service shape: owner-scoped queries, a not-found sentinel, and an export/delete
pair that joins the account-deletion cascade and the portable data export.

Completion into evidence (#201): marking an item completed stages an Evidence
Profile proposal through the existing R11 seam
(:func:`app.services.evidence_profile.stage_evidence_proposal`) — but only from the
owner's own notes, which are their words (Phase 1b, #321). Completion without notes
stages nothing: the system has no recognisable achievement to offer, and a reviewer
message or a bare keyword typed as an achievement would put a false fact one click
from the locked profile (D-113).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

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

#: A plan is a short, bounded to-do list (D-112), not an archive.
MAX_PLAN_ITEMS = 100
_MAX_LABEL_CHARS = 200
#: Slack for owners whose local date is ahead of UTC when they pick "today".
_DATE_GRACE = timedelta(days=1)


class DevelopmentItemNotFoundError(Exception):
    pass


class GapClassificationNotFoundError(Exception):
    pass


class PlanFullError(Exception):
    pass


class PastTargetDateError(Exception):
    pass


def _check_target_date(target) -> None:
    if target is not None and target < datetime.now(UTC).date() - _DATE_GRACE:
        raise PastTargetDateError


def _snapshot(classification: GapClassification) -> tuple[str, str]:
    """What to build (the cited requirement/claim, else the finding message) and the
    application it came from, kept on the item so it outlives the reviewer finding."""
    return (
        trace_seed(classification.cited_trace, classification.message)[:_MAX_LABEL_CHARS],
        classification.workspace_id,
    )


def list_development_items(db: Session, user_id: str) -> list[DevelopmentItem]:
    items = (
        db.query(DevelopmentItem)
        .filter(DevelopmentItem.user_id == user_id)
        .order_by(DevelopmentItem.created_at.asc())
        .all()
    )
    _backfill_snapshots(db, items)
    return items


def _backfill_snapshots(db: Session, items: list[DevelopmentItem]) -> None:
    """Fill the label/application of items created before they were snapshotted,
    while their gap classification still exists."""
    stale = [i for i in items if i.label is None and i.gap_classification_id is not None]
    if not stale:
        return
    changed = False
    for item in stale:
        classification = db.get(GapClassification, item.gap_classification_id)
        if classification is not None:
            item.label, item.workspace_id = _snapshot(classification)
            changed = True
    if changed:
        db.commit()


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
    _check_target_date(body.target_date)
    held = list_development_items(db, user_id)
    for existing in held:
        if existing.gap_classification_id == classification.id and existing.state != "completed":
            return existing  # adding the same gap again is the same commitment
    if len(held) >= MAX_PLAN_ITEMS:
        raise PlanFullError
    label, workspace_id = _snapshot(classification)
    item = DevelopmentItem(
        user_id=user_id,
        gap_classification_id=classification.id,
        workspace_id=workspace_id,
        label=label,
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


def _stage_completion_proposal(db: Session, item: DevelopmentItem) -> None:
    """Stage the proposal completion produces (D-113) from the owner's own notes.

    Stages only (add + flush, no commit) — the caller commits atomically with the
    rest of the item's own update. The notes are the owner's words, so the proposal
    lands already confirmed (Phase 1b, #321). With no notes there is nothing the
    owner authored, and nothing is staged.
    """
    statement = (item.notes or "").strip()
    if not statement:
        return
    proposal = stage_evidence_proposal(
        db,
        item.user_id,
        EvidenceItemCreate(
            kind="achievement",
            content={"statement": statement},
            # The owner wrote these notes: the fact is theirs, not a tool's suggestion.
            provenance="user-entered",
        ),
        confirmation_state="confirmed",
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
        if changes["target_date"] != item.target_date:
            _check_target_date(changes["target_date"])
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
