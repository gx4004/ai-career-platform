from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.telemetry import (
    AccessMode,
    ExportFormat,
    FailureCategory,
    SessionStatus,
    TelemetryEventName,
    TelemetryLevel,
    ToolId,
)

# Activation-event names accepted by the durable write seam. This is the union
# of every event name already firing today: the frontend-telemetry taxonomy
# (`TelemetryEventName`) plus the backend-only tool-run outcome event, which the
# server logs as `tool_run_completed` (the frontend's client-observed twin is
# `tool_run_succeeded`). No new event names are introduced in this slice — every
# value here is already emitted somewhere in the running app.
ActivationEventName = TelemetryEventName | Literal["tool_run_completed"]


class ActivationEventCreate(BaseModel):
    """Allowlist gate for the single activation-event write seam (D-037).

    Mirrors the frontend telemetry ingestion discipline: `extra="forbid"` so any
    disallowed or free-text field (resume/JD/generated content, email, stack
    traces, raw log lines) is rejected exactly the way the ingestion endpoint
    already rejects unknown fields. Adds the two backend-computed operational
    metrics — `duration_ms` and `cost_estimate` — which no client reports.
    """

    model_config = ConfigDict(extra="forbid")

    event_name: ActivationEventName
    level: TelemetryLevel = "info"
    tool_id: ToolId | None = None
    access_mode: AccessMode | None = None
    saved: bool | None = None
    failure_category: FailureCategory | None = None
    export_format: ExportFormat | None = None
    has_feedback: bool | None = None
    session_status: SessionStatus | None = None
    duration_ms: int | None = None
    cost_estimate: Decimal | None = None
    occurred_at: datetime | None = None
