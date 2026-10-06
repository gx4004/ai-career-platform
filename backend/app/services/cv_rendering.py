"""Canonical CV rendering, deterministic artifact generation and the style catalog.

``TEMPLATES`` and the density/ATS constants below are the single source of CV
design values: both exporters read them here, and the browser preview reads them
through ``style_catalog()`` (``GET /cv-documents/style-catalog``).

PDF bytes are stable through ReportLab's invariant mode. DOCX semantic content is
deterministic; ZIP member timestamps/order are canonicalized so bytes are stable
with a fixed python-docx version.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape

from docx import Document
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    FrameBreak,
    KeepTogether,
    NextPageTemplate,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

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
from app.services.cv_fonts import (
    FONT_FAMILIES,
    covering_font,
    css_family,
    docx_font_name,
    not_in_winansi,
    pdf_font_names,
)
from app.services.cv_parser import (
    CvParserRejected,
    lines_from_text,
    parse_cv,
    split_sections,
    title_key,
)

URL_RE = re.compile(r"https?://[^\s<>()\[\]{}\"']*[^\s<>()\[\]{}\"'.,;:!?]")


@dataclass(frozen=True)
class Template:
    name: str
    description: str
    body_size: int
    heading_size: int
    margin_mm: int
    section_gap: int
    title_align: str = "left"
    # Section kinds rendered in a sidebar column; empty means single column.
    sidebar_kinds: tuple[str, ...] = ()

    @property
    def two_column(self) -> bool:
        return bool(self.sidebar_kinds)

    @property
    def ats_safe(self) -> bool:
        """Safe for strict ATS parsers without ATS mode: single column, so the
        reading order is the order the person wrote."""
        return not self.two_column


TEMPLATES: dict[str, Template] = {
    "ats-essential": Template(
        "ATS Essential",
        "Single-column, minimal styling built for applicant tracking systems.",
        10, 13, 18, 6,
    ),
    "professional-editorial": Template(
        "Professional Editorial",
        "A refined single-column layout with warm serif section headings.",
        10, 15, 20, 8,
        title_align="center",
    ),
    "technical-portfolio": Template(
        "Technical Portfolio",
        "Monospace-accented layout suited to engineering and technical roles.",
        9, 12, 16, 7,
    ),
    "modern-two-column": Template(
        "Modern Two-Column",
        "A sidebar column for contact/skills next to a wide main column. PDF only — "
        "DOCX exports degrade to a single column.",
        9, 12, 14, 6,
        sidebar_kinds=("skills", "certifications"),
    ),
    "minimal-serif": Template(
        "Minimal Serif",
        "A quiet, minimal serif layout with generous whitespace.",
        10, 13, 20, 7,
    ),
}

ATS_SAFE_TEMPLATES = frozenset(tid for tid, template in TEMPLATES.items() if template.ats_safe)

# density -> (display name, type scale, section-gap scale)
DENSITIES: dict[str, tuple[str, float, float]] = {
    "compact": ("Compact", 0.88, 0.7),
    "normal": ("Balanced", 1.0, 1.0),
    "spacious": ("Roomy", 1.15, 1.4),
}

# What ATS-friendly mode forces, whatever the saved style says.
ATS_TEMPLATE_ID = "ats-essential"
ATS_DENSITY = "normal"
ATS_ACCENT = "#111827"
ATS_PDF_FONT = ("Helvetica", "Helvetica-Bold")
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
                title_align=template.title_align,
                margin_mm=template.margin_mm,
                sidebar_kinds=list(template.sidebar_kinds),
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
            for family in FONT_FAMILIES.values()
        ],
        palette=[CvStyleCatalogColor(value=value, name=name) for value, name in CV_ACCENT_NAMES.items()],
        densities=[CvStyleCatalogDensity(id=d, name=name) for d, (name, _, _) in DENSITIES.items()],
        ats_mode=CvStyleCatalogAtsMode(
            template_id=ATS_TEMPLATE_ID,
            density=ATS_DENSITY,
            accent=ATS_ACCENT,
            css_family=ATS_CSS_FAMILY,
        ),
    )


@dataclass(frozen=True)
class EffectiveStyle:
    layout_template_id: str
    font_name: str
    font_bold_name: str
    font_docx_name: str
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
    layout_id = ATS_TEMPLATE_ID if ats else template_id
    template = TEMPLATES[layout_id]
    if ats:
        (font_name, font_bold), font_docx, accent = ATS_PDF_FONT, ATS_PDF_FONT[0], ATS_ACCENT
    else:
        font_name, font_bold = pdf_font_names(style.font_id)
        font_docx = docx_font_name(style.font_id)
        accent = style.accent_color
    density = ATS_DENSITY if ats else style.density
    sizes = template_sizes(template, density)
    return EffectiveStyle(
        layout_template_id=layout_id,
        font_name=font_name,
        font_bold_name=font_bold,
        font_docx_name=font_docx,
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
    text = " ".join(str(value).split())
    return text or None


def _render_entry(entry: dict) -> dict:
    text = " ".join(str(entry["body"]).split())
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
        title=_clean(raw.get("name")) or document.name.strip(),
        headline=_clean(raw.get("headline")),
        contact=contact,
    )


def _fit_pdf_font(
    effective: EffectiveStyle, style: CvStyle, header: CvRenderHeader, sections: list[dict]
) -> tuple[str, str, list[str]]:
    """The PDF font pair that can draw this CV's text, and the characters none can.

    The saved font is kept whenever it covers the text. A CV in a script it lacks
    (Cyrillic in a Latin-only serif, a Polish name in ATS mode's Helvetica) falls
    back to the bundled family that covers the most; the rest is reported, never
    silently dropped.
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
    if effective.ats_mode:
        missing = not_in_winansi(text)
        if not missing:
            return effective.font_name, effective.font_bold_name, []
        font_id = "lato"
    else:
        font_id = style.font_id
    chosen, missing = covering_font(font_id, text)
    font_name, font_bold_name = pdf_font_names(chosen)
    return font_name, font_bold_name, missing


def build_render_model(document, template_id: str, style: CvStyle) -> CvRenderModel:
    effective = resolve_effective_style(template_id, style)
    template = TEMPLATES[effective.layout_template_id]
    sections = [
        {
            "id": section["id"],
            "kind": section["kind"],
            "title": section["title"].strip(),
            "entries": [
                _render_entry(entry)
                for entry in sorted(section["entries"], key=lambda item: (item["position"], item["id"]))
            ],
        }
        for section in sorted(document.sections, key=lambda item: (item["position"], item["id"]))
        if section.get("visible", True)
    ]
    header = _render_header(document)
    font_name, font_bold_name, unsupported = _fit_pdf_font(effective, style, header, sections)
    return CvRenderModel(
        document_name=document.name.strip(),
        header=header,
        template_id=effective.layout_template_id,
        margin_mm=effective.margin_mm,
        unsupported_characters=unsupported,
        tokens={
            "font": font_name,
            "font_bold": font_bold_name,
            "font_docx": effective.font_docx_name,
            "accent": effective.accent,
            "body_size_pt": effective.body_size,
            "heading_size_pt": effective.heading_size,
            "section_gap_pt": effective.section_gap,
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


def _markup(text: str) -> str:
    cursor, parts = 0, []
    for match in URL_RE.finditer(text):
        parts.extend(
            (
                escape(text[cursor : match.start()]),
                f'<a href="{escape(match.group())}" color="blue">{escape(match.group())}</a>',
            )
        )
        cursor = match.end()
    parts.append(escape(text[cursor:]))
    return "".join(parts)


def _pdf_styles(model: CvRenderModel) -> dict[str, ParagraphStyle]:
    tokens = model.tokens
    font = str(tokens["font"])
    font_bold = str(tokens["font_bold"])
    accent = str(tokens["accent"])
    body_size = int(tokens["body_size_pt"])
    heading_size = int(tokens["heading_size_pt"])
    heading = ParagraphStyle(
        "heading",
        fontName=font,
        fontSize=heading_size,
        leading=heading_size + 3,
        textColor=HexColor(accent),
        spaceAfter=3,
        keepWithNext=True,
    )
    body = ParagraphStyle(
        "body", fontName=font, fontSize=body_size, leading=body_size + 3, spaceAfter=4
    )
    title = ParagraphStyle(
        "title",
        parent=heading,
        fontSize=heading_size + 6,
        leading=heading_size + 9,
        alignment=TA_CENTER if tokens["title_align"] == "center" else TA_LEFT,
        spaceAfter=10,
    )
    headline = ParagraphStyle(
        "headline",
        fontName=font,
        fontSize=body_size + 2,
        leading=body_size + 5,
        alignment=title.alignment,
        spaceAfter=2,
    )
    contact = ParagraphStyle(
        "contact",
        fontName=font,
        fontSize=max(7, body_size - 1),
        leading=body_size + 3,
        textColor=HexColor("#4B5563"),
        alignment=title.alignment,
        spaceAfter=2,
    )
    entry_heading = ParagraphStyle(
        "entry_heading",
        fontName=font_bold,
        fontSize=body_size + 1,
        leading=body_size + 4,
        spaceAfter=1,
    )
    entry_heading_right = ParagraphStyle(
        "entry_heading_right", parent=entry_heading, alignment=TA_RIGHT
    )
    entry_meta = ParagraphStyle(
        "entry_meta",
        fontName=font,
        fontSize=max(7, body_size - 1),
        leading=body_size + 2,
        textColor=HexColor("#4B5563"),
        spaceAfter=2,
    )
    bullet = ParagraphStyle("bullet", parent=body, leftIndent=10, bulletIndent=0, spaceAfter=2)
    return {
        "heading": heading,
        "body": body,
        "title": title,
        "headline": headline,
        "contact": contact,
        "entry_heading": entry_heading,
        "entry_heading_right": entry_heading_right,
        "entry_meta": entry_meta,
        "bullet": bullet,
    }


_FLUSH_TABLE = TableStyle(
    [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]
)


def _entry_flow(entry, styles: dict[str, ParagraphStyle], content_width: float) -> list:
    flow: list = []
    if entry.heading is not None:
        left = f"<b>{escape(entry.heading)}</b>"
        if entry.subheading:
            left += f" — {escape(entry.subheading)}"
        if entry.dates:
            row = Table(
                [
                    [
                        Paragraph(left, styles["entry_heading"]),
                        Paragraph(escape(entry.dates), styles["entry_heading_right"]),
                    ]
                ],
                colWidths=[content_width * 0.7, content_width * 0.3],
            )
            row.setStyle(_FLUSH_TABLE)
            # A table starts every cell in ReportLab's default, non-embedded Helvetica.
            row.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), styles["body"].fontName)]))
            flow.append(row)
        else:
            flow.append(Paragraph(left, styles["entry_heading"]))
        if entry.location:
            flow.append(Paragraph(escape(entry.location), styles["entry_meta"]))
        for bullet_text in entry.bullets:
            flow.append(Paragraph(f"&bull;&nbsp;{_markup(bullet_text)}", styles["bullet"]))
    if entry.paragraph:
        flow.append(Paragraph(_markup(entry.paragraph), styles["body"]))
    return flow


def _split_sidebar(sections, sidebar_kinds) -> tuple[list, list]:
    """The two-column sidebar/main split (mirrored by the preview's ``splitTwoColumn``)."""
    side = [s for s in sections if s.kind in sidebar_kinds]
    main = [s for s in sections if s.kind not in sidebar_kinds]
    if not side and main:
        side, main = main[:1], main[1:]
    return side, main


def _pdf_header(model: CvRenderModel, styles: dict[str, ParagraphStyle]) -> list:
    header = model.header
    has_detail = bool(header.headline or header.contact)
    title = ParagraphStyle("title_tight", parent=styles["title"], spaceAfter=3 if has_detail else 10)
    flow: list = [Paragraph(escape(header.title), title)]
    if header.headline:
        flow.append(Paragraph(escape(header.headline), styles["headline"]))
    if header.contact:
        # A narrow sidebar column cannot hold one long line: stack the items there.
        separator = "<br/>" if model.tokens["two_column"] else " | "
        flow.append(
            Paragraph(separator.join(_markup(item) for item in header.contact), styles["contact"])
        )
    if has_detail:
        flow.append(Spacer(1, 8))
    return flow


def render_pdf(model: CvRenderModel) -> bytes:
    page_w, page_h = A4
    m = model.margin_mm * mm
    height = page_h - 2 * m
    if model.tokens["two_column"]:
        sidebar_w = 58 * mm
        main_x = m + sidebar_w + 6 * mm
        main_w = page_w - main_x - m
        frames = [
            Frame(m, m, sidebar_w, height, id="side", leftPadding=0, rightPadding=6, topPadding=0),
            Frame(main_x, m, main_w, height, id="main", leftPadding=0, topPadding=0),
        ]
        side, main = _split_sidebar(model.sections, TEMPLATES[model.template_id].sidebar_kinds)
        columns = [(side, sidebar_w), (main, main_w)]
        # Later pages carry the main column only: its text must not flow into the
        # (narrower) sidebar frame of a continuation page.
        continued = [Frame(main_x, m, main_w, height, id="main", leftPadding=0, topPadding=0)]
    else:
        frames = [Frame(m, m, page_w - 2 * m, height, id="normal")]
        columns = [(model.sections, page_w - 2 * m)]
        continued = None

    out = io.BytesIO()
    doc = BaseDocTemplate(
        out,
        pagesize=A4,
        leftMargin=m,
        rightMargin=m,
        topMargin=m,
        bottomMargin=m,
        invariant=1,
        title=model.document_name,
        author="Career Workbench",
        creator="Career Workbench",
        # Without this every page starts in ReportLab's default, non-embedded Helvetica.
        initialFontName=str(model.tokens["font"]),
    )
    doc.addPageTemplates([PageTemplate(id="cv", frames=frames)])
    if continued is not None:
        doc.addPageTemplates([PageTemplate(id="cv-continued", frames=continued)])
    styles = _pdf_styles(model)
    section_gap = int(model.tokens["section_gap_pt"])
    story: list = []
    if continued is not None:
        # Declared up front, so whichever column overflows page one, every later page is
        # main-column only. Sidebar text too long for page one spills into page one's main
        # frame (still readable) instead of reaching a continuation page's narrow frame.
        story.append(NextPageTemplate("cv-continued"))
    story.extend(_pdf_header(model, styles))
    for index, (sections, width) in enumerate(columns):
        if index:
            story.append(FrameBreak())
        for section in sections:
            story.extend(_section_flow(section, styles, width, height))
            story.append(Spacer(1, section_gap))
    doc.build(story)
    return out.getvalue()


# An entry up to this share of a page stays in one piece; a longer one may split.
_KEEP_ENTRY_TOGETHER = 0.3
# Room a heading and the start of a long entry need so neither is stranded at a page bottom.
_START_ROOM_PT = 80


def _flow_height(flow: list, width: float) -> float:
    return sum(item.wrap(width, 1_000_000)[1] for item in flow)


def _entry_groups(flow: list, width: float, frame_height: float) -> list[list]:
    """The pieces of one entry that must each stay on a single page."""
    if len(flow) <= 3 or _flow_height(flow, width) <= _KEEP_ENTRY_TOGETHER * frame_height:
        # Short, or too few pieces to split between: a long paragraph splits by itself.
        return [flow]
    return [flow[:3], *([item] for item in flow[3:-2]), flow[-2:]]


def _section_flow(section, styles: dict[str, ParagraphStyle], width: float, frame_height: float):
    """A section as flowables that may break across pages between entries.

    The heading always travels with the start of the first entry, and a short entry
    (a role of a few bullets) is never split; a long one keeps its first and last
    lines together. A single long paragraph is left to split on its own after
    reserving room for the heading and its first lines. Wrapping the whole section in
    one keep-together block would push it to the next page whenever it did not fit,
    leaving the previous page blank.
    """
    heading = Paragraph(escape(section.title), styles["heading"])
    groups = [
        group
        for entry in section.entries
        for group in _entry_groups(_entry_flow(entry, styles, width), width, frame_height)
        if group
    ]
    if not groups:
        return [KeepTogether([heading])]
    story: list = []
    for index, group in enumerate(groups):
        items = [heading, *group] if index == 0 else group
        if _flow_height(items, width) <= _KEEP_ENTRY_TOGETHER * frame_height:
            story.append(KeepTogether(items) if len(items) > 1 else items[0])
        else:
            # Too long to keep whole: it splits on its own once it has room to start. The
            # heading drops keepWithNext here, which would otherwise glue it to all of it.
            if index == 0:
                loose = ParagraphStyle("heading_loose", parent=styles["heading"], keepWithNext=0)
                items = [Paragraph(escape(section.title), loose), *group]
            story.extend([CondPageBreak(_START_ROOM_PT), *items])
    return story


def render_docx(model: CvRenderModel) -> bytes:
    tokens = model.tokens
    font = str(tokens["font_docx"])
    accent = RGBColor.from_string(str(tokens["accent"])[1:])
    body_size = int(tokens["body_size_pt"])
    heading_size = int(tokens["heading_size_pt"])
    doc = Document()
    section = doc.sections[0]
    # python-docx's template is US Letter; the PDF and the margins below are A4.
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.top_margin = section.bottom_margin = section.left_margin = section.right_margin = (
        Inches(model.margin_mm / 25.4)
    )
    core = doc.core_properties
    core.title = model.document_name
    core.author = "Career Workbench"
    core.created = core.modified = datetime(2000, 1, 1, tzinfo=UTC)
    normal = doc.styles["Normal"]
    normal.font.name = font
    normal.font.size = Pt(body_size)
    heading_style = doc.styles["Heading 1"]
    heading_style.font.name = font
    for theme_attribute in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"):
        # The template's theme fonts would otherwise win over the named font.
        heading_style.element.rPr.rFonts.attrib.pop(qn(f"w:{theme_attribute}"), None)
    heading_style.font.size = Pt(heading_size)
    heading_style.font.bold = True
    heading_style.font.color.rgb = accent
    heading_style.paragraph_format.space_before = Pt(int(tokens["section_gap_pt"]) + 4)
    heading_style.paragraph_format.space_after = Pt(3)
    alignment = 1 if tokens["title_align"] == "center" else 0
    title = doc.add_paragraph()
    title.alignment = alignment
    run = title.add_run(model.header.title)
    run.bold = True
    run.font.name = font
    run.font.size = Pt(heading_size + 6)
    run.font.color.rgb = accent
    if model.header.headline:
        headline = doc.add_paragraph()
        headline.alignment = alignment
        _add_run(headline, model.header.headline, font)
    if model.header.contact:
        contact = doc.add_paragraph()
        contact.alignment = alignment
        for index, item in enumerate(model.header.contact):
            if index:
                _add_run(contact, " | ", font)
            _add_linked_text(contact, item, font)
    # A4 width in inches minus margins, for the right-aligned date tab stop.
    content_width_in = 210 / 25.4 - 2 * model.margin_mm / 25.4
    for rendered_section in model.sections:
        # A real Heading style, so Word's navigation pane and screen readers see sections.
        p = doc.add_paragraph(style="Heading 1")
        p.paragraph_format.keep_with_next = True
        r = p.add_run(rendered_section.title)
        r.bold = True
        r.font.name = font
        r.font.size = Pt(heading_size)
        r.font.color.rgb = accent
        for entry in rendered_section.entries:
            _add_docx_entry(doc, entry, font, content_width_in)
    raw = io.BytesIO()
    doc.save(raw)
    source = zipfile.ZipFile(io.BytesIO(raw.getvalue()))
    final = io.BytesIO()
    with zipfile.ZipFile(final, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for name in sorted(source.namelist()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            target.writestr(info, source.read(name))
    source.close()
    return final.getvalue()


def _add_run(paragraph, text: str, font: str, *, bold=False, italic=False) -> None:
    run = paragraph.add_run(text)
    run.bold = bold or None
    run.italic = italic or None
    run.font.name = font


def _add_docx_entry(doc, entry, font: str, content_width_in: float) -> None:
    if entry.heading is not None:
        heading_line = doc.add_paragraph()
        heading_line.paragraph_format.keep_with_next = True
        _add_run(heading_line, entry.heading, font, bold=True)
        if entry.subheading:
            _add_run(heading_line, f" — {entry.subheading}", font)
        if entry.dates:
            heading_line.paragraph_format.tab_stops.add_tab_stop(
                Inches(content_width_in), WD_TAB_ALIGNMENT.RIGHT
            )
            _add_run(heading_line, f"\t{entry.dates}", font)
        if entry.location:
            _add_run(doc.add_paragraph(), entry.location, font, italic=True)
        for bullet_text in entry.bullets:
            _add_run(doc.add_paragraph(style="List Bullet"), bullet_text, font)
    if entry.paragraph:
        p = doc.add_paragraph()
        p.paragraph_format.keep_together = True
        _add_linked_text(p, entry.paragraph, font)


def _add_linked_text(paragraph, text: str, font: str) -> None:
    cursor = 0
    for match in URL_RE.finditer(text):
        _add_run(paragraph, text[cursor : match.start()], font)
        _add_hyperlink(paragraph, match.group())
        cursor = match.end()
    _add_run(paragraph, text[cursor:], font)


def _add_hyperlink(paragraph, url: str) -> None:
    relationship_id = paragraph.part.relate_to(url, RT.HYPERLINK, is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), relationship_id)
    run = OxmlElement("w:r")
    properties = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    properties.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    properties.append(underline)
    text = OxmlElement("w:t")
    text.text = url
    run.extend((properties, text))
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


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
                next((drawn(line) for line in entry_render_lines(section.entries[0])), "").split()[:8]
            )
            title = drawn(section.title)
            page_breaks_ok = page_breaks_ok and any(
                title in text and first_line in text for text in page_text
            )
        margin = model.margin_mm * 72 / 25.4
        for number, page in enumerate(rendered):
            if number == rendered.page_count - 1:
                break
            printable = page.rect.height - 2 * margin
            lowest = max((block[3] for block in page.get_text("blocks")), default=margin)
            page_breaks_ok = page_breaks_ok and (
                page.rect.height - margin - lowest <= _MAX_PAGE_GAP * printable
            )
        artifact_links = {link.get("uri") for page in rendered for link in page.get_links()}
    unsupported = model.unsupported_characters
    order_only = (
        expected_structure != actual_structure
        and sorted(expected_structure) == sorted(actual_structure)
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
