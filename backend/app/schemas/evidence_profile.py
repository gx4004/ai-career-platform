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
ConfirmationState = Literal["unconfirmed", "confirmed"]


class EvidenceItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: EvidenceKind
    content: dict[str, Any] = Field(min_length=1)
    provenance: EvidenceProvenance


class EvidenceItemUpdate(BaseModel):
    """An owner-authored correction: content only.

    ``kind`` and ``provenance`` are fixed at creation; accepting them here would
    let a PATCH relabel an imported or inferred fact as ``user-entered`` and
    falsify its recorded origin (D-062).
    """

    model_config = ConfigDict(extra="forbid")

    content: dict[str, Any] = Field(min_length=1)


class EvidenceItemIds(BaseModel):
    """A bounded set of the owner's item ids for one bulk action."""

    model_config = ConfigDict(extra="forbid")

    ids: list[str] = Field(min_length=1, max_length=1000)


class EvidenceImportRequest(BaseModel):
    """Resume text to extract suggested evidence from (R11, #146).

    Bounds mirror the resume-analyzer request so the same parsed resume text can
    feed both surfaces. The endpoint is authenticated-only; guest uploads never
    reach this contract (D-064).
    """

    model_config = ConfigDict(extra="forbid")

    resume_text: str = Field(min_length=50, max_length=50_000)


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
