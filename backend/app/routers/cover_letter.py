import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.prompts.cover_letter import COVER_LETTER_PROMPT_VERSION
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

    resume_analysis_dict = (
        body.resume_analysis.model_dump(exclude_none=True) if body.resume_analysis else None
    )
    job_match_dict = (
        body.job_match.model_dump(exclude_none=True) if body.job_match else None
    )

    response = await run_tool_pipeline(
        tool_name="cover-letter",
        service_fn=generate_cover_letter,
        service_kwargs={
            "resume_text": body.resume_text,
            "job_description": body.job_description,
            "tone": body.tone,
            "resume_analysis": resume_analysis_dict,
            "job_match": job_match_dict,
            # tool_pipeline only injects sanitized feedback when the key is
            # present in service_kwargs; without this entry, regen-with-feedback
            # silently dropped user feedback before reaching the prompt.
            "feedback": body.feedback,
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
        cache_extra_keys={
            "prompt_version": COVER_LETTER_PROMPT_VERSION,
            "model": settings.LLM_MODEL,
            "tone": body.tone or "",
            "resume_analysis": json.dumps(resume_analysis_dict, sort_keys=True) if resume_analysis_dict else "",
            "job_match": json.dumps(job_match_dict, sort_keys=True) if job_match_dict else "",
        },
    )
    return CoverLetterResponse(**response)
