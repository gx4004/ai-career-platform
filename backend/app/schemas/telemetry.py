from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TelemetryEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_name: Literal[
        "tool_run_started",
        "tool_run_succeeded",
        "tool_run_failed",
        "result_page_loaded",
        "result_page_cache_miss",
        "export_action_used",
        "workspace_resumed",
        "frontend_error",
        "tool_regenerate",
        "ad_shown",
        "ad_completed",
        "ad_blocked",
        "countdown_completed",
        "auth_signup_source",
        "workflow_continued",
    ]
    level: Literal["info", "error"] = "info"
    tool_id: Literal[
        "resume",
        "job-match",
        "career",
        "cover-letter",
        "interview",
        "portfolio",
    ] | None = None
    access_mode: Literal["authenticated", "guest_demo"] | None = None
    saved: bool | None = None
    failure_category: Literal[
        "tool_request_failed",
        "render_error",
        "route_error",
        "chunk_load_error",
    ] | None = None
    export_format: Literal["txt", "md"] | None = None
    has_feedback: bool | None = None
    session_status: Literal["loading", "guest", "authenticated"] | None = None
    unlock_method: Literal["ad", "countdown"] | None = None
    occurred_at: datetime | None = None


class TelemetryAcceptedResponse(BaseModel):
    accepted: bool = True
