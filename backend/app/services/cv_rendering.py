"""Canonical CV rendering, deterministic artifact generation and the style catalog.

``TEMPLATES`` and the density/ATS constants below are the single source of CV
design values: both exporters read them here, and the browser preview reads them
through ``style_catalog()`` (``GET /cv-documents/style-catalog``).

PDF bytes are stable through ReportLab's invariant mode. DOCX semantic content is
deterministic; ZIP member timestamps/order are canonicalized so bytes are stable
with a fixed python-docx version.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.schemas.cv_documents import (
    CV_ACCENT_NAMES,
    CvArtifactEvidence,
    CvRenderHeader,
    CvRenderModel,
    CvStyle,
    CvStyleCatalog,
    CvStyleCatalogAtsMode,
    CvStyleCatalogColor,
    CvStyleCatalogDensity,
    CvStyleCatalogFont,
    CvStyleCatalogTemplate,
    CvStyleSizes,
)
from app.services.cv_chromium import print_pdf
from app.services.cv_docx import docx_note_for, render_docx, render_txt  # noqa: F401
from app.services.cv_fonts import OVERRIDE_FONT_IDS, TYPEFACES, css_family
from app.services.cv_html import (
    DEFAULT_TEMPLATE_ID,
    URL_RE,
    TemplateManifest,
    available_template_ids,
    effective_families,
    font_plan,
    html_template_id,
    load_manifest,
    missing_characters,
    nfc,
    render_cv_html,
)
from app.services.cv_parser import (
    CvParserRejected,
    lines_from_text,
    parse_cv,
    split_sections,
    title_key,
)
from app.services.cv_pdf import font_problems, normalize_pdf


@dataclass(frozen=True)
class Template:
    """A template's layout facts, read from its manifest (the DOCX export and the catalog use them)."""

    name: str
    description: str
    body_size: int
    heading_size: int
    margin_mm: int
    section_gap: int
    ats_safe: bool
    columns: int
    photo_slot: bool
    group: str
    typefaces: dict[str, str]
    title_align: str = "left"
    # Section kinds rendered in a sidebar column; empty means single column.
    sidebar_kinds: tuple[str, ...] = ()

    @property
    def two_column(self) -> bool:
        return self.columns == 2 or bool(self.sidebar_kinds)


def _template_from_manifest(manifest: TemplateManifest) -> Template:
    return Template(
        name=manifest.name,
        description=manifest.description,
        body_size=10,
        heading_size=13,
        margin_mm=round(manifest.margin_left_mm),
        section_gap=6,
        ats_safe=manifest.ats_safe,
        columns=manifest.columns,
        photo_slot=manifest.photo_slot,
        group=manifest.group,
        typefaces=dict(manifest.typefaces),
        title_align=manifest.title_align,
        sidebar_kinds=manifest.sidebar_kinds,
    )


# Built from the manifests under app/cv_templates/: a template appears here (and in the
# style catalog) once its directory exists. ATS-safe templates are listed first.
TEMPLATES: dict[str, Template] = {
    template_id: _template_from_manifest(load_manifest(template_id))
    for template_id in available_template_ids()
}

ATS_SAFE_TEMPLATES = frozenset(tid for tid, template in TEMPLATES.items() if template.ats_safe)


def is_ats_safe(template_id: str) -> bool:
    """Whether the template that prints ``template_id`` is single-column (an unavailable id prints as the default)."""
    return TEMPLATES[html_template_id(template_id)].ats_safe


# density -> (display name, type scale, section-gap scale)
DENSITIES: dict[str, tuple[str, float, float]] = {
    "compact": ("Compact", 0.88, 0.7),
    "normal": ("Balanced", 1.0, 1.0),
    "spacious": ("Roomy", 1.15, 1.4),
}

# What ATS-friendly mode forces, whatever the saved style says.
ATS_TEMPLATE_ID = DEFAULT_TEMPLATE_ID
ATS_DENSITY = "normal"
ATS_ACCENT = "#111827"
ATS_CSS_FAMILY = "Helvetica, Arial, 'Liberation Sans', sans-serif"


def template_sizes(template: Template, density: str) -> CvStyleSizes:
    _, scale, gap_scale = DENSITIES[density]
    return CvStyleSizes(
        body_pt=max(8, round(template.body_size * scale)),
        heading_pt=max(10, round(template.heading_size * scale)),
        section_gap_pt=max(3, round(template.section_gap * gap_scale)),
    )


def style_catalog() -> CvStyleCatalog:
    return CvStyleCatalog(
        templates=[
            CvStyleCatalogTemplate(
                id=template_id,
                name=template.name,
                description=template.description,
                ats_safe=template.ats_safe,
                columns=template.columns,
                photo_slot=template.photo_slot,
                group=template.group,
                typefaces=template.typefaces,
                title_align=template.title_align,
                margin_mm=template.margin_mm,
                sidebar_kinds=list(template.sidebar_kinds),
                docx_note=docx_note_for(template.two_column),
                sizes={density: template_sizes(template, density) for density in DENSITIES},
            )
            for template_id, template in TEMPLATES.items()
        ],
        fonts=[
            CvStyleCatalogFont(
                id=family.id,
                name=family.name,
                category=family.category,
                css_family=css_family(family.id),
            )
            for family in (TYPEFACES[font_id] for font_id in OVERRIDE_FONT_IDS)
        ],
        palette=[
            CvStyleCatalogColor(value=value, name=name) for value, name in CV_ACCENT_NAMES.items()
        ],
        densities=[CvStyleCatalogDensity(id=d, name=name) for d, (name, _, _) in DENSITIES.items()],
        ats_mode=CvStyleCatalogAtsMode(
            template_id=ATS_TEMPLATE_ID,
            offered_template_ids=sorted(ATS_SAFE_TEMPLATES, key=list(TEMPLATES).index),
            density=ATS_DENSITY,
            accent=ATS_ACCENT,
            css_family=ATS_CSS_FAMILY,
        ),
    )


@dataclass(frozen=True)
class EffectiveStyle:
    layout_template_id: str
    font_override: str
    font_docx_name: str
    font_docx_heading_name: str
    accent: str
    density: str
    ats_mode: bool
    body_size: int
    heading_size: int
    margin_mm: int
    section_gap: int
    two_column: bool


def resolve_effective_style(template_id: str, style: CvStyle) -> EffectiveStyle:
    """Resolve template + style into the concrete tokens both renderers consume."""
    ats = style.ats_mode
    layout_id = ATS_TEMPLATE_ID if ats else html_template_id(template_id)
    template = TEMPLATES[layout_id]
    if ats:
        font_docx = font_docx_heading = "Helvetica"
        accent = ATS_ACCENT
    else:
        plan = font_plan(layout_id, style.font_id or None)
        font_docx, font_docx_heading = plan.body.name, plan.heading.name
        accent = style.accent_color
    density = ATS_DENSITY if ats else style.density
    sizes = template_sizes(template, density)
    return EffectiveStyle(
        layout_template_id=layout_id,
        font_override="" if ats else (style.font_id or ""),
        font_docx_name=font_docx,
        font_docx_heading_name=font_docx_heading,
        accent=accent,
        density=density,
        ats_mode=ats,
        body_size=sizes.body_pt,
        heading_size=sizes.heading_pt,
        margin_mm=template.margin_mm,
        section_gap=sizes.section_gap_pt,
        two_column=template.two_column,
    )


def _clean(value) -> str | None:
    if value is None:
        return None
    text = nfc(" ".join(str(value).split()))
    return text or None


def _render_entry(entry: dict) -> dict:
    text = nfc(" ".join(str(entry["body"]).split()))
    heading = _clean(entry.get("heading"))
    bullets = [cleaned for b in entry.get("bullets") or [] if (cleaned := _clean(b))]
    dates = " – ".join(
        part for part in (_clean(entry.get("start_date")), _clean(entry.get("end_date"))) if part
    )
    if heading is None:
        # Freeform entry: one paragraph of body text.
        paragraph, bullets = text or None, []
    else:
        paragraph = text if not bullets and text and text != heading else None
    return {
        "id": entry["id"],
        "text": text,
        # Only text that renders as marked-up body can carry a clickable link.
        "links": URL_RE.findall(" ".join(filter(None, [paragraph, *bullets]))),
        "heading": heading,
        "subheading": _clean(entry.get("subheading")) if heading else None,
        "location": _clean(entry.get("location")) if heading else None,
        "dates": (dates or None) if heading else None,
        "bullets": bullets,
        "paragraph": paragraph,
    }


def _render_header(document) -> CvRenderHeader:
    """The header block: the candidate's name (the document's own name only when no
    name was set), headline and contact details."""
    raw = getattr(document, "header", None) or {}
    contact = [
        value
        for value in (
            _clean(raw.get("email")),
            _clean(raw.get("phone")),
            _clean(raw.get("location")),
            *(_clean(link) for link in raw.get("links") or []),
        )
        if value
    ]
    return CvRenderHeader(
        title=_clean(raw.get("name")) or nfc(document.name.strip()),
        headline=_clean(raw.get("headline")),
        contact=contact,
        email=_clean(raw.get("email")),
        phone=_clean(raw.get("phone")),
        location=_clean(raw.get("location")),
        links=[link for link in (_clean(raw_link) for raw_link in raw.get("links") or []) if link],
    )


def _unsupported_characters(
    template_id: str, header: CvRenderHeader, sections: list[dict], font_override: str | None = None
) -> list[str]:
    """The characters of this CV that none of the template's bundled fonts can draw.

    They are reported (the "Reads back" check names them) and print as spaces, never as
    a silently substituted fallback glyph.
    """
    text = "\n".join(
        [
            header.title,
            header.headline or "",
            *header.contact,
            *(
                piece
                for section in sections
                for piece in (
                    section["title"],
                    *(
                        part
                        for entry in section["entries"]
                        for part in (
                            entry["heading"],
                            entry["subheading"],
                            entry["location"],
                            entry["dates"],
                            entry["paragraph"],
                            *entry["bullets"],
                        )
                        if part
                    ),
                )
            ),
        ]
    )
    return missing_characters(template_id, text, font_override)


def build_render_model(document, template_id: str, style: CvStyle) -> CvRenderModel:
    effective = resolve_effective_style(template_id, style)
    template = TEMPLATES[effective.layout_template_id]
    sections = [
        {
            "id": section["id"],
            "kind": section["kind"],
            "title": nfc(section["title"].strip()),
            "entries": [
                _render_entry(entry)
                for entry in sorted(
                    section["entries"], key=lambda item: (item["position"], item["id"])
                )
            ],
        }
        for section in sorted(document.sections, key=lambda item: (item["position"], item["id"]))
        # An empty section would print as a bare heading in the PDF and DOCX.
        if section.get("visible", True) and section["entries"]
    ]
    header = _render_header(document)
    unsupported = _unsupported_characters(
        html_template_id(effective.layout_template_id),
        header,
        sections,
        effective.font_override or None,
    )
    return CvRenderModel(
        document_name=nfc(document.name.strip()),
        header=header,
        template_id=effective.layout_template_id,
        margin_mm=effective.margin_mm,
        unsupported_characters=unsupported,
        tokens={
            "font_docx": effective.font_docx_name,
            "font_docx_heading": effective.font_docx_heading_name,
            "ats_mode": effective.ats_mode,
            "font_override": effective.font_override,
            "accent": effective.accent,
            "body_size_pt": effective.body_size,
            "heading_size_pt": effective.heading_size,
            "section_gap_pt": effective.section_gap,
            "type_scale_pct": round(DENSITIES[effective.density][1] * 100),
            "gap_scale_pct": round(DENSITIES[effective.density][2] * 100),
            "page_size": style.page_size,
            "title_align": template.title_align,
            "two_column": effective.two_column,
        },
        sections=sections,
    )


def entry_render_lines(entry) -> list[str]:
    """The literal text lines an entry renders as, in rendering order.

    ``validate_artifact`` checks the re-read PDF against exactly these lines
    rather than the unrendered body, so a structured entry that renders as
    "heading + bullets" is judged on what is on the page (#322).
    """
    if entry.heading is None:
        return [entry.paragraph] if entry.paragraph else []
    head_line = entry.heading
    if entry.subheading:
        head_line += f" — {entry.subheading}"
    if entry.dates:
        head_line += f" {entry.dates}"
    lines = [head_line]
    if entry.location:
        lines.append(entry.location)
    lines.extend(entry.bullets)
    if entry.paragraph:
        lines.append(entry.paragraph)
    return lines


def render_pdf(model: CvRenderModel) -> bytes:
    """The CV as a PDF: its HTML template printed by the shared headless Chromium.

    Raises ``CvRenderUnavailableError`` (HTTP 503 in the API) when Chromium cannot run;
    there is no fallback renderer.
    """
    return normalize_pdf(print_pdf(render_cv_html(model, page_size=str(model.tokens.get("page_size", "a4")))))


def _normalize_text(value: str) -> str:
    return " ".join(str(value).split())


def _letters_only(value: str) -> str:
    """Text reduced to its letters and digits: separators, bullets and spacing differ
    between the model and the re-read PDF without changing what is written."""
    return re.sub(r"[\W_]+", "", str(value)).casefold()


# A page (other than the last) whose text stops short of this share of the printable
# height is mostly empty: the content did not fill it.
_MAX_PAGE_GAP = 0.4


def validate_artifact(model: CvRenderModel, pdf: bytes) -> CvArtifactEvidence:
    """Re-read a rendered PDF and report what it proves: content reads back in
    order, links are real, every section starts with its first entry and no page
    is left mostly empty."""
    import fitz

    # The read-back uses the section titles the CV itself has, so a renamed
    # section ("Selected Work") is still found as one.
    try:
        extracted = parse_cv(pdf, "cv.pdf", "pdf").extracted_text
    except CvParserRejected:
        # Longer than a PDF can be re-read (an enormous CV): report it, never a 500.
        return CvArtifactEvidence(
            reads_back="fail", links="fail", page_breaks="fail", too_long=True
        )
    vocabulary = {title_key(section.title): section.kind for section in model.sections}
    # Whatever sits above the first section is the header (name, headline, contact).
    _, grouped = split_sections(lines_from_text(extracted), vocabulary, keep_empty=True)
    # A structured entry renders as several lines (heading, location, one per
    # bullet), so sections are compared as the text they hold, not entry by entry (#322).
    expected_structure = [
        (
            section.kind,
            title_key(section.title),
            _letters_only(
                " ".join(line for entry in section.entries for line in entry_render_lines(entry))
            ),
        )
        for section in model.sections
    ]
    actual_structure = [
        (kind, title_key(title), _letters_only(" ".join(line.text for line in lines)))
        for kind, title, lines in grouped
    ]
    links = [
        link for section in model.sections for entry in section.entries for link in entry.links
    ]
    # Characters no font could draw are missing from the PDF. That is reported once,
    # as a "Reads back" failure; the page-break check compares only what was drawn.
    missing = set(model.unsupported_characters)

    def drawn(text: str) -> str:
        # A space, as on the read-back side: "APIs😀fast" reads back as "APIs fast".
        return _normalize_text("".join(" " if ch in missing else ch for ch in text))

    with fitz.open(stream=pdf, filetype="pdf") as rendered:
        page_lines = [page.get_text().splitlines() for page in rendered]
        # A glyph the font lacks reads back as NUL (or U+FFFD); it is not text.
        page_text = [
            " ".join(" ".join(lines).replace("\x00", " ").replace("\ufffd", " ").split())
            for lines in page_lines
        ]
        page_letters = [_letters_only(text) for text in page_text]
        page_breaks_ok = rendered.page_count > 0 and all(page_lines)
        for section in model.sections:
            if not section.entries:
                continue
            # The section title and the first line of its first entry share a page, so a
            # heading is never stranded at the bottom of one. Checked per rendered line
            # (not one joined block): a bullet line's literal "•" glyph would otherwise
            # break a contiguous substring match.
            # Only its opening words: a long paragraph is allowed to continue on the next page.
            first_line = " ".join(
                next((drawn(line) for line in entry_render_lines(section.entries[0])), "").split()[
                    :8
                ]
            )
            # Letters only: a heading row prints "role, organisation, dates" in cells with no
            # separator between them, so the dash and spacing of the model's line are not text.
            title = _letters_only(drawn(section.title))
            first = _letters_only(first_line)
            page_breaks_ok = page_breaks_ok and any(
                title in letters and first in letters for letters in page_letters
            )
        manifest = load_manifest(html_template_id(model.template_id))
        top, bottom = (mm * 72 / 25.4 for mm in (manifest.margin_top_mm, manifest.margin_bottom_mm))
        for number, page in enumerate(rendered):
            if number == rendered.page_count - 1:
                break
            printable = page.rect.height - top - bottom
            lowest = max((block[3] for block in page.get_text("blocks")), default=top)
            page_breaks_ok = page_breaks_ok and (
                page.rect.height - bottom - lowest <= _MAX_PAGE_GAP * printable
            )
        artifact_links = {link.get("uri") for page in rendered for link in page.get_links()}
    unsupported = model.unsupported_characters
    order_only = expected_structure != actual_structure and sorted(expected_structure) == sorted(
        actual_structure
    )
    return CvArtifactEvidence(
        order_only=order_only,
        reads_back="pass" if expected_structure == actual_structure and not unsupported else "fail",
        links="pass"
        if all(link in extracted and link in artifact_links for link in links)
        else "fail",
        page_breaks="pass" if page_breaks_ok else "fail",
        unread_sections=_unread_sections(model, expected_structure, actual_structure),
        unsupported_characters=unsupported,
        font_problems=font_problems(
            pdf,
            effective_families(
                html_template_id(model.template_id), str(model.tokens.get("font_override") or "") or None
            ),
        ),
    )


def _unread_sections(model: CvRenderModel, expected: list, actual: list) -> list[str]:
    """Titles of the sections whose text did not come back from the PDF as written."""
    if expected == actual:
        return []
    found = set(actual)
    missing = [i for i, item in enumerate(expected) if item not in found]
    if not missing:
        # Everything is there but not in the written order: name the ones out of place.
        missing = [i for i, item in enumerate(expected) if i >= len(actual) or actual[i] != item]
    return [model.sections[i].title for i in missing]
