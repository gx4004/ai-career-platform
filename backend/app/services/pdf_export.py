from __future__ import annotations

import io
from html import escape
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def _safe_paragraph_html(text: str) -> str:
    """Escape user/LLM text for reportlab's mini-HTML parser, then re-add <br/> for newlines.

    reportlab.platypus.Paragraph interprets a subset of HTML markup; passing raw
    LLM/user text through unescaped lets stray '<' '>' or '&' break rendering and
    in principle lets a crafted resume inject reportlab tags via the LLM. Escape
    first, then re-introduce the only markup we want (line breaks).
    """
    return escape(text).replace("\n", "<br/>")


def generate_cover_letter_pdf(result: dict[str, Any]) -> bytes:
    """Render cover-letter result into a letter-format PDF.

    Reads from the actual response shape produced by `cover_letter_gen.py`:
    `opening`, `body_points`, `closing` (each `{text, why_this_paragraph, ...}`)
    and the composed `full_text`. Falls back to `full_text` if the structured
    sections are missing.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
        leftMargin=2.5 * cm,
        rightMargin=2.5 * cm,
    )
    styles = getSampleStyleSheet()

    letter_body = ParagraphStyle(
        "LetterBody",
        parent=styles["Normal"],
        fontSize=11,
        leading=16,
        spaceBefore=6,
        spaceAfter=6,
    )

    elements: list[Any] = [
        Paragraph("Cover Letter", styles["Title"]),
        Spacer(1, 0.5 * cm),
    ]

    def _add_section_text(section: Any) -> bool:
        if not isinstance(section, dict):
            return False
        text = section.get("text")
        if not isinstance(text, str) or not text.strip():
            return False
        elements.append(Paragraph(_safe_paragraph_html(text.strip()), letter_body))
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
                    elements.append(Paragraph(_safe_paragraph_html(stripped), letter_body))
                    elements.append(Spacer(1, 0.3 * cm))
                    added_any = True

    if not added_any:
        elements.append(Paragraph("No content available for export.", letter_body))

    doc.build(elements)
    return buffer.getvalue()


def generate_interview_pdf(result: dict[str, Any]) -> bytes:
    """Render interview result into a Q&A PDF.

    Reads `questions[].{question, answer, key_points, answer_structure}` from the
    actual response shape produced by `interview_gen.py`. Earlier versions read
    `key_talking_points` which never exists in the payload — that field name is
    a bug.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
    )
    styles = getSampleStyleSheet()

    question_style = ParagraphStyle(
        "Question",
        parent=styles["Heading3"],
        fontSize=12,
        spaceBefore=14,
        spaceAfter=6,
        textColor="darkblue",
    )
    answer_style = ParagraphStyle(
        "Answer",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        spaceBefore=4,
        spaceAfter=4,
        leftIndent=12,
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor="gray",
        spaceBefore=2,
    )

    elements: list[Any] = [
        Paragraph("Interview Q&amp;A", styles["Title"]),
        Spacer(1, 0.5 * cm),
    ]

    questions = result.get("questions")
    rendered_any = False
    if isinstance(questions, list):
        for index, q in enumerate(questions, start=1):
            if not isinstance(q, dict):
                continue
            question_text = q.get("question") if isinstance(q.get("question"), str) else None
            if not question_text or not question_text.strip():
                question_text = f"Question {index}"
            elements.append(
                Paragraph(f"Q{index}: {_safe_paragraph_html(question_text.strip())}", question_style)
            )
            rendered_any = True

            structure = q.get("answer_structure")
            if isinstance(structure, list) and structure:
                for step in structure:
                    if isinstance(step, str) and step.strip():
                        elements.append(
                            Paragraph(f"&bull; {_safe_paragraph_html(step.strip())}", answer_style)
                        )

            answer = q.get("answer")
            if isinstance(answer, str) and answer.strip():
                elements.append(
                    Paragraph(_safe_paragraph_html(answer.strip()), answer_style)
                )

            key_points = q.get("key_points")
            if isinstance(key_points, list) and key_points:
                elements.append(Paragraph("Key Points:", label_style))
                for point in key_points:
                    if isinstance(point, str) and point.strip():
                        elements.append(
                            Paragraph(f"&bull; {_safe_paragraph_html(point.strip())}", answer_style)
                        )

            elements.append(Spacer(1, 0.3 * cm))

    if not rendered_any:
        elements.append(Paragraph("No questions available for export.", answer_style))

    doc.build(elements)
    return buffer.getvalue()
