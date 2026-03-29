from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tools import CareerRequest, CareerResponse
from app.services.career_recommender import recommend_career
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


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
        },
        label_fn=lambda r: f"Career Plan ({r['recommended_direction']['role_title']})",
        resume_text=body.resume_text,
        feedback=body.feedback,
        parent_run_id=body.parent_run_id,
        workspace_id=workspace_id,
        linked_context_ids=linked_context_ids,
        current_user=current_user,
        db=db,
        cache_extra_keys={"target_role": body.target_role or ""},
    )
    return CareerResponse(**response)
