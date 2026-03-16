from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.history import WorkspaceSummary
from app.services.premium_outputs import attach_premium_outputs
from app.services.workspaces import resolve_workspace, touch_workspace

GUEST_LOCKED_ACTIONS = ["save", "favorite", "continue", "history"]

DEFAULT_NEXT_STEP_TOOL = {
    "resume": "job-match",
    "job-match": "cover-letter",
    "cover-letter": "interview",
    "interview": "career",
    "career": "portfolio",
    "portfolio": "resume",
}


def build_tool_response(
    result: dict[str, Any],
    *,
    tool_name: str,
    history_id: str | None,
    access_mode: str,
) -> dict[str, Any]:
    enriched = attach_premium_outputs(tool_name, result)
    return {
        **enriched,
        "history_id": history_id,
        "access_mode": access_mode,
        "saved": history_id is not None,
        "locked_actions": [] if history_id else GUEST_LOCKED_ACTIONS,
    }


def persist_tool_run(
    db: Session,
    *,
    current_user: User | None,
    tool_name: str,
    label: str,
    result: dict[str, Any],
    linked_context_ids: list[str] | None = None,
    workspace_id: str | None = None,
) -> ToolRun | None:
    if current_user is None:
        return None

    linked_ids = _unique_strings(linked_context_ids)
    workspace = resolve_workspace(
        db,
        current_user=current_user,
        tool_name=tool_name,
        label=label,
        workspace_id=workspace_id,
        linked_history_ids=linked_ids,
    )
    touch_workspace(workspace)
    enriched = attach_premium_outputs(tool_name, result)
    run = ToolRun(
        user_id=current_user.id,
        workspace_id=workspace.id,
        tool_name=tool_name,
        label=label,
        result_payload=attach_workspace_meta(
            tool_name,
            enriched,
            linked_context_ids=linked_ids,
        ),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def attach_workspace_meta(
    tool_name: str,
    payload: dict[str, Any],
    *,
    linked_context_ids: list[str] | None = None,
) -> dict[str, Any]:
    return {
        **payload,
        "_workspace_meta": derive_saved_run_metadata(
            tool_name,
            payload,
            linked_context_ids=linked_context_ids,
        ),
    }


def derive_saved_run_metadata(
    tool_name: str,
    payload: dict[str, Any] | None,
    *,
    linked_context_ids: list[str] | None = None,
) -> dict[str, Any]:
    source = payload or {}
    summary = source.get("summary") if isinstance(source.get("summary"), dict) else {}
    workspace_meta = (
        source.get("_workspace_meta")
        if isinstance(source.get("_workspace_meta"), dict)
        else {}
    )
    linked_ids = linked_context_ids or _string_list(
        workspace_meta.get("linked_context_ids")
    )

    return {
        "summary_headline": _string(summary.get("headline")),
        "primary_recommendation_title": _primary_recommendation_title(
            tool_name, source
        ),
        "schema_version": _string(source.get("schema_version")),
        "linked_context_ids": linked_ids,
        "next_step_tool": _string(workspace_meta.get("next_step_tool"))
        or DEFAULT_NEXT_STEP_TOOL.get(tool_name),
    }


def extract_linked_context_ids(*history_ids: str | None) -> list[str]:
    return _unique_strings(history_ids)


def build_workspace_summary(
    workspace: Workspace | None,
    runs: list[ToolRun] | None = None,
) -> WorkspaceSummary | None:
    if workspace is None:
        return None

    ordered_runs = sorted(
        runs or list(workspace.tool_runs),
        key=lambda run: run.created_at,
        reverse=True,
    )
    last_run = ordered_runs[0] if ordered_runs else None
    return WorkspaceSummary(
        id=workspace.id,
        label=workspace.label,
        is_pinned=workspace.is_pinned,
        linked_run_ids=[run.id for run in ordered_runs],
        last_active_tool=last_run.tool_name if last_run else None,
        last_active_result_id=last_run.id if last_run else None,
        updated_at=workspace.updated_at.isoformat(),
    )


def _unique_strings(values: Any) -> list[str]:
    if values is None:
        return []
    linked_ids: list[str] = []
    for history_id in values:
        if history_id and history_id not in linked_ids:
            linked_ids.append(history_id)
    return linked_ids


def _primary_recommendation_title(tool_name: str, payload: dict[str, Any]) -> str | None:
    if tool_name == "resume":
        role_fit = payload.get("role_fit")
        if isinstance(role_fit, dict):
            return _string(role_fit.get("target_role_label"))
        return _first_string(
            _string_list(payload.get("strengths")),
            _string_list(payload.get("top_actions")),
        )

    if tool_name == "job-match":
        return _string(payload.get("recruiter_summary")) or _string(payload.get("verdict"))

    if tool_name == "cover-letter":
        return _string(payload.get("tone_used")) or "Targeted cover letter"

    if tool_name == "interview":
        focus_areas = payload.get("focus_areas")
        if isinstance(focus_areas, list) and focus_areas:
            first = focus_areas[0]
            if isinstance(first, dict):
                return _string(first.get("title")) or _string(first.get("focus_area"))
        return "Interview practice deck"

    if tool_name == "career":
        direction = payload.get("recommended_direction")
        if isinstance(direction, dict):
            return _string(direction.get("role_title"))
        return None

    if tool_name == "portfolio":
        return _string(payload.get("recommended_start_project")) or _string(
            payload.get("target_role")
        )

    return None


def _string(value: Any) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _first_string(*candidates: list[str]) -> str | None:
    for items in candidates:
        if items:
            return items[0]
    return None
