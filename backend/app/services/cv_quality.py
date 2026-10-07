from __future__ import annotations

from typing import Any

from app.schemas.cv_documents import CvArtifactEvidence, CvStyle
from app.services.cv_rendering import ATS_SAFE_TEMPLATES


def _visible(sections: list[dict]) -> list[dict]:
    """The sections the PDF prints: visible and not empty (an empty one is left out of it)."""
    return sorted(
        (s for s in sections if s.get("visible", True) and s.get("entries")),
        key=lambda s: s.get("position", 0),
    )


_CONTENT_SECTIONS = {"experience", "education", "projects"}


def _listed(items: list[str], limit: int) -> str:
    shown = ", ".join(items[:limit])
    return f"{shown} and {len(items) - limit} more" if len(items) > limit else shown


def _reads_back_fix(style: CvStyle, evidence: CvArtifactEvidence) -> str:
    """Advice for a failed 'Reads back' check, naming what actually did not read back."""
    if evidence.unsupported_characters:
        advice = (
            "The CV font cannot draw these characters, so they are missing from the PDF: "
            f"{' '.join(evidence.unsupported_characters[:12])}. Replace them with "
            "standard letters, or remove them."
        )
        if evidence.unread_sections:
            advice += f" Affected sections: {_listed(evidence.unread_sections, 5)}."
        return advice
    if evidence.too_long:
        return "This CV is too long to check. Shorten it, then run the check again."
    if evidence.order_only and not (style.ats_mode or style.template_id in ATS_SAFE_TEMPLATES):
        return (
            "Every section is there, but this layout reads in a different order than you "
            "wrote it. Pick a single-column template to keep your order."
        )
    if evidence.unread_sections:
        named = f"These sections did not read back as written: {_listed(evidence.unread_sections, 5)}."
        if style.ats_mode or style.template_id in ATS_SAFE_TEMPLATES:
            return f"{named} Look for unusual symbols or stray formatting in them."
        return f"{named} Try ATS-friendly mode or a single-column template."
    return "Some sections did not read back in order. Try ATS-friendly mode or a single-column template."


def _check(check_id: str, label: str, passed: bool, detail: str, fix: str) -> dict[str, Any]:
    return {"id": check_id, "label": label, "passed": passed, "detail": detail, "fix": fix}


def run_checks(
    sections: list[dict], style: CvStyle, evidence: CvArtifactEvidence
) -> list[dict[str, Any]]:
    """Pass/fail structural checks against the PDF rendered from the saved style.

    Deliberately no aggregate number: CONTEXT.md forbids a universal ATS score.
    """
    kinds = {str(s.get("kind")) for s in _visible(sections)}
    standard = kinds - {"custom"}
    return [
        _check(
            "sections",
            "Clear section headings",
            # What the person did or studied (Experience, Education or Projects) plus at
            # least one more standard section; a graduate CV has no Experience.
            bool(kinds & _CONTENT_SECTIONS) and len(standard) >= 2,
            "Application systems look for standard sections such as Experience, Education "
            "and Skills.",
            "Add the sections application systems expect: Experience (or Education or "
            "Projects) and a Skills or Summary section.",
        ),
        _check(
            "reads_back",
            "Reads back correctly",
            evidence.reads_back == "pass",
            "Reading the PDF back in returns every section as typed text, in the right order.",
            _reads_back_fix(style, evidence),
        ),
        _check(
            "links",
            "Links work",
            evidence.links == "pass",
            "Web addresses in your CV are real, clickable links in the PDF.",
            "A link in your CV does not work. Check the web addresses you included.",
        ),
        _check(
            "page_breaks",
            "Tidy page breaks",
            evidence.page_breaks == "pass",
            "Each section starts on the same page as its first entry, and no page is left mostly empty.",
            "A heading is separated from its first entry, or a page is left mostly empty. "
            "Shorten the entry or reorder the sections so the pages fill.",
        ),
        _check(
            "layout",
            "Single-column layout",
            style.ats_mode or style.template_id in ATS_SAFE_TEMPLATES,
            "Single-column layouts read in the order you wrote them.",
            "Your template uses two columns, which some application systems read out of "
            "order. Turn on ATS-friendly mode or pick a single-column template.",
        ),
    ]


def analyze_cv_quality(
    sections: list[dict], style: CvStyle, evidence: CvArtifactEvidence
) -> dict[str, Any]:
    return {
        "schema_version": "cv-quality/v3",
        "checks": run_checks(sections, style, evidence),
    }
