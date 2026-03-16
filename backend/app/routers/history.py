from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.auth.security import get_current_user
from app.database import get_db
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.history import (
    DeletedResponse,
    FavoriteRequest,
    ToolRunDetail,
    ToolRunListResponse,
    ToolRunSummary,
    WorkspaceListResponse,
    WorkspaceSummary,
    WorkspaceUpdateRequest,
)
from app.services.tool_runs import build_workspace_summary, derive_saved_run_metadata

router = APIRouter()


@router.get("", response_model=ToolRunListResponse)
def list_history(
    tool: str | None = None,
    favorite: bool | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(ToolRun)
        .options(selectinload(ToolRun.workspace))
        .filter(ToolRun.user_id == current_user.id)
    )

    if tool:
        query = query.filter(ToolRun.tool_name == tool)
    if favorite is not None:
        query = query.filter(ToolRun.is_favorite == favorite)
    if q:
        query = query.filter(ToolRun.label.ilike(f"%{q}%"))

    total = query.count()
    items = (
        query.order_by(ToolRun.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    workspace_runs = _workspace_runs_map(db, current_user.id, items)

    return ToolRunListResponse(
        items=[_summary(r, workspace_runs.get(r.workspace_id, [])) for r in items],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/workspaces", response_model=WorkspaceListResponse)
def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspaces = (
        db.query(Workspace)
        .options(selectinload(Workspace.tool_runs))
        .filter(Workspace.user_id == current_user.id)
        .order_by(Workspace.is_pinned.desc(), Workspace.updated_at.desc())
        .all()
    )
    items = []
    for workspace in workspaces:
        summary = build_workspace_summary(workspace, list(workspace.tool_runs))
        if summary is not None:
            items.append(summary)
    return WorkspaceListResponse(
        items=items,
        total=len(workspaces),
    )


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceSummary)
def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace(db, workspace_id, current_user.id)
    if body.label is not None:
        workspace.label = body.label.strip() or None
    if body.is_pinned is not None:
        workspace.is_pinned = body.is_pinned
    db.commit()
    db.refresh(workspace)
    return build_workspace_summary(workspace, list(workspace.tool_runs))


@router.get("/{history_id}", response_model=ToolRunDetail)
def get_history_item(
    history_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, history_id, current_user.id)
    workspace_runs = _workspace_runs_map(db, current_user.id, [run])
    return ToolRunDetail(
        id=run.id,
        tool_name=run.tool_name,
        label=run.label,
        is_favorite=run.is_favorite,
        created_at=run.created_at.isoformat(),
        saved=True,
        access_mode="authenticated",
        locked_actions=[],
        metadata=derive_saved_run_metadata(run.tool_name, run.result_payload or {}),
        workspace=build_workspace_summary(run.workspace, workspace_runs.get(run.workspace_id, [])),
        result_payload=run.result_payload or {},
    )


@router.delete("/{history_id}", response_model=DeletedResponse)
def delete_history_item(
    history_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, history_id, current_user.id)
    workspace = run.workspace
    db.delete(run)
    if workspace and len(workspace.tool_runs) == 1:
        db.delete(workspace)
    db.commit()
    return DeletedResponse(deleted=1)


@router.patch("/{history_id}/favorite", response_model=ToolRunSummary)
def toggle_favorite(
    history_id: str,
    body: FavoriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, history_id, current_user.id)
    run.is_favorite = body.is_favorite
    db.commit()
    db.refresh(run)
    workspace_runs = _workspace_runs_map(db, current_user.id, [run])
    return _summary(run, workspace_runs.get(run.workspace_id, []))


def _get_run(db: Session, history_id: str, user_id: str) -> ToolRun:
    run = (
        db.query(ToolRun)
        .options(selectinload(ToolRun.workspace))
        .filter(ToolRun.id == history_id, ToolRun.user_id == user_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="History item not found")
    return run


def _get_workspace(db: Session, workspace_id: str, user_id: str) -> Workspace:
    workspace = (
        db.query(Workspace)
        .options(selectinload(Workspace.tool_runs))
        .filter(Workspace.id == workspace_id, Workspace.user_id == user_id)
        .first()
    )
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


def _workspace_runs_map(
    db: Session,
    user_id: str,
    runs: list[ToolRun],
) -> dict[str | None, list[ToolRun]]:
    workspace_ids = [run.workspace_id for run in runs if run.workspace_id]
    if not workspace_ids:
        return {}

    linked_runs = (
        db.query(ToolRun)
        .filter(ToolRun.user_id == user_id, ToolRun.workspace_id.in_(workspace_ids))
        .order_by(ToolRun.created_at.desc())
        .all()
    )
    grouped: dict[str | None, list[ToolRun]] = {}
    for run in linked_runs:
        grouped.setdefault(run.workspace_id, []).append(run)
    return grouped


def _summary(run: ToolRun, workspace_runs: list[ToolRun] | None = None) -> ToolRunSummary:
    return ToolRunSummary(
        id=run.id,
        tool_name=run.tool_name,
        label=run.label,
        is_favorite=run.is_favorite,
        created_at=run.created_at.isoformat(),
        saved=True,
        access_mode="authenticated",
        locked_actions=[],
        metadata=derive_saved_run_metadata(run.tool_name, run.result_payload or {}),
        workspace=build_workspace_summary(run.workspace, workspace_runs),
    )
