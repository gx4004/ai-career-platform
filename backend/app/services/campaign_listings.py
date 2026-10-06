from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.workspace import Workspace

TITLE_SEPARATOR = " — "


def application_label(title: str, company: str) -> str:
    return f"{title}{TITLE_SEPARATOR}{company}"


def _label_is_automatic(workspace: Workspace) -> bool:
    """True when nobody chose the name: blank, a tool's label, or "Role — Company"."""
    label = (workspace.label or "").strip()
    if not label:
        return True
    names = {application_label(workspace.role or "", workspace.company or "")}
    if workspace.listing is not None:
        names.add(application_label(workspace.listing.title, workspace.listing.company))
    for run in workspace.tool_runs:
        names.add((run.label or "").strip())
        names.add(f"{run.tool_name.title()} Workspace")
    return label in names


def _job_match_score(workspace: Workspace) -> int | None:
    """The fit the owner's newest Job Match in this workspace produced, if any."""
    for run in workspace.tool_runs:  # newest first
        if run.tool_name != "job-match":
            continue
        score = (run.result_payload or {}).get("match_score")
        if isinstance(score, int) and not isinstance(score, bool):
            return score
    return None


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
    if outcome == "replaced" and workspace.applied_at is not None:
        # What was sent is frozen; swapping the posting under it would misrepresent it.
        raise HTTPException(
            status_code=409,
            detail="This application is already marked applied, so its job posting is kept.",
        )
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
    details = {"source_family": source_family, "outcome": outcome}
    automatic_label = _label_is_automatic(workspace)
    if outcome == "replaced":
        # Fit and drafts were made for the old job; the card must not present them
        # under the new one. The owner's typed answers are kept (their keys are stable).
        workspace.role = normalized_title
        workspace.company = normalized_company
        workspace.match_score = None
        if workspace.drafts_run_id is not None:
            workspace.drafts_run_id = None
            workspace.open_questions = []
            details["drafts_cleared"] = True
        # A cover letter or interview prep chosen for the old job must not keep feeding
        # "What you're sending" under the new one; the runs themselves stay in history.
        if workspace.selected_cover_letter_run_id or workspace.selected_interview_run_id:
            workspace.selected_cover_letter_run_id = None
            workspace.selected_interview_run_id = None
            details["materials_cleared"] = True
        # No longer the Discover listing it was adopted from: adopting that listing
        # again must start a new application, not return this one.
        workspace.discovery_listing_id = None
    else:
        workspace.role = workspace.role or normalized_title
        workspace.company = workspace.company or normalized_company
        if workspace.match_score is None:
            workspace.match_score = _job_match_score(workspace)
    if automatic_label:
        workspace.label = application_label(workspace.role, workspace.company)
    workspace.current_listing_id = listing.id
    if workspace.status is None:
        # A workspace aimed at a job posting is an Application.
        workspace.status = "saved"
    db.add(CampaignEvent(workspace_id=workspace.id, event_type=event_type, details=details))
    workspace.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(listing)
    if listing.retrieved_at.tzinfo is None:
        # SQLite drops tzinfo. Normalize the loaded value without marking the row
        # dirty, so a later commit in the same session never re-writes it.
        set_committed_value(listing, "retrieved_at", listing.retrieved_at.replace(tzinfo=UTC))
    return listing
