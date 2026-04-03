from fastapi import APIRouter, Depends, Request
from app.limiter import limiter
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tools import CoverLetterRequest, CoverLetterResponse
from app.services.cover_letter_gen import generate_cover_letter
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()


@router.post("/generate", response_model=CoverLetterResponse)
@limiter.limit("10/minute")
async def generate(
    request: Request,
    body: CoverLetterRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = [
        body.resume_analysis.history_id if body.resume_analysis else None,
        body.job_match.history_id if body.job_match else None,
        *(body.workspace_context.linked_history_ids if body.workspace_context else []),
    ]

    response = await run_tool_pipeline(
        tool_name="cover-letter",
        service_fn=generate_cover_letter,
        service_kwargs={
            "resume_text": body.resume_text,
            "job_description": body.job_description,
            "tone": body.tone,
            "resume_analysis": (
                body.resume_analysis.model_dump(exclude_none=True)
                if body.resume_analysis
                else None
            ),
            "job_match": (
                body.job_match.model_dump(exclude_none=True) if body.job_match else None
            ),
        },
        label_fn=lambda r: f"Cover Letter ({r['tone_used']})",
        resume_text=body.resume_text,
        job_description=body.job_description,
        feedback=body.feedback,
        parent_run_id=body.parent_run_id,
        workspace_id=workspace_id,
        linked_context_ids=linked_context_ids,
        current_user=current_user,
        db=db,
    )
    return CoverLetterResponse(**response)
