"""Saved edits to a generated cover letter.

An edit replaces the text of the opening, each body paragraph and the closing, and
recomposes `full_text`, which Copy, TXT/MD, PDF and the application reviewer read.
Everything that explains a paragraph (rationale, requirements, evidence) is kept.
"""

from __future__ import annotations

from typing import Any

from app.schemas.tools import CoverLetterEditRequest


class LetterEditMismatch(ValueError):
    """The edit does not fit the stored letter (different number of body paragraphs)."""


def apply_letter_edit(payload: dict[str, Any], edit: CoverLetterEditRequest) -> dict[str, Any]:
    """The stored payload with the edited paragraph text applied (a new dict)."""
    stored_body = payload.get("body_points")
    stored_body = stored_body if isinstance(stored_body, list) else []
    if len(edit.body_points) != len(stored_body):
        raise LetterEditMismatch(
            f"this letter has {len(stored_body)} body paragraphs, the edit has {len(edit.body_points)}"
        )

    def with_text(section: Any, text: str) -> dict[str, Any]:
        return {**(section if isinstance(section, dict) else {}), "text": text}

    opening = with_text(payload.get("opening"), edit.opening)
    body_points = [with_text(section, text) for section, text in zip(stored_body, edit.body_points, strict=True)]
    closing = with_text(payload.get("closing"), edit.closing)
    parts = [opening["text"], *(item["text"] for item in body_points), closing["text"]]
    return {
        **payload,
        "opening": opening,
        "body_points": body_points,
        "closing": closing,
        "full_text": "\n\n".join(part.strip() for part in parts if part.strip()),
    }
