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
CvCheckId = Literal["sections", "reads_back", "links", "page_breaks", "layout"]
CvTemplateId = Literal[
    "ats-essential",
    "professional-editorial",
    "technical-portfolio",
    "modern-two-column",
    "minimal-serif",
]
CvArtifactFormat = Literal["docx", "pdf"]
CvFontId = Literal["lato", "pt-sans", "pt-serif", "crimson-text", "ibm-plex-mono"]
CvDensity = Literal["compact", "normal", "spacious"]

# Curated palette (color -> display name) so accent colors stay readable and
# print-safe. Any hex outside this set is rejected rather than silently normalized.
CV_ACCENT_NAMES: dict[str, str] = {
    "#111827": "Ink",
    "#7C2D12": "Rust",
    "#075985": "Ocean",
    "#166534": "Forest",
    "#6D28D9": "Violet",
    "#B91C1C": "Crimson",
    "#0F766E": "Teal",
}
CV_ACCENT_PALETTE: tuple[str, ...] = tuple(CV_ACCENT_NAMES)


class CvStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: CvTemplateId = "ats-essential"
    font_id: CvFontId = "lato"
    accent_color: str = Field(default="#111827", pattern=r"^#[0-9a-fA-F]{6}$")
    density: CvDensity = "normal"
    ats_mode: bool = False

    @field_validator("accent_color")
    @classmethod
    def _accent_in_palette(cls, value: str) -> str:
        if value.upper() not in {color.upper() for color in CV_ACCENT_PALETTE}:
            raise ValueError("accent_color must be one of the curated palette colors")
        return value


class CvEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100)
    evidence_item_id: str | None
    body: str = Field(min_length=1, max_length=5_000)
    position: int = Field(ge=0)
    heading: str | None = Field(default=None, min_length=1, max_length=200)
    subheading: str | None = Field(default=None, min_length=1, max_length=200)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: str | None = Field(default=None, min_length=1, max_length=40)
    end_date: str | None = Field(default=None, min_length=1, max_length=40)
    bullets: list[str] = Field(default_factory=list, max_length=30)


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
    style: CvStyle | None = None

    @model_validator(mode="after")
    def require_change(self):
        if self.name is None and self.sections is None and self.style is None:
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
    style: CvStyle
    created_at: datetime
    updated_at: datetime
    tailoring_model_runs: int = Field(ge=0)
    tailoring_model_run_limit: Literal[10] = 10
    variants: list[CvVariantResponse]

    @field_validator("style", mode="before")
    @classmethod
    def _default_style_for_legacy_rows(cls, value):
        return value if value is not None else CvStyle()


class CvDocumentListResponse(BaseModel):
    items: list[CvDocumentResponse]


class CvRenderEntry(BaseModel):
    """One entry as it renders: every derived display value is computed once in
    ``build_render_model`` so the PDF, DOCX and validation code never re-derive it."""

    id: str
    text: str
    links: list[str] = Field(default_factory=list)
    heading: str | None = None
    subheading: str | None = None
    location: str | None = None
    # "start – end", or None when neither date is set.
    dates: str | None = None
    bullets: list[str] = Field(default_factory=list)
    # The body paragraph that renders, if any: a freeform entry's text, or a
    # structured entry's text when it has no bullets and says more than its heading.
    paragraph: str | None = None


class CvRenderSection(BaseModel):
    id: str
    kind: CvSectionKind
    title: str
    entries: list[CvRenderEntry]


class CvRenderModel(BaseModel):
    """Internal render input shared by the PDF and DOCX exporters (not an API response)."""

    document_name: str
    template_id: CvTemplateId
    margin_mm: int
    tokens: dict[str, str | int | bool]
    sections: list[CvRenderSection]


class CvArtifactEvidence(BaseModel):
    """What re-reading a rendered PDF proves about it (internal to the quality check)."""

    # One content-equivalence comparison: the text layer is readable and the
    # own-parser re-import returns the same sections in order.
    reads_back: Literal["pass", "fail"]
    links: Literal["pass", "fail"]
    page_breaks: Literal["pass", "fail"]


class CvQualityDimension(BaseModel):
    key: CvQualityDimensionKey
    label: str
    score: int = Field(ge=0, le=100)
    reasons: list[str] = Field(min_length=1, max_length=4)
    remediation: str


class CvCheck(BaseModel):
    id: CvCheckId
    label: str
    passed: bool
    detail: str
    fix: str


class CvQualityResponse(BaseModel):
    schema_version: Literal["cv-quality/v2"] = "cv-quality/v2"
    dimensions: list[CvQualityDimension]
    checks: list[CvCheck]
    advisory_note: str


class CvTailoringRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_title: str = Field(min_length=1, max_length=200)
    job_description: str = Field(min_length=20, max_length=50_000)


class CvTailoringChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    section_id: str = Field(min_length=1, max_length=100)
    entry_id: str = Field(min_length=1, max_length=100)
    # Which entry field this change rewrites: the unrendered "body", or one
    # rendered bullet by index. Structured entries with bullets render as
    # title + bullets, not body, so a change must be able to target the
    # bullet that actually renders (#322). Defaults to "body" so existing
    # freeform-entry proposals are unaffected.
    field: str = Field(default="body", max_length=20)
    before: str = Field(min_length=1, max_length=5_000)
    after: str = Field(min_length=1, max_length=5_000)
    job_requirement: str = Field(min_length=1, max_length=1_000)
    evidence_item_ids: list[str] = Field(max_length=20)
    support: Literal["confirmed", "document", "unsupported"]

    @field_validator("field")
    @classmethod
    def _valid_field(cls, value: str) -> str:
        if value == "body" or re.fullmatch(r"bullets\[\d+\]", value):
            return value
        raise ValueError("field must be 'body' or 'bullets[<index>]'")


class CvTailoringSkippedChange(BaseModel):
    id: str
    reason: Literal["stale_before_text"]


class CvTailoringProposal(BaseModel):
    schema_version: Literal["cv-tailoring/v1"] = "cv-tailoring/v1"
    job_title: str
    changes: list[CvTailoringChange] = Field(max_length=50)
    skipped: list[CvTailoringSkippedChange] = Field(default_factory=list, max_length=50)
    remaining_regenerations: int = Field(ge=0)
    request_id: UUID
    proposal_token: str = Field(min_length=64, max_length=64)
    history_id: str | None = None
    access_mode: Literal["authenticated"] = "authenticated"
    saved: bool = True
    locked_actions: list[str] = Field(default_factory=list)


class CvTailoringDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    change_id: str
    action: Literal["accept", "reject"]


class CvTailoringApply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    variant_name: str = Field(min_length=1, max_length=120)
    job_title: str = Field(min_length=1, max_length=200)
    proposal_token: str = Field(min_length=64, max_length=64)
    changes: list[CvTailoringChange] = Field(max_length=50)
    decisions: list[CvTailoringDecision] = Field(max_length=50)


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
    heading: str | None = Field(default=None, min_length=1, max_length=200)
    subheading: str | None = Field(default=None, min_length=1, max_length=200)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: str | None = Field(default=None, min_length=1, max_length=40)
    end_date: str | None = Field(default=None, min_length=1, max_length=40)
    bullets: list[str] = Field(default_factory=list, max_length=30)


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


class CvStyleSizes(BaseModel):
    body_pt: int
    heading_pt: int
    section_gap_pt: int


class CvStyleCatalogTemplate(BaseModel):
    id: CvTemplateId
    name: str
    description: str
    ats_safe: bool
    title_align: Literal["left", "center"]
    margin_mm: int
    # Section kinds placed in the sidebar; empty for single-column templates.
    sidebar_kinds: list[CvSectionKind]
    sizes: dict[CvDensity, CvStyleSizes]


class CvStyleCatalogFont(BaseModel):
    id: CvFontId
    name: str
    category: str
    css_family: str


class CvStyleCatalogColor(BaseModel):
    value: str
    name: str


class CvStyleCatalogDensity(BaseModel):
    id: CvDensity
    name: str


class CvStyleCatalogAtsMode(BaseModel):
    """What ATS-friendly mode forces, whatever the saved template/font/accent/density."""

    template_id: CvTemplateId
    density: CvDensity
    accent: str
    css_family: str


class CvStyleCatalog(BaseModel):
    """The single source of CV design values; the frontend preview looks these up."""

    templates: list[CvStyleCatalogTemplate]
    fonts: list[CvStyleCatalogFont]
    palette: list[CvStyleCatalogColor]
    densities: list[CvStyleCatalogDensity]
    ats_mode: CvStyleCatalogAtsMode
