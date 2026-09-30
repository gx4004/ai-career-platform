from __future__ import annotations

from typing import Any

from app.schemas.cv_documents import CvArtifactEvidence, CvStyle
from app.services.cv_rendering import ATS_SAFE_TEMPLATES


def _visible(sections: list[dict]) -> list[dict]:
    return sorted(
        (s for s in sections if s.get("visible", True)), key=lambda s: s.get("position", 0)
    )


def _check(check_id: str, label: str, passed: bool, detail: str, fix: str) -> dict[str, Any]:
    return {"id": check_id, "label": label, "passed": passed, "detail": detail, "fix": fix}


def run_checks(
    sections: list[dict], style: CvStyle, evidence: CvArtifactEvidence
) -> list[dict[str, Any]]:
    """Pass/fail structural checks against the PDF rendered from the saved style.

    Deliberately no aggregate number: CONTEXT.md forbids a universal ATS score.
    """
    kinds = {str(s.get("kind")) for s in _visible(sections)}
    return [
        _check(
            "sections",
            "Clear section headings",
            {"experience", "skills"} <= kinds,
            "Application systems look for standard sections such as Experience and Skills.",
            "Add an Experience section and a Skills section so application systems can find them.",
        ),
        _check(
            "reads_back",
            "Reads back correctly",
            evidence.reads_back == "pass",
            "Reading the PDF back in returns every section as typed text, in the right order.",
            "Some sections did not read back in order. Try ATS-friendly mode or a "
            "single-column template.",
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
            "Each section starts on the same page as its first entry.",
            "An entry splits across pages. Shorten it or move it so it fits on one page.",
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
