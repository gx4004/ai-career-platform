from datetime import UTC, date, datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

DiscoverySourceFamily = Literal["licensed", "employer_ats", "public_career_page", "user_provided"]
DiscoveryTermsStatus = Literal["pending", "accepted", "failed"]
DiscoveryAllowedBehavior = Literal[
    "api", "feed", "ats_integration", "public_page", "user_url", "paste"
]
DiscoveryRobotsPolicy = Literal["required", "not_applicable"]
DiscoveryQueryParameter = Literal[
    "role",
    "location",
    "remote",
    "page",
    "cursor",
    "limit",
    "posted_after",
]


class DiscoverySourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,99}$")
    display_name: str = Field(min_length=1, max_length=160)
    source_family: DiscoverySourceFamily
    owner: str = Field(min_length=1, max_length=160)
    allowed_behavior: DiscoveryAllowedBehavior
    endpoint_url: str = Field(pattern=r"^https://", max_length=2_048)
    allowed_query_parameters: list[DiscoveryQueryParameter] = Field(
        default_factory=list, max_length=7
    )
    robots_policy: DiscoveryRobotsPolicy
    rate_limit_per_minute: int = Field(ge=1, le=10_000)
    attribution_rule: str = Field(min_length=1, max_length=1_000)
    retention_days: int = Field(ge=1, le=3_650)

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        return _validate_endpoint(value)

    @field_validator("allowed_query_parameters")
    @classmethod
    def unique_query_parameters(
        cls, value: list[DiscoveryQueryParameter]
    ) -> list[DiscoveryQueryParameter]:
        if len(value) != len(set(value)):
            raise ValueError("Allowed query parameters must be unique")
        return value


class DiscoverySourceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    owner: str | None = Field(default=None, min_length=1, max_length=160)
    terms_status: DiscoveryTermsStatus | None = None
    allowed_behavior: DiscoveryAllowedBehavior | None = None
    endpoint_url: str | None = Field(default=None, pattern=r"^https://", max_length=2_048)
    allowed_query_parameters: list[DiscoveryQueryParameter] | None = Field(
        default=None, max_length=7
    )
    robots_policy: DiscoveryRobotsPolicy | None = None
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=10_000)
    attribution_rule: str | None = Field(default=None, min_length=1, max_length=1_000)
    retention_days: int | None = Field(default=None, ge=1, le=3_650)
    kill_switch: bool | None = None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one registry field must change")
        return self

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint(cls, value: str | None) -> str | None:
        return _validate_endpoint(value) if value is not None else None

    @field_validator("allowed_query_parameters")
    @classmethod
    def unique_query_parameters(
        cls, value: list[DiscoveryQueryParameter] | None
    ) -> list[DiscoveryQueryParameter] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("Allowed query parameters must be unique")
        return value


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
    endpoint_url: str | None
    allowed_query_parameters: list[DiscoveryQueryParameter] | None
    robots_policy: DiscoveryRobotsPolicy | None
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


class LicensedSourceQuery(BaseModel):
    """Minimal outbound discovery query; profile/history/identity fields do not exist."""

    model_config = ConfigDict(extra="forbid")

    role: str | None = Field(default=None, min_length=1, max_length=120)
    location: str | None = Field(default=None, min_length=1, max_length=120)
    remote: bool | None = None
    page: int | None = Field(default=None, ge=1, le=10_000)
    cursor: str | None = Field(default=None, min_length=1, max_length=200)
    limit: int | None = Field(default=None, ge=1, le=100)
    posted_after: date | None = None


def _validate_endpoint(value: str) -> str:
    parsed = urlparse(value)
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Endpoint must be a credential-free HTTPS URL without query or fragment")
    return value
