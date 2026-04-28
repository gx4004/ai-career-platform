from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.prompts.job_match import build_job_match_prompt
from app.services.ai_client import complete_structured
from app.services.quality_signals import (
    build_resume_prepass,
    compute_match_score,
    job_match_verdict,
)

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "quality_v2"
CONFIDENCE_NOTE = (
    "Directional heuristic based on keyword and evidence overlap, not a recruiter "
    "decision or ATS guarantee."
)


def _headline(verdict: str, matched_keywords: list[str], missing_keywords: list[str]) -> str:
    if verdict == "strong":
        return "The resume already aligns well, but a few targeted edits could make the fit easier to trust."
    if matched_keywords:
        return (
            f"The foundation is there, but the resume still needs stronger proof for "
            f"{', '.join(missing_keywords[:3]) or 'the most important role requirements'}."
        )
    return "The current resume reads as a stretch for this role without clearer targeted evidence."


def _fallback_requirements(
    matched_keywords: list[str],
    missing_keywords: list[str],
) -> list[dict[str, str]]:
    requirements: list[dict[str, str]] = []
    ordered_keywords = matched_keywords + missing_keywords
    for index, keyword in enumerate(ordered_keywords[:6]):
        is_matched = keyword in matched_keywords
        requirements.append(
            {
                "requirement": keyword,
                "importance": "must" if index < 4 else "preferred",
                "status": "matched" if is_matched else "missing",
                "resume_evidence": (
                    f"The resume already references {keyword}."
                    if is_matched
                    else f"No direct evidence for {keyword} was detected in the resume."
                ),
                "suggested_fix": (
                    f"Add a concrete bullet that shows where you used {keyword} and what changed."
                    if not is_matched
                    else f"Keep {keyword} visible in both the skills area and the strongest experience bullet."
                ),
            }
        )
    return requirements


def _normalize_requirements(
    result: dict,
    matched_keywords: list[str],
    missing_keywords: list[str],
) -> list[dict[str, str]]:
    raw_items = result.get("requirements") if isinstance(result.get("requirements"), list) else []
    normalized: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        importance = str(item.get("importance") or "").strip()
        status = str(item.get("status") or "").strip()
        if importance not in {"must", "preferred"} or status not in {"matched", "partial", "missing"}:
            continue
        normalized.append(
            {
                "requirement": str(item.get("requirement") or "Role requirement"),
                "importance": importance,
                "status": status,
                "resume_evidence": str(item.get("resume_evidence") or "Evidence was not clearly surfaced."),
                "suggested_fix": str(item.get("suggested_fix") or "Revise the resume so this requirement is easier to verify."),
            }
        )
    return normalized[:6] if normalized else _fallback_requirements(matched_keywords, missing_keywords)


def _section_for_keyword(keyword: str) -> str:
    lowered = keyword.lower()
    if lowered in {"python", "sql", "docker", "kubernetes", "typescript", "react"}:
        return "skills"
    if "design" in lowered or "project" in lowered:
        return "projects"
    if lowered in {"leadership", "communication", "stakeholder management"}:
        return "summary"
    return "experience"


def _fallback_tailoring_actions(missing_keywords: list[str]) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    for keyword in missing_keywords[:3]:
        section = _section_for_keyword(keyword)
        actions.append(
            {
                "section": section,
                "keyword": keyword,
                "action": f"Add a specific example in the {section} section that proves {keyword} with scope and outcome.",
            }
        )
    return actions


def _normalize_tailoring_actions(result: dict, missing_keywords: list[str]) -> list[dict[str, str]]:
    raw_items = result.get("tailoring_actions") if isinstance(result.get("tailoring_actions"), list) else []
    normalized: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        section = str(item.get("section") or "").strip()
        if section not in {"summary", "experience", "skills", "projects"}:
            continue
        normalized.append(
            {
                "section": section,
                "keyword": str(item.get("keyword") or "keyword"),
                "action": str(item.get("action") or "Add a more specific example tied to the job description."),
            }
        )
    return normalized[:4] if normalized else _fallback_tailoring_actions(missing_keywords)


def _normalize_top_actions(
    result: dict,
    requirements: list[dict[str, str]],
    tailoring_actions: list[dict[str, str]],
) -> list[dict[str, str]]:
    raw_items = result.get("top_actions") if isinstance(result.get("top_actions"), list) else []
    normalized: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        priority = str(item.get("priority") or "").strip()
        if priority not in {"high", "medium", "low"}:
            priority = "medium"
        normalized.append(
            {
                "title": str(item.get("title") or "Top action"),
                "action": str(item.get("action") or "Tailor the resume to the most important requirement."),
                "priority": priority,
            }
        )
    if normalized:
        return normalized[:3]

    actions: list[dict[str, str]] = []
    for requirement in requirements:
        if requirement["status"] == "matched":
            continue
        actions.append(
            {
                "title": requirement["requirement"],
                "action": requirement["suggested_fix"],
                "priority": "high" if requirement["importance"] == "must" else "medium",
            }
        )
    for tailoring_action in tailoring_actions:
        if len(actions) >= 3:
            break
        actions.append(
            {
                "title": f"Tailor {tailoring_action['keyword']}",
                "action": tailoring_action["action"],
                "priority": "medium",
            }
        )
    return actions[:3]


async def match_job(resume_text: str, job_description: str) -> dict:
    prepass = build_resume_prepass(resume_text, job_description)
    match_score = compute_match_score(prepass.matched_keywords, prepass.missing_keywords)
    verdict = job_match_verdict(match_score)
    generated_at = datetime.now(UTC).isoformat()

    locked_payload = {
        "schema_version": SCHEMA_VERSION,
        "summary": {
            "headline": _headline(verdict, prepass.matched_keywords, prepass.missing_keywords),
            "verdict": verdict,
            "confidence_note": CONFIDENCE_NOTE,
        },
        "top_actions": [],
        "generated_at": generated_at,
        "match_score": match_score,
        "verdict": verdict,
        "requirements": [],
        "matched_keywords": prepass.matched_keywords,
        "missing_keywords": prepass.missing_keywords,
        "tailoring_actions": [],
        "interview_focus": [],
        "recruiter_summary": "",
    }
    prepass_evidence = {
        "detected_sections": prepass.detected_sections,
        "detected_skills": prepass.detected_skills,
        "quantified_bullets": prepass.quantified_bullets,
        "matched_keywords": prepass.matched_keywords,
        "missing_keywords": prepass.missing_keywords,
        "target_role_label": prepass.target_role_label,
    }

    system_prompt, user_prompt = build_job_match_prompt(
        resume_text,
        job_description,
        locked_payload,
        prepass_evidence,
    )
    # Spec decision #7: Resume Analyzer and Job Match fall back to a silent
    # heuristic when the LLM is unavailable; the generative tools (cover-letter,
    # interview, career, portfolio) surface explicit errors. The downstream
    # _normalize_* helpers already accept an empty dict and fill in heuristic
    # defaults from the prepass, so an empty result is enough to drive the
    # fallback path through the same normalization pipeline as a successful
    # LLM call.
    try:
        result = await complete_structured(system_prompt, user_prompt)
    except Exception as exc:
        logger.warning(
            "LLM call failed for job match, returning heuristic-only result: %s",
            exc,
            exc_info=True,
        )
        result = {}

    requirements = _normalize_requirements(result, prepass.matched_keywords, prepass.missing_keywords)
    tailoring_actions = _normalize_tailoring_actions(result, prepass.missing_keywords)
    top_actions = _normalize_top_actions(result, requirements, tailoring_actions)
    interview_focus = result.get("interview_focus") if isinstance(result.get("interview_focus"), list) else []
    interview_focus = [str(item) for item in interview_focus if str(item).strip()]
    if not interview_focus:
        interview_focus = prepass.missing_keywords[:3] or prepass.matched_keywords[:3]

    # Normalize missing keywords with contextual guidance
    raw_missing = result.get("missing_keywords") if isinstance(result.get("missing_keywords"), list) else []
    enriched_missing_keywords: list[dict[str, str]] = []
    for item in raw_missing:
        if isinstance(item, dict):
            keyword = str(item.get("keyword") or "").strip()
            if not keyword:
                continue
            enriched_missing_keywords.append(
                {
                    "keyword": keyword,
                    "contextual_guidance": str(item.get("contextual_guidance") or "").strip()
                    or "Consider adding relevant experience with this skill",
                    "anti_stuffing_note": str(item.get("anti_stuffing_note") or "").strip()
                    or "Only mention if you have genuine experience",
                }
            )
        elif isinstance(item, str) and item.strip():
            enriched_missing_keywords.append(
                {
                    "keyword": item.strip(),
                    "contextual_guidance": "Consider adding relevant experience with this skill",
                    "anti_stuffing_note": "Only mention if you have genuine experience",
                }
            )
    # Fallback: if LLM didn't return enriched missing keywords, build from prepass
    if not enriched_missing_keywords:
        for kw in prepass.missing_keywords:
            enriched_missing_keywords.append(
                {
                    "keyword": kw,
                    "contextual_guidance": "Consider adding relevant experience with this skill",
                    "anti_stuffing_note": "Only mention if you have genuine experience",
                }
            )

    recruiter_summary = str(
        result.get("recruiter_summary")
        or (
            f"This resume shows evidence for {', '.join(prepass.matched_keywords[:4]) or 'some relevant experience'}, "
            f"but it still needs clearer proof for {', '.join(prepass.missing_keywords[:4]) or 'the key job requirements'} "
            f"to read as a stronger match."
        )
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "summary": {
            "headline": str(result.get("summary", {}).get("headline") if isinstance(result.get("summary"), dict) else "") or _headline(verdict, prepass.matched_keywords, prepass.missing_keywords),
            "verdict": str(result.get("summary", {}).get("verdict") if isinstance(result.get("summary"), dict) else "") or verdict,
            "confidence_note": str(result.get("summary", {}).get("confidence_note") if isinstance(result.get("summary"), dict) else "") or CONFIDENCE_NOTE,
        },
        "top_actions": top_actions,
        "generated_at": generated_at,
        "match_score": match_score,
        "verdict": verdict,
        "requirements": requirements,
        "matched_keywords": prepass.matched_keywords,
        "missing_keywords": enriched_missing_keywords,
        "tailoring_actions": tailoring_actions,
        "interview_focus": interview_focus[:4],
        "recruiter_summary": recruiter_summary,
    }
