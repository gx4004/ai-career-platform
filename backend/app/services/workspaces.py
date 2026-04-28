from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace


def resolve_workspace(
    db: Session,
    *,
    current_user: User,
    tool_name: str,
    label: str,
    workspace_id: str | None = None,
    linked_history_ids: list[str] | None = None,
) -> Workspace:
    workspace = None

    if workspace_id:
        workspace = (
            db.query(Workspace)
            .filter(Workspace.id == workspace_id, Workspace.user_id == current_user.id)
            .first()
        )
        if workspace:
            return workspace

    linked_ids = [item for item in (linked_history_ids or []) if item]
    if linked_ids:
        linked_run = (
            db.query(ToolRun)
            .filter(
                ToolRun.user_id == current_user.id,
                ToolRun.id.in_(linked_ids),
                ToolRun.workspace_id.is_not(None),
            )
            .order_by(ToolRun.created_at.desc())
            .first()
        )
        if linked_run and linked_run.workspace:
            return linked_run.workspace

    workspace = Workspace(
        user_id=current_user.id,
        label=_default_workspace_label(tool_name, label),
    )
    db.add(workspace)
    db.flush()
    db.refresh(workspace)
    return workspace


def touch_workspace(workspace: Workspace) -> None:
    workspace.updated_at = datetime.now(UTC)


def _default_workspace_label(tool_name: str, label: str) -> str:
    cleaned = label.strip()
    if cleaned:
        return cleaned
    return f"{tool_name.title()} Workspace"
