from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EvidenceKind = Literal[
    "experience",
    "achievement",
    "skill",
    "education",
    "project",
    "certification",
    "preference",
    "interview-evidence",
]
EvidenceProvenance = Literal["imported", "inferred", "user-entered"]
ConfirmationState = Literal["unconfirmed", "confirmed", "rejected"]


class EvidenceItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: EvidenceKind
    content: dict[str, Any] = Field(min_length=1)
    provenance: EvidenceProvenance


class EvidenceItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: EvidenceKind | None = None
    content: dict[str, Any] | None = Field(default=None, min_length=1)
    provenance: EvidenceProvenance | None = None

    @model_validator(mode="after")
    def require_change(self):
        if self.kind is None and self.content is None and self.provenance is None:
            raise ValueError("At least one editable field is required")
        return self


class ConfirmationAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["confirm", "reject"]


class EvidenceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: EvidenceKind
    content: dict[str, Any]
    provenance: EvidenceProvenance
    confirmation_state: ConfirmationState
    created_at: datetime
    updated_at: datetime


class EvidenceItemListResponse(BaseModel):
    items: list[EvidenceItemResponse]


# Stable identifier for the self-serve export contract (D-065). The version is
# embedded in every payload so a consumer can detect the format it received, and a
# future breaking change bumps the string rather than silently reshaping the data.
EVIDENCE_PROFILE_EXPORT_SCHEMA_VERSION = "evidence-profile-export/v1"


class EvidenceProfileExport(BaseModel):
    """Self-serve, machine-readable snapshot of one user's complete Evidence Profile.

    Every item is emitted in full — provenance and confirmation state included — so
    the export is a faithful, portable copy of the verified record (D-065, user
    story 15). The Pydantic model is the published schema: it is surfaced as the
    ``GET /evidence-profile/export`` response in the OpenAPI document, and every
    export payload validates against it by construction.
    """

    model_config = ConfigDict(from_attributes=True)

    schema_version: Literal["evidence-profile-export/v1"] = (
        EVIDENCE_PROFILE_EXPORT_SCHEMA_VERSION
    )
    exported_at: datetime
    item_count: int = Field(ge=0)
    items: list[EvidenceItemResponse]

    @model_validator(mode="after")
    def item_count_matches(self):
        if self.item_count != len(self.items):
            raise ValueError("item_count must equal the number of exported items")
        return self
