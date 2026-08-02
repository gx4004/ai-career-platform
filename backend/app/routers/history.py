import hashlib
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session, selectinload

from app.auth.security import get_current_user
from app.database import get_db
from app.feature_gates import require_r13_enabled, require_r17_enabled
from app.limiter import limiter
from app.models.application_packet import ApplicationPacket
from app.models.campaign_event import CampaignEvent
from app.models.campaign_tracking import CampaignContact, CampaignNote, CampaignTask
from app.models.gap_classification import GapClassification
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.gap_classification import (
    GapClassificationListResponse,
    GapClassificationRead,
)
from app.schemas.gap_response import GapResponseOffer
from app.schemas.history import (
    CampaignContactCreate,
    CampaignContactResponse,
    CampaignDetailResponse,
    CampaignMaterialSelectionRequest,
    CampaignNoteCreate,
    CampaignNoteResponse,
    CampaignReminderConsent,
    CampaignReminderResponse,
    CampaignReviewResponse,
    CampaignStatus,
    CampaignTaskCreate,
    CampaignTaskResponse,
    CampaignTaskUpdate,
    DeletedResponse,
    FavoriteRequest,
    RunUpdateRequest,
    ToolRunDetail,
    ToolRunListResponse,
    ToolRunSummary,
    WorkspaceListResponse,
    WorkspaceSummary,
    WorkspaceUpdateRequest,
)
from app.services.campaign_materials import (
    clear_selected_run,
    get_campaign_detail,
    update_material_selections,
)
from app.services.campaign_reminders import claim_due_reminders, set_reminder_consent
from app.services.campaign_reviewer import (
    project_campaign_materials,
    project_cv_document_text,
    review_campaign_materials,
)
from app.services.campaign_snapshots import (
    DuplicateRoleSubmissionError,
    capture_submission_snapshot,
)
from app.services.campaign_tracking import add_contact, add_note, add_task, record_event
from app.services.evidence_injection import load_profile_for_injection
from app.services.gap_classifier import (
    GapClassificationNotFoundError,
    classify_findings,
    delete_gap_classification,
    list_gap_classifications,
    persist_gap_classifications,
)
from app.services.gap_response import map_gap_to_response
from app.services.input_sanitizer import sanitize_user_input
from app.services.tool_pipeline import run_tool_pipeline
from app.services.tool_runs import build_workspace_summary, derive_saved_run_metadata

router = APIRouter()
TRACKING_DELETE_CONFIG = {
    CampaignTask: ("Task", "task_deleted", "task_id"),
    CampaignNote: ("Note", "note_deleted", "note_id"),
    CampaignContact: ("Contact", "contact_deleted", "contact_id"),
}

CAMPAIGN_STATUS_TRANSITIONS: dict[CampaignStatus | None, set[CampaignStatus]] = {
    None: {CampaignStatus.PLANNING},
    CampaignStatus.PLANNING: {
        CampaignStatus.PREPARING,
        CampaignStatus.REJECTED,
        CampaignStatus.WITHDRAWN,
    },
    CampaignStatus.PREPARING: {
        CampaignStatus.APPLIED,
        CampaignStatus.REJECTED,
        CampaignStatus.WITHDRAWN,
    },
    CampaignStatus.APPLIED: {
        CampaignStatus.INTERVIEWING,
        CampaignStatus.OFFER,
        CampaignStatus.REJECTED,
        CampaignStatus.WITHDRAWN,
    },
    CampaignStatus.INTERVIEWING: {
        CampaignStatus.OFFER,
        CampaignStatus.REJECTED,
        CampaignStatus.WITHDRAWN,
    },
    CampaignStatus.OFFER: {
        CampaignStatus.ACCEPTED,
        CampaignStatus.REJECTED,
        CampaignStatus.WITHDRAWN,
    },
    CampaignStatus.ACCEPTED: set(),
    CampaignStatus.REJECTED: set(),
    CampaignStatus.WITHDRAWN: set(),
}


@router.get("", response_model=ToolRunListResponse)
def list_history(
    tool: str | None = None,
    favorite: bool | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(ToolRun)
        .options(selectinload(ToolRun.workspace))
        .filter(ToolRun.user_id == current_user.id)
    )

    if tool:
        query = query.filter(ToolRun.tool_name == tool)
    if favorite is not None:
        query = query.filter(ToolRun.is_favorite == favorite)
    if q:
        query = query.filter(ToolRun.label.ilike(f"%{q}%"))

    total = query.count()
    items = (
        query.order_by(ToolRun.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    workspace_runs = _workspace_runs_map(db, current_user.id, items)

    return ToolRunListResponse(
        items=[_summary(r, workspace_runs.get(r.workspace_id, [])) for r in items],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/workspaces", response_model=WorkspaceListResponse)
def list_workspaces(
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspaces = (
        db.query(Workspace)
        .options(selectinload(Workspace.tool_runs))
        .filter(Workspace.user_id == current_user.id)
        .order_by(Workspace.is_pinned.desc(), Workspace.updated_at.desc())
        .limit(limit)
        .all()
    )
    items = []
    for workspace in workspaces:
        summary = build_workspace_summary(workspace, list(workspace.tool_runs))
        if summary is not None:
            items.append(summary)
    return WorkspaceListResponse(items=items, total=len(items))


@router.get("/workspaces/{workspace_id}", response_model=CampaignDetailResponse)
def get_campaign(
    workspace_id: str,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace(db, workspace_id, current_user.id)
    return get_campaign_detail(db, workspace, current_user.id)


@router.patch("/workspaces/{workspace_id}/materials", response_model=CampaignDetailResponse)
def update_campaign_materials(
    workspace_id: str,
    body: CampaignMaterialSelectionRequest,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace(db, workspace_id, current_user.id)
    return update_material_selections(db, workspace, current_user.id, body)


@router.get("/workspaces/{workspace_id}/reminders", response_model=CampaignReminderResponse)
@limiter.limit("10/minute")
def get_campaign_reminders(
    request: Request,
    workspace_id: str,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_workspace(db, workspace_id, current_user.id)
    return claim_due_reminders(db, workspace_id, current_user.id)


@router.patch("/workspaces/{workspace_id}/reminders", response_model=CampaignReminderResponse)
def update_campaign_reminders(
    workspace_id: str,
    body: CampaignReminderConsent,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return set_reminder_consent(db, _get_workspace(db, workspace_id, current_user.id), body.enabled)


@router.post("/workspaces/{workspace_id}/review", response_model=CampaignReviewResponse)
@limiter.limit("10/minute")
async def review_campaign(
    request: Request,
    workspace_id: str,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace(db, workspace_id, current_user.id)
    if workspace.listing is None:
        raise HTTPException(status_code=409, detail="Attach a canonical listing before review")
    cv_text, cover_text = project_campaign_materials(workspace)
    cv_document_text = project_cv_document_text(workspace)
    clean_cover = sanitize_user_input(cover_text)
    response = await run_tool_pipeline(
        tool_name="application-reviewer",
        service_fn=review_campaign_materials,
        service_kwargs={
            "resume_text": cv_text,
            "job_description": workspace.listing.description,
            "cover_text": clean_cover,
            "cv_document_text": cv_document_text,
        },
        label_fn=lambda result: f"Application review ({len(result['findings'])} findings)",
        resume_text=cv_text,
        job_description=workspace.listing.description,
        workspace_id=workspace.id,
        current_user=current_user,
        db=db,
        cache_extra_keys={
            "reviewer_version": "v2",
            "cover_sha256": hashlib.sha256(clean_cover.encode()).hexdigest(),
            "cv_document_sha256": hashlib.sha256(cv_document_text.encode()).hexdigest(),
        },
        require_evidence_profile=True,
    )
    return CampaignReviewResponse(**response)


def _serialize_gap_classifications(rows) -> GapClassificationListResponse:
    return GapClassificationListResponse(
        classifications=[GapClassificationRead.model_validate(row) for row in rows]
    )


@router.post(
    "/workspaces/{workspace_id}/gap-classifications",
    response_model=GapClassificationListResponse,
)
@limiter.limit("10/minute")
async def classify_campaign_gaps(
    request: Request,
    workspace_id: str,
    _gate: None = Depends(require_r17_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Classify the campaign's advisory reviewer findings into honest gap kinds.

    Deterministic and idempotent: it runs the reviewer, labels each recognized
    finding (R17 #198, D-109), and reconciles the persisted set to match. No LLM
    call and no second judgment path over the materials.
    """
    workspace = _get_workspace(db, workspace_id, current_user.id)
    if workspace.listing is None:
        raise HTTPException(
            status_code=409, detail="Attach a canonical listing before classifying gaps"
        )
    cv_text, cover_text = project_campaign_materials(workspace)
    cv_document_text = project_cv_document_text(workspace)
    clean_cover = sanitize_user_input(cover_text)
    payload, _ = load_profile_for_injection(db, current_user.id)
    review = await review_campaign_materials(
        resume_text=cv_text,
        job_description=workspace.listing.description,
        cover_text=clean_cover,
        evidence_profile=payload,
        cv_document_text=cv_document_text,
    )
    classifications = classify_findings(review["findings"], payload)
    rows = persist_gap_classifications(db, current_user.id, workspace_id, classifications)
    return _serialize_gap_classifications(rows)


@router.get(
    "/workspaces/{workspace_id}/gap-classifications",
    response_model=GapClassificationListResponse,
)
def get_campaign_gaps(
    workspace_id: str,
    _gate: None = Depends(require_r17_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_workspace(db, workspace_id, current_user.id)
    rows = list_gap_classifications(db, current_user.id, workspace_id)
    return _serialize_gap_classifications(rows)


@router.delete(
    "/workspaces/{workspace_id}/gap-classifications/{classification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_campaign_gap(
    workspace_id: str,
    classification_id: str,
    _gate: None = Depends(require_r17_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _get_workspace(db, workspace_id, current_user.id)
    try:
        delete_gap_classification(db, current_user.id, workspace_id, classification_id)
    except GapClassificationNotFoundError:
        raise HTTPException(status_code=404, detail="Gap classification not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/workspaces/{workspace_id}/gap-classifications/{classification_id}/response",
    response_model=GapResponseOffer,
)
def get_gap_response(
    workspace_id: str,
    classification_id: str,
    _gate: None = Depends(require_r17_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The single honest response for one classified gap (R17 #200, D-110).

    Read-only: it names the truthful next action and, for uncaptured evidence, the
    proposal body the user would submit to the R11 create path — it never writes
    to the Evidence Profile.
    """
    _get_workspace(db, workspace_id, current_user.id)
    classification = (
        db.query(GapClassification)
        .filter(
            GapClassification.id == classification_id,
            GapClassification.workspace_id == workspace_id,
            GapClassification.user_id == current_user.id,
        )
        .first()
    )
    if classification is None:
        raise HTTPException(status_code=404, detail="Gap classification not found")
    return map_gap_to_response(classification)


@router.post(
    "/workspaces/{workspace_id}/tasks", response_model=CampaignTaskResponse, status_code=201
)
def create_campaign_task(
    workspace_id: str,
    body: CampaignTaskCreate,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return add_task(db, _get_workspace(db, workspace_id, current_user.id), body)


@router.patch("/workspaces/{workspace_id}/tasks/{item_id}", response_model=CampaignTaskResponse)
def update_campaign_task(
    workspace_id: str,
    item_id: str,
    body: CampaignTaskUpdate,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_workspace(db, workspace_id, current_user.id)
    item = (
        db.query(CampaignTask)
        .filter(CampaignTask.id == item_id, CampaignTask.workspace_id == workspace_id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if item.completed != body.completed:
        item.completed = body.completed
        record_event(
            db,
            workspace_id,
            "task_completed" if body.completed else "task_reopened",
            {"task_id": item.id},
        )
        db.commit()
        db.refresh(item)
    return item


@router.delete("/workspaces/{workspace_id}/tasks/{item_id}", response_model=DeletedResponse)
def delete_campaign_task(
    workspace_id: str,
    item_id: str,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _delete_campaign_record(db, current_user.id, workspace_id, item_id, CampaignTask)


@router.post(
    "/workspaces/{workspace_id}/notes", response_model=CampaignNoteResponse, status_code=201
)
def create_campaign_note(
    workspace_id: str,
    body: CampaignNoteCreate,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return add_note(db, _get_workspace(db, workspace_id, current_user.id), body)


@router.delete("/workspaces/{workspace_id}/notes/{item_id}", response_model=DeletedResponse)
def delete_campaign_note(
    workspace_id: str,
    item_id: str,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _delete_campaign_record(db, current_user.id, workspace_id, item_id, CampaignNote)


@router.post(
    "/workspaces/{workspace_id}/contacts", response_model=CampaignContactResponse, status_code=201
)
def create_campaign_contact(
    workspace_id: str,
    body: CampaignContactCreate,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return add_contact(db, _get_workspace(db, workspace_id, current_user.id), body)


@router.delete("/workspaces/{workspace_id}/contacts/{item_id}", response_model=DeletedResponse)
def delete_campaign_contact(
    workspace_id: str,
    item_id: str,
    _gate: None = Depends(require_r13_enabled),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _delete_campaign_record(db, current_user.id, workspace_id, item_id, CampaignContact)


def _delete_campaign_record(
    db: Session,
    user_id: str,
    workspace_id: str,
    item_id: str,
    model: Any,
) -> DeletedResponse:
    label, event_type, detail_key = TRACKING_DELETE_CONFIG[model]
    _get_workspace(db, workspace_id, user_id)
    item = db.query(model).filter_by(id=item_id, workspace_id=workspace_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    record_event(db, workspace_id, event_type, {detail_key: item.id})
    db.delete(item)
    db.commit()
    return DeletedResponse(deleted=1)


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceSummary)
def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if "status" in body.model_fields_set:
        workspace = (
            db.query(Workspace)
            .filter(Workspace.id == workspace_id, Workspace.user_id == current_user.id)
            .with_for_update()
            .first()
        )
        if workspace is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
    else:
        workspace = _get_workspace(db, workspace_id, current_user.id)
    if body.label is not None:
        workspace.label = body.label.strip() or None
    if body.is_pinned is not None:
        workspace.is_pinned = body.is_pinned
    if "company" in body.model_fields_set:
        workspace.company = body.company.strip() if body.company and body.company.strip() else None
    if "role" in body.model_fields_set:
        workspace.role = body.role.strip() if body.role and body.role.strip() else None
    if "deadline" in body.model_fields_set:
        previous_deadline = workspace.deadline
        workspace.deadline = body.deadline
        if previous_deadline != body.deadline:
            db.add(
                CampaignEvent(
                    workspace_id=workspace.id,
                    event_type="deadline_changed",
                    details={
                        "from": previous_deadline.isoformat() if previous_deadline else None,
                        "to": body.deadline.isoformat() if body.deadline else None,
                    },
                )
            )
    if "status" in body.model_fields_set:
        transition = _apply_campaign_status_transition(workspace, body.status)
        if transition is not None:
            previous, requested = transition
            if requested == CampaignStatus.APPLIED:
                try:
                    capture_submission_snapshot(db, workspace)
                except DuplicateRoleSubmissionError as exc:
                    raise HTTPException(status_code=409, detail=str(exc)) from None
            db.add(
                CampaignEvent(
                    workspace_id=workspace.id,
                    event_type="status_changed",
                    details={
                        "from": previous.value if previous else None,
                        "to": requested.value,
                    },
                )
            )
    db.commit()
    db.refresh(workspace)
    return build_workspace_summary(workspace, list(workspace.tool_runs))


@router.delete("/workspaces/{workspace_id}", response_model=DeletedResponse)
def delete_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_workspace(db, workspace_id, current_user.id)
    # Approval and account erasure lock/delete packets before their campaign.
    # Match that order so PostgreSQL cannot deadlock approval against this
    # campaign cascade (approval holds packet while requesting workspace).
    (
        db.query(ApplicationPacket)
        .filter(
            ApplicationPacket.user_id == current_user.id,
            ApplicationPacket.campaign_id == workspace_id,
        )
        .order_by(ApplicationPacket.id.asc())
        .with_for_update()
        .all()
    )
    workspace = (
        db.query(Workspace)
        .filter(
            Workspace.id == workspace_id,
            Workspace.user_id == current_user.id,
        )
        .with_for_update()
        .one_or_none()
    )
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    db.delete(workspace)
    db.commit()
    return DeletedResponse(deleted=1)


def _apply_campaign_status_transition(
    workspace: Workspace, requested: CampaignStatus | None
) -> tuple[CampaignStatus | None, CampaignStatus] | None:
    current = CampaignStatus(workspace.status) if workspace.status else None
    if requested is None or requested == current:
        return None
    if requested not in CAMPAIGN_STATUS_TRANSITIONS[current]:
        current_label = current.value if current else "legacy-null"
        raise HTTPException(
            status_code=409,
            detail=f"Campaign status cannot transition from {current_label} to {requested.value}",
        )
    workspace.status = requested.value
    return current, requested


@router.get("/{history_id}", response_model=ToolRunDetail)
def get_history_item(
    history_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, history_id, current_user.id)
    workspace_runs = _workspace_runs_map(db, current_user.id, [run])
    return ToolRunDetail(
        id=run.id,
        tool_name=run.tool_name,
        label=run.label,
        is_favorite=run.is_favorite,
        created_at=run.created_at.isoformat(),
        saved=True,
        access_mode="authenticated",
        locked_actions=[],
        metadata=derive_saved_run_metadata(run.tool_name, run.result_payload or {}),
        workspace=build_workspace_summary(run.workspace, workspace_runs.get(run.workspace_id, [])),
        parent_run_id=run.parent_run_id,
        result_payload=run.result_payload or {},
    )


@router.get("/{run_id}/export/pdf")
@limiter.limit("10/minute")
def export_pdf(
    request: Request,
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import io

    from fastapi.responses import StreamingResponse

    from app.services.pdf_export import generate_cover_letter_pdf, generate_interview_pdf

    run = (
        db.query(ToolRun)
        .filter(
            ToolRun.id == run_id,
            ToolRun.user_id == current_user.id,
        )
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    result = run.result_payload or {}

    if run.tool_name == "cover-letter":
        pdf_bytes = generate_cover_letter_pdf(result)
        filename = "cover-letter.pdf"
    elif run.tool_name == "interview":
        pdf_bytes = generate_interview_pdf(result)
        filename = "interview-qa.pdf"
    else:
        raise HTTPException(
            status_code=400,
            detail="PDF export is only available for cover letter and interview results",
        )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{history_id}", response_model=DeletedResponse)
def delete_history_item(
    history_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, history_id, current_user.id)
    workspace = run.workspace
    clear_selected_run(db, current_user.id, run)
    db.delete(run)
    if workspace is not None:
        # Use a DB-level count rather than the in-memory relationship, which
        # may not reflect concurrent inserts. If this run is the last one in
        # the workspace, remove the workspace too.
        remaining = (
            db.query(ToolRun)
            .filter(
                ToolRun.workspace_id == workspace.id,
                ToolRun.id != run.id,
            )
            .count()
        )
        if remaining == 0 and not _has_campaign_data(workspace):
            db.delete(workspace)
    db.commit()
    return DeletedResponse(deleted=1)


@router.patch("/{history_id}/favorite", response_model=ToolRunSummary)
def toggle_favorite(
    history_id: str,
    body: FavoriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, history_id, current_user.id)
    run.is_favorite = body.is_favorite
    db.commit()
    db.refresh(run)
    workspace_runs = _workspace_runs_map(db, current_user.id, [run])
    return _summary(run, workspace_runs.get(run.workspace_id, []))


@router.patch("/{history_id}", response_model=ToolRunSummary)
def update_run(
    history_id: str,
    body: RunUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, history_id, current_user.id)
    run.label = body.label.strip() if body.label and body.label.strip() else None
    db.commit()
    db.refresh(run)
    workspace_runs = _workspace_runs_map(db, current_user.id, [run])
    return _summary(run, workspace_runs.get(run.workspace_id, []))


def _get_run(db: Session, history_id: str, user_id: str) -> ToolRun:
    run = (
        db.query(ToolRun)
        .options(selectinload(ToolRun.workspace))
        .filter(ToolRun.id == history_id, ToolRun.user_id == user_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="History item not found")
    return run


def _has_campaign_data(workspace: Workspace) -> bool:
    return any(
        value is not None
        for value in (
            workspace.company,
            workspace.role,
            workspace.status,
            workspace.deadline,
            workspace.listing,
            workspace.selected_cv_variant_id,
            workspace.selected_cover_letter_run_id,
            workspace.selected_interview_run_id,
        )
    )


def _get_workspace(db: Session, workspace_id: str, user_id: str) -> Workspace:
    workspace = (
        db.query(Workspace)
        .options(selectinload(Workspace.tool_runs))
        .filter(Workspace.id == workspace_id, Workspace.user_id == user_id)
        .first()
    )
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


def _workspace_runs_map(
    db: Session,
    user_id: str,
    runs: list[ToolRun],
) -> dict[str | None, list[ToolRun]]:
    workspace_ids = [run.workspace_id for run in runs if run.workspace_id]
    if not workspace_ids:
        return {}

    linked_runs = (
        db.query(ToolRun)
        .filter(ToolRun.user_id == user_id, ToolRun.workspace_id.in_(workspace_ids))
        .order_by(ToolRun.created_at.desc())
        .all()
    )
    grouped: dict[str | None, list[ToolRun]] = {}
    for run in linked_runs:
        grouped.setdefault(run.workspace_id, []).append(run)
    return grouped


def _summary(run: ToolRun, workspace_runs: list[ToolRun] | None = None) -> ToolRunSummary:
    return ToolRunSummary(
        id=run.id,
        tool_name=run.tool_name,
        label=run.label,
        is_favorite=run.is_favorite,
        created_at=run.created_at.isoformat(),
        saved=True,
        access_mode="authenticated",
        locked_actions=[],
        metadata=derive_saved_run_metadata(run.tool_name, run.result_payload or {}),
        workspace=build_workspace_summary(run.workspace, workspace_runs),
    )
