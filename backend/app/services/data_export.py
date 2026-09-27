from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.application_preferences import ApplicationPreferences
from app.models.campaign_listing import CampaignListing
from app.models.gap_classification import GapClassification
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.schemas.applications import (
    ApplicationExportItem,
    ApplicationPreferencesResponse,
    ApplicationsExport,
    EventExport,
    ListingResponse,
    RunExport,
)
from app.schemas.data_export import CareerDataExport, DevelopmentLoopExport
from app.schemas.gap_classification import GapClassificationRead
from app.services.applications import snapshot_response
from app.services.cv_documents import export_documents
from app.services.development import export_development_plan
from app.services.discovery_personalization import export_personalization
from app.services.evidence_profile import export_evidence_profile
from app.services.gap_response import map_gap_to_response


def export_career_data(db: Session, user_id: str) -> CareerDataExport:
    profile = export_evidence_profile(db, user_id)
    development_plan = export_development_plan(db, user_id)
    classifications = (
        db.query(GapClassification)
        .filter(GapClassification.user_id == user_id)
        .order_by(GapClassification.created_at.asc(), GapClassification.id.asc())
        .all()
    )
    return CareerDataExport(
        exported_at=profile.exported_at,
        item_count=profile.item_count,
        items=profile.items,
        cv_documents=export_documents(db, user_id),
        personalization=export_personalization(db, user_id),
        development=DevelopmentLoopExport(
            classification_count=len(classifications),
            classifications=[
                GapClassificationRead.model_validate(item) for item in classifications
            ],
            item_count=development_plan.item_count,
            items=development_plan.items,
            recommendation_count=len(classifications),
            recommendations=[
                map_gap_to_response(classification) for classification in classifications
            ],
        ),
        applications=export_applications(db, user_id),
    )


def export_applications(db: Session, user_id: str) -> ApplicationsExport:
    workspaces = (
        db.query(Workspace)
        .filter(Workspace.user_id == user_id)
        .order_by(Workspace.created_at.asc())
        .all()
    )
    preferences = (
        db.query(ApplicationPreferences)
        .filter(ApplicationPreferences.user_id == user_id)
        .one_or_none()
    )
    items = [_export_item(workspace) for workspace in workspaces]
    return ApplicationsExport(
        application_count=len(items),
        applications=items,
        preferences=(
            ApplicationPreferencesResponse.model_validate(preferences) if preferences else None
        ),
    )


def _export_item(workspace: Workspace) -> ApplicationExportItem:
    return ApplicationExportItem(
        id=workspace.id,
        label=workspace.label,
        is_pinned=workspace.is_pinned,
        company=workspace.company,
        role=workspace.role,
        status=workspace.status,
        deadline=_as_utc(workspace.deadline),
        applied_at=_as_utc(workspace.applied_at),
        match_score=workspace.match_score,
        notes=workspace.notes,
        open_questions=list(workspace.open_questions or []),
        answers=dict(workspace.answers or {}),
        created_at=_as_utc(workspace.created_at),
        updated_at=_as_utc(workspace.updated_at),
        listing=_listing(workspace.listing),
        listing_revisions=[_listing(listing) for listing in workspace.listings],
        selected_cv_variant_id=workspace.selected_cv_variant_id,
        selected_cover_letter=_run(workspace.selected_cover_letter_run),
        selected_interview=_run(workspace.selected_interview_run),
        drafts=_run(workspace.drafts_run),
        tasks=list(workspace.campaign_tasks),
        snapshot=snapshot_response(workspace.snapshot),
        events=[
            EventExport(
                id=event.id,
                event_type=event.event_type,
                details=event.details,
                created_at=_as_utc(event.created_at),
            )
            for event in workspace.campaign_events
        ],
    )


def _listing(listing: CampaignListing | None) -> ListingResponse | None:
    if listing is None:
        return None
    return ListingResponse(
        title=listing.title,
        company=listing.company,
        description=listing.description,
        source_url=listing.source_url,
        apply_url=listing.apply_url,
        retrieved_at=_as_utc(listing.retrieved_at),
    )


def _run(run: ToolRun | None) -> RunExport | None:
    if run is None:
        return None
    return RunExport(
        id=run.id,
        tool_name=run.tool_name,
        label=run.label,
        parent_run_id=run.parent_run_id,
        result_payload=run.result_payload or {},
        created_at=_as_utc(run.created_at),
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
