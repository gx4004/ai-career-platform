from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SubmissionSafetyBlockReason = Literal[
    "user_paused",
    "global_kill_switch",
    "policy_missing",
    "incident_rehearsal_missing",
    "user_rate_limit",
    "user_volume_limit",
    "source_rate_limit",
    "source_volume_limit",
    "anomaly_detected",
]


class SubmissionSafetyPolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_rate_limit_per_minute: int = Field(ge=1, le=60)
    user_daily_volume_limit: int = Field(ge=1, le=1000)
    source_rate_limit_per_minute: int = Field(ge=1, le=1000)
    source_daily_volume_limit: int = Field(ge=1, le=100000)
    anomaly_user_attempts_per_hour: int = Field(ge=1, le=1000)

    @model_validator(mode="after")
    def anomaly_precedes_daily_limit(self):
        if self.anomaly_user_attempts_per_hour > self.user_daily_volume_limit:
            raise ValueError("anomaly threshold cannot exceed the user daily volume limit")
        return self


class SubmissionIncidentRehearsalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    playbook_version: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$")


class SubmissionSafetyPolicyResponse(SubmissionSafetyPolicyConfig):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    discovery_source_id: str
    configured_at: datetime
    updated_at: datetime

    @field_validator("configured_at", "updated_at")
    @classmethod
    def require_offset(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class SubmissionSafetyControlResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    global_kill_switch: bool
    incident_playbook_version: str | None
    incident_rehearsed_at: datetime | None
    updated_at: datetime

    @field_validator("incident_rehearsed_at", "updated_at")
    @classmethod
    def require_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class AdminSubmissionSafetyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    control: SubmissionSafetyControlResponse
    policies: list[SubmissionSafetyPolicyResponse]


class SubmissionSafetyStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allowed: bool
    reason: SubmissionSafetyBlockReason | None
    user_rate_used: int = Field(ge=0)
    user_rate_limit: int | None = Field(default=None, ge=1)
    user_daily_used: int = Field(ge=0)
    user_daily_limit: int | None = Field(default=None, ge=1)
    source_rate_used: int = Field(ge=0)
    source_rate_limit: int | None = Field(default=None, ge=1)
    source_daily_used: int = Field(ge=0)
    source_daily_limit: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def allowed_has_no_reason(self):
        if self.allowed != (self.reason is None):
            raise ValueError("allowed and reason must describe the same safety state")
        return self


class OwnerSubmissionSafetyStatus(BaseModel):
    """Owner-safe status without shared-source activity totals."""

    model_config = ConfigDict(extra="forbid")

    allowed: bool
    reason: SubmissionSafetyBlockReason | None
    user_rate_used: int = Field(ge=0)
    user_rate_limit: int | None = Field(default=None, ge=1)
    user_daily_used: int = Field(ge=0)
    user_daily_limit: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def allowed_has_no_reason(self):
        if self.allowed != (self.reason is None):
            raise ValueError("allowed and reason must describe the same safety state")
        return self
