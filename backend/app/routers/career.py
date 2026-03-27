from time import perf_counter

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tools import CareerRequest, CareerResponse
from app.services.career_recommender import recommend_career
from app.services.observability import (
    log_tool_run_completed,
    log_tool_run_failed,
    log_tool_run_started,
)
from app.services.tool_runs import build_tool_response, extract_linked_context_ids, persist_tool_run

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
    access_mode = "authenticated" if current_user else "guest_demo"
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = (
        body.workspace_context.linked_history_ids if body.workspace_context else []
    )
    start = perf_counter()
    log_tool_run_started(
        tool_name="career",
        access_mode=access_mode,
        workspace_id=workspace_id,
        linked_context_count=len(linked_context_ids),
    )

    try:
        result = await recommend_career(body.resume_text, body.target_role)
    except Exception as exc:
        log_tool_run_failed(
            tool_name="career",
            access_mode=access_mode,
            duration_ms=int((perf_counter() - start) * 1000),
            workspace_id=workspace_id,
            failure_category=exc.__class__.__name__,
        )
        raise

    run = persist_tool_run(
        db,
        current_user=current_user,
        tool_name="career",
        label=f"Career Plan ({result['recommended_direction']['role_title']})",
        result=result,
        linked_context_ids=extract_linked_context_ids(*linked_context_ids),
        workspace_id=workspace_id,
    )
    response = build_tool_response(
        result,
        tool_name="career",
        history_id=run.id if run else None,
        access_mode=access_mode,
    )
    log_tool_run_completed(
        tool_name="career",
        access_mode=access_mode,
        duration_ms=int((perf_counter() - start) * 1000),
        saved=run is not None,
        history_id=run.id if run else None,
        workspace_id=workspace_id,
    )
    return CareerResponse(**response)
