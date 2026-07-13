"""Explicit, user-initiated adoption of a discovery recommendation (R14 #176).

A recommendation becomes a campaign ONLY through this seam, and only when a user
calls it: exactly one explicit action creates one campaign whose canonical
listing carries the recommendation's listing content, source attribution, and
retrieval date (D-091, D-078). Discovery never reaches this seam on its own — no
scheduler, ingestion job, or ranking read may create a campaign, task, or
reminder (D-091).

The refusal rule is delegated to the ranked feed itself: adoption re-ranks the
owner's live recommendations and adopts only a listing the user can currently
see. A dismissed listing, a listing left with no visible source (every source
hidden), and an expired listing are all absent from that feed, so they can never
be adopted implicitly (respects the #175 personalization store, D-090).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.workspace import Workspace
from app.schemas.discovery_recommendations import DiscoveryRecommendation
from app.services.analytics import safe_record_activation_event
from app.services.campaign_listings import attach_listing
from app.services.discovery_recommendations import rank_discovery_recommendations


class RecommendationNotAdoptableError(Exception):
    """The listing is not in the user's current visible, live recommendation feed.

    Covers an unknown listing id and any listing the personalization store or
    expiry has removed from the feed (dismissed, all sources hidden, expired).
    Adoption refuses uniformly rather than revealing which reason applies.
    """


def adopt_recommendation(
    db: Session,
    user_id: str,
    listing_id: str,
    *,
    now: datetime | None = None,
) -> Workspace:
    """Create one campaign from one visible recommendation, by explicit user action.

    Copies the recommendation's listing content plus its freshest visible source
    attribution and retrieval date into the new campaign's canonical listing, and
    records the adoption as the campaign's first (and only) event.
    """
    feed = rank_discovery_recommendations(db, user_id, now=now)
    recommendation = next(
        (item for item in feed.items if item.listing_id == listing_id),
        None,
    )
    if recommendation is None:
        raise RecommendationNotAdoptableError(listing_id)

    # Attributions are ranked freshest-visible-first by the ranker; the canonical
    # campaign listing carries exactly one source, so the freshest one is copied.
    primary = recommendation.attributions[0]

    workspace = Workspace(
        user_id=user_id,
        label=_campaign_label(recommendation),
        company=recommendation.company,
        role=recommendation.title,
    )
    db.add(workspace)
    db.flush()

    attach_listing(
        db,
        user_id=user_id,
        campaign_id=workspace.id,
        title=recommendation.title,
        company=recommendation.company,
        description=recommendation.description,
        source_url=str(primary.source_url),
        source_family=primary.source_family,
        retrieved_at=primary.retrieved_at,
        event_type="listing_adopted",
    )

    # Allowlisted, low-cardinality adoption telemetry (D-090): only the outcome
    # class and the source family. Never listing content, URL, listing id, or
    # run id. Best-effort — instrumentation must not break the user action.
    safe_record_activation_event(
        db,
        event_name="discovery_recommendation_adopted",
        operational_outcome="adopted",
        operational_dimension=primary.source_family,
    )

    db.refresh(workspace)
    return workspace


def _campaign_label(recommendation: DiscoveryRecommendation) -> str:
    return f"{recommendation.title} — {recommendation.company}"
