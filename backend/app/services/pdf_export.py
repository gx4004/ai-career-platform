from __future__ import annotations

import io
import re
import unicodedata
from datetime import UTC, datetime
from html import escape
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.services.cv_fonts import pdf_font_names

# Lato (bundled, OFL) covers Latin incl. Turkish/Polish/Vietnamese, Cyrillic and Greek,
# and its bold face has the identical character set.
_BODY_FONT_ID = "lato"

# CJK has no bundled font: the Adobe CID fonts reportlab ships are referenced, not
# embedded, so the viewer substitutes a system CJK font. Text stays selectable and
# extractable, which is what matters for an application document.
_CJK_FONTS = {"zh": "STSong-Light", "ja": "HeiseiMin-W3", "ko": "HYSMyeongJo-Medium"}

_cjk_registered = False


def _register_cjk_fonts() -> None:
    global _cjk_registered
    if _cjk_registered:
        return
    for name in _CJK_FONTS.values():
        pdfmetrics.registerFont(UnicodeCIDFont(name))
    _cjk_registered = True


def _body_fonts() -> tuple[str, str]:
    return pdf_font_names(_BODY_FONT_ID)


def _has_glyph(char: str) -> bool:
    regular, _bold = _body_fonts()
    font = pdfmetrics.getFont(regular)
    return ord(char) in font.face.charToGlyph


def _is_hangul(char: str) -> bool:
    code = ord(char)
    return 0xAC00 <= code <= 0xD7AF or 0x1100 <= code <= 0x11FF or 0x3130 <= code <= 0x318F


def _is_kana(char: str) -> bool:
    code = ord(char)
    return 0x3040 <= code <= 0x30FF or 0x31F0 <= code <= 0x31FF


def _is_han(char: str) -> bool:
    code = ord(char)
    return 0x4E00 <= code <= 0x9FFF or 0x3400 <= code <= 0x4DBF or 0xF900 <= code <= 0xFAFF


def _is_cjk(char: str) -> bool:
    code = ord(char)
    return (
        _is_han(char)
        or _is_kana(char)
        or _is_hangul(char)
        or 0x3000 <= code <= 0x303F  # CJK punctuation
        or 0xFF00 <= code <= 0xFFEF  # full-width forms
    )


_REPLACEMENTS = {"✓": "+", "✔": "+", "✗": "x", "✘": "x", "\u2028": "\n", "\u2029": "\n\n"}


def _safe_paragraph_html(text: str) -> str:
    """Escape user/LLM text for reportlab's mini-HTML parser, then re-add <br/> for newlines.

    reportlab.platypus.Paragraph interprets a subset of HTML markup; passing raw
    LLM/user text through unescaped lets stray '<' '>' or '&' break rendering and
    in principle lets a crafted resume inject reportlab tags via the LLM. Escape
    first, then re-introduce the only markup we want (line breaks and the font
    switch for CJK runs).

    Characters no available font can draw (emoji, symbols, joiners) are dropped
    rather than printed as black boxes.
    """
    _register_cjk_fonts()
    text = unicodedata.normalize("NFC", text)
    # Han characters are shared by Chinese, Japanese and Korean: follow the script of
    # the text around them. Kana and Hangul pick their own font.
    han_font = _CJK_FONTS["zh"]
    if any(_is_hangul(c) for c in text):
        han_font = _CJK_FONTS["ko"]
    elif any(_is_kana(c) for c in text):
        han_font = _CJK_FONTS["ja"]

    pieces: list[str] = []
    current: str | None = None  # the CJK font of the open <font> tag, if any
    for char in text:
        for single in _REPLACEMENTS.get(char, char):
            if single in "\n\t " or (ord(single) >= 32 and _has_glyph(single)):
                wanted = None
            elif _is_hangul(single):
                wanted = _CJK_FONTS["ko"]
            elif _is_kana(single):
                wanted = _CJK_FONTS["ja"]
            elif _is_cjk(single):
                wanted = han_font
            else:
                continue  # control chars, emoji, variation selectors, unsupported symbols
            if wanted != current:
                if current:
                    pieces.append("</font>")
                if wanted:
                    pieces.append(f'<font name="{wanted}">')
                current = wanted
            pieces.append(escape(single))
    if current:
        pieces.append("</font>")
    return "".join(pieces).replace("\n", "<br/>")


def _has_cjk(text: str) -> bool:
    return any(_is_cjk(c) for c in text)


def _paragraph(text: str, style: ParagraphStyle, *, prefix: str = "") -> Paragraph:
    # 'CJK' wrapping breaks long unspaced runs; Latin text keeps normal word wrapping.
    if _has_cjk(text) and style.wordWrap != "CJK":
        style = ParagraphStyle(f"{style.name}CJK", parent=style, wordWrap="CJK")
    return Paragraph(f"{prefix}{_safe_paragraph_html(text)}", style)


def _styles() -> dict[str, ParagraphStyle]:
    regular, bold = _body_fonts()
    base = getSampleStyleSheet()["Normal"]
    ink = colors.HexColor("#1a1a1a")
    muted = colors.HexColor("#5b6068")
    return {
        "title": ParagraphStyle(
            "DocTitle", parent=base, fontName=bold, fontSize=20, leading=24, textColor=ink, spaceAfter=2
        ),
        "subtitle": ParagraphStyle(
            "DocSubtitle", parent=base, fontName=regular, fontSize=9.5, leading=13, textColor=muted
        ),
        "letter": ParagraphStyle(
            "LetterBody",
            parent=base,
            fontName=regular,
            fontSize=11,
            leading=16,
            spaceBefore=6,
            spaceAfter=6,
            textColor=ink,
        ),
        "question": ParagraphStyle(
            "Question",
            parent=base,
            fontName=bold,
            fontSize=12,
            leading=16,
            spaceBefore=14,
            spaceAfter=6,
            textColor=colors.HexColor("#0f3d2e"),
        ),
        "answer": ParagraphStyle(
            "Answer",
            parent=base,
            fontName=regular,
            fontSize=10,
            leading=14,
            spaceBefore=4,
            spaceAfter=4,
            leftIndent=12,
            textColor=ink,
        ),
        "label": ParagraphStyle(
            "Label",
            parent=base,
            fontName=bold,
            fontSize=9,
            leading=12,
            textColor=muted,
            spaceBefore=4,
            leftIndent=12,
        ),
    }


def _page_footer(canvas, doc) -> None:
    regular, _bold = _body_fonts()
    canvas.saveState()
    canvas.setFont(regular, 8.5)
    canvas.setFillColor(colors.HexColor("#5b6068"))
    width, _height = doc.pagesize
    canvas.drawCentredString(width / 2, 1.2 * cm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def _build(elements: list[Any], *, margin_cm: float, title: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=margin_cm * cm,
        bottomMargin=margin_cm * cm,
        leftMargin=margin_cm * cm,
        rightMargin=margin_cm * cm,
        title=title,
        author="Career Workbench",
    )
    doc.build(elements, onFirstPage=_page_footer, onLaterPages=_page_footer)
    return buffer.getvalue()


def _subtitle(parts: list[str | None]) -> str:
    return " · ".join(part for part in parts if part)


def _generated_on(result: dict[str, Any]) -> str:
    raw = result.get("generated_at")
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime("%-d %B %Y")
        except ValueError:
            pass
    return datetime.now(UTC).strftime("%-d %B %Y")


def generate_cover_letter_pdf(result: dict[str, Any]) -> bytes:
    """Render cover-letter result into a letter-format PDF.

    Reads from the actual response shape produced by `cover_letter_gen.py`:
    `opening`, `body_points`, `closing` (each `{text, why_this_paragraph, ...}`)
    and the composed `full_text`. Falls back to `full_text` if the structured
    sections are missing.
    """
    styles = _styles()
    tone = result.get("tone_used")
    elements: list[Any] = [
        Paragraph("Cover Letter", styles["title"]),
        Paragraph(
            _safe_paragraph_html(
                _subtitle([f"{tone} tone" if isinstance(tone, str) and tone.strip() else None, _generated_on(result)])
            ),
            styles["subtitle"],
        ),
        Spacer(1, 0.6 * cm),
    ]
    letter_body = styles["letter"]

    def _add_section_text(section: Any) -> bool:
        if not isinstance(section, dict):
            return False
        text = section.get("text")
        if not isinstance(text, str) or not text.strip():
            return False
        elements.append(_paragraph(text.strip(), letter_body))
        elements.append(Spacer(1, 0.3 * cm))
        return True

    added_any = False
    added_any |= _add_section_text(result.get("opening"))

    body_points = result.get("body_points")
    if isinstance(body_points, list):
        for item in body_points:
            added_any |= _add_section_text(item)

    added_any |= _add_section_text(result.get("closing"))

    if not added_any:
        full_text = result.get("full_text")
        if isinstance(full_text, str) and full_text.strip():
            for para in full_text.split("\n\n"):
                stripped = para.strip()
                if stripped:
                    elements.append(_paragraph(stripped, letter_body))
                    elements.append(Spacer(1, 0.3 * cm))
                    added_any = True

    if not added_any:
        elements.append(Paragraph("No content available for export.", letter_body))

    return _build(elements, margin_cm=2.5, title="Cover Letter")


def generate_interview_pdf(result: dict[str, Any]) -> bytes:
    """Render interview result into a Q&A PDF.

    Reads `questions[].{question, answer, key_points, answer_structure}` from the
    actual response shape produced by `interview_gen.py`. Earlier versions read
    `key_talking_points` which never exists in the payload — that field name is
    a bug.
    """
    styles = _styles()
    question_style = styles["question"]
    answer_style = styles["answer"]
    label_style = styles["label"]

    questions = result.get("questions")
    count = len(questions) if isinstance(questions, list) else 0
    elements: list[Any] = [
        Paragraph("Interview Q&amp;A", styles["title"]),
        Paragraph(
            _safe_paragraph_html(
                _subtitle([f"{count} questions" if count else None, _generated_on(result)])
            ),
            styles["subtitle"],
        ),
        Spacer(1, 0.5 * cm),
    ]

    rendered_any = False
    if isinstance(questions, list):
        for index, q in enumerate(questions, start=1):
            if not isinstance(q, dict):
                continue
            question_text = q.get("question") if isinstance(q.get("question"), str) else None
            if not question_text or not question_text.strip():
                question_text = f"Question {index}"
            elements.append(_paragraph(question_text.strip(), question_style, prefix=f"Q{index}: "))
            rendered_any = True

            structure = q.get("answer_structure")
            if isinstance(structure, list) and structure:
                for step in structure:
                    if isinstance(step, str) and step.strip():
                        elements.append(_paragraph(step.strip(), answer_style, prefix="&bull; "))

            answer = q.get("answer")
            if isinstance(answer, str) and answer.strip():
                elements.append(_paragraph(answer.strip(), answer_style))

            key_points = q.get("key_points")
            if isinstance(key_points, list) and key_points:
                elements.append(Paragraph("Key Points:", label_style))
                for point in key_points:
                    if isinstance(point, str) and point.strip():
                        elements.append(_paragraph(point.strip(), answer_style, prefix="&bull; "))

            elements.append(Spacer(1, 0.3 * cm))

    if not rendered_any:
        elements.append(Paragraph("No questions available for export.", answer_style))

    return _build(elements, margin_cm=2, title="Interview Q&A")


def pdf_download_name(label: str | None, fallback: str) -> str:
    """An ASCII file name for the download, from the run's label ("Cover Letter (Professional)")."""
    ascii_label = unicodedata.normalize("NFKD", label or "").encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_label.lower()).strip("-")[:60].strip("-")
    return f"{slug or fallback}.pdf"
