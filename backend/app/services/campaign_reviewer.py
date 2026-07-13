from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime

from app.evals.fabrication import extract_claims, trace_claim
from app.services.evidence_injection import EvidencePayload
from app.services.quality_signals import extract_job_keywords, keyword_present

GENERIC_PHRASES = (
    "results-driven",
    "passionate professional",
    "team player",
    "i am excited to apply",
)
REQUIREMENT_STOPWORDS = {"seeking", "expertise", "experience", "required", "preferred"}


def project_campaign_materials(campaign) -> tuple[str, str]:
    """Project exactly the visible CV and submitted cover-letter document."""
    sections = campaign.selected_cv_variant.sections if campaign.selected_cv_variant else []
    cv = "\n".join(
        entry["body"]
        for section in sorted(sections, key=lambda item: item.get("position", 0))
        if section.get("visible", True)
        for entry in sorted(section.get("entries", []), key=lambda item: item.get("position", 0))
        if isinstance(entry.get("body"), str)
    )
    payload = (
        campaign.selected_cover_letter_run.result_payload
        if campaign.selected_cover_letter_run
        else {}
    )
    cover = _cover_document_text(payload)
    return cv, cover


def _cover_document_text(payload: dict) -> str:
    full_text = payload.get("full_text")
    if isinstance(full_text, str) and full_text.strip():
        return full_text
    legacy_body = payload.get("body")
    if isinstance(legacy_body, str) and legacy_body.strip():
        return legacy_body
    body_points = payload.get("body_points")
    paragraphs = []
    for value in (
        payload.get("opening"),
        *(body_points if isinstance(body_points, list) else []),
        payload.get("closing"),
    ):
        if isinstance(value, dict) and isinstance(value.get("text"), str):
            paragraphs.append(value["text"])
    return "\n\n".join(paragraphs)


async def review_campaign_materials(
    *,
    resume_text: str,
    job_description: str,
    cover_text: str,
    evidence_profile: EvidencePayload | None = None,
) -> dict:
    confirmed_sources = {
        f"confirmed_evidence:{item['evidence_item_id']}": json.dumps(
            item["content"], sort_keys=True
        )
        for item in (evidence_profile.locked_facts if evidence_profile else [])
    }
    findings: list[dict] = []
    findings.extend(_unsupported(resume_text, cover_text, confirmed_sources))
    findings.extend(_missed_requirements(job_description, resume_text, cover_text))
    findings.extend(_contradictions(resume_text, cover_text))
    findings.extend(_generic_and_repeated(resume_text, cover_text))
    findings.extend(_document_defects(resume_text, cover_text))
    return {
        "schema_version": "application-reviewer/v1",
        "summary": {
            "headline": f"{len(findings)} advisory finding{'s' if len(findings) != 1 else ''}",
            "verdict": "Review the located findings before submission.",
            "confidence_note": "Deterministic checks only; findings never edit materials.",
        },
        "top_actions": [
            {
                "title": "Review advisory findings",
                "action": "Inspect, edit source materials if useful, or dismiss each finding.",
                "priority": "high"
                if any(item["severity"] == "high" for item in findings)
                else "medium",
            }
        ],
        "generated_at": datetime.now(UTC).isoformat(),
        "download_title": "Application quality review",
        "exportable_sections": [
            {
                "id": "findings",
                "title": "Advisory findings",
                "items": [f"{item['category']}: {item['message']}" for item in findings],
            }
        ],
        "editable_blocks": [],
        "findings": findings,
    }


def _finding(
    category: str, severity: str, message: str, locations: list[str], trace: list[str]
) -> dict:
    identity = json.dumps(
        {"category": category, "message": message, "locations": locations},
        sort_keys=True,
    )
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
        "category": category,
        "severity": severity,
        "message": message,
        "locations": locations,
        "trace": trace,
    }


def _unsupported(cv: str, cover: str, confirmed_sources: dict[str, str]) -> list[dict]:
    findings = []
    for location, output, extra_sources in (
        ("CV", cv, {}),
        ("Cover letter", cover, {"selected_cv": cv}),
    ):
        sources = {**confirmed_sources, **extra_sources}
        for claim in extract_claims(output):
            trace = trace_claim(claim, sources)
            if trace.traceable:
                continue
            findings.append(
                _finding(
                    "unsupported_claim",
                    "high",
                    f"{claim.text} is not traceable to confirmed evidence or source material.",
                    [_locator(location, output, claim.text)],
                    [
                        f"claim:{claim.text}",
                        *(f"source:{attempt.source}:no_match" for attempt in trace.attempts),
                        "result:unsupported",
                    ],
                )
            )
    return findings


def _missed_requirements(listing: str, cv: str, cover: str) -> list[dict]:
    return [
        _finding(
            "missed_requirement",
            "medium",
            f"The selected materials do not address the listing requirement “{keyword}”.",
            [
                _locator("Canonical listing", listing, keyword),
                "CV:entire document",
                "Cover letter:entire document",
            ],
            [f"listing_requirement:{keyword}", "result:not_found_in_selected_materials"],
        )
        for keyword in extract_job_keywords(listing, limit=12)
        if keyword.lower() not in REQUIREMENT_STOPWORDS
        and not keyword_present(keyword, f"{cv}\n{cover}")
    ]


def _contradictions(cv: str, cover: str) -> list[dict]:
    cv_matches = list(re.finditer(r"\b(\d{1,2})\+? years?\b", cv, re.I))
    cover_matches = list(re.finditer(r"\b(\d{1,2})\+? years?\b", cover, re.I))
    cv_years = {match.group(1) for match in cv_matches}
    cover_years = {match.group(1) for match in cover_matches}
    if cv_years and cover_years and cv_years != cover_years:
        return [
            _finding(
                "contradiction",
                "high",
                "Years-of-experience claims conflict across selected materials.",
                [f"CV:chars {match.start()}-{match.end()}:{match.group()}" for match in cv_matches]
                + [
                    f"Cover letter:chars {match.start()}-{match.end()}:{match.group()}"
                    for match in cover_matches
                ],
                ["comparison:years_of_experience", "result:conflict"],
            )
        ]
    return []


def _generic_and_repeated(cv: str, cover: str) -> list[dict]:
    findings = [
        _finding(
            "generic_language",
            "low",
            f"Generic phrase “{phrase}” weakens specificity.",
            [
                _locator(
                    "Cover letter" if phrase in cover.lower() else "CV",
                    cover if phrase in cover.lower() else cv,
                    phrase,
                )
            ],
            [f"matched_phrase:{phrase}"],
        )
        for phrase in GENERIC_PHRASES
        if phrase in f"{cv}\n{cover}".lower()
    ]
    cv_sentences = [
        part.strip().lower() for part in re.split(r"[.!?\n]+", cv) if len(part.strip()) >= 35
    ]
    cover_sentences = [
        part.strip().lower() for part in re.split(r"[.!?\n]+", cover) if len(part.strip()) >= 35
    ]
    sentences = cv_sentences + cover_sentences
    for sentence in sorted({item for item in sentences if sentences.count(item) > 1}):
        findings.append(
            _finding(
                "repetition",
                "low",
                "The same substantive sentence appears more than once.",
                [
                    *([_locator("CV", cv, sentence)] if sentence in cv.lower() else []),
                    *(
                        [_locator("Cover letter", cover, sentence)]
                        if sentence in cover.lower()
                        else []
                    ),
                ],
                [f"repeated_text:{sentence[:120]}"],
            )
        )
    return findings


def _document_defects(cv: str, cover: str) -> list[dict]:
    findings = []
    if len(cv.strip()) < 80:
        findings.append(
            _finding(
                "document_defect",
                "medium",
                "The selected CV has too little visible content.",
                ["CV:entire document"],
                [f"visible_characters:{len(cv.strip())}", "minimum:80"],
            )
        )
    if len(cover.strip()) < 120:
        findings.append(
            _finding(
                "document_defect",
                "medium",
                "The selected cover letter is unusually short.",
                ["Cover letter:entire document"],
                [f"visible_characters:{len(cover.strip())}", "minimum:120"],
            )
        )
    for token in ("[company]", "[name]", "todo"):
        if token in f"{cv}\n{cover}".lower():
            findings.append(
                _finding(
                    "document_defect",
                    "high",
                    f"Unresolved placeholder “{token}” remains.",
                    [
                        *([_locator("CV", cv, token)] if token in cv.lower() else []),
                        *(
                            [_locator("Cover letter", cover, token)]
                            if token in cover.lower()
                            else []
                        ),
                    ],
                    [f"placeholder:{token}"],
                )
            )
    return findings


def _locator(document: str, text: str, needle: str) -> str:
    start = text.lower().find(needle.lower())
    return (
        f"{document}:chars {start}-{start + len(needle)}" if start >= 0 else f"{document}:not found"
    )
