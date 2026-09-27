from __future__ import annotations

import re
from typing import Any

from app.schemas.cv_documents import CvArtifactEvidence, CvStyle
from app.services.cv_rendering import ATS_SAFE_TEMPLATES

ADVISORY_NOTE = (
    "Writing-quality numbers are directional editing guidance. Each check reports only "
    "the named structural property and never predicts ranking, interviews, or employment."
)
DIMENSIONS = (
    ("impact", "Evidence of impact"),
    ("clarity", "Clarity and focus"),
    ("completeness", "Document completeness"),
    ("structure", "Readable structure"),
)


def _visible(sections: list[dict]) -> list[dict]:
    return sorted(
        (s for s in sections if s.get("visible", True)), key=lambda s: s.get("position", 0)
    )


def _entry_text(entry: dict) -> str:
    """Flatten a structured or freeform entry into one scoring string.

    Structured fields (heading/subheading/location/dates/bullets) are additive
    enrichments over ``body`` (D-322); older entries carry only ``body`` and this
    must return exactly ``body.strip()`` for them.
    """
    parts = [str(entry.get("body", "")).strip()]
    for key in ("heading", "subheading", "location"):
        value = entry.get(key)
        if value:
            parts.append(str(value).strip())
    parts.extend(str(b).strip() for b in entry.get("bullets") or [] if str(b).strip())
    return " ".join(part for part in parts if part)


def _bodies(sections: list[dict]) -> list[str]:
    return [_entry_text(e) for s in _visible(sections) for e in s.get("entries", [])]


def score_cv_quality(sections: list[dict]) -> list[dict[str, Any]]:
    visible = _visible(sections)
    bodies = _bodies(sections)
    text = " ".join(bodies)
    word_count = len(re.findall(r"\b\w+\b", text))
    quantified = sum(bool(re.search(r"(?:\d|%|\$)", body)) for body in bodies)
    action_hits = sum(
        bool(
            re.match(
                r"(?i)(built|created|improved|reduced|increased|led|designed|delivered|launched|managed)\b",
                body,
            )
        )
        for body in bodies
    )
    kinds = {str(section.get("kind")) for section in visible}
    core = len(kinds & {"summary", "experience", "skills", "education"})
    titled = sum(bool(str(section.get("title", "")).strip()) for section in visible)
    concise = sum(8 <= len(re.findall(r"\w+", body)) <= 35 for body in bodies)

    values = {
        "impact": min(100, 20 + quantified * 18 + action_hits * 9),
        "clarity": min(
            100, 28 + (round(concise / len(bodies) * 42) if bodies else 0) + min(len(bodies), 5) * 5
        ),
        "completeness": min(
            100, 15 + core * 17 + min(len(bodies), 6) * 3 + (10 if word_count >= 45 else 0)
        ),
        "structure": min(100, 18 + core * 14 + titled * 5 + min(len(bodies), 6) * 3),
    }
    reasons = {
        "impact": [
            f"{quantified} entries include a measurable result.",
            f"{action_hits} entries start with a concrete action.",
        ],
        "clarity": [
            f"{concise} of {len(bodies)} entries use a concise scannable length.",
            f"The visible document contains about {word_count} words.",
        ],
        "completeness": [
            f"{core} of 4 common core section types are present.",
            f"{len(bodies)} visible entries provide document content.",
        ],
        "structure": [
            f"{len(visible)} visible typed sections create the reading order.",
            f"{titled} visible sections have explicit headings.",
        ],
    }
    fixes = {
        "impact": "Add truthful outcomes, scope, or measurements to entries that only list duties.",
        "clarity": "Keep each entry focused on one action and result, using direct language.",
        "completeness": "Add only the missing sections relevant to your history and target role.",
        "structure": "Use standard headings and short ordered entries so the document scans predictably.",
    }
    return [
        {
            "key": key,
            "label": label,
            "score": values[key],
            "reasons": reasons[key],
            "remediation": fixes[key],
        }
        for key, label in DIMENSIONS
    ]


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
        "schema_version": "cv-quality/v2",
        "dimensions": score_cv_quality(sections),
        "checks": run_checks(sections, style, evidence),
        "advisory_note": ADVISORY_NOTE,
    }
