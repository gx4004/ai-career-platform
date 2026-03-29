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


# Rebuild models that use forward references
AdminUserDetailResponse.model_rebuild()
AdminUserListResponse.model_rebuild()
