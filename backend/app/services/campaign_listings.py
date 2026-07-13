from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.workspace import Workspace


def attach_listing(
    db: Session,
    *,
    user_id: str,
    campaign_id: str,
    title: str,
    company: str,
    description: str,
    source_url: str | None,
    source_family: str,
) -> CampaignListing:
    normalized_title = title.strip()
    normalized_company = company.strip()
    normalized_description = description.strip()
    if not normalized_title or len(normalized_title) > 200:
        raise HTTPException(status_code=422, detail="Listing title must be 1 to 200 characters")
    if not normalized_company or len(normalized_company) > 200:
        raise HTTPException(status_code=422, detail="Listing company must be 1 to 200 characters")
    if not 20 <= len(normalized_description) <= 20_000:
        raise HTTPException(
            status_code=422,
            detail="Listing description must be 20 to 20000 characters",
        )
    if source_url is not None and len(source_url) > 2_048:
        raise HTTPException(status_code=422, detail="Listing source URL is too long")

    workspace = (
        db.query(Workspace)
        .filter(Workspace.id == campaign_id, Workspace.user_id == user_id)
        .first()
    )
    if workspace is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    outcome = "replaced" if workspace.listing is not None else "attached"
    listing = CampaignListing(
        workspace_id=workspace.id,
        title=normalized_title,
        company=normalized_company,
        description=normalized_description,
        source_url=source_url,
        retrieved_at=datetime.now(UTC),
    )
    db.add(listing)
    db.flush()
    workspace.current_listing_id = listing.id
    db.add(
        CampaignEvent(
            workspace_id=workspace.id,
            event_type="listing_attached",
            details={"source_family": source_family, "outcome": outcome},
        )
    )
    workspace.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(listing)
    if listing.retrieved_at.tzinfo is None:
        listing.retrieved_at = listing.retrieved_at.replace(tzinfo=UTC)
    return listing
