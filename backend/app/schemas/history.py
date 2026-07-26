from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.tools import SharedResultEnvelope


class CampaignStatus(StrEnum):
    PLANNING = "planning"
    PREPARING = "preparing"
    APPLIED = "applied"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class SavedRunMetadata(BaseModel):
    summary_headline: str | None = None
    primary_recommendation_title: str | None = None
    schema_version: str | None = None
    linked_context_ids: list[str] = Field(default_factory=list)
    next_step_tool: str | None = None


class CampaignListingResponse(BaseModel):
    title: str
    company: str
    description: str
    source_url: str | None = None
    retrieved_at: datetime


class WorkspaceSummary(BaseModel):
    id: str
    label: str | None = None
    is_pinned: bool = False
    company: str | None = None
    role: str | None = None
    status: CampaignStatus | None = None
    deadline: datetime | None = None
    listing: CampaignListingResponse | None = None
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

    model_config = {"from_attributes": True}


class ToolRunDetail(ToolRunSummary):
    parent_run_id: str | None = None
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


class CampaignCvVariantReference(BaseModel):
    id: str
    document_id: str
    document_name: str
    name: str
    target_role: str | None = None
    created_at: datetime


class CampaignRunReference(BaseModel):
    id: str
    label: str | None = None
    parent_run_id: str | None = None
    created_at: datetime


class CampaignSelectedMaterials(BaseModel):
    cv_variant: CampaignCvVariantReference | None = None
    cover_letter: CampaignRunReference | None = None
    interview: CampaignRunReference | None = None


class CampaignAvailableMaterials(BaseModel):
    cv_variants: list[CampaignCvVariantReference] = Field(default_factory=list)
    cover_letters: list[CampaignRunReference] = Field(default_factory=list)
    interviews: list[CampaignRunReference] = Field(default_factory=list)


class CampaignEventResponse(BaseModel):
    id: str
    event_type: str
    details: dict
    provenance: Literal["user", "system"] = "user"
    created_at: datetime


class CampaignTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    deadline: datetime | None = None
    completed: bool
    created_at: datetime


class CampaignNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    text: str
    created_at: datetime


class CampaignContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    role: str | None = None
    channel: str | None = None
    created_at: datetime


class CampaignSubmissionSnapshotResponse(BaseModel):
    id: str
    content: dict
    content_sha256: str
    created_at: datetime


class CampaignDetailResponse(WorkspaceSummary):
    selected_materials: CampaignSelectedMaterials
    available_materials: CampaignAvailableMaterials
    events: list[CampaignEventResponse] = Field(default_factory=list)
    tasks: list[CampaignTaskResponse] = Field(default_factory=list)
    notes: list[CampaignNoteResponse] = Field(default_factory=list)
    contacts: list[CampaignContactResponse] = Field(default_factory=list)
    submission_snapshots: list[CampaignSubmissionSnapshotResponse] = Field(default_factory=list)


class CampaignReminderConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class CampaignReminderItem(BaseModel):
    kind: Literal["campaign_deadline", "task_deadline"]
    task_id: str | None = None
    label: str
    deadline: datetime


class CampaignReminderResponse(BaseModel):
    enabled: bool
    items: list[CampaignReminderItem] = Field(default_factory=list)
    next_surface_at: datetime | None = None


class CampaignReviewFinding(BaseModel):
    id: str
    category: Literal[
        "unsupported_claim",
        "missed_requirement",
        "contradiction",
        "generic_language",
        "repetition",
        "document_defect",
    ]
    severity: Literal["high", "medium", "low"]
    message: str
    locations: list[str]
    trace: list[str]


class CampaignReviewResponse(SharedResultEnvelope):
    findings: list[CampaignReviewFinding]


class CampaignTaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=240)
    deadline: datetime | None = None

    @field_validator("deadline")
    @classmethod
    def task_deadline_requires_timezone(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("deadline must include a timezone offset")
        return value


class CampaignTaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    completed: bool


class CampaignNoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=5000)


class CampaignContactCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    channel: str | None = Field(default=None, max_length=200)


class CampaignMaterialSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cv_variant_id: str | None = None
    cover_letter_run_id: str | None = None
    interview_run_id: str | None = None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one material selection is required")
        return self


class DeletedResponse(BaseModel):
    deleted: int


class FavoriteRequest(BaseModel):
    is_favorite: bool


class RunUpdateRequest(BaseModel):
    label: str | None = Field(default=None, max_length=200)


class WorkspaceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, max_length=200)
    is_pinned: bool | None = None
    company: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    status: CampaignStatus | None = None
    deadline: datetime | None = None

    @field_validator("deadline")
    @classmethod
    def deadline_requires_timezone(cls, value: datetime | None):
        if value is not None and value.tzinfo is None:
            raise ValueError("deadline must include a timezone offset")
        return value

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one workspace field is required")
        return self


class CampaignRunExport(BaseModel):
    id: str
    label: str | None = None
    parent_run_id: str | None = None
    result_payload: dict
    created_at: datetime


class CampaignCoverLetterExport(CampaignRunExport):
    tool_name: Literal["cover-letter"]


class CampaignInterviewExport(CampaignRunExport):
    tool_name: Literal["interview"]


class CampaignExportItem(BaseModel):
    id: str
    label: str | None = None
    is_pinned: bool
    company: str | None = None
    role: str | None = None
    status: CampaignStatus | None = None
    deadline: datetime | None = None
    reminders_enabled: bool = False
    created_at: datetime
    updated_at: datetime
    events: list[CampaignEventExport] = Field(default_factory=list)
    listing: CampaignListingResponse | None = None
    listing_revisions: list[CampaignListingResponse] = Field(default_factory=list)
    selected_cv_variant_id: str | None = None
    selected_cover_letter_run_id: str | None = None
    selected_interview_run_id: str | None = None
    selected_cover_letter: CampaignCoverLetterExport | None = None
    selected_interview: CampaignInterviewExport | None = None
    tasks: list[CampaignTaskResponse] = Field(default_factory=list)
    notes: list[CampaignNoteResponse] = Field(default_factory=list)
    contacts: list[CampaignContactResponse] = Field(default_factory=list)
    submission_snapshots: list[CampaignSubmissionSnapshotResponse] = Field(default_factory=list)


class CampaignEventExport(BaseModel):
    id: str
    event_type: Literal[
        "status_changed",
        "deadline_changed",
        "listing_attached",
        "listing_adopted",
        "material_selection_changed",
        "task_created",
        "task_completed",
        "task_reopened",
        "task_deleted",
        "note_added",
        "note_deleted",
        "contact_added",
        "contact_deleted",
        "submission_snapshot_created",
        "packet_approved",
    ]
    details: dict
    created_at: datetime


class CampaignsExport(BaseModel):
    campaign_count: int = Field(ge=0)
    campaigns: list[CampaignExportItem]

    @model_validator(mode="after")
    def campaign_count_matches(self):
        if self.campaign_count != len(self.campaigns):
            raise ValueError("campaign_count must equal the number of campaigns")
        return self
