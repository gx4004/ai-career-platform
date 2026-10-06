"""The dashboard's "what should I do today?" plan (#418).

Two independent lists, built from existing rules and never blended:

- **Best matches**: the top visible Discovery listings by skills fit that the
  owner has not yet added to Applications (hidden listings are already out of
  the visibility rule). A low fit (below the shared "partial fit" band) is never
  a best match; when nothing clears that floor, the closest few are returned in
  a separate ``closest_matches`` list instead.
- **Needs action**: applications that are interviewing, have a deadline in the
  next week while still saved, or show the "No reply yet?" prompt. Each
  application appears once, under its most urgent reason. Nothing here changes
  a status.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.campaign_listing import CampaignListing
from app.models.workspace import Workspace
from app.schemas.applications import ApplicationCard, ApplicationStatus
from app.schemas.today import ActionItem, ActionReason, TodayPlan
from app.services.applications import IS_APPLICATION, list_applications
from app.services.discovery_recommendations import (
    MatchProfile,
    VisibleListing,
    best_matches,
    has_live_source,
    listing_item,
    load_match_profile,
)
from app.services.quality_signals import BORDERLINE_MATCH_FROM

MATCH_COUNT = 5
CLOSEST_COUNT = 3
# A best match is at least a partial fit: the same band Job Match calls "borderline".
BEST_MATCH_MIN_FIT = BORDERLINE_MATCH_FROM
ACTION_LIMIT = 6
DEADLINE_WINDOW = timedelta(days=7)
# At most this many already-added jobs are looked past to fill the match list.
_MAX_SKIPPED = 50
# Most urgent first; also the order of the list.
_REASON_ORDER: dict[ActionReason, int] = {"interview": 0, "deadline": 1, "no_reply": 2}


def todays_plan(db: Session, user_id: str, *, now: datetime | None = None) -> TodayPlan:
    now = now or datetime.now(UTC)
    profile = load_match_profile(db, user_id)
    actions = _needs_action(list_applications(db, user_id).items, now)
    fresh = _fresh_matches(db, user_id, now, profile) if profile.has_evidence else []
    best = [row for row in fresh if _fit(row) >= BEST_MATCH_MIN_FIT]
    return TodayPlan(
        has_sources=has_live_source(db, now),
        has_evidence=profile.has_evidence,
        best_matches=[listing_item(row) for row in best],
        closest_matches=[] if best else [listing_item(row) for row in fresh[:CLOSEST_COUNT]],
        best_match_min_fit=BEST_MATCH_MIN_FIT,
        needs_action=actions[:ACTION_LIMIT],
        needs_action_total=len(actions),
    )


def _fit(row: VisibleListing) -> int:
    return row.match.skills_fit if row.match and row.match.skills_fit is not None else -1


def _fresh_matches(db: Session, user_id: str, now: datetime, profile: MatchProfile):
    pipeline = _pipeline_keys(db, user_id)
    # Ask for extra to still fill the list after skipping the jobs already in the
    # pipeline; widen (bounded) while skipped jobs, such as one posting per
    # location, keep crowding the top. Ranked by fit, so once a row is below the
    # floor every later one is too: widening only helps while the top is all
    # pipeline jobs.
    limit = MATCH_COUNT + min(pipeline.size, _MAX_SKIPPED)
    while True:
        ranked = best_matches(db, user_id, limit=limit, now=now, profile=profile)
        fresh = [row for row in ranked if not pipeline.contains(row)]
        if len(fresh) >= MATCH_COUNT or len(ranked) < limit or limit >= MATCH_COUNT + _MAX_SKIPPED:
            return fresh[:MATCH_COUNT]
        limit = min(limit * 2, MATCH_COUNT + _MAX_SKIPPED)


@dataclass(frozen=True)
class _Pipeline:
    """What the owner's applications already say about which jobs they hold."""

    size: int
    # Adopted listings are recognised by row.application_id. Applications from
    # pasted jobs or seeds carry no Discovery link, so the same job is also
    # recognised by its company and title, or by its apply link.
    jobs: frozenset[tuple[str, str]]
    urls: frozenset[str]

    def contains(self, row: VisibleListing) -> bool:
        listing = row.listing
        return (
            row.application_id is not None
            or (_fold(listing.company), _fold(listing.title)) in self.jobs
            or any(
                _url_key(url) in self.urls
                for url in (listing.apply_url, row.attribution.source_url)
                if url
            )
        )


def _pipeline_keys(db: Session, user_id: str) -> _Pipeline:
    rows = db.execute(
        select(
            Workspace.company,
            Workspace.role,
            CampaignListing.company,
            CampaignListing.title,
            CampaignListing.source_url,
            CampaignListing.apply_url,
        )
        .outerjoin(CampaignListing, CampaignListing.id == Workspace.current_listing_id)
        .where(Workspace.user_id == user_id, IS_APPLICATION)
    ).all()
    jobs: set[tuple[str, str]] = set()
    urls: set[str] = set()
    for company, role, pasted_company, pasted_title, source_url, apply_url in rows:
        for pair in ((company, role), (pasted_company, pasted_title)):
            if pair[0] and pair[1]:
                jobs.add((_fold(pair[0]), _fold(pair[1])))
        urls.update(_url_key(url) for url in (source_url, apply_url) if url)
    return _Pipeline(len(rows), frozenset(jobs), frozenset(urls))


def _fold(value: str) -> str:
    return " ".join(value.casefold().split())


def _url_key(url: str) -> str:
    return url.strip().casefold().split("#", 1)[0].rstrip("/")


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
        and _start_of_day(now) <= card.deadline <= now + DEADLINE_WINDOW
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


def _start_of_day(moment: datetime) -> datetime:
    # Deadlines are dates saved at local noon, so one due today must stay listed
    # after noon; only earlier days count as past.
    return moment.replace(hour=0, minute=0, second=0, microsecond=0)


def _urgency(item: ActionItem):
    # Deadlines soonest first; no-reply longest wait first (oldest applied_at).
    when = item.deadline or item.applied_at or datetime.max.replace(tzinfo=UTC)
    return (_REASON_ORDER[item.reason], when)
