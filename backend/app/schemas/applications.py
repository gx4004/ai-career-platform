"""Request and response shapes for /api/v1/applications."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.application_preferences import MAX_PREPARE_PER_RUN
from app.schemas.tools import SharedResultEnvelope


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _require_timezone(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise ValueError("deadline must include a timezone offset")
    return value


class ApplicationStatus(StrEnum):
    SAVED = "saved"
    APPLIED = "applied"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class ListingResponse(BaseModel):
    title: str
    company: str
    description: str
    source_url: str | None = None
    apply_url: str | None = None
    retrieved_at: datetime


class NextTask(BaseModel):
    title: str
    deadline: datetime | None = None


class ApplicationCard(BaseModel):
    """One board card. Built from the Application row alone: no run payloads."""

    id: str
    label: str | None = None
    title: str | None = None
    company: str | None = None
    status: ApplicationStatus
    deadline: datetime | None = None
    applied_at: datetime | None = None
    match_score: int | None = None
    prepared: bool = False
    # Derived: prepared, every open question answered, still saved.
    ready: bool = False
    open_question_count: int = 0
    next_task: NextTask | None = None
    last_activity_at: datetime | None = None
    is_pinned: bool = False
    updated_at: datetime


class ApplicationList(BaseModel):
    items: list[ApplicationCard]
    total: int


class CvVariantReference(BaseModel):
    id: str
    document_id: str
    document_name: str
    name: str
    target_role: str | None = None
    created_at: datetime


class RunReference(BaseModel):
    id: str
    label: str | None = None
    parent_run_id: str | None = None
    created_at: datetime


class SelectedMaterials(BaseModel):
    cv_variant: CvVariantReference | None = None
    cover_letter: RunReference | None = None
    interview: RunReference | None = None


class AvailableMaterials(BaseModel):
    cv_variants: list[CvVariantReference] = Field(default_factory=list)
    cover_letters: list[RunReference] = Field(default_factory=list)
    interviews: list[RunReference] = Field(default_factory=list)


class DraftCoverLetter(BaseModel):
    body: str
    support: Literal["confirmed", "document", "unsupported"]
    evidence_item_ids: list[str] = Field(default_factory=list)


class DraftScreeningAnswer(BaseModel):
    question: str
    answer: str
    support: Literal["confirmed", "document"]
    evidence_item_ids: list[str] = Field(default_factory=list)


class ApplicationDrafts(BaseModel):
    run_id: str
    created_at: datetime
    cover_letter: DraftCoverLetter | None = None
    screening_answers: list[DraftScreeningAnswer] = Field(default_factory=list)


class OpenQuestion(BaseModel):
    key: str
    question: str
    category: str
    answered: bool = False


class EventResponse(BaseModel):
    id: str
    event_type: str
    details: dict
    provenance: Literal["user", "system"] = "user"
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize_created_at_to_utc(cls, value: datetime) -> datetime:
        return _as_utc(value)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    deadline: datetime | None = None
    completed: bool
    created_at: datetime


class SnapshotResponse(BaseModel):
    id: str
    content: dict
    content_sha256: str
    created_at: datetime


class ApplicationDetail(ApplicationCard):
    role: str | None = None
    listing: ListingResponse | None = None
    notes: str | None = None
    selected_materials: SelectedMaterials
    available_materials: AvailableMaterials
    drafts: ApplicationDrafts | None = None
    open_questions: list[OpenQuestion] = Field(default_factory=list)
    answers: dict[str, str] = Field(default_factory=dict)
    tasks: list[TaskResponse] = Field(default_factory=list)
    events: list[EventResponse] = Field(default_factory=list)
    snapshot: SnapshotResponse | None = None


class ApplicationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    status: ApplicationStatus | None = None
    deadline: datetime | None = None
    notes: str | None = Field(default=None, max_length=20_000)
    cv_variant_id: str | None = None
    cover_letter_run_id: str | None = None
    interview_run_id: str | None = None

    _deadline_tz = field_validator("deadline")(_require_timezone)

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status cannot be cleared")
        return self


class AnswersUpdate(BaseModel):
    """The owner's full set of typed answers; a blank answer removes it."""

    model_config = ConfigDict(extra="forbid")
    answers: dict[str, str] = Field(max_length=50)

    @field_validator("answers")
    @classmethod
    def bounded_answers(cls, value: dict[str, str]) -> dict[str, str]:
        if any(len(answer) > 5_000 for answer in value.values()):
            raise ValueError("answers must be at most 5000 characters")
        return value


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=240)
    deadline: datetime | None = None

    _deadline_tz = field_validator("deadline")(_require_timezone)


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    completed: bool


class ReviewFinding(BaseModel):
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


class ReviewResponse(SharedResultEnvelope):
    findings: list[ReviewFinding]


class ApplicationPreferencesBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    keywords: list[str] = Field(default_factory=list, max_length=20)
    locations: list[str] = Field(default_factory=list, max_length=20)
    remote: bool = False
    max_per_run: int = Field(default=5, ge=1, le=MAX_PREPARE_PER_RUN)

    @field_validator("keywords", "locations")
    @classmethod
    def clean_terms(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for term in value:
            term = term.strip()
            if len(term) > 100:
                raise ValueError("each term must be at most 100 characters")
            if term and term.casefold() not in {item.casefold() for item in cleaned}:
                cleaned.append(term)
        return cleaned


class ApplicationPreferencesResponse(ApplicationPreferencesBody):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    max_per_run_limit: int = MAX_PREPARE_PER_RUN
    is_default: bool = False


class ApplicationDetailsBody(BaseModel):
    """The owner's own contact details and standing answers, typed once (#374)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(default="", max_length=200)
    email: str = Field(default="", max_length=320)
    phone: str = Field(default="", max_length=50)
    linkedin: str = Field(default="", max_length=500)
    website: str = Field(default="", max_length=500)
    location: str = Field(default="", max_length=200)
    work_authorization: str = Field(default="", max_length=1000)
    visa_sponsorship: str = Field(default="", max_length=1000)
    notice_period: str = Field(default="", max_length=1000)
    salary_expectation: str = Field(default="", max_length=1000)
    relocation: str = Field(default="", max_length=1000)


class ApplicationDetailsResponse(ApplicationDetailsBody):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    # True until the owner saves once; name and email then come from the account.
    is_default: bool = False


class BulkPrepareResult(BaseModel):
    # ``prepared``: ran. ``no_preferences``: no keywords saved, nothing ran.
    # ``no_cv``: the owner has no CV yet, nothing ran.
    reason: Literal["prepared", "no_preferences", "no_cv"]
    prepared: list[ApplicationCard] = Field(default_factory=list)
    matched_count: int = 0
    skipped_existing_count: int = 0
    max_per_run: int


class AutofillReport(BaseModel):
    filled: list[str]
    skipped: list[str]
    url: str


class RunExport(BaseModel):
    id: str
    tool_name: str
    label: str | None = None
    parent_run_id: str | None = None
    result_payload: dict
    created_at: datetime


class EventExport(BaseModel):
    id: str
    event_type: str
    details: dict
    created_at: datetime


class ApplicationExportItem(BaseModel):
    id: str
    label: str | None = None
    is_pinned: bool
    company: str | None = None
    role: str | None = None
    status: ApplicationStatus | None = None
    deadline: datetime | None = None
    applied_at: datetime | None = None
    match_score: int | None = None
    notes: str | None = None
    open_questions: list[dict] = Field(default_factory=list)
    answers: dict[str, str] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    listing: ListingResponse | None = None
    listing_revisions: list[ListingResponse] = Field(default_factory=list)
    selected_cv_variant_id: str | None = None
    selected_cover_letter: RunExport | None = None
    selected_interview: RunExport | None = None
    drafts: RunExport | None = None
    tasks: list[TaskResponse] = Field(default_factory=list)
    snapshot: SnapshotResponse | None = None
    events: list[EventExport] = Field(default_factory=list)


class ApplicationsExport(BaseModel):
    application_count: int = Field(ge=0)
    applications: list[ApplicationExportItem]
    preferences: ApplicationPreferencesResponse | None = None
    details: ApplicationDetailsResponse | None = None

    @model_validator(mode="after")
    def application_count_matches(self):
        if self.application_count != len(self.applications):
            raise ValueError("application_count must equal the number of applications")
        return self
