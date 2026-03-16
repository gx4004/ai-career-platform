from pydantic import BaseModel, Field


class SavedRunMetadata(BaseModel):
    summary_headline: str | None = None
    primary_recommendation_title: str | None = None
    schema_version: str | None = None
    linked_context_ids: list[str] = Field(default_factory=list)
    next_step_tool: str | None = None


class WorkspaceSummary(BaseModel):
    id: str
    label: str | None = None
    is_pinned: bool = False
    linked_run_ids: list[str] = Field(default_factory=list)
    last_active_tool: str | None = None
    last_active_result_id: str | None = None
    updated_at: str


class ToolRunSummary(BaseModel):
    id: str
    tool_name: str
    label: str | None = None
    is_favorite: bool
    created_at: str
    saved: bool = True
    access_mode: str = "authenticated"
    locked_actions: list[str] = Field(default_factory=list)
    metadata: SavedRunMetadata = Field(default_factory=SavedRunMetadata)
    workspace: WorkspaceSummary | None = None

    model_config = {"from_attributes": True}


class ToolRunDetail(ToolRunSummary):
    result_payload: dict = {}


class ToolRunListResponse(BaseModel):
    items: list[ToolRunSummary]
    total: int
    page: int
    page_size: int
    has_more: bool


class WorkspaceListResponse(BaseModel):
    items: list[WorkspaceSummary]
    total: int


class DeletedResponse(BaseModel):
    deleted: int


class FavoriteRequest(BaseModel):
    is_favorite: bool


class WorkspaceUpdateRequest(BaseModel):
    label: str | None = None
    is_pinned: bool | None = None
