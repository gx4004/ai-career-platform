from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

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
    endpoint_url: str = Field(pattern=r"^https://", max_length=2_048)
    rate_limit_per_minute: int = Field(ge=1, le=10_000)
    attribution_rule: str = Field(min_length=1, max_length=1_000)
    retention_days: int = Field(ge=1, le=3_650)

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        return _validate_endpoint(value)


class DiscoverySourceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    owner: str | None = Field(default=None, min_length=1, max_length=160)
    terms_status: DiscoveryTermsStatus | None = None
    allowed_behavior: DiscoveryAllowedBehavior | None = None
    endpoint_url: str | None = Field(default=None, pattern=r"^https://", max_length=2_048)
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
    rate_limit_per_minute: int
    attribution_rule: str
    retention_days: int
    kill_switch: bool
    ingestion_allowed: bool
    last_fetched_at: datetime | None = None
    last_outcome: str | None = None
    listing_count: int | None = None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def failure_reason(self) -> str | None:
        """The last run's failure in words an operator can act on; null when it worked."""
        return describe_failure(self.last_outcome)

    @field_validator("terms_reviewed_at", "last_fetched_at", "created_at", "updated_at")
    @classmethod
    def require_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class DiscoverySourceListResponse(BaseModel):
    items: list[DiscoverySourceResponse] = Field(default_factory=list)


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


_HTTP_STATUS_REASONS = {
    401: "The board refused the request (HTTP 401): it is not public.",
    403: "The board refused the request (HTTP 403): it is not public or blocks this client.",
    404: "The board was not found (HTTP 404): check the board name in the endpoint URL.",
    410: "The board no longer exists (HTTP 410): check the board name in the endpoint URL.",
    429: "The board is rate limiting requests (HTTP 429): try again later.",
}
_ERROR_REASONS = {
    "ConnectError": "The board could not be reached: the connection failed.",
    "ConnectTimeout": "The board could not be reached: the connection timed out.",
    "ReadTimeout": "The board took too long to answer.",
    "TimeoutException": "The board took too long to answer.",
    "HTTPError": "The board's answer could not be used (wrong content type or too large).",
    "SourceNotAllowedError": "The source is not allowed to fetch: terms not accepted or kill switch on.",
    "ATSIngestionRefused": "The endpoint is not a supported Greenhouse, Lever or Ashby board URL.",
}


def describe_failure(last_outcome: str | None) -> str | None:
    """Turn a stored run outcome (``failed: HTTPStatusError 404``) into a sentence."""
    if not last_outcome or not last_outcome.startswith("failed"):
        return None
    detail = last_outcome.partition(":")[2].strip()
    error, _, code = detail.partition(" ")
    if error == "HTTPStatusError":
        if code.isdigit():
            status = int(code)
            if status in _HTTP_STATUS_REASONS:
                return _HTTP_STATUS_REASONS[status]
            if status >= 500:
                return f"The board's server failed (HTTP {status}): try again later."
            return f"The board answered HTTP {status}."
        return "The board answered with an HTTP error."
    return _ERROR_REASONS.get(error, f"The fetch failed ({error or 'unknown error'}).")
