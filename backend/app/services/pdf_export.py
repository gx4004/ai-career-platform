from __future__ import annotations

import io
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def generate_cover_letter_pdf(result: dict[str, Any]) -> bytes:
    """Generate a professional letter-format PDF from cover letter result."""
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

    # Custom styles for letter format
    letter_body = ParagraphStyle(
        "LetterBody",
        parent=styles["Normal"],
        fontSize=11,
        leading=16,
        spaceBefore=6,
        spaceAfter=6,
    )
    letter_heading = ParagraphStyle(
        "LetterHeading",
        parent=styles["Heading2"],
        fontSize=14,
        spaceBefore=12,
        spaceAfter=8,
    )

    elements = []

    # Title
    elements.append(Paragraph("Cover Letter", styles["Title"]))
    elements.append(Spacer(1, 0.5 * cm))

    # Extract sections from result
    sections = result.get("sections", [])
    if sections:
        for section in sections:
            if isinstance(section, dict):
                title = section.get("title", "")
                content = section.get("content", "")
                if title:
                    elements.append(Paragraph(title, letter_heading))
                if content:
                    # Replace newlines with <br/> for reportlab
                    content_html = str(content).replace("\n", "<br/>")
                    elements.append(Paragraph(content_html, letter_body))
    else:
        # Fallback: try full_letter field
        full_letter = result.get("full_letter", "")
        if full_letter:
            for para in full_letter.split("\n\n"):
                if para.strip():
                    elements.append(Paragraph(para.strip().replace("\n", "<br/>"), letter_body))
                    elements.append(Spacer(1, 0.3 * cm))

    if not elements or len(elements) <= 2:
        elements.append(Paragraph("No content available for export.", letter_body))

    doc.build(elements)
    return buffer.getvalue()


def generate_interview_pdf(result: dict[str, Any]) -> bytes:
    """Generate a question-answer card format PDF from interview result."""
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

    elements = []
    elements.append(Paragraph("Interview Q&A", styles["Title"]))
    elements.append(Spacer(1, 0.5 * cm))

    questions = result.get("questions", [])
    for i, q in enumerate(questions, 1):
        if not isinstance(q, dict):
            continue
        text = str(q.get("question", q.get("text", f"Question {i}")))
        elements.append(Paragraph(f"Q{i}: {text}", question_style))

        # Answer structure / key points
        answer = q.get("answer_structure", q.get("answer", ""))
        if isinstance(answer, list):
            for point in answer:
                elements.append(Paragraph(f"&bull; {str(point)}", answer_style))
        elif answer:
            elements.append(Paragraph(str(answer).replace("\n", "<br/>"), answer_style))

        # Key talking points
        talking_points = q.get("key_talking_points", [])
        if talking_points:
            elements.append(Paragraph("Key Talking Points:", label_style))
            for tp in talking_points:
                elements.append(Paragraph(f"&bull; {str(tp)}", answer_style))

        elements.append(Spacer(1, 0.3 * cm))

    if not questions:
        elements.append(Paragraph("No questions available for export.", answer_style))

    doc.build(elements)
    return buffer.getvalue()
