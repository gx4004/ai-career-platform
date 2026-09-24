from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.discovery_personalization import (
    DiscoveryPersonalizationResponse,
    DismissalCreate,
    DismissalItem,
    HiddenSourceCreate,
    HiddenSourceItem,
    RecommendationReportAck,
    RecommendationReportCreate,
)
from app.schemas.discovery_recommendations import (
    DiscoveryListingPage,
    DiscoveryRecommendationList,
)
from app.schemas.history import CampaignDetailResponse
from app.services.campaign_materials import get_campaign_detail
from app.services.discovery_adoption import (
    RecommendationNotAdoptableError,
    adopt_recommendation,
)
from app.services.discovery_personalization import (
    DiscoveredListingNotFoundError,
    DiscoverySourceNotFoundError,
    dismiss_recommendation,
    hide_source,
    list_personalization,
    report_recommendation,
    undismiss_recommendation,
    unhide_source,
)
from app.services.discovery_recommendations import (
    rank_discovery_recommendations,
    search_listings,
)

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


@router.get("/recommendations", response_model=DiscoveryRecommendationList)
def list_recommendations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return rank_discovery_recommendations(db, current_user.id)


@router.post(
    "/recommendations/{listing_id}/adopt",
    response_model=CampaignDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def adopt_recommendation_into_campaign(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One explicit user action turns one visible recommendation into a campaign.

    The listing content, its source attribution, and its retrieval date are
    copied into the new campaign's canonical listing, and the adoption is the
    campaign's first event (D-091, D-078). Dismissed, fully hidden, or expired
    recommendations are absent from the feed and are refused here.
    """
    try:
        workspace = adopt_recommendation(db, current_user.id, listing_id)
    except RecommendationNotAdoptableError as error:
        raise HTTPException(
            status_code=404,
            detail="Recommendation is not available to adopt",
        ) from error
    return get_campaign_detail(db, workspace, current_user.id)


# ── Personalization / correction controls (R14, issue #175) ──


@router.get("/personalization", response_model=DiscoveryPersonalizationResponse)
def get_personalization(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Owner-scoped hidden sources and dismissals that shape this user's feed."""
    return list_personalization(db, current_user.id)


@router.post(
    "/hidden-sources",
    response_model=HiddenSourceItem,
    status_code=status.HTTP_201_CREATED,
)
def create_hidden_source(
    body: HiddenSourceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return hide_source(db, current_user.id, body.source_id)
    except DiscoverySourceNotFoundError as error:
        raise HTTPException(status_code=404, detail="Discovery source not found") from error


@router.delete("/hidden-sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_hidden_source(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    unhide_source(db, current_user.id, source_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


@router.post(
    "/reports",
    response_model=RecommendationReportAck,
    status_code=status.HTTP_201_CREATED,
)
def create_report(
    body: RecommendationReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return report_recommendation(
            db,
            current_user.id,
            listing_id=body.listing_id,
            reason_category=body.reason_category,
            reason=body.reason,
        )
    except DiscoveredListingNotFoundError as error:
        raise HTTPException(status_code=404, detail="Discovered listing not found") from error
