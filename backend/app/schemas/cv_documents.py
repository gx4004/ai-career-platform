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
# The 16 template ids (docs/cv-templates-spec.md section 4). A template is *available* once
# its directory and manifest exist under app/cv_templates/; an id that is not yet available
# is accepted here and prints as the default template. tests/test_cv_template_catalog.py
# keeps this list and the manifests in sync.
CvTemplateId = Literal[
    "classic",
    "scholar",
    "academic",
    "manuscript",
    "executive",
    "frame",
    "lagoon",
    "lilac",
    "meadow",
    "rail",
    "almanac",
    "slate",
    "violet",
    "grotesk",
    "panel",
    "ledger",
]
DEFAULT_CV_TEMPLATE_ID: CvTemplateId = "classic"
# The five pre-catalog ids stored in older documents, and the template each became.
LEGACY_CV_TEMPLATE_IDS: dict[str, CvTemplateId] = {
    "ats-essential": "classic",
    "professional-editorial": "executive",
    "minimal-serif": "executive",
    "technical-portfolio": "slate",
    "modern-two-column": "lagoon",
}
CvPageSize = Literal["a4", "letter"]
CvTemplateGroup = Literal["ats-safe", "more"]
CvFontId = Literal["inter", "source-sans-3", "ibm-plex-sans", "source-serif-4", "lora", "eb-garamond"]
# Typeface ids stored before the 16-template catalog map to the nearest curated family.
# ``lato`` was the old default and was persisted on every row whether or not the person chose
# it, so it maps to None (the template's own pairing), not to an explicit override.
LEGACY_CV_FONT_IDS: dict[str, CvFontId | None] = {
    "lato": None,
    "pt-sans": "source-sans-3",
    "pt-serif": "source-serif-4",
    "crimson-text": "lora",
    "ibm-plex-mono": "ibm-plex-sans",
}
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
    "#9D174D": "Plum",
    "#334155": "Slate",
    "#B45309": "Amber",
}
CV_ACCENT_PALETTE: tuple[str, ...] = tuple(CV_ACCENT_NAMES)


class CvStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: CvTemplateId = DEFAULT_CV_TEMPLATE_ID
    # Optional typeface override; None means the template's own pairing.
    font_id: CvFontId | None = None
    # Null means "the template's own colour" (its manifest ``default_accent``, else Ink); any
    # palette colour, Ink included, is an explicit choice. Rows stored before this was nullable
    # hold a colour and keep printing it, so no data migration is needed.
    accent_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    density: CvDensity = "normal"
    ats_mode: bool = False
    page_size: CvPageSize = "a4"
    fit_one_page: bool = False

    @field_validator("template_id", mode="before")
    @classmethod
    def _map_legacy_template(cls, value):
        """Stored styles from before the catalog still parse: old ids map to a new one."""
        return LEGACY_CV_TEMPLATE_IDS.get(value, value) if isinstance(value, str) else value

    @field_validator("font_id", mode="before")
    @classmethod
    def _map_legacy_font(cls, value):
        """Stored styles from before the catalog still parse: old typeface ids map to the nearest."""
        if isinstance(value, str) and value in LEGACY_CV_FONT_IDS:
            return LEGACY_CV_FONT_IDS[value]
        return value

    @field_validator("accent_color")
    @classmethod
    def _accent_in_palette(cls, value: str | None) -> str | None:
        if value is None:
            return None
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


class CvPreviewRequest(CvDocumentUpdate):
    """The unsaved draft to preview. Same fields and validation as a save, but nothing
    is required (a field left out is taken from the saved CV) and nothing is stored."""

    @model_validator(mode="after")
    def require_change(self):
        return self


class CvPreviewPage(BaseModel):
    # A data: URL of the page as WebP, so the viewer needs no second request.
    url: str
    width: int
    height: int


class CvPreviewSection(BaseModel):
    """A section's rectangle on one page, as fractions (0..1) of that page's width and height.
    A section that runs over a page break has one rectangle per page."""

    id: str
    kind: str
    page: int = Field(ge=0)
    x: float
    y: float
    w: float
    h: float


class CvPreviewWarning(BaseModel):
    code: Literal["unsupported_characters"]
    message: str
    characters: list[str] = Field(default_factory=list)


class CvFitResult(BaseModel):
    """What fitting to one page did: whether it fits, the pages at the chosen scale (more than
    one means it ran to that many at the smallest allowed scale), the scale and the body size."""

    fits: bool
    pages: int
    scale: float
    body_pt: float
    # "time" when the search was cut short (time ran out or a later render failed) and this is
    # the best result it had; null when the search ran to its end.
    reason: Literal["time"] | None = None


class CvLengthAdvice(BaseModel):
    code: str
    message: str
    # "fit_one_page" when the advice offers a button that turns that style option on.
    action: Literal["fit_one_page"] | None = None


class CvLength(BaseModel):
    pages: int
    # How far down its printable area the last page is inked (0..1).
    last_page_fill: float
    advice: CvLengthAdvice | None = None


class CvPreviewResponse(BaseModel):
    pages: list[CvPreviewPage]
    page_count: int
    sections: list[CvPreviewSection]
    warnings: list[CvPreviewWarning] = Field(default_factory=list)
    # True when the CV has more pages than were drawn (the first 8 are).
    truncated: bool = False
    fit: CvFitResult | None = None
    length: CvLength | None = None


class CvTemplateThumbnail(BaseModel):
    """Page 1 of the sample CV in one template. ``url`` is a WebP data: URL, or None with
    ``error`` set when that template could not be drawn (the others are still returned)."""

    template_id: str
    url: str | None = None
    width: int = 0
    height: int = 0
    error: str | None = None


class CvTemplateThumbnailsResponse(BaseModel):
    thumbnails: list[CvTemplateThumbnail]


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
    # The same details by field, so a template can lay them out (icons, columns).
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = Field(default_factory=list)


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
    # Fonts in the PDF that break the template contract (Type 3, not embedded, or not one
    # of the template's families). Empty when the PDF is clean.
    font_problems: list[str] = Field(default_factory=list)
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

    @field_validator("content")
    @classmethod
    def _bounded_content(cls, value: dict[str, str]) -> dict[str, str]:
        # The parser's longest field is a body (MAX 5,000); accept reaches the
        # evidence bound by clamping, so only an absurd payload is refused here.
        if len(value) > 20 or any(len(key) > 64 or len(text) > 5_000 for key, text in value.items()):
            raise ValueError("claim content is too large")
        return value


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
    columns: Literal[1, 2]
    photo_slot: bool
    group: CvTemplateGroup
    # The template's default typeface pair (family names).
    typefaces: dict[str, str]
    title_align: Literal["left", "center"]
    margin_mm: int
    # Section kinds placed in the sidebar; empty for single-column templates.
    sidebar_kinds: list[CvSectionKind]
    # A plain sentence about the Word export when it differs from the PDF (two-column templates
    # print one column in DOCX); None when the Word version matches.
    docx_note: str | None = None
    # The palette colour the template prints with while the style's accent is null.
    default_accent: str = "#111827"
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
    # The templates still offered while ATS mode is on (the ATS-safe ones).
    offered_template_ids: list[CvTemplateId]
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
