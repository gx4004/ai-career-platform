import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

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
CvCheckId = Literal["sections", "reads_back", "links", "page_breaks", "layout"]
CvTemplateId = Literal[
    "ats-essential",
    "professional-editorial",
    "technical-portfolio",
    "modern-two-column",
    "minimal-serif",
]
CvFontId = Literal["lato", "pt-sans", "pt-serif", "crimson-text", "ibm-plex-mono"]
CvDensity = Literal["compact", "normal", "spacious"]


def _reject_nul(value: str) -> str:
    if "\x00" in value:
        raise ValueError("text cannot contain NUL characters")
    return value


def _remove_nul(value):
    return value.replace("\x00", "") if isinstance(value, str) else value


# Text the person typed: surrounding whitespace is dropped (so blank counts as empty
# under min_length) and NUL, which the database cannot store, is refused.
Text = Annotated[str, StringConstraints(strip_whitespace=True), AfterValidator(_reject_nul)]
# The same for imported text, which comes from a parsed file: NUL is removed, not refused.
ImportedText = Annotated[
    str, BeforeValidator(_remove_nul), StringConstraints(strip_whitespace=True)
]


def _unique_ids(sections) -> None:
    """Section ids are unique in a document, entry ids unique within a section."""
    section_ids = [section.id for section in sections]
    if len(set(section_ids)) != len(section_ids):
        raise ValueError("section ids must be unique")
    for section in sections:
        entry_ids = [entry.id for entry in section.entries]
        if len(set(entry_ids)) != len(entry_ids):
            raise ValueError("entry ids must be unique within a section")

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


def entry_body_from_bullets(bullets: list[str]) -> str | None:
    """An entry's ``body`` when it has bullet points: the filled bullets, one per line.

    Bullets are the single source of an entry's text once it has any; ``body``
    is derived from them so tailoring and rendering never see two versions.
    Returns None for an entry without filled bullets (its ``body`` is its own).
    """
    filled = [bullet.strip() for bullet in bullets if bullet.strip()]
    return "\n".join(filled) if filled else None


ENTRY_BODY_MAX_CHARS = 5_000


class _BodyFollowsBullets:
    @model_validator(mode="after")
    def _derive_body(self):
        derived = entry_body_from_bullets(self.bullets)
        if derived is not None:
            # ``body`` is validated before it is replaced, so the derived text
            # needs its own bound: an oversize body would pass the save and
            # then fail every later response that re-validates it.
            if len(derived) > ENTRY_BODY_MAX_CHARS:
                raise ValueError(f"bullets together exceed {ENTRY_BODY_MAX_CHARS} characters")
            self.body = derived
        return self


def _blank_to_none(value):
    if isinstance(value, str):
        return value.replace("\x00", "").strip() or None
    return value


class CvHeader(BaseModel):
    """The candidate's name, headline and contact details (document-level).

    Every field is optional and blank text counts as unset, so a CV can carry
    just a name. Rendered above the sections in the PDF, DOCX and preview.
    """

    model_config = ConfigDict(extra="forbid")

    name: Text | None = Field(default=None, min_length=1, max_length=120)
    headline: Text | None = Field(default=None, min_length=1, max_length=200)
    email: Text | None = Field(default=None, min_length=1, max_length=200)
    phone: Text | None = Field(default=None, min_length=1, max_length=40)
    location: Text | None = Field(default=None, min_length=1, max_length=200)
    links: list[Text] = Field(default_factory=list, max_length=6)

    @field_validator("name", "headline", "email", "phone", "location", mode="before")
    @classmethod
    def _blank_is_unset(cls, value):
        return _blank_to_none(value)

    @field_validator("links", mode="before")
    @classmethod
    def _clean_links(cls, value):
        if not isinstance(value, list):
            return value
        cleaned = [_blank_to_none(link) for link in value]
        return [link for link in cleaned if link is not None]

    @field_validator("links")
    @classmethod
    def _link_length(cls, value: list[str]) -> list[str]:
        if any(len(link) > 200 for link in value):
            raise ValueError("each link must be at most 200 characters")
        return value


class CvEntry(_BodyFollowsBullets, BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Text = Field(min_length=1, max_length=100)
    evidence_item_id: str | None
    body: Text = Field(min_length=1, max_length=5_000)
    position: int = Field(ge=0)
    heading: Text | None = Field(default=None, min_length=1, max_length=200)
    subheading: Text | None = Field(default=None, min_length=1, max_length=200)
    location: Text | None = Field(default=None, min_length=1, max_length=200)
    start_date: Text | None = Field(default=None, min_length=1, max_length=40)
    end_date: Text | None = Field(default=None, min_length=1, max_length=40)
    bullets: list[Text] = Field(default_factory=list, max_length=30)


class CvSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Text = Field(min_length=1, max_length=100)
    kind: CvSectionKind
    title: Text = Field(min_length=1, max_length=120)
    visible: bool = True
    position: int = Field(ge=0)
    entries: list[CvEntry] = Field(default_factory=list, max_length=200)


class CvDocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Text = Field(min_length=1, max_length=120)
    sections: list[CvSection] = Field(default_factory=list, max_length=50)
    seed_evidence_item_ids: list[str] = Field(default_factory=list, max_length=200)
    header: CvHeader | None = None

    @model_validator(mode="after")
    def _ids_are_unique(self):
        _unique_ids(self.sections)
        return self


class CvDocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Text | None = Field(default=None, min_length=1, max_length=120)
    sections: list[CvSection] | None = Field(default=None, max_length=50)
    style: CvStyle | None = None
    header: CvHeader | None = None
    # The ``updated_at`` of the copy the editor loaded. When it is no longer the stored
    # one, another window saved first and the save is refused with 409 (no silent overwrite).
    expected_updated_at: datetime | None = None

    @model_validator(mode="after")
    def _ids_are_unique(self):
        if self.sections is not None:
            _unique_ids(self.sections)
        return self

    @model_validator(mode="after")
    def require_change(self):
        if (
            self.name is None
            and self.sections is None
            and self.style is None
            and self.header is None
        ):
            raise ValueError("At least one editable field is required")
        return self


class CvVariantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Text = Field(min_length=1, max_length=120)
    target_role: Text | None = Field(default=None, min_length=1, max_length=200)


class CvVariantUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Text | None = Field(default=None, min_length=1, max_length=120)
    target_role: Text | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def require_change(self):
        if self.name is None and self.target_role is None:
            raise ValueError("At least one editable field is required")
        return self


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
    header: CvHeader = Field(default_factory=CvHeader)
    created_at: datetime
    updated_at: datetime
    tailoring_model_runs: int = Field(ge=0)
    tailoring_model_run_limit: Literal[10] = 10
    variants: list[CvVariantResponse]

    @field_validator("style", mode="before")
    @classmethod
    def _default_style_for_legacy_rows(cls, value):
        return value if value is not None else CvStyle()

    @field_validator("header", mode="before")
    @classmethod
    def _default_header_for_legacy_rows(cls, value):
        return value if value is not None else CvHeader()


class CvConflictResponse(BaseModel):
    """The 409 body of a save made on a stale copy: what happened and the newer version."""

    detail: str
    current: CvDocumentResponse


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


class CvRenderHeader(BaseModel):
    """The header block as it renders: the title line plus optional headline and contact line."""

    title: str
    headline: str | None = None
    # Email, phone, location and links, in that order.
    contact: list[str] = Field(default_factory=list)


class CvRenderModel(BaseModel):
    """Internal render input shared by the PDF and DOCX exporters (not an API response)."""

    document_name: str
    header: CvRenderHeader
    template_id: CvTemplateId
    margin_mm: int
    tokens: dict[str, str | int | bool]
    sections: list[CvRenderSection]
    # Characters in the CV that no font available for the PDF can draw.
    unsupported_characters: list[str] = Field(default_factory=list)


class CvArtifactEvidence(BaseModel):
    """What re-reading a rendered PDF proves about it (internal to the quality check)."""

    # One content-equivalence comparison: the text layer is readable and the
    # own-parser re-import returns the same sections in order.
    reads_back: Literal["pass", "fail"]
    links: Literal["pass", "fail"]
    page_breaks: Literal["pass", "fail"]
    # Titles of the sections that did not read back as written, and characters the
    # PDF could not draw: what the advice for a failed check can name.
    unread_sections: list[str] = Field(default_factory=list)
    unsupported_characters: list[str] = Field(default_factory=list)
    # The CV is longer than a PDF can be re-read, so nothing could be checked.
    too_long: bool = False
    # The same text came back but in a different order (a sidebar layout reads that way).
    order_only: bool = False


class CvCheck(BaseModel):
    id: CvCheckId
    label: str
    passed: bool
    detail: str
    fix: str


class CvQualityResponse(BaseModel):
    schema_version: Literal["cv-quality/v3"] = "cv-quality/v3"
    checks: list[CvCheck]


class CvTailoringRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_title: Text = Field(min_length=1, max_length=200)
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
    variant_name: Text = Field(min_length=1, max_length=120)
    job_title: Text = Field(min_length=1, max_length=200)
    proposal_token: str = Field(min_length=64, max_length=64)
    changes: list[CvTailoringChange] = Field(max_length=50)
    decisions: list[CvTailoringDecision] = Field(max_length=50)


class CvImportClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: EvidenceKind
    content: dict[str, str] = Field(min_length=1)
    provenance: Literal["imported"]


class CvImportEntry(_BodyFollowsBullets, BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: ImportedText = Field(min_length=1, max_length=100)
    body: ImportedText = Field(min_length=1, max_length=5_000)
    position: int = Field(ge=0)
    claim: CvImportClaim | None
    heading: ImportedText | None = Field(default=None, min_length=1, max_length=200)
    subheading: ImportedText | None = Field(default=None, min_length=1, max_length=200)
    location: ImportedText | None = Field(default=None, min_length=1, max_length=200)
    start_date: ImportedText | None = Field(default=None, min_length=1, max_length=40)
    end_date: ImportedText | None = Field(default=None, min_length=1, max_length=40)
    bullets: list[ImportedText] = Field(default_factory=list, max_length=30)


class CvImportSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: ImportedText = Field(min_length=1, max_length=100)
    kind: CvSectionKind
    title: ImportedText = Field(min_length=1, max_length=120)
    visible: bool = True
    position: int = Field(ge=0)
    entries: list[CvImportEntry] = Field(max_length=200)


class CvImportProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: ImportedText = Field(min_length=1, max_length=255)
    import_id: UUID
    name: ImportedText = Field(min_length=1, max_length=120)
    sections: list[CvImportSection] = Field(max_length=50)
    warnings: list[str] = Field(max_length=20)
    header: CvHeader = Field(default_factory=CvHeader)

    @model_validator(mode="after")
    def _ids_are_unique(self):
        _unique_ids(self.sections)
        return self

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
