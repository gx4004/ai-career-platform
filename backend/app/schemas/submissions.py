from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class SubmissionRecordsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["submission-records-export/v1"] = (
        "submission-records-export/v1"
    )
    record_count: int = Field(ge=0)
    records: list[SubmissionRecordResponse]
    dispatch_claim_count: int = Field(ge=0)
    dispatch_claims: list[SubmissionDispatchClaimResponse]

    @model_validator(mode="after")
    def count_matches(self):
        if self.record_count != len(self.records):
            raise ValueError("record_count must equal records length")
        if self.dispatch_claim_count != len(self.dispatch_claims):
            raise ValueError("dispatch_claim_count must equal dispatch_claims length")
        return self
