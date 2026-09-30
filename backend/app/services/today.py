"""The dashboard's "what should I do today?" plan (#418).

Two independent lists, built from existing rules and never blended:

- **Best matches**: the top visible Discovery listings by skills fit that the
  owner has not yet added to Applications (hidden listings are already out of
  the visibility rule).
- **Needs action**: applications that are interviewing, have a deadline in the
  next week while still saved, or show the "No reply yet?" prompt. Each
  application appears once, under its most urgent reason. Nothing here changes
  a status.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workspace import Workspace
from app.schemas.applications import ApplicationCard, ApplicationStatus
from app.schemas.today import ActionItem, ActionReason, TodayPlan
from app.services.applications import list_applications
from app.services.discovery_recommendations import (
    best_matches,
    has_live_source,
    listing_item,
    load_match_profile,
)

MATCH_COUNT = 5
ACTION_LIMIT = 6
DEADLINE_WINDOW = timedelta(days=7)
# Most urgent first; also the order of the list.
_REASON_ORDER: dict[ActionReason, int] = {"interview": 0, "deadline": 1, "no_reply": 2}


def todays_plan(db: Session, user_id: str, *, now: datetime | None = None) -> TodayPlan:
    now = now or datetime.now(UTC)
    profile = load_match_profile(db, user_id)
    actions = _needs_action(list_applications(db, user_id).items, now)
    return TodayPlan(
        has_sources=has_live_source(db, now),
        has_evidence=profile.has_evidence,
        best_matches=[listing_item(row) for row in _fresh_matches(db, user_id, now)],
        needs_action=actions[:ACTION_LIMIT],
        needs_action_total=len(actions),
    )


def _fresh_matches(db: Session, user_id: str, now: datetime):
    added = set(
        db.scalars(
            select(Workspace.discovery_listing_id).where(
                Workspace.user_id == user_id, Workspace.discovery_listing_id.is_not(None)
            )
        )
    )
    # Ask for enough extra to still fill the list after skipping the added ones.
    ranked = best_matches(db, user_id, limit=MATCH_COUNT + len(added), now=now)
    return [row for row in ranked if row.listing_id not in added][:MATCH_COUNT]


def _needs_action(cards: list[ApplicationCard], now: datetime) -> list[ActionItem]:
    items = [item for card in cards if (item := _action_for(card, now)) is not None]
    return sorted(items, key=_urgency)


def _action_for(card: ApplicationCard, now: datetime) -> ActionItem | None:
    reason: ActionReason | None = None
    if card.status == ApplicationStatus.INTERVIEWING:
        reason = "interview"
    elif (
        card.status == ApplicationStatus.SAVED
        and card.deadline is not None
        and now <= card.deadline <= now + DEADLINE_WINDOW
    ):
        reason = "deadline"
    elif card.no_reply_suggested:
        reason = "no_reply"
    if reason is None:
        return None
    return ActionItem(
        application_id=card.id,
        title=card.title or card.label or "Untitled application",
        company=card.company,
        status=card.status,
        reason=reason,
        deadline=card.deadline,
        applied_at=card.applied_at,
        days_since_applied=(
            max(0, (now - card.applied_at).days) if reason == "no_reply" and card.applied_at else None
        ),
    )


def _urgency(item: ActionItem):
    # Deadlines soonest first; no-reply longest wait first (oldest applied_at).
    when = item.deadline or item.applied_at or datetime.max.replace(tzinfo=UTC)
    return (_REASON_ORDER[item.reason], when)
