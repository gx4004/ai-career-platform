from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.applications import ApplicationStatus, ListingResponse


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
    company: str | None = None
    role: str | None = None
    status: ApplicationStatus | None = None
    deadline: datetime | None = None
    listing: ListingResponse | None = None
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
    # Mirror the frontend Zod enum (schemas.ts `toolRunSummarySchema.access_mode`)
    # and the sibling SharedResultEnvelope (tools.py). A plain `str` here is wider
    # than the frontend accepts, so a third value on a history response would
    # break the frontend parse; the Literal makes the contract exact.
    access_mode: Literal["authenticated", "guest_demo"] = "authenticated"
    locked_actions: list[str] = Field(default_factory=list)
    metadata: SavedRunMetadata = Field(default_factory=SavedRunMetadata)
    workspace: WorkspaceSummary | None = None
    # The run this one re-generates, so list rows can tell revisions apart.
    parent_run_id: str | None = None

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


class RunUpdateRequest(BaseModel):
    """A run is renamed, never un-named: the label is required and non-blank."""

    label: str = Field(max_length=200)

    @field_validator("label")
    @classmethod
    def label_is_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A run needs a name")
        return value


class WorkspaceUpdateRequest(BaseModel):
    """Label and pin only; application fields are edited through /applications."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, max_length=200)
    is_pinned: bool | None = None

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one workspace field is required")
        return self
