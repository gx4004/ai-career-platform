"""Saved edits to a generated cover letter.

An edit replaces the text of the opening, each body paragraph and the closing, and
recomposes `full_text`, which Copy, TXT/MD, PDF and the application reviewer read.
Everything that explains a paragraph (rationale, requirements, evidence) is kept, and
so is the sign-off ("Sincerely,\nName"), which is not an editable paragraph.
"""

from __future__ import annotations

from typing import Any

from app.schemas.tools import CoverLetterEditRequest


def _section_text(section: Any) -> str:
    return section.get("text", "").strip() if isinstance(section, dict) and isinstance(section.get("text"), str) else ""


def letter_sign_off(payload: dict[str, Any]) -> str:
    """The letter's sign-off ("Sincerely,\nName"): stored, or what full_text has after the closing.

    Runs saved before the sign-off was a field kept it only at the end of full_text.
    """
    stored = payload.get("sign_off")
    if isinstance(stored, str):
        return stored.strip()
    full_text = payload.get("full_text")
    closing = _section_text(payload.get("closing"))
    if not isinstance(full_text, str) or not closing or closing not in full_text:
        return ""
    return full_text[full_text.rindex(closing) + len(closing) :].strip()


def compose_letter_text(opening: str, body_points: list[str], closing: str, sign_off: str) -> str:
    """The whole letter as Copy, TXT/MD, PDF and the reviewer read it."""
    parts = [opening, *body_points, closing, sign_off]
    return "\n\n".join(part.strip() for part in parts if part and part.strip())


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
    sign_off = letter_sign_off(payload)
    return {
        **payload,
        "opening": opening,
        "body_points": body_points,
        "closing": closing,
        "sign_off": sign_off,
        "full_text": compose_letter_text(
            opening["text"], [item["text"] for item in body_points], closing["text"], sign_off
        ),
    }
