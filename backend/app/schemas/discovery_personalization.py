from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ReportReasonCategory = Literal[
    "not_relevant",
    "expired",
    "duplicate",
    "wrong_location",
    "low_quality",
    "other",
]
SourceFamily = Literal["licensed", "employer_ats", "public_career_page", "user_provided"]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


# ── Write payloads (owner-supplied) ──


class HiddenSourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str = Field(min_length=1, max_length=64)


class DismissalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str = Field(min_length=1, max_length=64)


class RecommendationReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str = Field(min_length=1, max_length=64)
    reason_category: ReportReasonCategory
    reason: str = Field(min_length=1, max_length=2_000)


# ── Owner-facing personalization state ──


class HiddenSourceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    source_id: str
    source_key: str
    display_name: str
    source_family: SourceFamily
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        return _as_utc(value)


class DismissalItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    listing_id: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        return _as_utc(value)


class DiscoveryPersonalizationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hidden_sources: list[HiddenSourceItem]
    dismissals: list[DismissalItem]


class RecommendationReportAck(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    listing_id: str
    reason_category: ReportReasonCategory
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        return _as_utc(value)


# ── Admin review (no profile content) ──


class AdminRecommendationReportItem(BaseModel):
    """A reported recommendation error for admin review.

    Deliberately omits ``user_id`` and every profile signal — the admin sees the
    product listing snapshot, the closed-set reason category, the user's own
    reason text, and when it was filed. Nothing here can reconstruct the reporter's
    Evidence Profile or search intent.
    """

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    listing_id: str
    listing_title: str
    listing_company: str
    source_family: SourceFamily
    reason_category: ReportReasonCategory
    reason: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        return _as_utc(value)


class AdminRecommendationReportList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[AdminRecommendationReportItem]


# ── Export (owner's own data, machine-readable) ──


class PersonalizationReportExport(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    listing_id: str
    listing_title: str
    listing_company: str
    source_family: SourceFamily
    reason_category: ReportReasonCategory
    reason: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        return _as_utc(value)


class PersonalizationExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hidden_sources: list[HiddenSourceItem]
    dismissals: list[DismissalItem]
    reports: list[PersonalizationReportExport]
