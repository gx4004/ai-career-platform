"""Request and response shapes for /api/v1/applications."""

from __future__ import annotations

import re
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
    NO_REPLY = "no_reply"
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
    status_changed_at: datetime | None = None
    # Derived: still Applied 21 days on. Only ever a prompt; never changes status.
    no_reply_suggested: bool = False
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


class InsightSegment(BaseModel):
    label: str
    applied: int = Field(ge=0)
    replied: int = Field(ge=0)
    # Percent, or None until the segment has enough applications to mean anything.
    reply_rate: int | None = Field(default=None, ge=0, le=100)
    enough_data: bool


class InsightsDimension(BaseModel):
    key: Literal["source", "company", "role_family", "work_mode", "skills_fit"]
    title: str
    segments: list[InsightSegment]
    hidden_count: int = Field(default=0, ge=0)


class InsightsSummary(BaseModel):
    applied: int = Field(ge=0)
    replied: int = Field(ge=0)
    reply_rate: int | None = Field(default=None, ge=0, le=100)


class WhatsWorking(BaseModel):
    """Reply rate overall and per segment. Signals stay separate, each with its n."""

    overall: InsightsSummary
    min_segment_size: int
    dimensions: list[InsightsDimension]


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
    # Autopilot is on and the form is a Greenhouse, Lever or Ashby page it may open.
    autofill_supported: bool = False


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


_URL_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)
# ``host:port[/path]`` only for a dotted host or localhost, so a script scheme
# such as ``javascript:1/alert(1)`` can never pass as a port.
_HOST_WITH_PORT = re.compile(
    r"(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?(?:/\S*)?|localhost(?::\d+)?(?:/\S*)?",
    re.IGNORECASE,
)
_EMAIL_SHAPE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _plain_link(value: str) -> str:
    """Empty, a bare ``linkedin.com/in/me``, or http(s); never javascript:/data:/ftp:."""
    if not value:
        return value
    if any(ch.isspace() or ord(ch) < 32 for ch in value):
        raise ValueError("must be a web address without spaces")
    if _URL_SCHEME.match(value) and not _HOST_WITH_PORT.fullmatch(value):
        if not re.match(r"^https?://\S+$", value, re.IGNORECASE):
            raise ValueError("must be an http or https address")
    return value


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

    @field_validator("email")
    @classmethod
    def _email_shape(cls, value: str) -> str:
        if value and not _EMAIL_SHAPE.match(value):
            raise ValueError("must be an email address")
        return value

    @field_validator("linkedin", "website")
    @classmethod
    def _links_are_plain(cls, value: str) -> str:
        return _plain_link(value)


class ApplicationDetailsResponse(ApplicationDetailsBody):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    # Stored rows predate the request checks; reading and exporting them must
    # never fail, so the response only validates what it is given on the way in.
    @field_validator("email")
    @classmethod
    def _email_shape(cls, value: str) -> str:
        return value

    @field_validator("linkedin", "website")
    @classmethod
    def _links_are_plain(cls, value: str) -> str:
        return value

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
    skipped: list[str]  # left for the owner, highlighted in the form
    mismatched: list[str] = Field(default_factory=list)  # written, but did not stick
    url: str


class AutofillRunStatus(BaseModel):
    """Where a background Autopilot run stands. ``idle`` means none for this application."""

    state: Literal["idle", "running", "review", "failed", "closed"]
    kind: str | None = None  # why it failed or closed, e.g. job_closed, form_not_found
    message: str | None = None
    next_step: str | None = None
    seconds_left: int | None = None  # of the review window, while state is review
    report: AutofillReport | None = None


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
