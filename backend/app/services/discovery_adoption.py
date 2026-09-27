"""Explicit, user-initiated adoption of a discovery recommendation (R14 #176).

A recommendation becomes an application ONLY through this seam, and only when a
user asks: one explicit action (adopting it, or "prepare applications for me")
creates one application whose listing carries the recommendation's content,
source attribution, apply link and retrieval date (D-091, D-078). Discovery never
reaches this seam on its own — no scheduler, ingestion job, or ranking read may
create an application or a task (D-091).

The refusal rule is delegated to the feed's visibility rules: adoption adopts
only a listing the user can currently see — in the ranked feed, or found through
job search under the same rules. A dismissed listing, a listing left with no
allowed source, and an expired listing are never visible, so they can never be
adopted implicitly (respects the #175 dismissals, D-090).

That refusal is evaluated on every call, including re-adoption of a listing this
owner already holds a campaign for. Adoption is idempotent, but idempotency
never outranks governance.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.workspace import Workspace
from app.schemas.discovery_recommendations import DiscoveryRecommendation
from app.services.campaign_listings import attach_listing
from app.services.discovery_recommendations import (
    rank_discovery_recommendations,
    visible_recommendation,
)


class RecommendationNotAdoptableError(Exception):
    """The listing is not in the user's current visible, live recommendation feed.

    Covers an unknown listing id and any listing a dismissal, source governance
    or expiry has removed from the feed.
    Adoption refuses uniformly rather than revealing which reason applies.
    """


def adopt_recommendation(
    db: Session,
    user_id: str,
    listing_id: str,
    *,
    now: datetime | None = None,
    recommendation: DiscoveryRecommendation | None = None,
) -> Workspace:
    """Create one application from one visible recommendation, by explicit user action.

    Copies the recommendation's listing content plus its freshest visible source
    attribution and retrieval date into the new application's listing, and
    records the adoption as its first event.

    ``recommendation`` is for a caller that has just ranked the feed itself (bulk
    prepare): it is taken as visible and the feed is not ranked again.
    """
    # Governance is checked BEFORE the idempotent return, not after. Ranking
    # re-checks source governance on every read (#273), so a listing whose
    # source has since been revoked or expired, or that was dismissed, is
    # refused even when this owner adopted it earlier. Ordering these the other
    # way would let a prior adoption grant standing access to a listing
    # governance now refuses — idempotency outranking governance.
    if recommendation is not None and recommendation.listing_id != listing_id:
        raise RecommendationNotAdoptableError(listing_id)
    if recommendation is None:
        feed = rank_discovery_recommendations(db, user_id, now=now)
        recommendation = next(
            (item for item in feed.items if item.listing_id == listing_id),
            None,
        )
    if recommendation is None:
        # The ranked feed is a top-N cut (and empty without confirmed evidence);
        # job search shows every visible listing, so the same visibility rules
        # are re-checked for the one listing (#323).
        recommendation = visible_recommendation(db, user_id, listing_id, now=now)
    if recommendation is None:
        raise RecommendationNotAdoptableError(listing_id)

    # Idempotent by (owner, listing): a double-click, retry, or a listing that
    # stays visible in the feed after its first adoption must never create a
    # second campaign for it (R14 #176 dedup gap).
    existing = (
        db.query(Workspace)
        .filter(Workspace.user_id == user_id, Workspace.discovery_listing_id == listing_id)
        .one_or_none()
    )
    if existing is not None:
        return existing

    # Attributions are ranked freshest-visible-first by the ranker; the canonical
    # campaign listing carries exactly one source, so the freshest one is copied.
    primary = recommendation.attributions[0]

    try:
        with db.begin_nested():
            workspace = Workspace(
                user_id=user_id,
                label=_campaign_label(recommendation),
                company=recommendation.company,
                role=recommendation.title,
                status="saved",
                match_score=recommendation.score,
                discovery_listing_id=listing_id,
            )
            db.add(workspace)
            db.flush()
    except IntegrityError:
        # A concurrent adoption of the same listing won the race between our
        # existence check and this insert; reuse its campaign rather than
        # creating a duplicate.
        return (
            db.query(Workspace)
            .filter(Workspace.user_id == user_id, Workspace.discovery_listing_id == listing_id)
            .one()
        )

    attach_listing(
        db,
        user_id=user_id,
        campaign_id=workspace.id,
        title=recommendation.title,
        company=recommendation.company,
        description=recommendation.description,
        source_url=str(primary.source_url),
        apply_url=str(recommendation.apply_url or primary.source_url),
        source_family=primary.source_family,
        retrieved_at=primary.retrieved_at,
        event_type="listing_adopted",
    )

    db.refresh(workspace)
    return workspace


def _campaign_label(recommendation: DiscoveryRecommendation) -> str:
    return f"{recommendation.title} — {recommendation.company}"
