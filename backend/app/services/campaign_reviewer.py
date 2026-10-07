from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime

from app.schemas.gap_classification import TRACE_VISIBLE_CHARACTERS
from app.services.evidence_injection import EvidencePayload
from app.services.fabrication import KIND_FIGURE, extract_claims, trace_claim
from app.services.quality_signals import (
    _SKILL_PATTERNS_BY_LOWER_LABEL,
    extract_detected_skills,
    extract_job_keywords,
    keyword_present,
)

GENERIC_PHRASES = (
    "results-driven",
    "passionate professional",
    "team player",
    "i am excited to apply",
)
REQUIREMENT_STOPWORDS = {"seeking", "expertise", "experience", "required", "preferred"}


def _flatten_sections(sections: list[dict]) -> str:
    return "\n".join(
        entry["body"]
        for section in sorted(sections, key=lambda item: item.get("position", 0))
        if section.get("visible", True)
        for entry in sorted(section.get("entries", []), key=lambda item: item.get("position", 0))
        if isinstance(entry.get("body"), str)
    )


def project_campaign_materials(campaign) -> tuple[str, str]:
    """Project the visible CV and the cover letter the application would send.

    The chosen cover letter wins; otherwise the prepared draft is checked.
    """
    sections = campaign.selected_cv_variant.sections if campaign.selected_cv_variant else []
    cv = _flatten_sections(sections)
    if campaign.selected_cover_letter_run is not None:
        return cv, cover_document_text(campaign.selected_cover_letter_run.result_payload or {})
    drafts = campaign.drafts_run.result_payload if campaign.drafts_run is not None else None
    cover = (drafts or {}).get("cover_letter") or {}
    return cv, str(cover.get("body") or "")


def project_cv_document_text(campaign) -> str:
    """The selected variant's parent CvDocument, flattened (D-073 grounding source).

    This is the user's own self-authored/edited structured CV (R12 #153/#155) —
    never LLM-tailored, unlike the variant itself, which #157's tailoring flow may
    have rewritten. It is a legitimate fabrication-check grounding source for CV
    content the user already had before any tailoring; see :func:`_unsupported`.
    """
    variant = campaign.selected_cv_variant
    document = variant.document if variant is not None else None
    return _flatten_sections(document.sections if document is not None else [])


def cover_document_text(payload: dict) -> str:
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
    cv_document_text: str = "",
    listing_title: str = "",
    listing_company: str = "",
    has_cv: bool | None = None,
) -> dict:
    """``has_cv``: a CV version is chosen (an empty one still is). Defaults to "the CV has text".

    The response names the documents chosen (``documents``), so a check that needs a document nobody chose
    reads as not checked, never as a pass.
    """
    documents = {
        "cv": bool(resume_text.strip()) if has_cv is None else has_cv,
        "cover_letter": bool(cover_text.strip()),
    }
    confirmed_sources = {
        f"confirmed_evidence:{item['evidence_item_id']}": json.dumps(
            item["content"], sort_keys=True
        )
        for item in (evidence_profile.locked_facts if evidence_profile else [])
    }
    findings: list[dict] = []
    # The posting is the cover letter's own subject: its role and company are
    # grounded by definition, so naming them is not a claim about the user.
    posting_names = "\n".join(part for part in (listing_title, listing_company) if part)
    findings.extend(
        _unsupported(
            resume_text,
            cover_text,
            confirmed_sources,
            cv_document_text,
            posting_names,
            job_description,
        )
    )
    findings.extend(_missed_requirements(job_description, resume_text, cover_text, documents))
    findings.extend(_contradictions(resume_text, cover_text))
    findings.extend(_generic_and_repeated(resume_text, cover_text))
    findings.extend(_document_defects(resume_text, cover_text, documents))
    return {
        "schema_version": "application-reviewer/v1",
        "summary": {
            "headline": f"{len(findings)} thing{'s' if len(findings) != 1 else ''} to look at",
            "verdict": "Look these over before you send your application.",
            "confidence_note": "Quick rule-based checks. Nothing is changed for you.",
        },
        "top_actions": [
            {
                "title": "Look over what the checks found",
                "action": "Fix your documents where it helps, or hide the ones that don't apply.",
                "priority": "high"
                if any(item["severity"] == "high" for item in findings)
                else "medium",
            }
        ],
        "generated_at": datetime.now(UTC).isoformat(),
        "download_title": "Application checklist",
        "exportable_sections": [
            {
                "id": "findings",
                "title": "What the checks found",
                "items": [f"{item['category']}: {item['message']}" for item in findings],
            }
        ],
        "editable_blocks": [],
        "documents": documents,
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


def _unsupported(
    cv: str,
    cover: str,
    confirmed_sources: dict[str, str],
    cv_document_text: str = "",
    posting_names: str = "",
    posting_text: str = "",
) -> list[dict]:
    """Flag CV/cover-letter claims traceable to neither confirmed evidence nor
    source material.

    "Source material" for the CV location is its own pre-tailoring document
    (D-073: content the user already had is legitimate grounding, not
    fabrication) — without it, every proper noun and figure in a truthful CV
    would be flagged the moment the owner has no confirmed Evidence Profile
    items, which is the common case. The cover letter additionally grounds
    against the selected CV, since a cover letter may legitimately restate CV
    content. It also grounds against the job posting it answers: the title and company
    ground any name; the description grounds names that are not skills, so "the
    Integrations team" is fine but "I led our Kubernetes migration" is still checked
    against what the owner actually has (D-043: a posting naming a skill is not
    evidence the owner has it).
    """
    findings = []
    for location, output, extra_sources in (
        ("CV", cv, {"cv_document": cv_document_text}),
        ("Cover letter", cover, {"selected_cv": cv, "cv_document": cv_document_text}),
    ):
        sources = {**confirmed_sources, **extra_sources}
        is_letter = location == "Cover letter"
        for claim in extract_claims(output):
            claim_sources = dict(sources)
            # Never a figure: "5 years" in a requirement is not evidence of 5 years.
            if is_letter and claim.kind != KIND_FIGURE:
                if posting_names:
                    claim_sources["job_posting_title_company"] = posting_names
                if posting_text and not _names_a_skill(claim.text):
                    claim_sources["job_posting"] = posting_text
            trace = trace_claim(claim, claim_sources)
            if trace.traceable:
                continue
            findings.append(
                _finding(
                    "unsupported_claim",
                    "high",
                    f"We couldn't find “{claim.text}” in your CV or profile. "
                    "Make sure you can back it up.",
                    [_locator(location, output, claim.text)],
                    [
                        f"claim:{claim.text}",
                        *(f"source:{attempt.source}:no_match" for attempt in trace.attempts),
                        "result:unsupported",
                    ],
                )
            )
    return findings


def _names_a_skill(text: str) -> bool:
    return bool(extract_detected_skills(text)) or text.lower() in _SKILL_PATTERNS_BY_LOWER_LABEL


def _missed_requirements(listing: str, cv: str, cover: str, chosen: dict[str, bool]) -> list[dict]:
    # Speak only of the documents chosen: with one of them missing, the other alone is checked.
    names = [name for name, key in (("CV", "cv"), ("Cover letter", "cover_letter")) if chosen[key]]
    if len(names) == 1:
        documents = f"your {'CV' if names[0] == 'CV' else 'cover letter'} doesn't"
    else:
        documents = "your CV and cover letter don't" if names else "your documents don't"
    locations = [f"{name}:entire document" for name in names]
    return [
        _finding(
            "missed_requirement",
            "medium",
            f"The job asks for “{keyword}”, but {documents} mention it.",
            [_locator("Job posting", listing, keyword), *locations],
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
                "Your CV and cover letter give different years of experience.",
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
            f"“{phrase}” is a stock phrase. Swap it for something specific you did.",
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
                "The same sentence appears more than once.",
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


def _document_defects(cv: str, cover: str, chosen: dict[str, bool]) -> list[dict]:
    findings = []
    # A chosen CV that is empty is the useful answer; no CV chosen is nothing to measure.
    if chosen["cv"] and len(cv.strip()) < 80:
        findings.append(
            _finding(
                "document_defect",
                "medium",
                "Your CV looks almost empty.",
                ["CV:entire document"],
                [f"{TRACE_VISIBLE_CHARACTERS}{len(cv.strip())}", "minimum:80"],
            )
        )
    # No cover letter chosen is not a short one: there is nothing to measure.
    if 0 < len(cover.strip()) < 120:
        findings.append(
            _finding(
                "document_defect",
                "medium",
                "Your cover letter is very short.",
                ["Cover letter:entire document"],
                [f"{TRACE_VISIBLE_CHARACTERS}{len(cover.strip())}", "minimum:120"],
            )
        )
    for token in ("[company]", "[name]", "todo"):
        if token in f"{cv}\n{cover}".lower():
            findings.append(
                _finding(
                    "document_defect",
                    "high",
                    f"There's a leftover placeholder: “{token}”.",
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
