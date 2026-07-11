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
