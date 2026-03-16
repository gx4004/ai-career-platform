from __future__ import annotations

from typing import Any

from app.services.quality_signals import build_resume_prepass, ordered_unique


def _to_str(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    return ""


def _to_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items = [_to_str(item) for item in value]
    return [item for item in items if item]


def _to_object_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _fallback_requirement_cards(prepass) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    ordered_keywords = prepass.missing_keywords + prepass.matched_keywords
    for index, keyword in enumerate(ordered_keywords[:6]):
        status = "missing" if keyword in prepass.missing_keywords else "matched"
        cards.append(
            {
                "requirement": keyword,
                "importance": "must" if index < 4 else "preferred",
                "status": status,
                "resume_evidence": (
                    f"The resume already references {keyword}."
                    if status == "matched"
                    else f"No direct evidence for {keyword} was detected in the resume."
                ),
                "suggested_fix": (
                    f"Keep {keyword} visible in the strongest experience bullet."
                    if status == "matched"
                    else f"Add one concrete example that proves {keyword} with ownership and outcome."
                ),
            }
        )
    return cards


def _normalize_requirements(job_match: dict[str, Any], prepass) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    for item in _to_object_list(job_match.get("requirements")):
        importance = _to_str(item.get("importance")) or "preferred"
        status = _to_str(item.get("status")) or "missing"
        if importance not in {"must", "preferred"} or status not in {"matched", "partial", "missing"}:
            continue
        cards.append(
            {
                "requirement": _to_str(item.get("requirement")) or "Role requirement",
                "importance": importance,
                "status": status,
                "resume_evidence": _to_str(item.get("resume_evidence")) or "Evidence was not clearly surfaced.",
                "suggested_fix": _to_str(item.get("suggested_fix")) or "Add a clearer example tied to this requirement.",
            }
        )
    return cards[:6] if cards else _fallback_requirement_cards(prepass)


def _normalize_tailoring_actions(
    job_match: dict[str, Any],
    missing_keywords: list[str],
) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    for item in _to_object_list(job_match.get("tailoring_actions")):
        section = _to_str(item.get("section")) or "experience"
        if section not in {"summary", "experience", "skills", "projects"}:
            section = "experience"
        keyword = _to_str(item.get("keyword")) or "keyword"
        action = _to_str(item.get("action")) or "Add a more specific proof point for this requirement."
        actions.append(
            {
                "section": section,
                "keyword": keyword,
                "action": action,
            }
        )
    if actions:
        return actions[:4]

    fallback: list[dict[str, str]] = []
    section_lookup = {
        "leadership": "summary",
        "communication": "summary",
        "project": "projects",
        "design": "projects",
        "python": "skills",
        "sql": "skills",
        "docker": "skills",
        "kubernetes": "skills",
        "aws": "skills",
    }
    for keyword in missing_keywords[:3]:
        section = "experience"
        lowered = keyword.lower()
        for marker, value in section_lookup.items():
            if marker in lowered:
                section = value
                break
        fallback.append(
            {
                "section": section,
                "keyword": keyword,
                "action": f"Add a specific {section} example that proves {keyword} with scope and outcome.",
            }
        )
    return fallback


def _normalize_resume_strengths(
    resume_analysis: dict[str, Any],
    prepass,
) -> list[str]:
    strengths = _to_str_list(resume_analysis.get("strengths"))
    if strengths:
        return strengths[:4]

    fallback: list[str] = []
    if prepass.detected_sections:
        fallback.append(
            f"Your resume already surfaces core sections such as {', '.join(prepass.detected_sections[:4])}."
        )
    if prepass.matched_keywords:
        fallback.append(
            f"The current draft already aligns with {', '.join(prepass.matched_keywords[:4])}."
        )
    if prepass.quantified_bullets >= 2:
        fallback.append("There is measurable impact available to use in an evidence-heavy paragraph.")
    if prepass.detected_skills:
        fallback.append(
            f"Relevant skills are already explicit, including {', '.join(prepass.detected_skills[:4])}."
        )
    if not fallback:
        fallback.append("The resume contains enough raw material to build a targeted application story.")
    return fallback[:4]


def _normalize_resume_gaps(
    resume_analysis: dict[str, Any],
    prepass,
    missing_keywords: list[str],
) -> list[dict[str, str]]:
    gaps: list[dict[str, str]] = []
    for item in _to_object_list(resume_analysis.get("issues")):
        title = _to_str(item.get("title"))
        if not title:
            continue
        severity = _to_str(item.get("severity")) or "medium"
        if severity not in {"high", "medium", "low"}:
            severity = "medium"
        gaps.append(
            {
                "title": title,
                "severity": severity,
                "why_it_matters": _to_str(item.get("why_it_matters")) or "This weakens the application story.",
                "fix": _to_str(item.get("fix")) or "Add clearer proof so the claim is easier to trust.",
            }
        )
    if gaps:
        return gaps[:4]

    fallback: list[dict[str, str]] = []
    if missing_keywords:
        fallback.append(
            {
                "title": "Important role keywords still need direct proof",
                "severity": "high",
                "why_it_matters": "Missing language makes the application feel less targeted.",
                "fix": f"Show where you used {', '.join(missing_keywords[:3])} with ownership and outcome.",
            }
        )
    if prepass.quantified_bullets < 2:
        fallback.append(
            {
                "title": "The strongest claims need more measurable evidence",
                "severity": "medium",
                "why_it_matters": "Specific outcomes make the draft more credible.",
                "fix": "Bring metrics, scope, reliability, or user impact into the strongest paragraph.",
            }
        )
    return fallback[:4]


def build_application_handoff(
    resume_text: str,
    job_description: str,
    resume_analysis: dict[str, Any] | None = None,
    job_match: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resume_analysis = resume_analysis or {}
    job_match = job_match or {}
    prepass = build_resume_prepass(resume_text, job_description)

    requirements = _normalize_requirements(job_match, prepass)
    matched_keywords = ordered_unique(
        _to_str_list(job_match.get("matched_keywords")) + prepass.matched_keywords
    )[:6]
    missing_keywords = ordered_unique(
        _to_str_list(job_match.get("missing_keywords"))
        + [item["requirement"] for item in requirements if item["status"] != "matched"]
        + prepass.missing_keywords
    )[:6]
    tailoring_actions = _normalize_tailoring_actions(job_match, missing_keywords)
    interview_focus = ordered_unique(
        _to_str_list(job_match.get("interview_focus"))
        + [item["requirement"] for item in requirements if item["status"] != "matched"]
        + matched_keywords
    )[:4]
    resume_strengths = _normalize_resume_strengths(resume_analysis, prepass)
    resume_gaps = _normalize_resume_gaps(resume_analysis, prepass, missing_keywords)

    role_fit = resume_analysis.get("role_fit") if isinstance(resume_analysis.get("role_fit"), dict) else {}
    role_label = (
        _to_str(role_fit.get("target_role_label"))
        or prepass.target_role_label
        or "this role"
    )
    recruiter_summary = _to_str(job_match.get("recruiter_summary")) or (
        f"The application already shows some fit through {', '.join(matched_keywords[:3]) or 'relevant experience'}, "
        f"but it still needs sharper proof for {', '.join(missing_keywords[:3]) or 'the highest-priority role requirements'}."
    )

    return {
        "role_label": role_label,
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords,
        "requirements": requirements,
        "priority_requirements": [
            item["requirement"]
            for item in requirements
            if item["status"] != "matched"
        ][:4]
        or matched_keywords[:4],
        "tailoring_actions": tailoring_actions,
        "interview_focus": interview_focus,
        "resume_strengths": resume_strengths,
        "resume_gaps": resume_gaps,
        "quantified_bullets": (
            int((resume_analysis.get("evidence") or {}).get("quantified_bullets") or 0)
            if isinstance(resume_analysis.get("evidence"), dict)
            else prepass.quantified_bullets
        ),
        "recruiter_summary": recruiter_summary,
        "prepass_evidence": prepass.evidence(),
    }
