from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

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
    apply_url: str | None = None,
    retrieved_at: datetime | None = None,
    event_type: str = "listing_attached",
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
    if apply_url is not None and len(apply_url) > 2_048:
        raise HTTPException(status_code=422, detail="Listing apply URL is too long")

    workspace = (
        db.query(Workspace)
        .filter(Workspace.id == campaign_id, Workspace.user_id == user_id)
        .first()
    )
    if workspace is None:
        raise HTTPException(status_code=404, detail="Application not found")

    outcome = "replaced" if workspace.listing is not None else "attached"
    if retrieved_at is None:
        retrieved_at = datetime.now(UTC)
    elif retrieved_at.tzinfo is None:
        retrieved_at = retrieved_at.replace(tzinfo=UTC)
    listing = CampaignListing(
        workspace_id=workspace.id,
        title=normalized_title,
        company=normalized_company,
        description=normalized_description,
        source_url=source_url,
        apply_url=apply_url,
        retrieved_at=retrieved_at,
    )
    db.add(listing)
    db.flush()
    workspace.current_listing_id = listing.id
    if workspace.status is None:
        # A workspace aimed at a job posting is an Application.
        workspace.status = "saved"
    db.add(
        CampaignEvent(
            workspace_id=workspace.id,
            event_type=event_type,
            details={"source_family": source_family, "outcome": outcome},
        )
    )
    workspace.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(listing)
    if listing.retrieved_at.tzinfo is None:
        # SQLite drops tzinfo. Normalize the loaded value without marking the row
        # dirty, so a later commit in the same session never re-writes it.
        set_committed_value(listing, "retrieved_at", listing.retrieved_at.replace(tzinfo=UTC))
    return listing
