from __future__ import annotations

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


class AdminScoringModeResponse(BaseModel):
    """Current state of the analytical scoring mode and the heuristic version in use.

    `mode` controls whether analytical tools (Resume, Job Match) call the LLM:
        - "blended"  -> heuristic prepass + Vertex AI Gemini call, blended 40/60
        - "heuristic" -> heuristic prepass only, no LLM call

    `heuristic_version` selects which heuristic implementation is active:
        - "v1" -> lightweight production prepass shipped with the original product
        - "v2" -> strong classical-IR baseline used in the comparative study
    """

    mode: Literal["blended", "heuristic"]
    heuristic_version: Literal["v1", "v2"]
    blended_weight_heuristic: float = 0.4
    blended_weight_llm: float = 0.6


class AdminScoringModeRequest(BaseModel):
    mode: Literal["blended", "heuristic"]


# Rebuild models that use forward references
AdminUserDetailResponse.model_rebuild()
AdminUserListResponse.model_rebuild()
