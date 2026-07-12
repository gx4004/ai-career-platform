import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.evidence_profile import EvidenceKind

CvSectionKind = Literal[
    "summary",
    "experience",
    "achievements",
    "skills",
    "education",
    "projects",
    "certifications",
    "interview-evidence",
    "custom",
]
CvQualityDimensionKey = Literal["impact", "clarity", "completeness", "structure"]
CvAtsCheckKey = Literal[
    "section_structure", "text_layer", "links", "page_breaks", "re_importability"
]


class CvEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100)
    evidence_item_id: str | None
    body: str = Field(min_length=1, max_length=5_000)
    position: int = Field(ge=0)


class CvSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100)
    kind: CvSectionKind
    title: str = Field(min_length=1, max_length=120)
    visible: bool = True
    position: int = Field(ge=0)
    entries: list[CvEntry] = Field(default_factory=list, max_length=200)


class CvDocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    sections: list[CvSection] = Field(default_factory=list, max_length=50)
    seed_evidence_item_ids: list[str] = Field(default_factory=list, max_length=200)


class CvDocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    sections: list[CvSection] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def require_change(self):
        if self.name is None and self.sections is None:
            raise ValueError("At least one editable field is required")
        return self


class CvVariantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    target_role: str | None = Field(default=None, min_length=1, max_length=200)


class CvVariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    target_role: str | None
    sections: list[CvSection]
    created_at: datetime


class CvDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    sections: list[CvSection]
    created_at: datetime
    updated_at: datetime
    variants: list[CvVariantResponse]


class CvDocumentListResponse(BaseModel):
    items: list[CvDocumentResponse]


class CvQualityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    use_model: bool = False
    checks: list[CvAtsCheckKey] | None = Field(default=None, min_length=1, max_length=5)


class CvQualityDimension(BaseModel):
    key: CvQualityDimensionKey
    label: str
    score: int = Field(ge=0, le=100)
    reasons: list[str] = Field(min_length=1, max_length=4)
    remediation: str


class CvAtsCheck(BaseModel):
    key: CvAtsCheckKey
    label: str
    status: Literal["pass", "fail", "review"]
    explanation: str
    remediation: str


class CvQualityResponse(BaseModel):
    schema_version: Literal["cv-quality/v1"] = "cv-quality/v1"
    dimensions: list[CvQualityDimension]
    ats_checks: list[CvAtsCheck]
    scoring_mode: Literal["heuristic", "blended"]
    advisory_note: str
    history_id: str | None = None
    access_mode: Literal["authenticated"] = "authenticated"
    saved: bool = True
    locked_actions: list[str] = Field(default_factory=list)


class CvImportClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: EvidenceKind
    content: dict[str, str] = Field(min_length=1)
    provenance: Literal["imported"]


class CvImportEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=5_000)
    position: int = Field(ge=0)
    claim: CvImportClaim | None


class CvImportSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    kind: CvSectionKind
    title: str = Field(min_length=1, max_length=120)
    visible: bool = True
    position: int = Field(ge=0)
    entries: list[CvImportEntry] = Field(max_length=200)


class CvImportProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = Field(min_length=1, max_length=255)
    import_id: UUID
    name: str = Field(min_length=1, max_length=120)
    sections: list[CvImportSection] = Field(max_length=50)
    warnings: list[str] = Field(max_length=20)

    @field_validator("import_id", mode="before")
    @classmethod
    def require_canonical_uuid(cls, value):
        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
            r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            value,
        ):
            raise ValueError("import_id must be a canonical UUID string")
        return value


class CvImportAccept(CvImportProposal):
    pass


CV_DOCUMENTS_EXPORT_SCHEMA_VERSION = "cv-documents-export/v1"


class CvDocumentsExport(BaseModel):
    schema_version: Literal["cv-documents-export/v1"] = CV_DOCUMENTS_EXPORT_SCHEMA_VERSION
    exported_at: datetime
    document_count: int = Field(ge=0)
    documents: list[CvDocumentResponse]

    @model_validator(mode="after")
    def document_count_matches(self):
        if self.document_count != len(self.documents):
            raise ValueError("document_count must equal the number of documents")
        return self
