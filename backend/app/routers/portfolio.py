from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.tools import PortfolioRequest, PortfolioResponse
from app.services.portfolio_planner import recommend_portfolio
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()


@router.post("/recommend", response_model=PortfolioResponse)
@limiter.limit("10/minute")
async def recommend(
    request: Request,
    body: PortfolioRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = (
        body.workspace_context.linked_history_ids if body.workspace_context else []
    )

    response = await run_tool_pipeline(
        tool_name="portfolio",
        service_fn=recommend_portfolio,
        service_kwargs={
            "resume_text": body.resume_text,
            "target_role": body.target_role,
        },
        label_fn=lambda r: f"Portfolio Roadmap ({r['target_role']})",
        resume_text=body.resume_text,
        feedback=body.feedback,
        parent_run_id=body.parent_run_id,
        workspace_id=workspace_id,
        linked_context_ids=linked_context_ids,
        current_user=current_user,
        db=db,
        cache_extra_keys={"target_role": body.target_role or ""},
    )
    return PortfolioResponse(**response)
