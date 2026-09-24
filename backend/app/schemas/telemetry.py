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

# Tool ids a browser is allowed to report. Every member is a tool a user can
# start from the UI (frontend/src/lib/tools/registry.ts) or a result surface
# rendered in the browser. This list is the browser ingest contract and must stay
# member-for-member equal to BROWSER_TOOL_IDS in
# frontend/src/lib/telemetry/client.ts — see
# tests/test_telemetry_tool_id_contract.py.
BrowserToolId = Literal[
    "resume",
    "job-match",
    "career",
    "cover-letter",
    "interview",
    "portfolio",
    "application-reviewer",
]

# Backend-generated pipeline operations that reuse the tool-run taxonomy but that
# no browser can emit. `application-packet` is written only by the packet
# pipeline (app/services/application_packets.py:PACKET_TOOL_NAME) and has no
# frontend tool id at all; it entered the browser union only so the backend
# reporting union would accept it, which both widened the ingest contract (a
# client could fabricate packet activation rows) and left the frontend union
# behind. Same reasoning as the CV Studio ids in app/schemas/analytics.py:
# backend telemetry needs a bounded identifier; the browser contract must not
# gain one.
BackendOnlyToolId = Literal["application-packet"]

# Every tool identifier the backend reports on — the reporting taxonomy, not the
# ingest contract. Nested Literals flatten (PEP 586), so this stays a flat
# Literal and `OperationalToolId` in app/schemas/analytics.py keeps covering
# every tool run exactly as before.
ToolId = Literal[BrowserToolId, BackendOnlyToolId]
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
    tool_id: BrowserToolId | None = None
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
