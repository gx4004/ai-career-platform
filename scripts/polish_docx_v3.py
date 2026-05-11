"""Stage M — final visual parity pass for the thesis supervisor draft.

The script assumes Pandoc has already converted the locked thesis Markdown to
DOCX. It applies the Stage L academic style and then closes the visible parity
gaps against the supervisor's prior approved MSc thesis: cleaner front matter,
placeholder-free TOC field, Polish language metadata, book-style tables, and
bibliography hanging indents.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import RGBColor
from docx.shared import Cm, Inches, Pt
from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS, "r": R_NS}

FONT = "Times New Roman"
CODE_FONT = "Courier New"
CODE_FILL = "F5F5F5"
CODE_FONT_SIZE_PT = 9.5
TITLE = "An AI-Based System for Personalized Career Recommendation"
TITLE_PL = "System oparty na sztucznej inteligencji do spersonalizowanego doradztwa zawodowego"
AUTHOR = "Egemen Goncu"
SUPERVISOR = "dr inż. Michał Błędowski"

TOC_ENTRIES = [
    (1, "Chapter 1 — Introduction", "1"),
    (2, "1.1 The career decision problem", "1"),
    (2, "1.2 AI-based recommendation systems for careers", "2"),
    (2, "1.3 Resume parsing and job-description analysis", "2"),
    (2, "1.4 Heuristic and language-model scoring approaches", "3"),
    (2, "1.5 Purpose of the thesis", "4"),
    (2, "1.6 Structure of the thesis", "5"),
    (1, "Chapter 2 — System architecture", "7"),
    (2, "2.1 Functional and non-functional requirements", "7"),
    (2, "2.2 Technology stack and rationale", "9"),
    (2, "2.3 Backend architecture", "10"),
    (2, "2.4 Frontend architecture", "13"),
    (2, "2.5 Data model and persistence", "14"),
    (2, "2.6 Authentication and security", "15"),
    (2, "2.7 Deployment topology", "15"),
    (1, "Chapter 3 — Tool implementations", "18"),
    (2, "3.1 Cross-cutting design", "18"),
    (2, "3.2 Resume Analyzer", "20"),
    (2, "3.3 Job Match", "21"),
    (2, "3.4 Career Path", "22"),
    (2, "3.5 Cover Letter", "22"),
    (2, "3.6 Interview Q&A", "23"),
    (2, "3.7 Portfolio Planner", "23"),
    (2, "3.8 Persistence, regeneration, and result history", "23"),
    (2, "3.9 Reliability behaviour observed in production", "24"),
    (1, "Chapter 4 — Conducted studies and results", "25"),
    (2, "4.1 Methodology", "25"),
    (2, "4.2 The strong heuristic (v2)", "27"),
    (2, "4.3 Results", "29"),
    (2, "4.4 Discussion and limitations", "35"),
    (1, "Chapter 5 — Conclusions", "37"),
    (2, "5.1 Results", "37"),
    (2, "5.2 Limitations", "38"),
    (2, "5.3 Future development", "39"),
    (1, "Bibliography", "42"),
    (1, "Appendix A — Source listings", "47"),
    (1, "Appendix B — Evaluation dataset description", "49"),
    (1, "Appendix C — Screenshots of the running system", "50"),
    (1, "Appendix D — Configuration reference", "53"),
]


def set_run_font(run, *, size_pt: float | None = None, bold: bool | None = None, italic: bool | None = None) -> None:
    run.font.name = FONT
    if size_pt is not None:
        run.font.size = Pt(size_pt)
    run.font.color.rgb = RGBColor(0, 0, 0)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), FONT)


def set_style_font(style, *, size_pt: float, bold: bool | None = None, italic: bool | None = None) -> None:
    style.font.name = FONT
    style.font.size = Pt(size_pt)
    style.font.color.rgb = RGBColor(0, 0, 0)
    if bold is not None:
        style.font.bold = bold
    if italic is not None:
        style.font.italic = italic
    rpr = style._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), FONT)


def remove_paragraph_borders(style) -> None:
    ppr = style._element.get_or_add_pPr()
    pbdr = ppr.find(qn("w:pBdr"))
    if pbdr is not None:
        ppr.remove(pbdr)


def remove_direct_paragraph_borders(paragraph_obj) -> None:
    ppr = paragraph_obj._p.get_or_add_pPr()
    pbdr = ppr.find(qn("w:pBdr"))
    if pbdr is not None:
        ppr.remove(pbdr)


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_paragraph_shading(paragraph_obj, fill: str) -> None:
    ppr = paragraph_obj._p.get_or_add_pPr()
    shd = ppr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        ppr.append(shd)
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)


def set_run_monospace(run, *, size_pt: float = CODE_FONT_SIZE_PT) -> None:
    run.font.name = CODE_FONT
    run.font.size = Pt(size_pt)
    run.font.color.rgb = RGBColor(0, 0, 0)
    run.bold = False
    run.italic = False
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), CODE_FONT)


def is_code_paragraph(paragraph_obj) -> bool:
    style_name = (paragraph_obj.style.name or "").lower()
    if any(token in style_name for token in ("source code", "verbatim", "code")):
        return True
    runs = paragraph_obj.runs
    if not runs:
        return False
    monospace_runs = 0
    for run in runs:
        rfonts = run._element.find(qn("w:rPr"))
        if rfonts is None:
            continue
        rfonts_node = rfonts.find(qn("w:rFonts"))
        if rfonts_node is None:
            continue
        ascii_font = (rfonts_node.get(qn("w:ascii")) or "").lower()
        if any(token in ascii_font for token in ("courier", "consolas", "menlo", "monaco", "mono")):
            monospace_runs += 1
    return monospace_runs > 0 and monospace_runs == len(runs)


def style_code_paragraph(paragraph_obj) -> None:
    paragraph_obj.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf = paragraph_obj.paragraph_format
    pf.line_spacing = 1.0
    pf.space_before = Pt(2)
    pf.space_after = Pt(2)
    pf.first_line_indent = Cm(0)
    pf.left_indent = Cm(0.4)
    pf.right_indent = Cm(0.4)
    pf.keep_together = True
    pf.keep_with_next = False
    set_paragraph_shading(paragraph_obj, CODE_FILL)
    for run in paragraph_obj.runs:
        set_run_monospace(run)


def set_cell_borders(cell, color: str = "666666", size: str = "6", *, val: str = "single") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = qn(f"w:{edge}")
        element = borders.find(tag)
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), val)
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_cell_border_edge(cell, edge: str, *, color: str = "000000", size: str = "8", val: str = "single") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    tag = qn(f"w:{edge}")
    element = borders.find(tag)
    if element is None:
        element = OxmlElement(f"w:{edge}")
        borders.append(element)
    element.set(qn("w:val"), val)
    element.set(qn("w:sz"), size)
    element.set(qn("w:space"), "0")
    element.set(qn("w:color"), color)


def set_run_lang(run, lang: str) -> None:
    rpr = run._element.get_or_add_rPr()
    lang_node = rpr.find(qn("w:lang"))
    if lang_node is None:
        lang_node = OxmlElement("w:lang")
        rpr.append(lang_node)
    lang_node.set(qn("w:val"), lang)
    lang_node.set(qn("w:eastAsia"), lang)
    lang_node.set(qn("w:bidi"), lang)


def set_cell_margins(table, margin_twips: int = 85) -> None:
    tbl_pr = table._tbl.tblPr
    margins = tbl_pr.find(qn("w:tblCellMar"))
    if margins is None:
        margins = OxmlElement("w:tblCellMar")
        tbl_pr.append(margins)
    for side in ("top", "left", "bottom", "right"):
        node = margins.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            margins.append(node)
        node.set(qn("w:w"), str(margin_twips))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths_cm: list[float]) -> None:
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    tbl_style = tbl_pr.find(qn("w:tblStyle"))
    if tbl_style is not None:
        tbl_pr.remove(tbl_style)
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    total_twips = int(sum(widths_cm) * 567)
    tbl_w.set(qn("w:w"), str(total_twips))
    tbl_w.set(qn("w:type"), "dxa")

    layout = tbl_pr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tbl_pr.append(layout)
    layout.set(qn("w:type"), "fixed")

    grid = tbl.tblGrid
    if grid is None:
        grid = OxmlElement("w:tblGrid")
        tbl.insert(list(tbl).index(tbl_pr) + 1, grid)
    for child in list(grid):
        grid.remove(child)
    widths_twips = [int(w_cm * 567) for w_cm in widths_cm]
    for width in widths_twips:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)

    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            if idx >= len(widths_twips):
                continue
            cell.width = Cm(widths_cm[idx])
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(widths_twips[idx]))
            tc_w.set(qn("w:type"), "dxa")


def table_width_profile(table) -> list[float]:
    headers = [cell.text.strip().lower() for cell in table.rows[0].cells] if table.rows else []
    cols = len(table.columns)
    if cols == 2:
        return [3.2, 12.4]
    if cols == 3:
        if headers[:3] == ["id", "tool", "required behaviour"]:
            return [1.2, 2.9, 11.5]
        if headers[:3] == ["variable", "purpose", "default"]:
            return [4.6, 7.0, 4.0]
        return [3.8, 4.2, 7.6]
    if cols == 4:
        return [3.4, 4.2, 4.5, 3.5]
    if cols == 5:
        if headers and headers[0] == "variant":
            return [5.1, 3.2, 2.7, 2.2, 2.0]
        return [3.4, 3.5, 3.5, 2.4, 2.4]
    return [15.6 / max(cols, 1)] * cols


def apply_python_docx_polish(src: Path, staged: Path) -> None:
    doc = Document(str(src))

    section = doc.sections[0]
    section.start_type = WD_SECTION_START.NEW_PAGE
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)
    section.header_distance = Cm(1.25)
    section.footer_distance = Cm(1.25)

    set_style_font(doc.styles["Normal"], size_pt=12)
    normal_pf = doc.styles["Normal"].paragraph_format
    normal_pf.line_spacing = 1.3
    normal_pf.space_after = Pt(4)
    normal_pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal_pf.first_line_indent = Cm(0.5)

    for name, size in (("Body Text", 12), ("First Paragraph", 12)):
        if name in doc.styles:
            set_style_font(doc.styles[name], size_pt=size)
            pf = doc.styles[name].paragraph_format
            pf.line_spacing = 1.3
            pf.space_after = Pt(4)
            pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            pf.first_line_indent = Cm(0.5)

    for name, size in (("Heading 1", 18), ("Heading 2", 14), ("Heading 3", 12)):
        if name in doc.styles:
            set_style_font(doc.styles[name], size_pt=size, bold=True, italic=(name == "Heading 3"))
            remove_paragraph_borders(doc.styles[name])
            pf = doc.styles[name].paragraph_format
            pf.line_spacing = 1.15
            pf.space_before = Pt(8 if name == "Heading 1" else 6)
            pf.space_after = Pt(5 if name == "Heading 1" else 3)
            pf.keep_with_next = True

    previous_was_heading = False
    in_polish_abstract = False
    in_bibliography = False
    for p in doc.paragraphs:
        text = p.text.strip()
        style_name = p.style.name
        if style_name.startswith("Heading"):
            if text == "Streszczenie":
                in_polish_abstract = True
            elif text == "Abstract (English)":
                in_polish_abstract = False
            if text == "Bibliography":
                in_bibliography = True
            elif in_bibliography and text.startswith("Appendices"):
                in_bibliography = False
        if style_name.startswith("Heading"):
            remove_direct_paragraph_borders(p)
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.keep_with_next = True
            if style_name == "Heading 1":
                p.paragraph_format.page_break_before = True
                if text.startswith("Chapter "):
                    p.paragraph_format.space_before = Pt(24)
                    p.paragraph_format.space_after = Pt(12)
            for run in p.runs:
                set_run_font(run, size_pt=18 if style_name == "Heading 1" else 14 if style_name == "Heading 2" else 12, bold=True, italic=(style_name == "Heading 3"))
                if in_polish_abstract:
                    set_run_lang(run, "pl-PL")
            previous_was_heading = True
            continue

        if p._p.findall(".//" + qn("w:drawing")):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next = True
            p.paragraph_format.space_before = Pt(3)
            p.paragraph_format.space_after = Pt(2)
            previous_was_heading = False
            continue

        if is_code_paragraph(p):
            style_code_paragraph(p)
            previous_was_heading = False
            continue

        if text:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.line_spacing = 1.3
            p.paragraph_format.space_after = Pt(4)
            if in_bibliography and text.startswith("["):
                p.paragraph_format.left_indent = Inches(0.5)
                p.paragraph_format.first_line_indent = Inches(-0.5)
                p.paragraph_format.space_after = Pt(3)
            elif not previous_was_heading and not text.startswith(("Figure ", "Table ", "[", "Keywords:", "Słowa kluczowe:")):
                p.paragraph_format.first_line_indent = Cm(0.5)
            if text.startswith(("Figure ", "Table ")):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.keep_together = True
                p.paragraph_format.first_line_indent = Cm(0)
                for run in p.runs:
                    run.italic = True
            for run in p.runs:
                set_run_font(run, size_pt=12)
                if in_polish_abstract:
                    set_run_lang(run, "pl-PL")
        previous_was_heading = False

    max_width = Cm(11.2)
    for idx, shape in enumerate(doc.inline_shapes):
        if idx < 3 or shape.width > max_width:
            ratio = max_width / shape.width
            shape.width = max_width
            shape.height = int(shape.height * ratio)

    for table in doc.tables:
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        set_table_geometry(table, table_width_profile(table))
        set_cell_margins(table, 65)
        for r_idx, row in enumerate(table.rows):
            for cell in row.cells:
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                set_cell_borders(cell, color="FFFFFF", size="0", val="nil")
                if r_idx == 0:
                    set_cell_border_edge(cell, "top", color="000000", size="12")
                    set_cell_border_edge(cell, "bottom", color="000000", size="8")
                elif r_idx == len(table.rows) - 1:
                    set_cell_border_edge(cell, "bottom", color="000000", size="12")
                if r_idx == 0:
                    set_cell_shading(cell, "F2F2F2")
                for p in cell.paragraphs:
                    # Pandoc may assign a reference-doc paragraph style named
                    # "Compact" to table cells. That style is absent after
                    # python-docx rewrites the file, and LibreOffice can export
                    # the cells as vertically stacked text. Normalize cell
                    # paragraphs to an existing style before the PDF pass.
                    p.style = doc.styles["Normal"]
                    p.paragraph_format.first_line_indent = Cm(0)
                    p.paragraph_format.line_spacing = 1.0
                    p.paragraph_format.space_after = Pt(0)
                    for run in p.runs:
                        set_run_font(run, size_pt=9.0, bold=(r_idx == 0))

    doc.save(str(staged))


def w(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


def r(tag: str) -> str:
    return f"{{{R_NS}}}{tag}"


def wx(tag: str, **attrs) -> etree._Element:
    element = etree.Element(w(tag))
    for key, value in attrs.items():
        element.set(w(key), str(value))
    return element


def paragraph(
    text: str = "",
    *,
    align: str = "left",
    size: int = 24,
    bold: bool = False,
    italic: bool = False,
    before: int = 0,
    after: int = 0,
    line: int | None = None,
    page_break_before: bool = False,
    style: str | None = None,
) -> etree._Element:
    p = etree.Element(w("p"))
    ppr = etree.SubElement(p, w("pPr"))
    if style:
        pstyle = etree.SubElement(ppr, w("pStyle"))
        pstyle.set(w("val"), style)
    jc = etree.SubElement(ppr, w("jc"))
    jc.set(w("val"), align)
    spacing = etree.SubElement(ppr, w("spacing"))
    spacing.set(w("before"), str(before))
    spacing.set(w("after"), str(after))
    if line:
        spacing.set(w("line"), str(line))
        spacing.set(w("lineRule"), "auto")
    if page_break_before:
        etree.SubElement(ppr, w("pageBreakBefore"))
    if not text:
        return p

    run = etree.SubElement(p, w("r"))
    rpr = etree.SubElement(run, w("rPr"))
    rfonts = etree.SubElement(rpr, w("rFonts"))
    for key in ("ascii", "hAnsi", "eastAsia", "cs"):
        rfonts.set(w(key), FONT)
    sz = etree.SubElement(rpr, w("sz"))
    sz.set(w("val"), str(size))
    szcs = etree.SubElement(rpr, w("szCs"))
    szcs.set(w("val"), str(size))
    if bold:
        etree.SubElement(rpr, w("b"))
        etree.SubElement(rpr, w("bCs"))
    if italic:
        etree.SubElement(rpr, w("i"))
        etree.SubElement(rpr, w("iCs"))
    t = etree.SubElement(run, w("t"))
    if text.startswith(" ") or text.endswith(" "):
        t.set(f"{{{XML_NS}}}space", "preserve")
    t.text = text
    return p


def horizontal_rule(*, before: int = 0, after: int = 0) -> etree._Element:
    p = paragraph("", align="center", before=before, after=after)
    ppr = p.find(w("pPr"))
    pbdr = etree.SubElement(ppr, w("pBdr"))
    bottom = etree.SubElement(pbdr, w("bottom"))
    bottom.set(w("val"), "single")
    bottom.set(w("sz"), "8")
    bottom.set(w("space"), "1")
    bottom.set(w("color"), "000000")
    ind = etree.SubElement(ppr, w("ind"))
    ind.set(w("left"), "720")
    ind.set(w("right"), "720")
    return p


def title_page_paragraphs() -> list[etree._Element]:
    paras = [
        paragraph("Wrocław University of Science and Technology", align="center", size=28, bold=True, after=90),
        paragraph("Faculty of Electronics, Photonics and Microsystems", align="center", size=26, after=120),
        horizontal_rule(after=560),
        paragraph("Field of Study: Electronic and Computer Engineering", align="center", size=24, after=560),
        paragraph("BACHELOR THESIS", align="center", size=36, bold=True, after=300),
        paragraph("Title of Thesis:", align="center", size=24, after=120),
        paragraph(TITLE, align="center", size=32, bold=True, after=140),
        paragraph(TITLE_PL, align="center", size=24, italic=True, after=700),
        paragraph("Author:", align="center", size=24, after=80),
        paragraph(AUTHOR, align="center", size=24, bold=True, after=260),
        paragraph("Supervisor:", align="center", size=24, after=80),
        paragraph(SUPERVISOR, align="center", size=24, after=820),
        horizontal_rule(after=120),
        paragraph("WROCŁAW 2026", align="center", size=24, bold=True, after=0),
    ]
    section_p = paragraph("")
    section_p.find(w("pPr")).append(section_properties(page_number_format=None, footer_rid=None))
    paras.append(section_p)
    return paras


def section_properties(*, page_number_format: str | None, footer_rid: str | None) -> etree._Element:
    sect = etree.Element(w("sectPr"))
    sect_type = etree.SubElement(sect, w("type"))
    sect_type.set(w("val"), "nextPage")
    if footer_rid:
        footer = etree.SubElement(sect, w("footerReference"))
        footer.set(w("type"), "default")
        footer.set(r("id"), footer_rid)
    pg_sz = etree.SubElement(sect, w("pgSz"))
    pg_sz.set(w("w"), "11906")
    pg_sz.set(w("h"), "16838")
    pg_mar = etree.SubElement(sect, w("pgMar"))
    pg_mar.set(w("top"), "1417")
    pg_mar.set(w("right"), "1417")
    pg_mar.set(w("bottom"), "1417")
    pg_mar.set(w("left"), "1417")
    pg_mar.set(w("header"), "709")
    pg_mar.set(w("footer"), "709")
    pg_mar.set(w("gutter"), "0")
    if page_number_format:
        pg_num = etree.SubElement(sect, w("pgNumType"))
        pg_num.set(w("fmt"), page_number_format)
        pg_num.set(w("start"), "1")
    cols = etree.SubElement(sect, w("cols"))
    cols.set(w("space"), "708")
    doc_grid = etree.SubElement(sect, w("docGrid"))
    doc_grid.set(w("linePitch"), "360")
    return sect


def paragraph_text(p: etree._Element) -> str:
    return "".join(t.text or "" for t in p.xpath(".//w:t", namespaces=NS)).strip()


def is_horizontal_rule(p: etree._Element) -> bool:
    return bool(p.xpath(".//*[local-name()='rect' and @*[local-name()='hr']='t']"))


def toc_paragraphs(footer_rid: str) -> list[etree._Element]:
    title = paragraph("Contents", align="left", size=36, bold=True, before=0, after=160, page_break_before=True)
    entries = [title]
    for level, text, page in TOC_ENTRIES:
        p = toc_entry_paragraph(level, text, page)
        entries.append(p)
    entries[-1].find(w("pPr")).append(section_properties(page_number_format="lowerRoman", footer_rid=footer_rid))
    return entries


def toc_entry_paragraph(level: int, text: str, page: str) -> etree._Element:
    p = etree.Element(w("p"))
    ppr = etree.SubElement(p, w("pPr"))
    pstyle = etree.SubElement(ppr, w("pStyle"))
    pstyle.set(w("val"), "TOC1" if level == 1 else "TOC2")
    spacing = etree.SubElement(ppr, w("spacing"))
    spacing.set(w("before"), "0")
    spacing.set(w("after"), "45")

    def add_text_run(value: str, *, bold: bool = False) -> None:
        run = etree.SubElement(p, w("r"))
        rpr = etree.SubElement(run, w("rPr"))
        rfonts = etree.SubElement(rpr, w("rFonts"))
        for key in ("ascii", "hAnsi", "eastAsia", "cs"):
            rfonts.set(w(key), FONT)
        if bold:
            etree.SubElement(rpr, w("b"))
            etree.SubElement(rpr, w("bCs"))
        sz = etree.SubElement(rpr, w("sz"))
        sz.set(w("val"), "24")
        text_node = etree.SubElement(run, w("t"))
        text_node.text = value

    add_text_run(text, bold=(level == 1))
    etree.SubElement(etree.SubElement(p, w("r")), w("tab"))
    add_text_run(page, bold=(level == 1))
    return p


def footer_xml() -> bytes:
    ftr = etree.Element(w("ftr"), nsmap={"w": W_NS, "r": R_NS})
    p = etree.SubElement(ftr, w("p"))
    ppr = etree.SubElement(p, w("pPr"))
    jc = etree.SubElement(ppr, w("jc"))
    jc.set(w("val"), "center")
    for tag, text in (
        ("begin", None),
        ("instr", " PAGE "),
        ("separate", None),
        ("result", "1"),
        ("end", None),
    ):
        run = etree.SubElement(p, w("r"))
        if tag == "instr":
            instr = etree.SubElement(run, w("instrText"))
            instr.set(f"{{{XML_NS}}}space", "preserve")
            instr.text = text
        elif tag == "result":
            t = etree.SubElement(run, w("t"))
            t.text = text
        else:
            fld = etree.SubElement(run, w("fldChar"))
            fld.set(w("fldCharType"), tag)
    return etree.tostring(ftr, xml_declaration=True, encoding="UTF-8", standalone="yes")


def next_footer_name(names: set[str]) -> str:
    i = 1
    while f"word/footer{i}.xml" in names:
        i += 1
    return f"footer{i}.xml"


def add_footer_relationship(rels_root: etree._Element, footer_name: str) -> str:
    max_id = 0
    for rel in rels_root.findall(f"{{{REL_NS}}}Relationship"):
        rid = rel.get("Id", "")
        if rid.startswith("rId") and rid[3:].isdigit():
            max_id = max(max_id, int(rid[3:]))
    rid = f"rId{max_id + 1}"
    rel = etree.SubElement(rels_root, f"{{{REL_NS}}}Relationship")
    rel.set("Id", rid)
    rel.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer")
    rel.set("Target", footer_name)
    return rid


def add_content_type_override(ct_root: etree._Element, footer_name: str) -> None:
    part = f"/word/{footer_name}"
    for node in ct_root.findall(f"{{{CT_NS}}}Override"):
        if node.get("PartName") == part:
            return
    override = etree.SubElement(ct_root, f"{{{CT_NS}}}Override")
    override.set("PartName", part)
    override.set("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml")


def mark_update_fields(settings_root: etree._Element) -> None:
    node = settings_root.find("w:updateFields", namespaces=NS)
    if node is None:
        node = etree.SubElement(settings_root, w("updateFields"))
    node.set(w("val"), "true")


def set_toc_style_tabs(styles_root: etree._Element) -> None:
    for style_id in ("TOC1", "TOC2"):
        style = styles_root.find(f".//w:style[@w:styleId='{style_id}']", namespaces=NS)
        if style is None:
            style = etree.SubElement(styles_root, w("style"))
            style.set(w("type"), "paragraph")
            style.set(w("styleId"), style_id)
            name = etree.SubElement(style, w("name"))
            name.set(w("val"), "toc 1" if style_id == "TOC1" else "toc 2")
            based_on = etree.SubElement(style, w("basedOn"))
            based_on.set(w("val"), "Normal")
            next_style = etree.SubElement(style, w("next"))
            next_style.set(w("val"), "Normal")
            etree.SubElement(style, w("uiPriority")).set(w("val"), "39")
        ppr = style.find("w:pPr", namespaces=NS)
        if ppr is None:
            ppr = etree.SubElement(style, w("pPr"))
        ind = ppr.find("w:ind", namespaces=NS)
        if ind is None:
            ind = etree.SubElement(ppr, w("ind"))
        ind.set(w("left"), "0" if style_id == "TOC1" else "360")
        spacing = ppr.find("w:spacing", namespaces=NS)
        if spacing is None:
            spacing = etree.SubElement(ppr, w("spacing"))
        spacing.set(w("before"), "0")
        spacing.set(w("after"), "60")
        tabs = ppr.find("w:tabs", namespaces=NS)
        if tabs is not None:
            ppr.remove(tabs)
        tabs = etree.SubElement(ppr, w("tabs"))
        tab = etree.SubElement(tabs, w("tab"))
        tab.set(w("val"), "right")
        tab.set(w("leader"), "dot")
        tab.set(w("pos"), "9072")
        rpr = style.find("w:rPr", namespaces=NS)
        if rpr is None:
            rpr = etree.SubElement(style, w("rPr"))
        rfonts = rpr.find("w:rFonts", namespaces=NS)
        if rfonts is None:
            rfonts = etree.SubElement(rpr, w("rFonts"))
        for key in ("ascii", "hAnsi", "eastAsia", "cs"):
            rfonts.set(w(key), FONT)
        size = rpr.find("w:sz", namespaces=NS)
        if size is None:
            size = etree.SubElement(rpr, w("sz"))
        size.set(w("val"), "24")


def tag_run_lang_xml(run: etree._Element, lang: str) -> None:
    rpr = run.find(w("rPr"))
    if rpr is None:
        rpr = etree.Element(w("rPr"))
        run.insert(0, rpr)
    lang_node = rpr.find(w("lang"))
    if lang_node is None:
        lang_node = etree.SubElement(rpr, w("lang"))
    lang_node.set(w("val"), lang)
    lang_node.set(w("eastAsia"), lang)
    lang_node.set(w("bidi"), lang)
    for text_node in run.findall(".//w:t", namespaces=NS):
        text_node.set(f"{{{XML_NS}}}lang", lang)


def tag_streszczenie_lang(body: etree._Element) -> None:
    active = False
    for child in body:
        if child.tag != w("p"):
            continue
        text = paragraph_text(child)
        if text == "Streszczenie":
            active = True
        elif text == "Abstract (English)":
            active = False
        if active:
            for run in child.findall(".//w:r", namespaces=NS):
                tag_run_lang_xml(run, "pl-PL")


def add_page_break_before(p: etree._Element) -> None:
    ppr = p.find(w("pPr"))
    if ppr is None:
        ppr = etree.Element(w("pPr"))
        p.insert(0, ppr)
    if ppr.find(w("pageBreakBefore")) is None:
        etree.SubElement(ppr, w("pageBreakBefore"))


def prepend_page_break_run(p: etree._Element) -> None:
    first_run = p.find(w("r"))
    if first_run is not None and first_run.find(w("br")) is not None:
        return
    run = etree.Element(w("r"))
    br = etree.SubElement(run, w("br"))
    br.set(w("type"), "page")
    insert_at = 1 if p.find(w("pPr")) is not None else 0
    p.insert(insert_at, run)


def explicit_page_break_paragraph() -> etree._Element:
    p = etree.Element(w("p"))
    r_node = etree.SubElement(p, w("r"))
    br = etree.SubElement(r_node, w("br"))
    br.set(w("type"), "page")
    return p


def apply_ooxml_polish(staged: Path, dst: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(staged, "r") as zin:
            zin.extractall(tmp_path)

        document_path = tmp_path / "word" / "document.xml"
        rels_path = tmp_path / "word" / "_rels" / "document.xml.rels"
        ct_path = tmp_path / "[Content_Types].xml"
        settings_path = tmp_path / "word" / "settings.xml"
        styles_path = tmp_path / "word" / "styles.xml"

        parser = etree.XMLParser(remove_blank_text=False)
        doc_root = etree.parse(str(document_path), parser).getroot()
        rels_root = etree.parse(str(rels_path), parser).getroot()
        ct_root = etree.parse(str(ct_path), parser).getroot()
        settings_root = etree.parse(str(settings_path), parser).getroot()
        styles_root = etree.parse(str(styles_path), parser).getroot()
        body = doc_root.find("w:body", namespaces=NS)
        if body is None:
            raise RuntimeError("document.xml has no w:body")

        names = {str(p.relative_to(tmp_path)) for p in tmp_path.rglob("*") if p.is_file()}
        footer_name = next_footer_name(names)
        footer_rid = add_footer_relationship(rels_root, footer_name)
        add_content_type_override(ct_root, footer_name)
        mark_update_fields(settings_root)
        set_toc_style_tabs(styles_root)

        final_sect = body.find("w:sectPr", namespaces=NS)
        if final_sect is not None:
            body.remove(final_sect)

        abstract_idx = None
        for i, child in enumerate(body):
            if child.tag == w("p") and paragraph_text(child).startswith("Abstract"):
                abstract_idx = i
                break
        if abstract_idx is None:
            raise RuntimeError("Could not find Abstract heading after Pandoc conversion")
        for child in list(body)[:abstract_idx]:
            body.remove(child)
        for child in list(body):
            if child.tag == w("p") and is_horizontal_rule(child):
                body.remove(child)
            elif child.tag == w("p") and paragraph_text(child) == f"{AUTHOR} Wrocław, May 2026":
                body.remove(child)

        abstract_p = body[0]
        abstract_ppr = abstract_p.find(w("pPr"))
        if abstract_ppr is None:
            abstract_ppr = etree.Element(w("pPr"))
            abstract_p.insert(0, abstract_ppr)
        if abstract_ppr.find(w("pageBreakBefore")) is None:
            etree.SubElement(abstract_ppr, w("pageBreakBefore"))

        first = body[0]
        for p in title_page_paragraphs():
            body.insert(body.index(first), p)

        chapter = None
        for i, child in enumerate(body):
            if child.tag == w("p") and paragraph_text(child).startswith("Chapter 1"):
                chapter = child
                break
        if chapter is None:
            raise RuntimeError("Could not find Chapter 1 heading for body section break")
        for p in toc_paragraphs(footer_rid):
            body.insert(body.index(chapter), p)

        body.append(section_properties(page_number_format="decimal", footer_rid=footer_rid))
        # Per-section page breaks: use inline <w:br type="page"> at the start
        # of the heading paragraph's run sequence. Pandoc emits every "# / ##"
        # marker as a Normal-styled paragraph (not Heading 1), so neither the
        # python-docx style rule at L397 nor pPr-level pageBreakBefore fires
        # reliably for these. LibreOffice silently ignores pageBreakBefore on
        # Normal-styled paragraphs during PDF export, which produced visible
        # bleeding (each chapter / appendix continuing mid-page from the
        # previous one). Inline <w:br> is honored verbatim by both Word and
        # LibreOffice without creating a leading blank.
        #
        # Excluded: "Chapter 1 — Introduction" and "Abstract — Streszczenie /
        # Abstract" — these already get a page boundary from the section break
        # inserted earlier in this function (title-page sectPr and TOC sectPr).
        # Adding an inline <w:br> on top of an existing section break would
        # produce a blank page.
        page_break_headings = {
            "Abstract (English)",
            "Acknowledgements",
            "List of abbreviations and symbols",
            "Chapter 2 — System architecture",
            "Chapter 3 — Tool implementations",
            "Chapter 4 — Conducted studies and results",
            "Chapter 5 — Conclusions",
            "Bibliography",
            "Appendices",
        }
        for child in body:
            if child.tag != w("p"):
                continue
            # Skip TOC entries — their text matches "Appendix X — ..." but
            # they are not body section headings. Their pStyle is TOC1/TOC2.
            ppr = child.find(w("pPr"))
            if ppr is not None:
                pstyle = ppr.find(w("pStyle"))
                if pstyle is not None and pstyle.get(w("val"), "").startswith("TOC"):
                    continue
            text = paragraph_text(child)
            if text in page_break_headings or text.startswith("Appendix "):
                prepend_page_break_run(child)
        tag_streszczenie_lang(body)

        (tmp_path / "word" / footer_name).write_bytes(footer_xml())
        document_path.write_bytes(etree.tostring(doc_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
        rels_path.write_bytes(etree.tostring(rels_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
        ct_path.write_bytes(etree.tostring(ct_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
        settings_path.write_bytes(etree.tostring(settings_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
        styles_path.write_bytes(etree.tostring(styles_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))

        dst.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
            for path in sorted(tmp_path.rglob("*")):
                if path.is_file():
                    zout.write(path, path.relative_to(tmp_path))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="src", required=True)
    parser.add_argument("--out", dest="dst", required=True)
    args = parser.parse_args()

    src = Path(args.src)
    dst = Path(args.dst)
    if not src.exists():
        print(f"ERROR: input DOCX not found: {src}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / "stage_l_python_docx.docx"
        apply_python_docx_polish(src, staged)
        apply_ooxml_polish(staged, dst)

    print(f"Saved polished thesis DOCX: {dst}")
    print("Applied: title page, Times 12 body, compact academic spacing, justified text, margins, book-style tables, caption/bibliography polish, placeholder-free TOC field, Polish language tags, Roman/Arabic section numbering.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
