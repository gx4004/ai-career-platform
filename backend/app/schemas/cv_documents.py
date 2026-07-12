from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class CvEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100)
    evidence_item_id: str = Field(min_length=1)
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
