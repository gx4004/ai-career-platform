from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.discovery_sources import DiscoverySourceFamily

SubmissionAuthorizationMechanism = Literal[
    "oauth2_authorization_code",
    "oauth2_device_authorization",
]
SubmissionAuthorizationScope = Literal["submit_applications"]


class VerifiedSourceAuthorization(BaseModel):
    """Bounded callback result accepted from a future trusted source adapter.

    This is intentionally not an HTTP request contract. It records only which
    source-provided OAuth flow completed and that the user consented. Extra fields
    are forbidden so passwords, cookies, access/refresh tokens, provider account
    identifiers, and arbitrary callback content cannot enter this persistence seam.
    """

    model_config = ConfigDict(extra="forbid")

    mechanism: SubmissionAuthorizationMechanism
    scope: SubmissionAuthorizationScope
    user_consent_confirmed: Literal[True]


class SubmissionAuthorizationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source_id: str
    source_key: str
    source_display_name: str
    source_family: DiscoverySourceFamily
    mechanism: SubmissionAuthorizationMechanism
    scope: SubmissionAuthorizationScope
    granted_at: datetime

    @field_validator("granted_at")
    @classmethod
    def require_offset(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class SubmissionAuthorizationListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[SubmissionAuthorizationResponse]


class SubmissionAuthorizationsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["submission-authorizations-export/v1"] = (
        "submission-authorizations-export/v1"
    )
    grant_count: int = Field(ge=0)
    grants: list[SubmissionAuthorizationResponse]

    @model_validator(mode="after")
    def grant_count_matches(self):
        if self.grant_count != len(self.grants):
            raise ValueError("grant_count must equal the number of exported grants")
        return self
