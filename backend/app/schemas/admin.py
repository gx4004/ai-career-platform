from __future__ import annotations

from decimal import Decimal
from typing import Literal

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


# ── R8 eval runs section (issue #124, parent #118, D-045) ──
# Read-only view over the latest versioned JSON eval report per tool, read from
# disk (`app/evals/reports/`) — never from `analytics_events` (D-045). Mirrors
# the `ToolReport` shape written by `app/evals/run_eval.py`. Plain tables only,
# no charting library (D-039).


class EvalRunItem(BaseModel):
    """Latest eval report for one tool, or the "no eval run yet" state.

    When ``has_report`` is ``False`` no report file exists yet for the tool and
    every metric field is ``None``; the admin UI renders an explicit "no eval
    run yet" state rather than an error or blank space. When ``True`` the fields
    mirror the on-disk ``ToolReport`` (see ``app/evals/run_eval.py``): Resume /
    Job Match carry ``calibration_miss_rate``; the four generative tools carry
    ``fabrication_candidate_count`` and ``usefulness_score``.
    """

    tool_id: str
    has_report: bool = False
    report_schema_version: str | None = None
    prompt_version: str | None = None
    judge_prompt_version: str | None = None
    generated_at: str | None = None
    mode: str | None = None
    fixtures_evaluated: int | None = None
    calibration_miss_rate: float | None = None
    fabrication_candidate_count: int | None = None
    usefulness_score: float | None = None


class AdminEvalRunsResponse(BaseModel):
    """Latest eval report per tool (all six, canonical tool-order) for the
    admin dashboard's read-only Eval Runs section. Sourced from disk, not
    ``analytics_events`` (D-045)."""

    tools: list[EvalRunItem] = []


# ── R11 profile-adoption view (issue #150, parent #143, D-067) ──
# Read-only aggregate over the same first-party analytics store, answering "is
# the Evidence Profile being adopted and trusted?". Plain counts/tables only —
# no charting library, no BI tool (D-039, ADR 0001). Every count is derived from
# allowlisted low-cardinality profile events; no evidence content is reachable.


class ProfileKindCount(BaseModel):
    """Count of created evidence items grouped by their typed kind."""

    kind: str
    count: int = 0


class ProfileProvenanceCount(BaseModel):
    """Count of created evidence items grouped by their provenance class."""

    provenance: str
    count: int = 0


class ProfileTransitionCount(BaseModel):
    """Count of explicit trust decisions grouped by the resulting confirmation
    state (``confirmed`` / ``rejected``) — the profile's trust signal."""

    transition: str
    count: int = 0


class AdminProfileAdoptionResponse(BaseModel):
    """Profile adoption/trust aggregate for the admin profile-adoption view.

    ``total_created`` / ``total_deleted`` are the bounded lifecycle totals in the
    window; ``created_by_kind`` and ``created_by_provenance`` describe adoption
    breadth; ``confirmation_transitions`` describes trust (confirmed vs rejected).
    """

    window_start: str
    window_end: str
    total_created: int = 0
    total_deleted: int = 0
    created_by_kind: list[ProfileKindCount] = []
    created_by_provenance: list[ProfileProvenanceCount] = []
    confirmation_transitions: list[ProfileTransitionCount] = []


# ── R10 scaling-trigger scorecard (issue #136, parent #135, D-052/D-053) ──
# Read-only aggregate over the same first-party operational store. Never enables
# a response: a crossed threshold sets `review_required` and links the deferred
# response ticket. Plain tables only — no charting library, no BI tool (D-039).


# fired: threshold met on a sufficient, sustained sample. not_fired: sufficient
# evidence shows the threshold is not met (includes a transient breach that did
# not sustain — a reset false positive). insufficient_sample: not enough fresh
# evidence, or the sub-signal is not yet instrumented, to decide.
TriggerState = Literal["fired", "not_fired", "insufficient_sample"]


class ScorecardTrigger(BaseModel):
    """One R10 scaling trigger with its predeclared plan and current evidence."""

    id: str
    label: str
    threshold: str
    observation_window: str
    minimum_sample: str
    evidence: str
    evidence_detail: dict[str, float | int | str] = {}
    evidence_fresh: bool = False
    last_evidence_at: str | None = None
    state: TriggerState = "insufficient_sample"
    # True only when `state == "fired"`. Signals the operator to *review* the
    # linked response; the scorecard never enables the response itself.
    review_required: bool = False
    response_ticket: int
    response_ticket_title: str
    owner: str
    rollback: str
    exit_criteria: str


class AdminScorecardResponse(BaseModel):
    """The full R10 operational scaling-trigger scorecard (read-only)."""

    generated_at: str
    window_start: str
    window_end: str
    replica_class: str
    triggers: list[ScorecardTrigger] = []


# ── R14 per-source health & kill switch (issue #177, parent #170, D-053/D-090) ──
# Read-only aggregate over the same first-party operational path — no new vendor.
# Every figure is a bounded per-source-family aggregate; no listing content, full
# URL, source key/name, or user identifier is reachable from this view.


class SourceFamilyHealth(BaseModel):
    """Operational health for one source family (aggregate dimensions only, D-053).

    Registry-posture counts (``source_count`` .. ``pending_terms_count``) and
    listings-store stock (``listing_count``, ``stale_count``, and the oldest /
    newest retrieval timestamps) are current-state figures; the flow counts
    (``fetch_*``, ``ingested`` / ``deduplicated``, ``expired``) are windowed
    allowlisted operational events. The retrieval timestamps are the store's own
    retrieval dates, never a user timestamp.
    """

    source_family: str
    source_count: int = 0
    active_count: int = 0
    killed_count: int = 0
    pending_terms_count: int = 0
    listing_count: int = 0
    stale_count: int = 0
    oldest_retrieved_at: str | None = None
    newest_retrieved_at: str | None = None
    fetch_success: int = 0
    fetch_failure: int = 0
    fetch_blocked: int = 0
    ingested: int = 0
    deduplicated: int = 0
    expired: int = 0


class AdminSourceHealthResponse(BaseModel):
    """Per-source-family operational health for the admin Source Health view."""

    window_start: str
    window_end: str
    staleness_threshold_days: int
    families: list[SourceFamilyHealth] = []


# Rebuild models that use forward references
AdminUserDetailResponse.model_rebuild()
AdminUserListResponse.model_rebuild()
