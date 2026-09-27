from __future__ import annotations

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


# ── R14 per-source health & kill switch (issue #177, parent #170, D-053/D-090) ──
# Read-only current-state aggregate. Every figure is a bounded per-source-family
# aggregate; no listing content, full URL, source key/name, or user identifier is
# reachable from this view.


class SourceFamilyHealth(BaseModel):
    """Operational health for one source family (aggregate dimensions only, D-053).

    Registry-posture counts (``source_count`` .. ``pending_terms_count``) and
    listings-store stock (``listing_count``, ``stale_count``, and the oldest /
    newest retrieval timestamps) are current-state figures. The retrieval
    timestamps are the store's own retrieval dates, never a user timestamp.
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


class AdminSourceHealthResponse(BaseModel):
    """Per-source-family operational health for the admin Source Health view."""

    staleness_threshold_days: int
    families: list[SourceFamilyHealth] = []


# Rebuild models that use forward references
AdminUserDetailResponse.model_rebuild()
AdminUserListResponse.model_rebuild()
