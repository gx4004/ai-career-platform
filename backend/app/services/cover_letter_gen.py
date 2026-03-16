from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.prompts.cover_letter import build_cover_letter_prompt
from app.services.ai_client import complete_structured
from app.services.application_context import build_application_handoff

SCHEMA_VERSION = "quality_v2"
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
    requirements = application_context["priority_requirements"][:2]
    evidence = _resume_evidence_snippets(application_context)[:2]
    role_label = application_context["role_label"]
    matched = ", ".join(application_context["matched_keywords"][:2]) or "relevant experience"
    return {
        "text": (
            "Dear Hiring Manager,\n\n"
            f"I am excited to apply for {role_label}. In a {tone.lower()} voice, this opening "
            f"connects my background in {matched} to the role's highest-priority needs."
        ),
        "why_this_paragraph": "Open with direct alignment so the reader can trust the fit quickly.",
        "requirements_used": requirements or application_context["matched_keywords"][:2],
        "evidence_used": evidence,
    }


def _fallback_body_points(application_context: dict[str, Any]) -> list[dict[str, Any]]:
    requirements = application_context["priority_requirements"]
    evidence = _resume_evidence_snippets(application_context)
    points: list[dict[str, Any]] = []

    if application_context["matched_keywords"] or evidence:
        points.append(
            {
                "text": (
                    f"My background already shows evidence for "
                    f"{', '.join(application_context['matched_keywords'][:3]) or 'the core scope of the role'}, "
                    "and I would anchor this paragraph in the strongest measurable example from the resume."
                ),
                "why_this_paragraph": "Translate the strongest existing evidence into a role-specific proof paragraph.",
                "requirements_used": requirements[:2] or application_context["matched_keywords"][:2],
                "evidence_used": evidence[:2],
            }
        )

    if application_context["missing_keywords"] or application_context["resume_gaps"]:
        points.append(
            {
                "text": (
                    f"I would also close the trust gap around "
                    f"{', '.join(application_context['missing_keywords'][:3]) or 'the weakest signals'} "
                    "by connecting adjacent experience to the job requirements without overstating fit."
                ),
                "why_this_paragraph": "Address the biggest application gap before it becomes an objection.",
                "requirements_used": application_context["missing_keywords"][:3] or requirements[:2],
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


def _fallback_closing(application_context: dict[str, Any]) -> dict[str, Any]:
    requirements = application_context["priority_requirements"][:2]
    evidence = _resume_evidence_snippets(application_context)[:1]
    return {
        "text": (
            "Thank you for your time and consideration. I would welcome the chance to discuss "
            f"how I can contribute to {application_context['role_label']} priorities with clear, evidence-backed execution."
        ),
        "why_this_paragraph": "Close with confidence and reinforce readiness for the next conversation.",
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
        "body_points": _fallback_body_points(application_context),
        "closing": _fallback_closing(application_context),
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
    result = await complete_structured(system_prompt, user_prompt)

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
