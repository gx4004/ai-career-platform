from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TelemetryEventRequest(BaseModel):
    event_name: Literal[
        "tool_run_started",
        "tool_run_succeeded",
        "tool_run_failed",
        "result_page_loaded",
        "export_action_used",
        "workspace_resumed",
        "frontend_error",
    ]
    level: Literal["info", "error"] = "info"
    tool_id: str | None = None
    history_id: str | None = None
    access_mode: Literal["authenticated", "guest_demo"] | None = None
    route: str | None = None
    workspace_id: str | None = None
    saved: bool | None = None
    error_message: str | None = None
    occurred_at: str | None = None
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class TelemetryAcceptedResponse(BaseModel):
    accepted: bool = True
