from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class AdminUserItem(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    is_active: bool = True
    is_admin: bool = False
    created_at: str | None = None
    run_count: int = 0

class AdminUserListResponse(BaseModel):
    items: list[AdminUserItem]
    total: int
    page: int
    page_size: int

class AdminUserDetailResponse(AdminUserItem):
    recent_runs: list[AdminRunItem] = []

class AdminRunItem(BaseModel):
    id: str
    user_id: str
    user_email: str | None = None
    tool_name: str
    label: str | None = None
    created_at: str | None = None
    has_parent: bool = False

class AdminRunListResponse(BaseModel):
    items: list[AdminRunItem]
    total: int
    page: int
    page_size: int

class AdminRunDetailResponse(AdminRunItem):
    result_payload: dict = {}
    feedback_text: str | None = None
    workspace_id: str | None = None

class AdminStatsResponse(BaseModel):
    total_users: int = 0
    total_runs: int = 0
    runs_today: int = 0
    active_users_7d: int = 0
    runs_by_tool: dict[str, int] = {}

class AdminSetAdminRequest(BaseModel):
    is_admin: bool


# ── R6 activation dashboard (issue #108, parent #103, D-039) ──
# Read-only aggregate view over the durable activation-event store. Plain
# counts/tables only — no charting library, no BI tool (D-039, ADR 0001).


class FunnelStepCount(BaseModel):
    """One of the six taxonomy steps, landing → revisit/export, with its count.

    ``step`` is the stable machine key; ``label`` is the human-readable name for
    the admin table. ``count`` is the number of matching activation events inside
    the requested window and access-mode filter.
    """

    step: str
    label: str
    count: int = 0


class FailureCategoryCount(BaseModel):
    """Failure events grouped by allowlisted failure category."""

    failure_category: str
    count: int = 0


class ToolLatencyCost(BaseModel):
    """Per-tool latency/cost aggregate over *completed* runs, using the
    backend-computed metrics from issue #106. Scoped to ``tool_run_completed``
    (not failed runs) so it stays consistent with the funnel's completion step;
    ``runs`` counts completed runs; cost fields are null when no completed run
    in scope recorded a cost estimate."""

    tool_id: str
    runs: int = 0
    avg_duration_ms: float | None = None
    total_cost_estimate: Decimal | None = None
    avg_cost_estimate: Decimal | None = None


class AdminActivationResponse(BaseModel):
    """Funnel / failure / cost aggregate for the admin activation dashboard."""

    window_start: str
    window_end: str
    access_mode: str | None = None
    funnel: list[FunnelStepCount] = []
    failures: list[FailureCategoryCount] = []
    tools: list[ToolLatencyCost] = []


# Rebuild models that use forward references
AdminUserDetailResponse.model_rebuild()
AdminUserListResponse.model_rebuild()
