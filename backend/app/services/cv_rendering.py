"""Canonical CV rendering and deterministic artifact generation.

The JSON render model is the single source consumed by browser preview and both
exporters. PDF bytes are stable through ReportLab's invariant mode. DOCX semantic
content is deterministic; ZIP member timestamps/order are canonicalized so bytes
are stable with a fixed python-docx version.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape

from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer

from app.schemas.cv_documents import CvArtifactEvidence, CvRenderModel
from app.services.cv_parser import parse_cv_import

URL_RE = re.compile(r"https?://[^\s<>()\[\]{}\"']*[^\s<>()\[\]{}\"'.,;:!?]")


@dataclass(frozen=True)
class Template:
    id: str
    font: str
    accent: str
    body_size: int
    heading_size: int
    margin_mm: int
    section_gap: int
    align: str


TEMPLATES = {
    "ats-essential": Template("ats-essential", "Helvetica", "#111827", 10, 13, 18, 6, "left"),
    "professional-editorial": Template(
        "professional-editorial", "Times-Roman", "#7C2D12", 10, 15, 20, 8, "left"
    ),
    "technical-portfolio": Template(
        "technical-portfolio", "Courier", "#075985", 9, 12, 16, 7, "left"
    ),
}


def build_render_model(document, template_id: str) -> CvRenderModel:
    template = TEMPLATES[template_id]
    sections = []
    for section in sorted(document.sections, key=lambda item: (item["position"], item["id"])):
        if not section.get("visible", True):
            continue
        entries = []
        for entry in sorted(section["entries"], key=lambda item: (item["position"], item["id"])):
            text = " ".join(str(entry["body"]).split())
            entries.append({"id": entry["id"], "text": text, "links": URL_RE.findall(text)})
        sections.append(
            {
                "id": section["id"],
                "kind": section["kind"],
                "title": section["title"].strip(),
                "entries": entries,
            }
        )
    canonical = {
        "document_id": document.id,
        "document_name": document.name.strip(),
        "template_id": template_id,
        "page": {"width_mm": 210, "height_mm": 297, "margin_mm": template.margin_mm},
        "tokens": {
            "font": template.font,
            "accent": template.accent,
            "body_size_pt": template.body_size,
            "heading_size_pt": template.heading_size,
            "section_gap_pt": template.section_gap,
            "align": template.align,
        },
        "sections": sections,
    }
    digest = hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return CvRenderModel(**canonical, canonical_hash=digest)


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


def render_pdf(model: CvRenderModel) -> bytes:
    out = io.BytesIO()
    t = TEMPLATES[model.template_id]
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=t.margin_mm * mm,
        rightMargin=t.margin_mm * mm,
        topMargin=t.margin_mm * mm,
        bottomMargin=t.margin_mm * mm,
        invariant=1,
        title=model.document_name,
        author="Career Workbench",
        creator="Career Workbench",
    )
    heading = ParagraphStyle(
        "heading",
        fontName=t.font,
        fontSize=t.heading_size,
        leading=t.heading_size + 3,
        textColor=HexColor(t.accent),
        spaceAfter=3,
        keepWithNext=True,
    )
    body = ParagraphStyle(
        "body", fontName=t.font, fontSize=t.body_size, leading=t.body_size + 3, spaceAfter=4
    )
    title = ParagraphStyle(
        "title",
        parent=heading,
        fontSize=t.heading_size + 6,
        leading=t.heading_size + 9,
        alignment=TA_CENTER if model.template_id == "professional-editorial" else TA_LEFT,
        spaceAfter=10,
    )
    story = [Paragraph(escape(model.document_name), title)]
    for section in model.sections:
        flow = [Paragraph(escape(section.title), heading)]
        flow.extend(Paragraph(_markup(entry.text), body) for entry in section.entries)
        story.extend([KeepTogether(flow), Spacer(1, t.section_gap)])
    doc.build(story)
    return out.getvalue()


def render_docx(model: CvRenderModel) -> bytes:
    t = TEMPLATES[model.template_id]
    doc = Document()
    section = doc.sections[0]
    section.top_margin = section.bottom_margin = section.left_margin = section.right_margin = (
        Inches(t.margin_mm / 25.4)
    )
    core = doc.core_properties
    core.title = model.document_name
    core.author = "Career Workbench"
    core.created = core.modified = datetime(2000, 1, 1, tzinfo=UTC)
    normal = doc.styles["Normal"]
    normal.font.name = t.font
    normal.font.size = Pt(t.body_size)
    title = doc.add_paragraph()
    title.alignment = 1 if model.template_id == "professional-editorial" else 0
    run = title.add_run(model.document_name)
    run.bold = True
    run.font.name = t.font
    run.font.size = Pt(t.heading_size + 6)
    run.font.color.rgb = RGBColor.from_string(t.accent[1:])
    for rendered_section in model.sections:
        p = doc.add_paragraph()
        p.paragraph_format.keep_with_next = True
        r = p.add_run(rendered_section.title)
        r.bold = True
        r.font.name = t.font
        r.font.size = Pt(t.heading_size)
        r.font.color.rgb = RGBColor.from_string(t.accent[1:])
        for entry in rendered_section.entries:
            p = doc.add_paragraph()
            p.paragraph_format.keep_together = True
            cursor = 0
            for match in URL_RE.finditer(entry.text):
                p.add_run(entry.text[cursor : match.start()])
                _add_hyperlink(p, match.group())
                cursor = match.end()
            p.add_run(entry.text[cursor:])
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


def validate_artifact(model: CvRenderModel, artifact: bytes, fmt: str) -> CvArtifactEvidence:
    parsed = parse_cv_import(artifact, f"cv.{fmt}", fmt)
    expected_structure = [
        (section.kind, section.title, [entry.text for entry in section.entries])
        for section in model.sections
    ]
    actual_structure = [
        (section.kind, section.title, [entry.body for entry in section.entries])
        for section in parsed.sections
    ]
    if actual_structure and actual_structure[0][2] == [model.document_name]:
        actual_structure = actual_structure[1:]
    content_equivalent = expected_structure == actual_structure
    links = [
        link for section in model.sections for entry in section.entries for link in entry.links
    ]
    extracted = "\n".join(e.body for s in parsed.sections for e in s.entries)
    if fmt == "pdf":
        import fitz

        with fitz.open(stream=artifact, filetype="pdf") as rendered:
            page_lines = [page.get_text().splitlines() for page in rendered]
            page_text = [" ".join(" ".join(lines).split()) for lines in page_lines]
            page_breaks_ok = rendered.page_count > 0 and all(page_lines)
            for section in model.sections:
                if not section.entries:
                    continue
                page_breaks_ok = page_breaks_ok and any(
                    section.title in text and section.entries[0].text in text for text in page_text
                )
            artifact_links = {link.get("uri") for page in rendered for link in page.get_links()}
    else:
        with zipfile.ZipFile(io.BytesIO(artifact)) as package:
            document_xml = package.read("word/document.xml")
            relationships = package.read("word/_rels/document.xml.rels")
        page_breaks_ok = b"w:keepNext" in document_xml and b"w:sectPr" in document_xml
        artifact_links = {link for link in links if link.encode() in relationships}
    return CvArtifactEvidence(
        template_id=model.template_id,
        format=fmt,
        searchable_text="pass" if content_equivalent else "fail",
        links="pass"
        if all(link in extracted and link in artifact_links for link in links)
        else "fail",
        page_breaks="pass" if page_breaks_ok else "fail",
        re_importability="pass" if content_equivalent else "fail",
        canonical_hash=model.canonical_hash,
    )
