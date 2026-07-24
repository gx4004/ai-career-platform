"""R17 development-item schemas (#199, D-112).

A development item is the user's own bounded to-do derived from one classified
gap (#198): it references the gap, records the single honest response for that
gap kind, tracks a planned/in-progress/completed state, and carries an optional
target date and notes. Bounded by design (D-112): no boards, dependencies, or
generic project-management features.

The gap-kind -> response-kind mapping is the single honest response per kind
(D-110); it lives here as the one source of truth and R17 #200 reuses it to
build its richer response offer.
"""

from datetime import UTC, date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.gap_classification import GapKind

DevelopmentResponseKind = Literal[
    "reword",  # presentation_weakness
    "capture_evidence",  # uncaptured_evidence
    "produce_evidence",  # evidence_not_yet_produced
    "learn_skill",  # missing_skill
]
DevelopmentState = Literal["planned", "in_progress", "completed"]

#: The single truthful response per gap kind (D-110). A substance gap never maps
#: to ``reword``. R17 #200 imports this rather than redefining it.
RESPONSE_FOR_GAP: dict[str, DevelopmentResponseKind] = {
    "presentation_weakness": "reword",
    "uncaptured_evidence": "capture_evidence",
    "evidence_not_yet_produced": "produce_evidence",
    "missing_skill": "learn_skill",
}


class DevelopmentItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gap_classification_id: str
    target_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class DevelopmentItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: DevelopmentState | None = None
    target_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def require_change(self):
        # Explicitly-provided fields only; sending target_date/notes as null is a
        # real change (clear the field), so key off which fields were set.
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        # `state` has no "clear" semantics — it is a required NOT NULL enum. An
        # explicit null must be rejected here as a 422, never applied (which would
        # violate the column constraint and surface as a 500).
        if "state" in self.model_fields_set and self.state is None:
            raise ValueError("state cannot be null")
        return self


class DevelopmentEvidenceProposalResponse(BaseModel):
    """The exact claim a completed item asks its owner to review (D-113).

    Keeping the identifier, content, and trust state together makes the
    nullable-link invariant explicit in both API contracts: either there is one
    complete, inspectable proposal or there is none.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    content: dict[str, Any]
    confirmation_state: Literal["unconfirmed", "confirmed"]


class DevelopmentItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    gap_classification_id: str | None
    gap_kind: GapKind
    response_kind: DevelopmentResponseKind
    state: DevelopmentState
    target_date: date | None
    notes: str | None
    source_finding_id: str | None
    timeline: list[dict[str, Any]]
    # R17 #201: a complete, inspectable value after completion stages a proposal;
    # NULL before completion or after decline. Never `rejected`: declining
    # hard-deletes the profile row rather than leaving a trace (D-113).
    evidence_proposal: DevelopmentEvidenceProposalResponse | None
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def normalize_database_timestamps(cls, value: datetime) -> datetime:
        # SQLite drops timezone metadata even for timezone=True columns. Normalize
        # that development/test representation to the UTC contract Postgres keeps.
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class DevelopmentPlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["development-plan/v1"] = "development-plan/v1"
    items: list[DevelopmentItemResponse]


class DevelopmentPlanExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_count: int = Field(ge=0)
    items: list[DevelopmentItemResponse]

    @model_validator(mode="after")
    def item_count_matches(self):
        if self.item_count != len(self.items):
            raise ValueError("item_count must equal the number of exported items")
        return self
