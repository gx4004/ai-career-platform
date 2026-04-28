from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.prompts.career import CAREER_PROMPT_VERSION
from app.schemas.tools import CareerRequest, CareerResponse
from app.services.career_recommender import recommend_career
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()


@router.post("/recommend", response_model=CareerResponse)
@limiter.limit("10/minute")
async def recommend(
    request: Request,
    body: CareerRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = (
        body.workspace_context.linked_history_ids if body.workspace_context else []
    )

    response = await run_tool_pipeline(
        tool_name="career",
        service_fn=recommend_career,
        service_kwargs={
            "resume_text": body.resume_text,
            "target_role": body.target_role,
            # tool_pipeline.run_tool_pipeline only injects the sanitized
            # feedback into service_kwargs when the key already exists in the
            # dict. Without this entry the regen-payload feedback was
            # accepted by the schema, logged, then silently dropped — the
            # LLM produced an identical plan no matter what the user typed
            # in the "Re-generate with feedback" textarea.
            "feedback": body.feedback,
        },
        label_fn=lambda r: f"Career Plan ({r['recommended_direction']['role_title']})",
        resume_text=body.resume_text,
        feedback=body.feedback,
        parent_run_id=body.parent_run_id,
        workspace_id=workspace_id,
        linked_context_ids=linked_context_ids,
        current_user=current_user,
        db=db,
        cache_extra_keys={
            "prompt_version": CAREER_PROMPT_VERSION,
            "model": settings.LLM_MODEL,
            "target_role": body.target_role or "",
        },
    )
    return CareerResponse(**response)
