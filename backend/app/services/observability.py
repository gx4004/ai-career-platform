from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("app.observability")


def configure_logging() -> None:
    root_logger = logging.getLogger()
    if root_logger.handlers:
        return
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
    )


def log_tool_run_started(
    *,
    tool_name: str,
    access_mode: str,
    workspace_id: str | None,
    linked_context_count: int,
) -> None:
    _log(
        "tool_run_started",
        tool_name=tool_name,
        access_mode=access_mode,
        workspace_id=workspace_id,
        linked_context_count=linked_context_count,
    )


def log_tool_run_completed(
    *,
    tool_name: str,
    access_mode: str,
    duration_ms: int,
    saved: bool,
    history_id: str | None,
    workspace_id: str | None,
) -> None:
    _log(
        "tool_run_completed",
        tool_name=tool_name,
        access_mode=access_mode,
        duration_ms=duration_ms,
        saved=saved,
        history_id=history_id,
        workspace_id=workspace_id,
    )


def log_tool_run_failed(
    *,
    tool_name: str,
    access_mode: str,
    duration_ms: int,
    workspace_id: str | None,
    failure_category: str,
) -> None:
    _log(
        "tool_run_failed",
        level="error",
        tool_name=tool_name,
        access_mode=access_mode,
        duration_ms=duration_ms,
        workspace_id=workspace_id,
        failure_category=failure_category,
    )


def log_frontend_telemetry(payload: dict[str, Any]) -> None:
    _log("frontend_telemetry", **payload)


def _log(event: str, level: str = "info", **fields: Any) -> None:
    sanitized = {key: value for key, value in fields.items() if value is not None}
    message = json.dumps({"event": event, **sanitized}, default=str, sort_keys=True)
    if level == "error":
        logger.error(message)
        return
    logger.info(message)
