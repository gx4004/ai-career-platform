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


class EvidenceImportRequest(BaseModel):
    """Request to derive reviewable proposals from an uploaded resume (R11, #146).

    Bounds mirror the resume-analyzer request so the same parsed resume text can
    feed both surfaces. The endpoint is authenticated-only; guest uploads never
    reach this contract (D-064).
    """

    model_config = ConfigDict(extra="forbid")

    resume_text: str = Field(min_length=50, max_length=50_000)


class EvidenceProposal(BaseModel):
    """One ephemeral, reviewable evidence proposal derived from resume parsing.

    A proposal is not a stored item: it carries no confirmation state and is
    never persisted by the proposal endpoint. Accepting it goes through the
    normal item-create path, which stamps it `unconfirmed` with `imported`
    provenance (D-062); discarding it simply drops this object.
    """

    model_config = ConfigDict(extra="forbid")

    # Per-request handle for the review UI only — not a database id.
    proposal_id: str
    kind: EvidenceKind
    content: dict[str, Any] = Field(min_length=1)
    # Resume-derived proposals are always `imported`; the model may not propose
    # `user-entered` or `inferred` provenance for extracted facts.
    provenance: Literal["imported"] = "imported"


class EvidenceImportProposalsResponse(BaseModel):
    proposals: list[EvidenceProposal]


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
