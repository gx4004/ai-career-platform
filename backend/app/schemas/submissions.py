from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.application_packets import PacketSubmissionHandoff

SubmissionStopReason = Literal[
    "challenge",
    "authentication_required",
    "uncertainty",
    "compatibility_mismatch",
    "source_validation_rejected",
]


class SubmissionRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    packet_approval_snapshot_id: str
    discovery_source_id: str
    authorization_grant_id: str
    idempotency_key: str
    snapshot_content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    contract_version: str
    contract_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    submitted_fields: dict[str, object]
    submitted_fields_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_confirmation_id: str
    submitted_at: datetime

    @field_validator("submitted_at")
    @classmethod
    def normalize_submitted_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class SubmissionDispatchClaimResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    idempotency_key: str
    packet_approval_snapshot_id: str
    discovery_source_id: str
    authorization_grant_id: str
    snapshot_content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    contract_version: str
    contract_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    submitted_fields: dict[str, object]
    submitted_fields_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize_created_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class SubmissionStopEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    packet_approval_snapshot_id: str
    discovery_source_id: str
    authorization_grant_id: str
    idempotency_key: str
    contract_version: str
    contract_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    reason: SubmissionStopReason
    source_code: str | None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize_created_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class SubmissionStoppedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["stopped"] = "stopped"
    stop_event_id: str
    packet_id: str
    packet_approval_snapshot_id: str
    discovery_source_id: str
    reason: SubmissionStopReason
    explanation: str
    handoff: PacketSubmissionHandoff
    automatic_retry_scheduled: Literal[False] = False

    @model_validator(mode="after")
    def handoff_has_official_destination(self):
        if self.handoff.destination_url is None:
            raise ValueError("stopped submission handoff requires an official destination")
        return self


class SubmissionRecordsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["submission-records-export/v1"] = "submission-records-export/v1"
    record_count: int = Field(ge=0)
    records: list[SubmissionRecordResponse]
    dispatch_claim_count: int = Field(ge=0)
    dispatch_claims: list[SubmissionDispatchClaimResponse]
    stop_count: int = Field(ge=0)
    stops: list[SubmissionStopEventResponse]

    @model_validator(mode="after")
    def count_matches(self):
        if self.record_count != len(self.records):
            raise ValueError("record_count must equal records length")
        if self.dispatch_claim_count != len(self.dispatch_claims):
            raise ValueError("dispatch_claim_count must equal dispatch_claims length")
        if self.stop_count != len(self.stops):
            raise ValueError("stop_count must equal stops length")
        return self
