"""Stage I-AUTO — conservative python-docx layout polish.

Applies the subset of Word formatting that python-docx can do reliably,
and explicitly leaves the items that python-docx is known to mishandle
(Roman → Arabic page-number switch with section break, full WUST title-page
geometry, TOC field auto-update on first open) to the user's ~5-minute
visual-polish step. Both lists are reported at the end of the run.

Usage:
    python scripts/polish_docx.py \
        --in thesis/build/thesis_full_draft_v3.docx \
        --out thesis/build/thesis_full_supervisor_draft.docx
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, Inches
from lxml import etree


HEADING_SIZES_PT: dict[str, int] = {
    "Heading 1": 18,
    "Heading 2": 14,
    "Heading 3": 12,
}


def center_inline_image_paragraphs(doc) -> int:
    """Center every paragraph that contains at least one inline shape."""
    n = 0
    for p in doc.paragraphs:
        if p._p.findall(".//" + qn("w:drawing")):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            n += 1
    return n


def set_heading_styles(doc) -> dict[str, int]:
    """Apply size + bold + italic conventions to Heading 1/2/3 paragraphs.

    Avoids modifying the underlying style definitions (which can ripple
    into Word's template-resolution behaviour); applies properties directly
    to the paragraph runs. Heading 1 also gets page_break_before so each
    chapter starts on its own page.
    """
    counts: dict[str, int] = {"Heading 1": 0, "Heading 2": 0, "Heading 3": 0}
    for p in doc.paragraphs:
        sn = p.style.name
        if sn not in HEADING_SIZES_PT:
            continue
        size = HEADING_SIZES_PT[sn]
        for run in p.runs:
            run.font.size = Pt(size)
            run.bold = True
            run.italic = (sn == "Heading 3")
        if sn == "Heading 1":
            p.paragraph_format.page_break_before = True
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(12)
        counts[sn] += 1
    return counts


def apply_bibliography_hanging_indent(doc) -> int:
    """Apply a 0.5"-hanging-indent to all paragraphs after the Bibliography heading.

    Stops at the next Heading 1 (typically 'Appendix A' or similar). Returns
    the count of paragraphs touched.
    """
    in_biblio = False
    n = 0
    for p in doc.paragraphs:
        sn = p.style.name
        if sn == "Heading 1":
            text = p.text.strip().lower()
            if in_biblio:
                in_biblio = False
            elif "bibliograph" in text or text.startswith("references"):
                in_biblio = True
                continue
        if in_biblio and p.text.strip():
            pf = p.paragraph_format
            pf.left_indent = Inches(0.5)
            pf.first_line_indent = Inches(-0.5)
            n += 1
    return n


def tag_polish_streszczenie(doc) -> int:
    """Tag every run of the Streszczenie section with `lang="pl"`.

    Walks paragraphs from the Streszczenie heading until the next Heading 1
    or the explicit `Abstract (English)` heading, whichever comes first.
    Avoids relying on python-docx's run-language API (which is incomplete
    in current versions) and writes the XML attribute directly.
    """
    in_streszczenie = False
    n = 0
    for p in doc.paragraphs:
        sn = p.style.name
        text = p.text.strip()
        if sn.startswith("Heading"):
            if "streszczenie" in text.lower():
                in_streszczenie = True
                continue
            if in_streszczenie and (
                sn == "Heading 1"
                or "abstract (english)" in text.lower()
                or "abstract" == text.lower()
            ):
                in_streszczenie = False
        if in_streszczenie and text:
            for run in p.runs:
                rPr = run._element.find(qn("w:rPr"))
                if rPr is None:
                    rPr = etree.SubElement(run._element, qn("w:rPr"))
                    # Move rPr to the front (Word expects it before w:t).
                    run._element.insert(0, rPr)
                lang = rPr.find(qn("w:lang"))
                if lang is None:
                    lang = etree.SubElement(rPr, qn("w:lang"))
                lang.set(qn("w:val"), "pl-PL")
                lang.set(qn("w:eastAsia"), "pl-PL")
                lang.set(qn("w:bidi"), "pl-PL")
                n += 1
    return n


def force_toc_field_dirty(doc) -> int:
    """Mark the existing TOC field 'dirty' so Word offers to update it on open.

    pandoc's --toc emits a TOC field; setting w:dirty='true' on the
    surrounding fldChar prompts Word with the standard "Update fields?"
    dialogue at first open. This is the most reliable way to refresh a
    pandoc-generated TOC without injecting a custom field.
    """
    body_xml = doc.element.body
    n = 0
    for fldchar in body_xml.iter(qn("w:fldChar")):
        if fldchar.get(qn("w:fldCharType")) == "begin":
            fldchar.set(qn("w:dirty"), "true")
            n += 1
    return n


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="src", required=True)
    parser.add_argument("--out", dest="dst", required=True)
    args = parser.parse_args()

    src = Path(args.src).resolve()
    dst = Path(args.dst).resolve()
    if not src.exists():
        print(f"ERROR: input docx missing: {src}", file=sys.stderr)
        return 1

    doc = Document(str(src))
    print(f"Loaded {src}")

    img_centred = center_inline_image_paragraphs(doc)
    print(f"  centred {img_centred} inline-image paragraph(s)")

    heading_counts = set_heading_styles(doc)
    print(f"  styled headings: {heading_counts}")

    biblio_n = apply_bibliography_hanging_indent(doc)
    print(f"  applied bibliography hanging indent to {biblio_n} paragraph(s)")

    pl_n = tag_polish_streszczenie(doc)
    print(f"  tagged {pl_n} Streszczenie run(s) with lang=pl-PL")

    toc_n = force_toc_field_dirty(doc)
    print(f"  marked {toc_n} TOC field(s) dirty for Word auto-refresh")

    dst.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(dst))
    print(f"\nSaved polished docx to {dst}")

    print("\nApplied automatically:")
    print("  ✅ Centred inline-image paragraphs")
    print("  ✅ Heading 1/2/3 sizes (18/14/12 pt) + bold (italic on H3)")
    print("  ✅ Heading 1 page-break-before (each chapter starts new page)")
    print("  ✅ Bibliography hanging indent (0.5\" / -0.5\")")
    print("  ✅ Polish language tag on every Streszczenie run")
    print("  ✅ TOC field marked dirty (Word will offer to update on first open)")

    print("\nLeft for the user's 5-minute visual pass:")
    print("  ⏳ Title-page geometry (university/faculty centring, exact WUST template)")
    print("  ⏳ Roman → Arabic page-number switch (section break before Chapter 1)")
    print("  ⏳ TOC click-through (References → Update Field if Word doesn't auto-prompt)")
    print("  ⏳ Visual scan for orphans/widows after page-break additions")
    print("  ⏳ Save as `thesis_full_supervisor_draft.docx` (already named)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
