from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

DiscoverySourceFamily = Literal["licensed", "employer_ats", "public_career_page", "user_provided"]
DiscoveryTermsStatus = Literal["pending", "accepted", "failed"]
DiscoveryAllowedBehavior = Literal[
    "api", "feed", "ats_integration", "public_page", "user_url", "paste"
]


class DiscoverySourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,99}$")
    display_name: str = Field(min_length=1, max_length=160)
    source_family: DiscoverySourceFamily
    owner: str = Field(min_length=1, max_length=160)
    allowed_behavior: DiscoveryAllowedBehavior
    rate_limit_per_minute: int = Field(ge=1, le=10_000)
    attribution_rule: str = Field(min_length=1, max_length=1_000)
    retention_days: int = Field(ge=1, le=3_650)


class DiscoverySourceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    owner: str | None = Field(default=None, min_length=1, max_length=160)
    terms_status: DiscoveryTermsStatus | None = None
    allowed_behavior: DiscoveryAllowedBehavior | None = None
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=10_000)
    attribution_rule: str | None = Field(default=None, min_length=1, max_length=1_000)
    retention_days: int | None = Field(default=None, ge=1, le=3_650)
    kill_switch: bool | None = None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one registry field must change")
        return self


class DiscoverySourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_key: str
    display_name: str
    source_family: DiscoverySourceFamily
    owner: str
    terms_status: DiscoveryTermsStatus
    terms_reviewed_at: datetime | None
    terms_reviewed_by: str | None
    allowed_behavior: DiscoveryAllowedBehavior
    rate_limit_per_minute: int
    attribution_rule: str
    retention_days: int
    kill_switch: bool
    ingestion_allowed: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("terms_reviewed_at", "created_at", "updated_at")
    @classmethod
    def require_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class DiscoverySourceListResponse(BaseModel):
    items: list[DiscoverySourceResponse] = Field(default_factory=list)
