"""/api/v1/applications: the board, one application, preparing and applying.

Nothing here submits an application. The owner applies on the employer's site;
the Autopilot experiment only fills the form and leaves it open for them.
"""

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.gap_classification import GapClassification
from app.models.user import User
from app.schemas.applications import (
    AnswersUpdate,
    ApplicationDetail,
    ApplicationDetailsBody,
    ApplicationDetailsResponse,
    ApplicationList,
    ApplicationPreferencesBody,
    ApplicationPreferencesResponse,
    ApplicationUpdate,
    AutofillRunStatus,
    BulkPrepareResult,
    ReviewResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    WhatsWorking,
)
from app.schemas.gap_classification import GapClassificationListResponse, GapClassificationRead
from app.schemas.gap_response import GapResponseOffer
from app.schemas.history import DeletedResponse
from app.services import application_details
from app.services import applications as service
from app.services.application_insights import whats_working
from app.services.autopilot import (
    AutofillBusy,
    AutofillRefused,
    build_materials,
    cancel_run,
    get_run,
    start_autofill,
)
from app.services.campaign_reviewer import (
    project_campaign_materials,
    project_cv_document_text,
    review_campaign_materials,
)
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

router = APIRouter()

@contextmanager
def _errors() -> Iterator[None]:
    """Map service errors to HTTP. Each carries a message the owner can act on."""
    try:
        yield
    except service.ApplicationNotFound:
        raise HTTPException(status_code=404, detail="Application not found") from None
    except service.ApplicationConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    except service.InvalidReference as error:
        raise HTTPException(status_code=422, detail=str(error)) from None


def _load(db: Session, user: User, application_id: str, *, for_update: bool = False):
    with _errors():
        return service.get_application(db, user.id, application_id, for_update=for_update)


# ── Board and preferences (static paths first) ──


@router.get("", response_model=ApplicationList)
def list_applications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_applications(db, current_user.id)


@router.get("/insights", response_model=WhatsWorking)
def get_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What's working: reply rate overall and by segment, each with its sample size."""
    return whats_working(db, current_user.id)


@router.get("/preferences", response_model=ApplicationPreferencesResponse)
def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_preferences(db, current_user.id)


@router.put("/preferences", response_model=ApplicationPreferencesResponse)
def put_preferences(
    body: ApplicationPreferencesBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.save_preferences(db, current_user.id, body)


@router.get("/details", response_model=ApplicationDetailsResponse)
def get_details(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Contact details and standing answers the owner typed for application forms."""
    return application_details.get_details(db, current_user)


@router.put("/details", response_model=ApplicationDetailsResponse)
def put_details(
    body: ApplicationDetailsBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return application_details.save_details(db, current_user.id, body)


@router.post("/prepare", response_model=BulkPrepareResult)
@limiter.limit("5/minute")
async def prepare_for_me(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Adopt and prepare the best matching jobs, up to the per-run cap."""
    with _errors():
        return await service.prepare_for_me(db, current_user)


# ── One application ──


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application(
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.application_detail(db, _load(db, current_user, application_id))


@router.patch("/{application_id}", response_model=ApplicationDetail)
def update_application(
    application_id: str,
    body: ApplicationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _load(db, current_user, application_id, for_update=True)
    with _errors():
        service.update_application(db, workspace, body)
    return service.application_detail(db, workspace)


@router.delete("/{application_id}", response_model=DeletedResponse)
def delete_application(
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.delete_application(db, _load(db, current_user, application_id, for_update=True))
    return DeletedResponse(deleted=1)


@router.post("/{application_id}/prepare", response_model=ApplicationDetail)
@limiter.limit("10/minute")
async def prepare_application(
    request: Request,
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Draft a cover letter and screening answers; list what only the owner can answer."""
    workspace = _load(db, current_user, application_id)
    with _errors():
        await service.prepare_application(db, current_user, workspace)
    return service.application_detail(db, workspace)


@router.put("/{application_id}/answers", response_model=ApplicationDetail)
def save_answers(
    application_id: str,
    body: AnswersUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _load(db, current_user, application_id, for_update=True)
    with _errors():
        service.save_answers(db, workspace, body.answers)
    return service.application_detail(db, workspace)


@router.post("/{application_id}/applied", response_model=ApplicationDetail)
def mark_applied(
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The owner applied on the employer's site. Freezes what was sent, once."""
    workspace = _load(db, current_user, application_id, for_update=True)
    with _errors():
        service.mark_applied(db, workspace)
    db.commit()
    db.refresh(workspace)
    return service.application_detail(db, workspace)


def _autofill_status(db: Session, workspace, run) -> AutofillRunStatus:
    status = run.snapshot() if run else {"state": "idle"}
    if run is not None and run.claim_log():
        service.record_autofill(db, workspace, status)  # once per run, on the application
        db.commit()
    return AutofillRunStatus(**status)


def _autofill_enabled() -> None:
    if not settings.AUTOPILOT_EXPERIMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/{application_id}/autofill", response_model=AutofillRunStatus, status_code=202)
def autofill(
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start filling the application form in a browser on this computer.

    Returns at once; poll ``GET`` for progress. Never submits: the owner reviews the
    open window and presses submit themselves.
    """
    _autofill_enabled()
    workspace = _load(db, current_user, application_id)
    if service.unanswered_questions(workspace):
        raise HTTPException(
            status_code=409, detail="Answer the open questions before filling the form."
        )
    snapshot = service.snapshot_response(workspace.snapshot)
    content = snapshot.content if snapshot else service.application_content(workspace)
    details = application_details.get_details(db, current_user)
    try:
        run = start_autofill(current_user.id, application_id, build_materials(details, content))
    except AutofillRefused as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except AutofillBusy as error:
        raise HTTPException(
            status_code=409, detail="A form is already being filled. Finish that one first."
        ) from error
    return _autofill_status(db, workspace, run)


@router.get("/{application_id}/autofill", response_model=AutofillRunStatus)
def autofill_status(
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Status and report of the latest fill for this application."""
    _autofill_enabled()
    workspace = _load(db, current_user, application_id)
    return _autofill_status(db, workspace, get_run(current_user.id, application_id))


@router.delete("/{application_id}/autofill", response_model=AutofillRunStatus)
def autofill_cancel(
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel the fill and close its browser window."""
    _autofill_enabled()
    workspace = _load(db, current_user, application_id)
    return _autofill_status(db, workspace, cancel_run(current_user.id, application_id))


@router.post("/{application_id}/review", response_model=ReviewResponse)
@limiter.limit("10/minute")
async def review_application(
    request: Request,
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rule-based checks on the CV and cover letter this application would send."""
    workspace = _load(db, current_user, application_id)
    if workspace.listing is None:
        raise HTTPException(status_code=409, detail="Add the job posting before checking")
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
            "listing_title": workspace.listing.title,
            "listing_company": workspace.listing.company,
        },
        label_fn=lambda result: f"Application review ({len(result['findings'])} findings)",
        resume_text=cv_text,
        job_description=workspace.listing.description,
        workspace_id=workspace.id,
        current_user=current_user,
        db=db,
        cache_extra_keys={
            "reviewer_version": "v3",
            "listing_sha256": hashlib.sha256(
                f"{workspace.listing.title}\n{workspace.listing.company}".encode()
            ).hexdigest(),
            "cover_sha256": hashlib.sha256(clean_cover.encode()).hexdigest(),
            "cv_document_sha256": hashlib.sha256(cv_document_text.encode()).hexdigest(),
        },
    )
    return ReviewResponse(**response)


# ── Tasks ──


@router.post("/{application_id}/tasks", response_model=TaskResponse, status_code=201)
def create_task(
    application_id: str,
    body: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.add_task(db, _load(db, current_user, application_id), body)


@router.patch("/{application_id}/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    application_id: str,
    task_id: str,
    body: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _load(db, current_user, application_id)
    with _errors():
        task = service.get_task(db, workspace, task_id)
    return service.set_task_completed(db, task, body.completed)


@router.delete("/{application_id}/tasks/{task_id}", response_model=DeletedResponse)
def delete_task(
    application_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _load(db, current_user, application_id)
    with _errors():
        service.delete_task(db, service.get_task(db, workspace, task_id))
    return DeletedResponse(deleted=1)


# ── Gap classifications (R17 career development loop) ──


def _serialize_gaps(rows) -> GapClassificationListResponse:
    return GapClassificationListResponse(
        classifications=[GapClassificationRead.model_validate(row) for row in rows]
    )


@router.post("/{application_id}/gap-classifications", response_model=GapClassificationListResponse)
@limiter.limit("10/minute")
async def classify_gaps(
    request: Request,
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Label each reviewer finding with the honest kind of gap it is.

    Deterministic and idempotent: no LLM call, and the stored set is reconciled.
    """
    workspace = _load(db, current_user, application_id)
    if workspace.listing is None:
        raise HTTPException(
            status_code=409, detail="Add the job posting before classifying gaps"
        )
    cv_text, cover_text = project_campaign_materials(workspace)
    payload, _ = load_profile_for_injection(db, current_user.id)
    review = await review_campaign_materials(
        resume_text=cv_text,
        job_description=workspace.listing.description,
        cover_text=sanitize_user_input(cover_text),
        evidence_profile=payload,
        cv_document_text=project_cv_document_text(workspace),
        listing_title=workspace.listing.title,
        listing_company=workspace.listing.company,
    )
    classifications = classify_findings(review["findings"], payload)
    rows = persist_gap_classifications(db, current_user.id, workspace.id, classifications)
    return _serialize_gaps(rows)


@router.get("/{application_id}/gap-classifications", response_model=GapClassificationListResponse)
def list_gaps(
    application_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _load(db, current_user, application_id)
    return _serialize_gaps(list_gap_classifications(db, current_user.id, application_id))


@router.delete(
    "/{application_id}/gap-classifications/{classification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_gap(
    application_id: str,
    classification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _load(db, current_user, application_id)
    try:
        delete_gap_classification(db, current_user.id, application_id, classification_id)
    except GapClassificationNotFoundError:
        raise HTTPException(status_code=404, detail="Gap classification not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{application_id}/gap-classifications/{classification_id}/response",
    response_model=GapResponseOffer,
)
def get_gap_response(
    application_id: str,
    classification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The single honest next step for one classified gap. Read-only."""
    _load(db, current_user, application_id)
    classification = (
        db.query(GapClassification)
        .filter(
            GapClassification.id == classification_id,
            GapClassification.workspace_id == application_id,
            GapClassification.user_id == current_user.id,
        )
        .first()
    )
    if classification is None:
        raise HTTPException(status_code=404, detail="Gap classification not found")
    return map_gap_to_response(classification)
