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

# ── R10 operational-event allowlist (issue #136, parent #135, D-053) ──
# The R10 scaling-trigger scorecard extends the same first-party operational
# path R6 already owns. These are backend-generated, low-cardinality dimensions
# emitted at authoritative backend boundaries (cache lookup, provider incident,
# job import). Like every other dimension in this file they are constrained to a
# closed Literal set, so `extra="forbid"` on the write seam rejects raw
# resume/JD/generated content, full URLs/hostnames, provider exception messages,
# cache keys, SQL parameters, email/IP, and stable user/run/workspace IDs.

# Backend-only R10 event names. Kept separate from the frontend telemetry
# taxonomy (`TelemetryEventName`) because no client may emit these — they are
# written only by the server at the boundary that observes the outcome.
R10EventName = Literal[
    "r10_cache_outcome",
    "r10_provider_incident",
    "r10_import_outcome",
]

# Cache lookup/write outcome at the shared tool-pipeline seam (ADR 0004). No
# cache key or payload ever crosses the boundary — only the outcome class.
CacheOutcome = Literal["hit", "miss", "write", "failure"]

# Provider incident category (D-055). One event is emitted per user-visible
# provider failure — internal retries are collapsed into a single incident, not
# counted separately — and only the category crosses the boundary, never the
# raw provider exception message.
ProviderIncidentCategory = Literal[
    "timeout",
    "quota",
    "unavailable",
    "permission",
    "malformed",
]

# Allowlisted job-import source family (D-059). The raw hostname/path/query is
# mapped locally to one of these bounded families and then discarded before any
# analytics row is written; `other` stays one bounded catch-all category.
ImportSourceFamily = Literal[
    "greenhouse",
    "lever",
    "workday",
    "ashby",
    "smartrecruiters",
    "other",
]

# Job-import attempt outcome. `success` = first-tier HTTP fetch, `fallback` =
# the bounded Playwright fallback produced the result, `failure` = neither tier
# yielded a usable posting and the user gets the paste fallback.
ImportOutcome = Literal["success", "fallback", "failure"]

# The two reused generic operational columns. `operational_dimension` holds the
# primary category/family for an event (provider incident category or import
# source family); `operational_outcome` holds the outcome class (cache outcome
# or import outcome). Which axis a value belongs to is unambiguous from
# `event_name`, so aggregation never has to disambiguate a bare string.
OperationalDimension = ProviderIncidentCategory | ImportSourceFamily
OperationalOutcome = CacheOutcome | ImportOutcome

# Activation-event names accepted by the durable write seam. This is the union
# of every event name already firing today: the frontend-telemetry taxonomy
# (`TelemetryEventName`) plus the backend-only tool-run outcome event, which the
# server logs as `tool_run_completed` (the frontend's client-observed twin is
# `tool_run_succeeded`), plus the backend-only R10 operational events (#136).
ActivationEventName = TelemetryEventName | Literal["tool_run_completed"] | R10EventName


class ActivationEventCreate(BaseModel):
    """Allowlist gate for the single activation-event write seam (D-037).

    Mirrors the frontend telemetry ingestion discipline: `extra="forbid"` so any
    disallowed or free-text field (resume/JD/generated content, email, stack
    traces, raw log lines) is rejected exactly the way the ingestion endpoint
    already rejects unknown fields. Adds the two backend-computed operational
    metrics — `duration_ms` and `cost_estimate` — which no client reports, and
    the two low-cardinality R10 operational dimensions (`operational_dimension`,
    `operational_outcome`) that carry scaling-trigger evidence (#136, D-053).
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
    operational_dimension: OperationalDimension | None = None
    operational_outcome: OperationalOutcome | None = None
    occurred_at: datetime | None = None
