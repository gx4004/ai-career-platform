from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SubmissionLegalTermsStatus = Literal["pending", "accepted", "failed"]
SubmissionContractStatus = Literal["missing", "verified", "broken"]
SubmissionFieldFormat = Literal[
    "utf8_text",
    "email",
    "phone_e164",
    "iso_date",
    "https_url",
    "pdf",
    "docx",
    "boolean",
    "integer",
    "decimal",
    "enum",
]
SubmissionErrorMeaning = Literal[
    "accepted",
    "validation_error",
    "authentication_required",
    "authorization_denied",
    "challenge",
    "rate_limited",
    "duplicate",
    "transient_failure",
]
SubmissionErrorHandling = Literal[
    "confirm_success",
    "stop_and_return",
    "retry_with_source_idempotency",
]


class SubmissionContractField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_field: str = Field(pattern=r"^[a-z][a-z0-9_]{0,99}$")
    packet_field: str = Field(pattern=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$", max_length=160)
    required: bool


class SubmissionContractFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_field: str = Field(pattern=r"^[a-z][a-z0-9_]{0,99}$")
    kind: SubmissionFieldFormat


class SubmissionContractError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_code: str = Field(pattern=r"^[a-zA-Z0-9_.-]{1,100}$")
    meaning: SubmissionErrorMeaning
    handling: SubmissionErrorHandling

    @model_validator(mode="after")
    def enforce_safe_handling(self):
        if self.meaning == "accepted" and self.handling != "confirm_success":
            raise ValueError("Accepted responses must confirm success")
        if self.meaning == "challenge" and self.handling != "stop_and_return":
            raise ValueError("Challenges must stop and return control to the user")
        if self.handling == "confirm_success" and self.meaning != "accepted":
            raise ValueError("Only an accepted response can confirm success")
        if (
            self.handling == "retry_with_source_idempotency"
            and self.meaning not in {"rate_limited", "transient_failure"}
        ):
            raise ValueError("Only bounded transient failures may be retryable")
        return self


class SubmissionCompatibilityContract(BaseModel):
    """Reviewed source contract used by local fixtures and future integrations."""

    model_config = ConfigDict(extra="forbid")

    version: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$")
    fields: list[SubmissionContractField] = Field(min_length=1, max_length=100)
    formats: list[SubmissionContractFormat] = Field(min_length=1, max_length=100)
    error_semantics: list[SubmissionContractError] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def require_complete_unique_contract(self):
        field_names = [item.source_field for item in self.fields]
        if len(field_names) != len(set(field_names)):
            raise ValueError("Contract source fields must be unique")
        format_names = [item.source_field for item in self.formats]
        if len(format_names) != len(set(format_names)):
            raise ValueError("Contract formats must be unique by source field")
        if set(format_names) != set(field_names):
            raise ValueError("Every contract field must have exactly one format")
        error_codes = [item.source_code for item in self.error_semantics]
        if len(error_codes) != len(set(error_codes)):
            raise ValueError("Contract error codes must be unique")
        if not any(item.meaning == "accepted" for item in self.error_semantics):
            raise ValueError("Contract error semantics must document accepted responses")
        return self


class SubmissionLegalTermsReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: SubmissionLegalTermsStatus


class SubmissionSourceGovernanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    legal_terms_status: SubmissionLegalTermsStatus
    legal_terms_reviewed_at: datetime | None
    legal_terms_reviewed_by: str | None
    contract_status: SubmissionContractStatus
    contract_version: str | None
    contract_fields: list[SubmissionContractField] | None
    contract_formats: list[SubmissionContractFormat] | None
    contract_error_semantics: list[SubmissionContractError] | None
    contract_reviewed_at: datetime | None
    contract_reviewed_by: str | None
    promoted: bool
    promoted_at: datetime | None
    promoted_by: str | None
    kill_switch: bool
    submission_allowed: bool
    created_at: datetime
    updated_at: datetime

    @field_validator(
        "legal_terms_reviewed_at",
        "contract_reviewed_at",
        "promoted_at",
        "created_at",
        "updated_at",
    )
    @classmethod
    def require_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value

    @model_validator(mode="after")
    def enforce_governance_record_shape(self):
        review_values = (
            self.legal_terms_reviewed_at,
            self.legal_terms_reviewed_by,
        )
        if self.legal_terms_status == "pending":
            if any(value is not None for value in review_values):
                raise ValueError("Pending legal/terms review cannot have reviewer metadata")
        elif any(value is None for value in review_values):
            raise ValueError("Completed legal/terms review requires reviewer metadata")

        contract_values = (
            self.contract_version,
            self.contract_fields,
            self.contract_formats,
            self.contract_error_semantics,
            self.contract_reviewed_at,
            self.contract_reviewed_by,
        )
        if self.contract_status == "missing":
            if any(value is not None for value in contract_values):
                raise ValueError("Missing contract cannot have contract metadata")
        else:
            if any(value is None for value in contract_values):
                raise ValueError("Documented contract requires complete contract metadata")
            SubmissionCompatibilityContract(
                version=self.contract_version,
                fields=self.contract_fields,
                formats=self.contract_formats,
                error_semantics=self.contract_error_semantics,
            )

        promotion_values = (self.promoted_at, self.promoted_by)
        if self.promoted:
            if (
                any(value is None for value in promotion_values)
                or self.legal_terms_status != "accepted"
                or self.contract_status != "verified"
            ):
                raise ValueError(
                    "Promoted source requires approval, verified contract, and provenance"
                )
        elif any(value is not None for value in promotion_values):
            raise ValueError("Unpromoted source cannot have promotion provenance")
        if self.submission_allowed and (
            not self.promoted
            or self.legal_terms_status != "accepted"
            or self.contract_status != "verified"
            or self.kill_switch
        ):
            raise ValueError("Allowed submission source must satisfy every local gate")
        return self
