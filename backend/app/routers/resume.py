from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.prompts.resume import RESUME_PROMPT_VERSION
from app.schemas.tools import ResumeAnalyzeRequest, ResumeAnalyzeResponse
from app.services.resume_analyzer import analyze_resume
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()


@router.post("/analyze", response_model=ResumeAnalyzeResponse)
@limiter.limit("10/minute")
async def analyze(
    request: Request,
    body: ResumeAnalyzeRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = (
        body.workspace_context.linked_history_ids if body.workspace_context else []
    )

    response = await run_tool_pipeline(
        tool_name="resume",
        service_fn=analyze_resume,
        service_kwargs={
            "resume_text": body.resume_text,
            "job_description": body.job_description,
            "feedback": body.feedback,
        },
        label_fn=lambda r: f"Resume Analysis ({r['overall_score']}/100)",
        resume_text=body.resume_text,
        job_description=body.job_description,
        feedback=body.feedback,
        parent_run_id=body.parent_run_id,
        workspace_id=workspace_id,
        linked_context_ids=linked_context_ids,
        current_user=current_user,
        db=db,
        cache_extra_keys={
            "prompt_version": RESUME_PROMPT_VERSION,
            "model": settings.LLM_MODEL,
        },
    )
    return ResumeAnalyzeResponse(**response)
