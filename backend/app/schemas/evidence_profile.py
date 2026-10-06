import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


#: Bounds on what one fact may hold. Every confirmed or unconfirmed item is rendered
#: into every authenticated tool prompt, so an unbounded value bloats all of them.
MAX_CONTENT_FIELDS = 20
MAX_CONTENT_KEY_CHARS = 64
MAX_CONTENT_VALUE_CHARS = 2_000
MAX_CONTENT_TOTAL_CHARS = 8_000


# C0 controls except tab and line feed, plus DEL and the C1 range. NUL in particular
# cannot be stored by Postgres text and breaks every CV seeded from the fact.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


def strip_control_chars(text: str) -> str:
    """``text`` with Windows line ends unified and every other control character removed."""
    return _CONTROL_CHARS.sub("", text.replace("\r\n", "\n"))


def normalize_evidence_content(raw: Any) -> dict[str, str | int | float | bool]:
    """Validate and tidy one fact's content: a flat record of scalar fields.

    Strings are stripped and blank fields dropped (an optional field left empty in a
    form is not a fact); nested objects/arrays, blank keys and anything over the
    per-field, field-count or total bounds are rejected. A record with nothing left
    is rejected, so a confirmed fact can never be empty.
    """
    if not isinstance(raw, dict):
        raise ValueError("content must be an object")
    content: dict[str, str | int | float | bool] = {}
    total = 0
    for key, value in raw.items():
        if not isinstance(key, str) or not key.strip():
            raise ValueError("content field names must be non-empty text")
        key = key.strip()
        if _CONTROL_CHARS.search(key):
            raise ValueError("content field names cannot contain control characters")
        if len(key) > MAX_CONTENT_KEY_CHARS:
            raise ValueError(f"content field names are limited to {MAX_CONTENT_KEY_CHARS} characters")
        if isinstance(value, str):
            value = value.replace("\r\n", "\n").strip()
            if _CONTROL_CHARS.search(value):
                raise ValueError("content cannot contain control characters (tabs and line breaks are fine)")
            if not value:
                continue
            if len(value) > MAX_CONTENT_VALUE_CHARS:
                raise ValueError(
                    f"content values are limited to {MAX_CONTENT_VALUE_CHARS} characters"
                )
            total += len(value)
        elif isinstance(value, (bool, int, float)):
            total += len(str(value))
        elif value is None:
            continue
        else:
            raise ValueError("content must be flat: text, number or true/false values only")
        content[key] = value
        total += len(key)
    if not content:
        raise ValueError("content needs at least one non-blank value")
    if len(content) > MAX_CONTENT_FIELDS:
        raise ValueError(f"content is limited to {MAX_CONTENT_FIELDS} fields")
    if total > MAX_CONTENT_TOTAL_CHARS:
        raise ValueError(f"content is limited to {MAX_CONTENT_TOTAL_CHARS} characters in total")
    return content


class EvidenceItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: EvidenceKind
    content: dict[str, Any] = Field(min_length=1)
    provenance: EvidenceProvenance

    @field_validator("content")
    @classmethod
    def _flat_non_blank_content(cls, value):
        return normalize_evidence_content(value)


class EvidenceItemUpdate(BaseModel):
    """An owner-authored correction: content only.

    ``kind`` and ``provenance`` are fixed at creation; accepting them here would
    let a PATCH relabel an imported or inferred fact as ``user-entered`` and
    falsify its recorded origin (D-062).
    """

    model_config = ConfigDict(extra="forbid")

    content: dict[str, Any] = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def _flat_non_blank_content(cls, value):
        return normalize_evidence_content(value)


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
    """The Evidence Profile section of a portable snapshot (D-065, user story 15).

    ``GET /evidence-profile/export`` itself returns the wider ``CareerDataExport``
    (profile plus CV Studio data); this model is the profile-only shape that
    :func:`app.services.evidence_profile.export_evidence_profile` builds. Every item
    is emitted in full — provenance and confirmation state included — and every
    payload validates against the model by construction.
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
