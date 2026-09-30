"""Explicit, user-initiated adoption of a discovery recommendation (R14 #176).

A recommendation becomes an application ONLY through this seam, and only when a
user asks: one explicit action (adopting it, or "prepare applications for me")
creates one application whose listing carries the recommendation's content,
source attribution, apply link and retrieval date (D-091, D-078). Discovery never
reaches this seam on its own — no scheduler, ingestion job, or ranking read may
create an application or a task (D-091).

The refusal rule is Discovery's one visibility rule (`visible_listing`):
adoption adopts only a listing the user can currently see. A dismissed listing, a listing left with no
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
from app.services.campaign_listings import attach_listing
from app.services.discovery_recommendations import VisibleListing, visible_listing

# The application listing's own description limit.
_MAX_ADOPTED_DESCRIPTION = 20_000


class RecommendationNotAdoptableError(Exception):
    """The listing is not currently visible to this owner.

    Covers an unknown listing id and any listing a dismissal, source governance
    or expiry has hidden. Adoption refuses uniformly rather than revealing which
    reason applies.
    """


def adopt_recommendation(
    db: Session,
    user_id: str,
    listing_id: str,
    *,
    now: datetime | None = None,
    visible: VisibleListing | None = None,
) -> Workspace:
    """Create one application from one visible listing, by explicit user action.

    Copies the listing content plus its freshest visible source attribution and
    retrieval date into the new application's listing, and records the adoption
    as its first event.

    ``visible`` is for a caller that has just read the listing through the same
    visibility rule (bulk prepare), so it is not read again.
    """
    # Visibility is checked BEFORE the idempotent return: a listing whose source
    # has since been revoked or expired, or that was dismissed, is refused even
    # when this owner adopted it earlier. Idempotency never outranks governance.
    if visible is None:
        visible = visible_listing(db, user_id, listing_id, now=now)
    if visible is None or visible.listing_id != listing_id:
        raise RecommendationNotAdoptableError(listing_id)

    # Idempotent by (owner, listing): a double-click or retry never creates a
    # second application for the same listing.
    existing = (
        db.query(Workspace)
        .filter(Workspace.user_id == user_id, Workspace.discovery_listing_id == listing_id)
        .one_or_none()
    )
    if existing is not None:
        return existing

    listing = visible.listing
    attribution = visible.attribution
    workspace = Workspace(
        user_id=user_id,
        label=f"{listing.title} — {listing.company}",
        company=listing.company,
        role=listing.title,
        status="saved",
        match_score=visible.match.skills_fit if visible.match else None,
        discovery_listing_id=listing_id,
    )
    try:
        with db.begin_nested():
            db.add(workspace)
            db.flush()
    except IntegrityError:
        # A concurrent adoption (double-click) won the race between the check
        # above and this insert; reuse its application.
        return (
            db.query(Workspace)
            .filter(Workspace.user_id == user_id, Workspace.discovery_listing_id == listing_id)
            .one()
        )

    attach_listing(
        db,
        user_id=user_id,
        campaign_id=workspace.id,
        title=listing.title,
        company=listing.company,
        description=listing.description[:_MAX_ADOPTED_DESCRIPTION],
        source_url=attribution.source_url,
        apply_url=listing.apply_url or attribution.source_url,
        source_family=attribution.source.source_family,
        retrieved_at=attribution.retrieved_at,
        event_type="listing_adopted",
    )

    db.refresh(workspace)
    return workspace
