from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.applications import ApplicationDetail
from app.schemas.discovery_personalization import DismissalCreate, DismissalItem
from app.schemas.discovery_recommendations import (
    DiscoveryDeepMatch,
    DiscoveryListingDetail,
    DiscoveryListingPage,
)
from app.services.applications import application_detail
from app.services.discovery_adoption import (
    RecommendationNotAdoptableError,
    adopt_recommendation,
)
from app.services.discovery_deep_match import ListingNotVisibleError, NoCvError, deep_match
from app.services.discovery_personalization import (
    DiscoveredListingNotFoundError,
    dismiss_recommendation,
    undismiss_recommendation,
)
from app.services.discovery_recommendations import listing_detail, search_listings

router = APIRouter()


@router.get("/listings", response_model=DiscoveryListingPage)
def list_listings(
    q: str | None = Query(default=None, max_length=200),
    location: str | None = Query(default=None, max_length=200),
    remote: bool | None = None,
    company: str | None = Query(default=None, max_length=200),
    posted_within_days: int | None = Query(default=None, ge=1, le=365),
    sort: Literal["best_match", "newest"] = "best_match",
    page: int = Query(default=1, ge=1, le=1000),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search every listing the user can see; scored when they have confirmed evidence."""
    return search_listings(
        db,
        current_user.id,
        q=q,
        location=location,
        remote=remote,
        company=company,
        posted_within_days=posted_within_days,
        sort=sort,
        page=page,
        limit=limit,
    )


@router.get("/listings/{listing_id}", response_model=DiscoveryListingDetail)
def get_listing(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One visible listing with its full description."""
    detail = listing_detail(db, current_user.id, listing_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return detail


@router.post("/listings/{listing_id}/deep-match", response_model=DiscoveryDeepMatch)
@limiter.limit("10/minute")
async def start_deep_match(
    request: Request,
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run Job Match on this listing with the owner's newest CV, once.

    Returns the run already linked to the listing when there is one, so opening a
    listing again never re-runs the model.
    """
    try:
        return await deep_match(db, current_user, listing_id)
    except ListingNotVisibleError as error:
        raise HTTPException(status_code=404, detail="Listing not found") from error
    except NoCvError as error:
        raise HTTPException(
            status_code=409, detail="Create a CV in CV Studio before running a deep match."
        ) from error


@router.post(
    "/recommendations/{listing_id}/adopt",
    response_model=ApplicationDetail,
    status_code=status.HTTP_201_CREATED,
)
def adopt_recommendation_into_campaign(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One explicit user action turns one visible listing into an application.

    The listing content, its source attribution, apply link and retrieval date are
    copied into the new application's listing, and the adoption is its first
    event (D-091, D-078). Hidden listings (dismissed, expired, source not
    allowed) are refused.
    """
    try:
        workspace = adopt_recommendation(db, current_user.id, listing_id)
    except RecommendationNotAdoptableError as error:
        raise HTTPException(
            status_code=404,
            detail="Recommendation is not available to adopt",
        ) from error
    return application_detail(db, workspace)


# ── Dismissals (R14, issue #175) ──


@router.post(
    "/dismissals",
    response_model=DismissalItem,
    status_code=status.HTTP_201_CREATED,
)
def create_dismissal(
    body: DismissalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return dismiss_recommendation(db, current_user.id, body.listing_id)
    except DiscoveredListingNotFoundError as error:
        raise HTTPException(status_code=404, detail="Discovered listing not found") from error


@router.delete("/dismissals/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_dismissal(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    undismiss_recommendation(db, current_user.id, listing_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
