from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Allowlisted dimensions shared by the frontend-telemetry ingestion contract and
# the durable activation-event write seam (see app/schemas/analytics.py). These
# are the same low-cardinality values the frontend schema already restricts
# itself to (D-037) — never resume/JD/generated content, email, or free text.
TelemetryEventName = Literal[
    "landing_page_viewed",
    "tool_run_started",
    "tool_run_succeeded",
    "tool_run_failed",
    "result_page_loaded",
    "result_page_cache_miss",
    "export_action_used",
    "workspace_resumed",
    "frontend_error",
    "tool_regenerate",
    "auth_signup_source",
    "workflow_continued",
    "generation_loader_abandoned",
]
TelemetryLevel = Literal["info", "error"]
ToolId = Literal[
    "resume",
    "job-match",
    "career",
    "cover-letter",
    "interview",
    "portfolio",
    "application-reviewer",
    "application-packet",
]
AccessMode = Literal["authenticated", "guest_demo"]
FailureCategory = Literal[
    "tool_request_failed",
    "render_error",
    "route_error",
    "chunk_load_error",
]
ExportFormat = Literal["txt", "md"]
SessionStatus = Literal["loading", "guest", "authenticated"]


class TelemetryEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_name: TelemetryEventName
    level: TelemetryLevel = "info"
    tool_id: ToolId | None = None
    access_mode: AccessMode | None = None
    saved: bool | None = None
    failure_category: FailureCategory | None = None
    export_format: ExportFormat | None = None
    has_feedback: bool | None = None
    session_status: SessionStatus | None = None
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    occurred_at: datetime | None = None

    @model_validator(mode="after")
    def validate_loader_abandonment(self):
        if self.event_name == "generation_loader_abandoned":
            if self.tool_id is None or self.duration_ms is None or self.level != "info":
                raise ValueError("loader abandonment requires tool and duration")
        elif self.duration_ms is not None:
            raise ValueError("client duration is valid only for loader abandonment")
        return self


class TelemetryAcceptedResponse(BaseModel):
    accepted: bool = True
