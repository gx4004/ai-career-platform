from time import perf_counter

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tools import InterviewRequest, InterviewResponse
from app.services.interview_gen import generate_interview_questions
from app.services.observability import (
    log_tool_run_completed,
    log_tool_run_failed,
    log_tool_run_started,
)
from app.services.tool_runs import (
    build_tool_response,
    extract_linked_context_ids,
    persist_tool_run,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/questions", response_model=InterviewResponse)
@limiter.limit("10/minute")
async def questions(
    request: Request,
    body: InterviewRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    access_mode = "authenticated" if current_user else "guest_demo"
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = (
        body.workspace_context.linked_history_ids if body.workspace_context else []
    )
    start = perf_counter()
    log_tool_run_started(
        tool_name="interview",
        access_mode=access_mode,
        workspace_id=workspace_id,
        linked_context_count=len(linked_context_ids),
    )

    try:
        result = await generate_interview_questions(
            body.resume_text,
            body.job_description,
            body.num_questions,
            body.resume_analysis.model_dump(exclude_none=True)
            if body.resume_analysis
            else None,
            body.job_match.model_dump(exclude_none=True) if body.job_match else None,
        )
    except Exception as exc:
        log_tool_run_failed(
            tool_name="interview",
            access_mode=access_mode,
            duration_ms=int((perf_counter() - start) * 1000),
            workspace_id=workspace_id,
            failure_category=exc.__class__.__name__,
        )
        raise

    run = persist_tool_run(
        db,
        current_user=current_user,
        tool_name="interview",
        label=f"Interview Prep ({len(result['questions'])} questions)",
        result=result,
        linked_context_ids=extract_linked_context_ids(
            body.resume_analysis.history_id if body.resume_analysis else None,
            body.job_match.history_id if body.job_match else None,
            *linked_context_ids,
        ),
        workspace_id=workspace_id,
    )
    response = build_tool_response(
        result,
        tool_name="interview",
        history_id=run.id if run else None,
        access_mode=access_mode,
    )
    log_tool_run_completed(
        tool_name="interview",
        access_mode=access_mode,
        duration_ms=int((perf_counter() - start) * 1000),
        saved=run is not None,
        history_id=run.id if run else None,
        workspace_id=workspace_id,
    )
    return InterviewResponse(**response)
