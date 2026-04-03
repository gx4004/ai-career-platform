from fastapi import APIRouter, Depends, Request
from app.limiter import limiter
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tools import JobMatchRequest, JobMatchResponse
from app.services.job_matcher import match_job
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()


@router.post("/match", response_model=JobMatchResponse)
@limiter.limit("10/minute")
async def match(
    request: Request,
    body: JobMatchRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = (
        body.workspace_context.linked_history_ids if body.workspace_context else []
    )

    response = await run_tool_pipeline(
        tool_name="job-match",
        service_fn=match_job,
        service_kwargs={
            "resume_text": body.resume_text,
            "job_description": body.job_description,
        },
        label_fn=lambda r: f"Job Match ({r['match_score']}%)",
        resume_text=body.resume_text,
        job_description=body.job_description,
        feedback=body.feedback,
        parent_run_id=body.parent_run_id,
        workspace_id=workspace_id,
        linked_context_ids=linked_context_ids,
        current_user=current_user,
        db=db,
    )
    return JobMatchResponse(**response)
