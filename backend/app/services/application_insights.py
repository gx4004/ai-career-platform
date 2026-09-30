"""What's working (#416): reply rate by segment, from the owner's own outcomes.

Plain counts and ratios, always with the sample size. No ML, no blending: each
segment dimension is its own, separate signal (PRD #413).

Definitions (also in CONTEXT.md):

- **Applied**: an application the owner sent (``applied_at`` set), except one
  withdrawn before any reply. The employer never got to answer that one.
- **Replied**: an applied application that reached an interview or an offer,
  including one later rejected or withdrawn. A rejection with no interview is
  not counted as a reply.
- **Reply rate**: replied / applied, over applications still waiting as well.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.campaign_event import CampaignEvent
from app.models.discovered_listing import DiscoveredListing
from app.models.workspace import Workspace
from app.schemas.applications import (
    InsightsDimension,
    InsightSegment,
    InsightsSummary,
    WhatsWorking,
)
from app.schemas.discovery_recommendations import SimilarApplications

MIN_SEGMENT_SIZE = 3
MAX_SEGMENTS_PER_DIMENSION = 8
# Odds signal in Discovery (#417): needs a real sample, not a lucky streak.
MIN_ODDS_SAMPLE = 5
MIN_ODDS_OUTCOMES = 20

_SOURCE_LABELS = {
    "employer_ats": "Employer job boards",
    "licensed": "Licensed feeds",
    "public_career_page": "Career pages",
    "user_provided": "Pasted",
}

# First keyword found in the title wins, so order matters.
_ROLE_FAMILIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Data", ("data", "analytics", "machine learning", "ml ", "scientist", "analyst")),
    ("Design", ("design", "ux", "ui ")),
    ("Product", ("product manager", "product owner", "product")),
    ("Marketing", ("marketing", "growth", "content", "seo")),
    ("Sales", ("sales", "account executive", "business development", "customer success")),
    ("Operations", ("operations", "recruit", "people", "finance", "support")),
    (
        "Engineering",
        ("engineer", "developer", "devops", "software", "frontend", "backend", "sre", "fullstack"),
    ),
)

# The same cut-offs Job Match uses for its verdicts.
_FIT_BUCKETS = (
    (78, "Strong fit (78%+)"),
    (55, "Partial fit (55-77%)"),
    (0, "Low fit (under 55%)"),
)

_REPLY_STATUSES = {"interviewing", "offer"}


@dataclass(frozen=True)
class AppliedApplication:
    """One application, reduced to the facts the insights count."""

    status: str
    reached_interview: bool
    source: str | None = None  # a discovery source family, or None when unknown
    company: str | None = None
    title: str | None = None
    remote: bool | None = None
    skills_fit: int | None = None  # at adoption; Discovery-created applications only


def _keyword_in(keyword: str, padded: str) -> bool:
    if len(keyword) <= 3:
        return f" {keyword} " in padded
    return f" {keyword}" in padded


def role_family(title: str | None) -> str | None:
    if not title or not title.strip():
        return None
    words = " ".join(re.findall(r"[a-z0-9+#]+", title.casefold()))
    padded = f" {words} "
    for family, keywords in _ROLE_FAMILIES:
        # Word starts only, so "HTML" is not machine learning and "Linux" is not UX.
        # Short keywords (ux, ui, ml, sre, seo) must be the whole word.
        if any(_keyword_in(keyword.strip(), padded) for keyword in keywords):
            return family
    return "Other"


def fit_bucket(skills_fit: int | None) -> str | None:
    if skills_fit is None:
        return None
    return next(label for floor, label in _FIT_BUCKETS if skills_fit >= floor)


def has_replied(application: AppliedApplication) -> bool:
    return application.status in _REPLY_STATUSES or application.reached_interview


def counts_as_applied(application: AppliedApplication) -> bool:
    return not (application.status == "withdrawn" and not application.reached_interview)


def _segment(label: str, applied: int, replied: int) -> InsightSegment:
    enough = applied >= MIN_SEGMENT_SIZE
    return InsightSegment(
        label=label,
        applied=applied,
        replied=replied,
        reply_rate=round(replied / applied * 100) if enough else None,
        enough_data=enough,
    )


def _dimension(
    key: str, title: str, applications: list[AppliedApplication], labeler
) -> InsightsDimension:
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    display: dict[str, str] = {}
    for application in applications:
        label = labeler(application)
        if label is None:
            continue
        folded = label.casefold()
        display.setdefault(folded, label)
        counts[folded][0] += 1
        counts[folded][1] += has_replied(application)
    segments = [_segment(display[name], *pair) for name, pair in counts.items()]
    # Segments with enough data first (best rate first), then the thin ones by size.
    segments.sort(
        key=lambda s: (not s.enough_data, -(s.reply_rate or 0), -s.applied, s.label.casefold())
    )
    return InsightsDimension(
        key=key,
        title=title,
        segments=segments[:MAX_SEGMENTS_PER_DIMENSION],
        hidden_count=max(0, len(segments) - MAX_SEGMENTS_PER_DIMENSION),
    )


def compute_insights(applications: list[AppliedApplication]) -> WhatsWorking:
    """Reply rate overall and per segment. Pure: counts in, counts out."""
    applied = [a for a in applications if counts_as_applied(a)]
    replied = sum(has_replied(a) for a in applied)
    return WhatsWorking(
        overall=InsightsSummary(
            applied=len(applied),
            replied=replied,
            reply_rate=round(replied / len(applied) * 100) if applied else None,
        ),
        min_segment_size=MIN_SEGMENT_SIZE,
        dimensions=[
            _dimension(
                "source",
                "Where you found it",
                applied,
                lambda a: _SOURCE_LABELS.get(a.source or "", None) if a.source else None,
            ),
            _dimension("company", "Company", applied, lambda a: (a.company or "").strip() or None),
            _dimension("role_family", "Kind of role", applied, lambda a: role_family(a.title)),
            _dimension(
                "work_mode",
                "Remote or on-site",
                applied,
                lambda a: None if a.remote is None else ("Remote" if a.remote else "On-site"),
            ),
            _dimension(
                "skills_fit", "Skills fit when saved", applied, lambda a: fit_bucket(a.skills_fit)
            ),
        ],
    )


@dataclass(frozen=True)
class OddsModel:
    """Reply rate for "similar applications": same kind of role and skills-fit bucket.

    Learned only from the owner's own outcomes (#417). It says nothing until the
    owner has ``MIN_ODDS_OUTCOMES`` recorded outcomes, and per listing until the
    segment has ``MIN_ODDS_SAMPLE`` applications. It is a separate signal: it is
    never folded into skills fit, and ranking uses it only to break exact ties.
    """

    segments: dict[tuple[str, str], tuple[int, int]]  # (family, bucket) -> (applied, replied)
    overall_rate: float = 0.0  # neutral value for listings without a signal

    def similar(self, title: str | None, skills_fit: int | None) -> SimilarApplications | None:
        family, bucket = role_family(title), fit_bucket(skills_fit)
        counts = self.segments.get((family, bucket)) if family and bucket else None
        if counts is None or counts[0] < MIN_ODDS_SAMPLE:
            return None
        return SimilarApplications(
            role_family=family, fit_bucket=bucket, applied=counts[0], replied=counts[1]
        )

    def tiebreak_rate(self, title: str | None, skills_fit: int | None) -> float:
        """Reply rate to order equal-fit listings by; unknown ones get the owner's overall."""
        similar = self.similar(title, skills_fit)
        return similar.replied / similar.applied if similar else self.overall_rate


NO_ODDS = OddsModel(segments={})


def _recorded_outcome(application: AppliedApplication) -> bool:
    """Something happened after applying: not still waiting (or never sent)."""
    return application.status not in ("saved", "applied")


def build_odds_model(applications: list[AppliedApplication]) -> OddsModel:
    applied = [a for a in applications if counts_as_applied(a)]
    if sum(_recorded_outcome(a) for a in applied) < MIN_ODDS_OUTCOMES:
        return NO_ODDS
    counts: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for application in applied:
        family, bucket = role_family(application.title), fit_bucket(application.skills_fit)
        if family and bucket:
            counts[(family, bucket)][0] += 1
            counts[(family, bucket)][1] += has_replied(application)
    return OddsModel(
        segments={key: (a, r) for key, (a, r) in counts.items()},
        overall_rate=sum(has_replied(a) for a in applied) / len(applied),
    )


def odds_model(db: Session, user_id: str) -> OddsModel:
    return build_odds_model(load_applied_applications(db, user_id))


def load_applied_applications(db: Session, user_id: str) -> list[AppliedApplication]:
    """The owner's sent applications, reduced to the facts the insights count."""
    workspaces = (
        db.query(Workspace)
        .filter(Workspace.user_id == user_id, Workspace.applied_at.is_not(None))
        .all()
    )
    ids = [w.id for w in workspaces]
    interviewed: set[str] = set()
    families: dict[str, str] = {}
    if ids:
        for event in (
            db.query(CampaignEvent)
            .filter(
                CampaignEvent.workspace_id.in_(ids),
                CampaignEvent.event_type.in_(
                    ("status_changed", "listing_adopted", "listing_attached")
                ),
            )
            .order_by(CampaignEvent.created_at.asc())
        ):
            details = event.details or {}
            if event.event_type == "status_changed":
                if details.get("to") in _REPLY_STATUSES:
                    interviewed.add(event.workspace_id)
            elif "source_family" in details:
                families.setdefault(event.workspace_id, details["source_family"])
    listing_ids = {w.discovery_listing_id for w in workspaces if w.discovery_listing_id}
    remote_by_listing: dict[str, bool | None] = {}
    if listing_ids:
        remote_by_listing = dict(
            db.query(DiscoveredListing.id, DiscoveredListing.remote).filter(
                DiscoveredListing.id.in_(listing_ids)
            )
        )
    return [
        AppliedApplication(
            status=w.status or "saved",
            reached_interview=w.id in interviewed,
            source=families.get(w.id),
            company=w.company or (w.listing.company if w.listing else None),
            title=w.role or (w.listing.title if w.listing else None),
            remote=remote_by_listing.get(w.discovery_listing_id),
            skills_fit=w.match_score if w.discovery_listing_id else None,
        )
        for w in workspaces
    ]


def whats_working(db: Session, user_id: str) -> WhatsWorking:
    """Load the owner's sent applications and compute their insights."""
    return compute_insights(load_applied_applications(db, user_id))
