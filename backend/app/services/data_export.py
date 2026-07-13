from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.workspace import Workspace
from app.schemas.data_export import CareerDataExport
from app.schemas.history import (
    CampaignEventExport,
    CampaignExportItem,
    CampaignListingResponse,
    CampaignsExport,
)
from app.services.cv_documents import export_documents
from app.services.evidence_profile import export_evidence_profile


def export_career_data(db: Session, user_id: str) -> CareerDataExport:
    profile = export_evidence_profile(db, user_id)
    workspaces = (
        db.query(Workspace)
        .filter(Workspace.user_id == user_id)
        .order_by(Workspace.created_at.asc())
        .all()
    )
    return CareerDataExport(
        exported_at=profile.exported_at,
        item_count=profile.item_count,
        items=profile.items,
        cv_documents=export_documents(db, user_id),
        campaigns=CampaignsExport(
            campaign_count=len(workspaces),
            campaigns=[
                CampaignExportItem(
                    id=workspace.id,
                    label=workspace.label,
                    is_pinned=workspace.is_pinned,
                    company=workspace.company,
                    role=workspace.role,
                    status=workspace.status,
                    deadline=_as_utc(workspace.deadline),
                    created_at=_as_utc(workspace.created_at),
                    updated_at=_as_utc(workspace.updated_at),
                    listing=(
                        CampaignListingResponse(
                            title=workspace.listing.title,
                            company=workspace.listing.company,
                            description=workspace.listing.description,
                            source_url=workspace.listing.source_url,
                            retrieved_at=_as_utc(workspace.listing.retrieved_at),
                        )
                        if workspace.listing is not None
                        else None
                    ),
                    listing_revisions=[
                        CampaignListingResponse(
                            title=listing.title,
                            company=listing.company,
                            description=listing.description,
                            source_url=listing.source_url,
                            retrieved_at=_as_utc(listing.retrieved_at),
                        )
                        for listing in workspace.listings
                    ],
                    selected_cv_variant_id=workspace.selected_cv_variant_id,
                    selected_cover_letter_run_id=workspace.selected_cover_letter_run_id,
                    selected_interview_run_id=workspace.selected_interview_run_id,
                    selected_cover_letter=(
                        {
                            "id": workspace.selected_cover_letter_run.id,
                            "tool_name": workspace.selected_cover_letter_run.tool_name,
                            "label": workspace.selected_cover_letter_run.label,
                            "parent_run_id": workspace.selected_cover_letter_run.parent_run_id,
                            "result_payload": workspace.selected_cover_letter_run.result_payload
                            or {},
                            "created_at": _as_utc(workspace.selected_cover_letter_run.created_at),
                        }
                        if workspace.selected_cover_letter_run
                        else None
                    ),
                    selected_interview=(
                        {
                            "id": workspace.selected_interview_run.id,
                            "tool_name": workspace.selected_interview_run.tool_name,
                            "label": workspace.selected_interview_run.label,
                            "parent_run_id": workspace.selected_interview_run.parent_run_id,
                            "result_payload": workspace.selected_interview_run.result_payload or {},
                            "created_at": _as_utc(workspace.selected_interview_run.created_at),
                        }
                        if workspace.selected_interview_run
                        else None
                    ),
                    tasks=list(workspace.campaign_tasks),
                    notes=list(workspace.campaign_notes),
                    contacts=list(workspace.campaign_contacts),
                    events=[
                        CampaignEventExport(
                            id=event.id,
                            event_type=event.event_type,
                            details=event.details,
                            created_at=_as_utc(event.created_at),
                        )
                        for event in workspace.campaign_events
                    ],
                )
                for workspace in workspaces
            ],
        ),
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
