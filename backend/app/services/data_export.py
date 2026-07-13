from datetime import UTC

from sqlalchemy.orm import Session

from app.models.workspace import Workspace
from app.schemas.data_export import CareerDataExport
from app.schemas.history import CampaignEventExport, CampaignExportItem, CampaignsExport
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
                    deadline=(
                        workspace.deadline.replace(tzinfo=UTC)
                        if workspace.deadline and workspace.deadline.tzinfo is None
                        else workspace.deadline
                    ),
                    created_at=(
                        workspace.created_at.replace(tzinfo=UTC)
                        if workspace.created_at.tzinfo is None
                        else workspace.created_at
                    ),
                    updated_at=(
                        workspace.updated_at.replace(tzinfo=UTC)
                        if workspace.updated_at.tzinfo is None
                        else workspace.updated_at
                    ),
                    events=[
                        CampaignEventExport(
                            id=event.id,
                            event_type=event.event_type,
                            details=event.details,
                            created_at=(
                                event.created_at.replace(tzinfo=UTC)
                                if event.created_at.tzinfo is None
                                else event.created_at
                            ),
                        )
                        for event in workspace.campaign_events
                    ],
                )
                for workspace in workspaces
            ],
        ),
    )
