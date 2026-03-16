from time import perf_counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tools import PortfolioRequest, PortfolioResponse
from app.services.observability import (
    log_tool_run_completed,
    log_tool_run_failed,
    log_tool_run_started,
)
from app.services.portfolio_planner import recommend_portfolio
from app.services.tool_runs import build_tool_response, persist_tool_run

router = APIRouter()


@router.post("/recommend", response_model=PortfolioResponse)
async def recommend(
    body: PortfolioRequest,
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
        tool_name="portfolio",
        access_mode=access_mode,
        workspace_id=workspace_id,
        linked_context_count=len(linked_context_ids),
    )

    try:
        result = await recommend_portfolio(body.resume_text, body.target_role)
    except Exception as exc:
        log_tool_run_failed(
            tool_name="portfolio",
            access_mode=access_mode,
            duration_ms=int((perf_counter() - start) * 1000),
            workspace_id=workspace_id,
            failure_category=exc.__class__.__name__,
        )
        raise

    run = persist_tool_run(
        db,
        current_user=current_user,
        tool_name="portfolio",
        label=f"Portfolio Roadmap ({result['target_role']})",
        result=result,
        linked_context_ids=linked_context_ids,
        workspace_id=workspace_id,
    )
    response = build_tool_response(
        result,
        tool_name="portfolio",
        history_id=run.id if run else None,
        access_mode=access_mode,
    )
    log_tool_run_completed(
        tool_name="portfolio",
        access_mode=access_mode,
        duration_ms=int((perf_counter() - start) * 1000),
        saved=run is not None,
        history_id=run.id if run else None,
        workspace_id=workspace_id,
    )
    return PortfolioResponse(**response)
