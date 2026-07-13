from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.cv_document import CvDocument, CvVariant
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.schemas.history import (
    CampaignAvailableMaterials,
    CampaignCvVariantReference,
    CampaignDetailResponse,
    CampaignMaterialSelectionRequest,
    CampaignRunReference,
    CampaignSelectedMaterials,
)
from app.services.campaign_tracking import record_event
from app.services.tool_runs import build_workspace_summary


def get_campaign_detail(db: Session, workspace: Workspace, user_id: str) -> CampaignDetailResponse:
    variants = (
        db.query(CvVariant)
        .join(CvDocument)
        .filter(CvDocument.user_id == user_id)
        .order_by(CvVariant.created_at.desc())
        .all()
    )
    runs = (
        db.query(ToolRun)
        .filter(ToolRun.user_id == user_id, ToolRun.tool_name.in_(("cover-letter", "interview")))
        .order_by(ToolRun.created_at.desc())
        .all()
    )
    summary = build_workspace_summary(workspace, list(workspace.tool_runs))
    return CampaignDetailResponse(
        **summary.model_dump(),
        selected_materials=CampaignSelectedMaterials(
            cv_variant=_cv_ref(workspace.selected_cv_variant),
            cover_letter=_run_ref(workspace.selected_cover_letter_run),
            interview=_run_ref(workspace.selected_interview_run),
        ),
        available_materials=CampaignAvailableMaterials(
            cv_variants=[_cv_ref(item) for item in variants],
            cover_letters=[_run_ref(item) for item in runs if item.tool_name == "cover-letter"],
            interviews=[_run_ref(item) for item in runs if item.tool_name == "interview"],
        ),
        events=[
            {
                "id": e.id,
                "event_type": e.event_type,
                "details": e.details,
                "provenance": e.details.get("provenance", "user"),
                "created_at": e.created_at,
            }
            for e in workspace.campaign_events
        ],
        tasks=list(workspace.campaign_tasks),
        notes=list(workspace.campaign_notes),
        contacts=list(workspace.campaign_contacts),
    )


def update_material_selections(
    db: Session, workspace: Workspace, user_id: str, body: CampaignMaterialSelectionRequest
) -> CampaignDetailResponse:
    if "cv_variant_id" in body.model_fields_set:
        _select_cv_variant(db, workspace, user_id, body.cv_variant_id)
    if "cover_letter_run_id" in body.model_fields_set:
        _select_cover_letter(db, workspace, user_id, body.cover_letter_run_id)
    if "interview_run_id" in body.model_fields_set:
        _select_interview(db, workspace, user_id, body.interview_run_id)
    db.commit()
    db.refresh(workspace)
    return get_campaign_detail(db, workspace, user_id)


def clear_selected_run(db: Session, user_id: str, run: ToolRun) -> None:
    campaigns = (
        db.query(Workspace)
        .filter(
            Workspace.user_id == user_id,
            (Workspace.selected_cover_letter_run_id == run.id)
            | (Workspace.selected_interview_run_id == run.id),
        )
        .all()
    )
    for campaign in campaigns:
        material_type = (
            "cover_letter" if campaign.selected_cover_letter_run_id == run.id else "interview"
        )
        if material_type == "cover_letter":
            campaign.selected_cover_letter_run_id = None
        else:
            campaign.selected_interview_run_id = None
        _record_event(db, campaign.id, material_type, "cleared", provenance="system")


def clear_selected_variants(db: Session, document: CvDocument) -> None:
    variant_ids = [variant.id for variant in document.variants]
    if not variant_ids:
        return
    campaigns = (
        db.query(Workspace)
        .filter(
            Workspace.user_id == document.user_id, Workspace.selected_cv_variant_id.in_(variant_ids)
        )
        .all()
    )
    for campaign in campaigns:
        campaign.selected_cv_variant_id = None
        _record_event(db, campaign.id, "cv_variant", "cleared", provenance="system")


def _select_cv_variant(db: Session, workspace: Workspace, user_id: str, value: str | None) -> None:
    if (
        value is not None
        and db.query(CvVariant)
        .join(CvDocument)
        .filter(CvVariant.id == value, CvDocument.user_id == user_id)
        .first()
        is None
    ):
        raise HTTPException(status_code=422, detail="Invalid cv_variant reference")
    if workspace.selected_cv_variant_id != value:
        workspace.selected_cv_variant_id = value
        _record_event(db, workspace.id, "cv_variant", "selected" if value else "cleared")


def _select_cover_letter(
    db: Session, workspace: Workspace, user_id: str, value: str | None
) -> None:
    _validate_owned_run(db, user_id, value, "cover-letter")
    if workspace.selected_cover_letter_run_id != value:
        workspace.selected_cover_letter_run_id = value
        _record_event(db, workspace.id, "cover_letter", "selected" if value else "cleared")


def _select_interview(db: Session, workspace: Workspace, user_id: str, value: str | None) -> None:
    _validate_owned_run(db, user_id, value, "interview")
    if workspace.selected_interview_run_id != value:
        workspace.selected_interview_run_id = value
        _record_event(db, workspace.id, "interview", "selected" if value else "cleared")


def _validate_owned_run(
    db: Session,
    user_id: str,
    value: str | None,
    tool_name: Literal["cover-letter", "interview"],
) -> None:
    if (
        value is not None
        and db.query(ToolRun)
        .filter(
            ToolRun.id == value,
            ToolRun.user_id == user_id,
            ToolRun.tool_name == tool_name,
        )
        .first()
        is None
    ):
        raise HTTPException(status_code=422, detail=f"Invalid {tool_name} reference")


def _record_event(
    db: Session, workspace_id: str, material_type: str, action: str, *, provenance: str = "user"
) -> None:
    record_event(
        db,
        workspace_id,
        "material_selection_changed",
        {"material_type": material_type, "action": action},
        provenance=provenance,
    )


def _cv_ref(variant: CvVariant | None) -> CampaignCvVariantReference | None:
    if variant is None:
        return None
    return CampaignCvVariantReference(
        id=variant.id,
        document_id=variant.document_id,
        document_name=variant.document.name,
        name=variant.name,
        target_role=variant.target_role,
        created_at=variant.created_at,
    )


def _run_ref(run: ToolRun | None) -> CampaignRunReference | None:
    if run is None:
        return None
    return CampaignRunReference(
        id=run.id, label=run.label, parent_run_id=run.parent_run_id, created_at=run.created_at
    )
