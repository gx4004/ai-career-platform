from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
from typing import Any

from app.prompts.cover_letter import build_cover_letter_prompt
from app.services.ai_client import complete_structured
from app.services.application_context import build_application_handoff

SCHEMA_VERSION = "quality_v2"

TONE_STRATEGIES = {
    "Professional": {
        "opening": "qualifications_first",
        "body_order": ["credentials", "requirements_mapping", "achievements"],
        "evidence_bias": "formal_metrics",
        "closing": "forward_looking",
    },
    "Confident": {
        "opening": "achievements_first",
        "body_order": ["top_achievements", "quantified_results", "value_proposition"],
        "evidence_bias": "strongest_accomplishments",
        "closing": "bold_commitment",
    },
    "Warm": {
        "opening": "personal_connection",
        "body_order": ["company_alignment", "collaborative_wins", "cultural_fit"],
        "evidence_bias": "anecdotes",
        "closing": "enthusiasm",
    },
}
CONFIDENCE_NOTE = (
    "Advisory draft based on your resume and surfaced role signals, not an employer "
    "preference prediction."
)


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


def _default_headline(application_context: dict[str, Any]) -> str:
    if application_context["missing_keywords"]:
        return (
            f"The draft is targeted, but it should prove "
            f"{', '.join(application_context['missing_keywords'][:3])} more explicitly."
        )
    return "The letter is aligned to the role and ready for a final evidence-focused polish."


def _default_summary(application_context: dict[str, Any]) -> dict[str, str]:
    return {
        "headline": _default_headline(application_context),
        "verdict": "Application-ready draft",
        "confidence_note": CONFIDENCE_NOTE,
    }


def _resume_evidence_snippets(application_context: dict[str, Any]) -> list[str]:
    snippets = application_context["resume_strengths"] + [
        gap["fix"] for gap in application_context["resume_gaps"]
    ]
    return [item for item in snippets if item][:4]


def _fallback_opening(
    application_context: dict[str, Any],
    tone: str,
) -> dict[str, Any]:
    strategy = TONE_STRATEGIES.get(tone, TONE_STRATEGIES["Professional"])
    requirements = application_context["priority_requirements"][:2]
    evidence = _resume_evidence_snippets(application_context)[:2]
    role_label = application_context["role_label"]
    matched = ", ".join(application_context["matched_keywords"][:2]) or "relevant experience"

    if strategy["opening"] == "achievements_first":
        opening_text = (
            "Dear Hiring Manager,\n\n"
            f"My strongest results speak directly to what {role_label} demands. "
            f"With proven impact in {matched}, I bring exactly the track record this role needs."
        )
        why = "Lead with the strongest achievement to establish credibility immediately."
    elif strategy["opening"] == "personal_connection":
        opening_text = (
            "Dear Hiring Manager,\n\n"
            f"What drew me to {role_label} is a genuine alignment between your team's mission "
            f"and the work I find most meaningful — especially around {matched}."
        )
        why = "Open with a personal connection to the company's mission to build rapport."
    else:
        opening_text = (
            "Dear Hiring Manager,\n\n"
            f"I am writing to apply for {role_label}. My background in {matched} "
            f"maps directly to the role's highest-priority requirements."
        )
        why = "Open with direct alignment so the reader can trust the fit quickly."

    return {
        "text": opening_text,
        "why_this_paragraph": why,
        "requirements_used": requirements or application_context["matched_keywords"][:2],
        "evidence_used": evidence,
    }


def _fallback_body_points(
    application_context: dict[str, Any],
    tone: str = "Professional",
) -> list[dict[str, Any]]:
    strategy = TONE_STRATEGIES.get(tone, TONE_STRATEGIES["Professional"])
    requirements = application_context["priority_requirements"]
    evidence = _resume_evidence_snippets(application_context)
    matched = application_context["matched_keywords"]
    missing = application_context["missing_keywords"]
    points: list[dict[str, Any]] = []

    if strategy["evidence_bias"] == "strongest_accomplishments":
        # Confident: lead with quantified results and bold claims
        if matched or evidence:
            points.append(
                {
                    "text": (
                        f"The results speak for themselves: my work in "
                        f"{', '.join(matched[:3]) or 'the core scope of the role'} "
                        "delivered measurable outcomes that map directly to what this role demands."
                    ),
                    "why_this_paragraph": "Lead with the strongest quantified accomplishments to establish authority.",
                    "requirements_used": requirements[:2] or matched[:2],
                    "evidence_used": evidence[:2],
                }
            )
        if missing or application_context["resume_gaps"]:
            points.append(
                {
                    "text": (
                        f"I am already building momentum in "
                        f"{', '.join(missing[:3]) or 'adjacent areas'} "
                        "and will bring that same results-driven approach to closing any remaining gaps."
                    ),
                    "why_this_paragraph": "Address gaps with confidence and a forward-looking commitment.",
                    "requirements_used": missing[:3] or requirements[:2],
                    "evidence_used": evidence[2:4] or evidence[:2],
                }
            )
    elif strategy["evidence_bias"] == "anecdotes":
        # Warm: collaborative stories and cultural fit
        if matched or evidence:
            points.append(
                {
                    "text": (
                        f"Some of my most rewarding work has been in "
                        f"{', '.join(matched[:3]) or 'areas that overlap with this role'}, "
                        "where I partnered closely with teammates to deliver shared wins."
                    ),
                    "why_this_paragraph": "Weave collaborative stories that show cultural alignment.",
                    "requirements_used": requirements[:2] or matched[:2],
                    "evidence_used": evidence[:2],
                }
            )
        if missing or application_context["resume_gaps"]:
            points.append(
                {
                    "text": (
                        f"I am genuinely excited to grow in "
                        f"{', '.join(missing[:3]) or 'the areas that matter most to your team'} "
                        "and see this role as the right environment to do that together."
                    ),
                    "why_this_paragraph": "Show enthusiasm for growth in a way that reinforces team fit.",
                    "requirements_used": missing[:3] or requirements[:2],
                    "evidence_used": evidence[2:4] or evidence[:2],
                }
            )
    else:
        # Professional: formal credentials and systematic mapping
        if matched or evidence:
            points.append(
                {
                    "text": (
                        f"My background already shows evidence for "
                        f"{', '.join(matched[:3]) or 'the core scope of the role'}, "
                        "and I would anchor this paragraph in the strongest measurable example from the resume."
                    ),
                    "why_this_paragraph": "Translate the strongest existing evidence into a role-specific proof paragraph.",
                    "requirements_used": requirements[:2] or matched[:2],
                    "evidence_used": evidence[:2],
                }
            )
        if missing or application_context["resume_gaps"]:
            points.append(
                {
                    "text": (
                        f"I would also close the trust gap around "
                        f"{', '.join(missing[:3]) or 'the weakest signals'} "
                        "by connecting adjacent experience to the job requirements without overstating fit."
                    ),
                    "why_this_paragraph": "Address the biggest application gap before it becomes an objection.",
                    "requirements_used": missing[:3] or requirements[:2],
                    "evidence_used": evidence[2:4] or evidence[:2],
                }
            )

    if not points:
        points.append(
            {
                "text": "This paragraph should connect the strongest project or achievement to the role's highest-priority requirement.",
                "why_this_paragraph": "Give the hiring team one concrete reason to keep reading.",
                "requirements_used": requirements[:2],
                "evidence_used": evidence[:2],
            }
        )

    return points[:3]


def _fallback_closing(
    application_context: dict[str, Any],
    tone: str = "Professional",
) -> dict[str, Any]:
    strategy = TONE_STRATEGIES.get(tone, TONE_STRATEGIES["Professional"])
    requirements = application_context["priority_requirements"][:2]
    evidence = _resume_evidence_snippets(application_context)[:1]
    role_label = application_context["role_label"]

    if strategy["closing"] == "bold_commitment":
        closing_text = (
            f"I am ready to deliver the same caliber of results for {role_label}. "
            "I would welcome the opportunity to discuss how my track record translates into immediate impact for your team."
        )
        why = "Close with a bold, forward-looking commitment that reinforces confidence."
    elif strategy["closing"] == "enthusiasm":
        closing_text = (
            f"I am genuinely excited about the possibility of joining your team and contributing to {role_label}. "
            "Thank you for considering my application — I would love to continue this conversation."
        )
        why = "Close with warmth and authentic enthusiasm to leave a personal impression."
    else:
        closing_text = (
            "Thank you for your time and consideration. I would welcome the chance to discuss "
            f"how I can contribute to {role_label} priorities with clear, evidence-backed execution."
        )
        why = "Close with confidence and reinforce readiness for the next conversation."

    return {
        "text": closing_text,
        "why_this_paragraph": why,
        "requirements_used": requirements,
        "evidence_used": evidence,
    }


def _normalize_section(
    raw_value: Any,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    raw = raw_value if isinstance(raw_value, dict) else {"text": _to_str(raw_value)}
    return {
        "text": _to_str(raw.get("text")) or fallback["text"],
        "why_this_paragraph": _to_str(raw.get("why_this_paragraph")) or fallback["why_this_paragraph"],
        "requirements_used": _to_str_list(raw.get("requirements_used")) or fallback["requirements_used"],
        "evidence_used": _to_str_list(raw.get("evidence_used")) or fallback["evidence_used"],
    }


def _compose_full_text(
    opening: dict[str, Any],
    body_points: list[dict[str, Any]],
    closing: dict[str, Any],
) -> str:
    parts = [opening["text"]] + [item["text"] for item in body_points] + [closing["text"]]
    return "\n\n".join(part for part in parts if part)


def _normalize_top_actions(
    result: dict[str, Any],
    application_context: dict[str, Any],
    tone: str,
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in _to_object_list(result.get("top_actions")):
        priority = _to_str(item.get("priority")) or "medium"
        if priority not in {"high", "medium", "low"}:
            priority = "medium"
        normalized.append(
            {
                "title": _to_str(item.get("title")) or "Top action",
                "action": _to_str(item.get("action")) or "Tighten the strongest paragraph with clearer evidence.",
                "priority": priority,
            }
        )
    if normalized:
        return normalized[:3]

    actions: list[dict[str, str]] = []
    if application_context["missing_keywords"]:
        keyword = application_context["missing_keywords"][0]
        actions.append(
            {
                "title": f"Strengthen {keyword} evidence",
                "action": f"Add a concrete proof point that makes {keyword} feel real in the letter, not implied.",
                "priority": "high",
            }
        )
    if application_context["resume_gaps"]:
        gap = application_context["resume_gaps"][0]
        actions.append(
            {
                "title": gap["title"],
                "action": gap["fix"],
                "priority": gap["severity"],
            }
        )
    actions.append(
        {
            "title": "Re-check tone",
            "action": f"Rerun or edit the draft so the {tone.lower()} tone matches the employer's voice without losing specificity.",
            "priority": "low",
        }
    )
    return actions[:3]


def _normalize_customization_notes(
    result: dict[str, Any],
    application_context: dict[str, Any],
    tone: str,
) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for item in _to_object_list(result.get("customization_notes")):
        category = _to_str(item.get("category")) or "evidence"
        source = _to_str(item.get("source")) or "job-match"
        if category not in {"tone", "evidence", "keyword", "gap"}:
            category = "evidence"
        if source not in {"resume", "resume-analysis", "job-match", "job-description"}:
            source = "job-match"
        notes.append(
            {
                "category": category,
                "note": _to_str(item.get("note")) or "No customization note was returned.",
                "requirements_used": _to_str_list(item.get("requirements_used")),
                "source": source,
            }
        )
    if notes:
        return notes[:4]

    fallback: list[dict[str, Any]] = [
        {
            "category": "tone",
            "note": f"Keep the draft in a {tone.lower()} tone so the letter sounds deliberate rather than generic.",
            "requirements_used": application_context["matched_keywords"][:2],
            "source": "job-description",
        }
    ]
    if application_context["missing_keywords"]:
        fallback.append(
            {
                "category": "keyword",
                "note": f"Make {', '.join(application_context['missing_keywords'][:3])} explicit in the strongest evidence paragraph.",
                "requirements_used": application_context["missing_keywords"][:3],
                "source": "job-match",
            }
        )
    if application_context["resume_gaps"]:
        gap = application_context["resume_gaps"][0]
        fallback.append(
            {
                "category": "gap",
                "note": gap["fix"],
                "requirements_used": application_context["priority_requirements"][:2],
                "source": "resume-analysis",
            }
        )
    return fallback[:4]


async def generate_cover_letter(
    resume_text: str,
    job_description: str,
    tone: str | None,
    resume_analysis: dict[str, Any] | None = None,
    job_match: dict[str, Any] | None = None,
) -> dict[str, Any]:
    requested_tone = tone or "Professional"
    application_context = build_application_handoff(
        resume_text,
        job_description,
        resume_analysis,
        job_match,
    )
    generated_at = datetime.now(timezone.utc).isoformat()
    locked_payload = {
        "schema_version": SCHEMA_VERSION,
        "summary": _default_summary(application_context),
        "top_actions": [],
        "generated_at": generated_at,
        "opening": _fallback_opening(application_context, requested_tone),
        "body_points": _fallback_body_points(application_context, requested_tone),
        "closing": _fallback_closing(application_context, requested_tone),
        "full_text": "",
        "tone_used": requested_tone,
        "customization_notes": [],
    }

    system_prompt, user_prompt = build_cover_letter_prompt(
        resume_text,
        job_description,
        requested_tone,
        locked_payload,
        application_context,
    )
    try:
        result = await complete_structured(system_prompt, user_prompt)
    except Exception as exc:
        logger.warning("Cover letter LLM call failed, using fallback: %s", exc)
        full_text = _compose_full_text(
            locked_payload["opening"],
            locked_payload["body_points"],
            locked_payload["closing"],
        )
        locked_payload["full_text"] = full_text
        locked_payload["summary"]["confidence_note"] = (
            "Generated from resume and job description templates. "
            "Re-run for a fully personalized letter."
        )
        return locked_payload

    opening = _normalize_section(
        result.get("opening"),
        locked_payload["opening"],
    )
    fallback_body_points = locked_payload["body_points"]
    raw_body_points = _to_object_list(result.get("body_points"))
    body_points = [
        _normalize_section(
            raw_body_points[index] if index < len(raw_body_points) else {},
            fallback_body_points[index]
            if index < len(fallback_body_points)
            else fallback_body_points[-1],
        )
        for index in range(max(len(raw_body_points), len(fallback_body_points)))
    ][:3]
    closing = _normalize_section(
        result.get("closing"),
        locked_payload["closing"],
    )

    summary_raw = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    summary = {
        "headline": _to_str(summary_raw.get("headline")) or _default_headline(application_context),
        "verdict": _to_str(summary_raw.get("verdict")) or "Application-ready draft",
        "confidence_note": _to_str(summary_raw.get("confidence_note")) or CONFIDENCE_NOTE,
    }
    top_actions = _normalize_top_actions(result, application_context, requested_tone)
    tone_used = _to_str(result.get("tone_used")) or requested_tone
    full_text = _to_str(result.get("full_text")) or _compose_full_text(opening, body_points, closing)
    customization_notes = _normalize_customization_notes(result, application_context, tone_used)

    return {
        "schema_version": SCHEMA_VERSION,
        "summary": summary,
        "top_actions": top_actions,
        "generated_at": generated_at,
        "opening": opening,
        "body_points": body_points,
        "closing": closing,
        "full_text": full_text,
        "tone_used": tone_used,
        "customization_notes": customization_notes,
    }
