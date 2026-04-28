"""Tests for the PDF export service.

These tests assert that PDF generation produces non-empty output containing the
caller's actual content, against the schema fields the cover-letter and
interview generators really emit. The previous implementation read fields
that never exist in the payload (`sections`, `full_letter`, `key_talking_points`),
so all PDFs silently rendered as the "No content available for export." stub.

Reportlab compresses page content with FlateDecode + ASCII85, so we extract
text via PyMuPDF (already a dependency) instead of substring-matching the raw
bytes.
"""
from __future__ import annotations

import fitz

from app.services.pdf_export import generate_cover_letter_pdf, generate_interview_pdf


def _extract_text(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


COVER_LETTER_PAYLOAD = {
    "schema_version": "quality_v2",
    "summary": {
        "headline": "Targeted draft ready for evidence polish.",
        "verdict": "Application-ready draft",
        "confidence_note": "Advisory draft based on resume context.",
    },
    "opening": {
        "text": "Dear Hiring Manager,\nMy work in backend reliability maps to the role's reliability requirements.",
        "why_this_paragraph": "Connect fit fast.",
        "requirements_used": ["Backend reliability"],
        "evidence_used": ["Reduced incident rate by 31%"],
    },
    "body_points": [
        {
            "text": "I led the migration of three internal services to Kubernetes and cut deploy failures.",
            "why_this_paragraph": "Show ownership.",
            "requirements_used": ["Kubernetes", "Deployment ownership"],
            "evidence_used": ["Reduced deploy failures by 22%"],
        },
        {
            "text": "I would bring the same discipline to the gaps your posting names around observability.",
            "why_this_paragraph": "Bridge to gap.",
            "requirements_used": ["Observability"],
            "evidence_used": [],
        },
    ],
    "closing": {
        "text": "Thank you for reviewing my application — I would welcome the chance to discuss next steps.",
        "why_this_paragraph": "Wrap with confidence.",
        "requirements_used": [],
        "evidence_used": [],
    },
    "full_text": "fallback only",
    "tone_used": "Professional",
    "customization_notes": [],
}


INTERVIEW_PAYLOAD = {
    "schema_version": "quality_v2",
    "summary": {
        "headline": "Gap-first practice plan.",
        "verdict": "Practice plan",
        "confidence_note": "Advisory practice plan.",
    },
    "questions": [
        {
            "question": "Walk me through how you would diagnose a regression in a deploy you owned.",
            "answer": "I'd start with the deploy diff and the affected service's metrics, then bisect.",
            "key_points": ["Deploy diff", "Service metrics", "Bisect strategy"],
            "answer_structure": ["Situation", "Action", "Result"],
            "follow_up_questions": [],
            "focus_area": "Reliability",
            "why_asked": "Checks operational instinct.",
            "practice_first": False,
        },
        {
            "question": "How have you handled a stakeholder push to skip a rollback?",
            "answer": "Anchor the conversation in the customer impact and the recovery cost.",
            "key_points": ["Customer impact", "Recovery cost"],
            "answer_structure": ["Frame", "Decide"],
            "follow_up_questions": [],
            "focus_area": "Stakeholder management",
            "why_asked": "Checks calm under pressure.",
            "practice_first": True,
        },
    ],
    "focus_areas": [],
    "weak_signals_to_prepare": [],
    "interviewer_notes": [],
}


def _is_pdf(blob: bytes) -> bool:
    return blob.startswith(b"%PDF-")


def test_cover_letter_pdf_contains_each_paragraph_text():
    pdf_bytes = generate_cover_letter_pdf(COVER_LETTER_PAYLOAD)
    assert _is_pdf(pdf_bytes)
    text = _extract_text(pdf_bytes)
    assert "Dear Hiring Manager" in text
    assert "led the migration of three internal services" in text
    assert "would bring the same discipline" in text
    assert "Thank you for reviewing my application" in text
    # And we did NOT fall through to the empty-payload stub.
    assert "No content available for export" not in text


def test_cover_letter_pdf_falls_back_to_full_text_when_sections_missing():
    payload = {"full_text": "Standalone paragraph one.\n\nStandalone paragraph two."}
    pdf_bytes = generate_cover_letter_pdf(payload)
    assert _is_pdf(pdf_bytes)
    text = _extract_text(pdf_bytes)
    assert "Standalone paragraph one" in text
    assert "Standalone paragraph two" in text
    assert "No content available for export" not in text


def test_cover_letter_pdf_handles_truly_empty_payload():
    pdf_bytes = generate_cover_letter_pdf({})
    assert _is_pdf(pdf_bytes)
    text = _extract_text(pdf_bytes)
    assert "No content available for export" in text


def test_cover_letter_pdf_escapes_html_metacharacters():
    payload = {
        "full_text": "Less-than: <script>alert('x')</script> & more.",
    }
    pdf_bytes = generate_cover_letter_pdf(payload)
    assert _is_pdf(pdf_bytes)
    text = _extract_text(pdf_bytes)
    # Reportlab won't have rendered the <script> tag — it must come through as
    # the literal characters in the displayed text.
    assert "<script>" in text
    assert "alert('x')" in text


def test_interview_pdf_includes_questions_answer_and_key_points():
    pdf_bytes = generate_interview_pdf(INTERVIEW_PAYLOAD)
    assert _is_pdf(pdf_bytes)
    text = _extract_text(pdf_bytes)
    assert "Q1" in text
    assert "Q2" in text
    assert "Walk me through how you would diagnose" in text
    assert "How have you handled a stakeholder push" in text
    # Old field name was `key_talking_points`; the schema field is `key_points`,
    # and the new export must surface it.
    assert "Key Points" in text
    assert "Deploy diff" in text
    assert "Customer impact" in text
    # Answer structure steps are listed as bullets.
    assert "Situation" in text
    assert "Frame" in text


def test_interview_pdf_handles_empty_questions():
    pdf_bytes = generate_interview_pdf({"questions": []})
    assert _is_pdf(pdf_bytes)
    text = _extract_text(pdf_bytes)
    assert "No questions available for export" in text
