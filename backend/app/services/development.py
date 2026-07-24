"""R17 development-plan service (#199, D-112/D-114).

CRUD over a user's bounded development items. Mirrors the Evidence Profile
service shape: owner-scoped queries, a not-found sentinel, and an export/delete
pair that joins the account-deletion cascade and the portable data export.
"""

from __future__ import annotations

from datetime import UTC, datetime

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


class DevelopmentItemNotFoundError(Exception):
    pass


class GapClassificationNotFoundError(Exception):
    pass


def _event(name: str, **fields) -> dict:
    return {"event": name, "at": datetime.now(UTC).isoformat(), **fields}


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
        source_finding_id=classification.finding_id,
        state="planned",
        target_date=body.target_date,
        notes=body.notes,
        timeline=[_event("created", state="planned")],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_development_item(
    db: Session, item_id: str, user_id: str, body: DevelopmentItemUpdate
) -> DevelopmentItem:
    item = get_development_item(db, item_id, user_id)
    changes = body.model_dump(exclude_unset=True)
    if "state" in changes and changes["state"] != item.state:
        item.timeline = [
            *item.timeline,
            _event("state_changed", from_state=item.state, to_state=changes["state"]),
        ]
        item.state = changes["state"]
    if "target_date" in changes:
        item.target_date = changes["target_date"]
    if "notes" in changes:
        item.notes = changes["notes"]
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
