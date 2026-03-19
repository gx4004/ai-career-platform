from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.prompts.interview import build_interview_prompt
from app.services.ai_client import complete_structured
from app.services.application_context import build_application_handoff

SCHEMA_VERSION = "quality_v2"
CONFIDENCE_NOTE = (
    "Advisory practice plan based on resume and role signals, not a prediction of the "
    "actual interview outcome."
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
            "Start with the weak-signal topics first so your answers close the biggest proof gaps."
        )
    return "The practice plan is centered on the role's highest-value themes and strongest stories."


def _default_summary(application_context: dict[str, Any]) -> dict[str, str]:
    return {
        "headline": _default_headline(application_context),
        "verdict": "Gap-first practice plan",
        "confidence_note": CONFIDENCE_NOTE,
    }


def _default_focus_areas(application_context: dict[str, Any]) -> list[dict[str, Any]]:
    titles = application_context["interview_focus"] or application_context["priority_requirements"][:3]
    focus_areas: list[dict[str, Any]] = []
    for index, title in enumerate(titles[:4]):
        practice_first = title in application_context["missing_keywords"] or index == 0
        focus_areas.append(
            {
                "title": title,
                "reason": (
                    f"This topic matters because the role emphasizes {title} and the interviewer will want specific proof."
                ),
                "requirements_used": [title],
                "practice_first": practice_first,
            }
        )
    if focus_areas:
        return focus_areas
    return [
        {
            "title": application_context["role_label"],
            "reason": "Focus on the strongest story that makes your fit feel concrete.",
            "requirements_used": application_context["matched_keywords"][:2],
            "practice_first": False,
        }
    ]


def _default_weak_signals(application_context: dict[str, Any]) -> list[dict[str, Any]]:
    weak_signals: list[dict[str, Any]] = []
    for requirement in application_context["requirements"]:
        if requirement["status"] == "matched":
            continue
        weak_signals.append(
            {
                "title": requirement["requirement"],
                "severity": "high" if requirement["importance"] == "must" else "medium",
                "why_it_matters": requirement["resume_evidence"],
                "prep_action": requirement["suggested_fix"],
                "related_requirements": [requirement["requirement"]],
            }
        )
    for gap in application_context["resume_gaps"]:
        if len(weak_signals) >= 4:
            break
        weak_signals.append(
            {
                "title": gap["title"],
                "severity": gap["severity"],
                "why_it_matters": gap["why_it_matters"],
                "prep_action": gap["fix"],
                "related_requirements": application_context["priority_requirements"][:2],
            }
        )
    return weak_signals[:4]


def _default_answer_structure(question: str) -> list[str]:
    lowered = question.lower()
    if "tell me about" in lowered or "describe" in lowered or "behavior" in lowered:
        return ["Situation", "Task", "Action", "Result"]
    return ["Context", "Approach", "Outcome"]


def _default_follow_ups(focus_area: str) -> list[str]:
    return [
        f"What specific example best proves {focus_area}?",
        f"How would you measure success in {focus_area} work?",
    ]


def _default_questions(
    application_context: dict[str, Any],
    count: int,
) -> list[dict[str, Any]]:
    focus_areas = _default_focus_areas(application_context)
    evidence = application_context["resume_strengths"]
    weak_titles = {
        item["title"]
        for item in _default_weak_signals(application_context)
    }
    questions: list[dict[str, Any]] = []
    for index in range(count):
        focus_area = focus_areas[index % len(focus_areas)]["title"]
        questions.append(
            {
                "question": f"How would you demonstrate {focus_area} in this role?",
                "answer": (
                    f"Anchor your answer in the strongest available resume evidence, such as "
                    f"{evidence[index % len(evidence)] if evidence else 'a concrete achievement with scope and outcome'}."
                ),
                "key_points": [focus_area, "Specific example", "Outcome"],
                "answer_structure": _default_answer_structure(focus_area),
                "follow_up_questions": _default_follow_ups(focus_area),
                "focus_area": focus_area,
                "why_asked": f"This checks whether you can make {focus_area} feel credible and job-relevant.",
                "practice_first": focus_area in weak_titles,
            }
        )
    return questions


def _normalize_focus_areas(
    result: dict[str, Any],
    application_context: dict[str, Any],
) -> list[dict[str, Any]]:
    areas: list[dict[str, Any]] = []
    for item in _to_object_list(result.get("focus_areas")):
        title = _to_str(item.get("title"))
        if not title:
            continue
        areas.append(
            {
                "title": title,
                "reason": _to_str(item.get("reason")) or "This is one of the role's highest-value themes.",
                "requirements_used": _to_str_list(item.get("requirements_used")) or [title],
                "practice_first": bool(item.get("practice_first")),
            }
        )
    return areas[:4] if areas else _default_focus_areas(application_context)


def _normalize_weak_signals(
    result: dict[str, Any],
    application_context: dict[str, Any],
) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for item in _to_object_list(result.get("weak_signals_to_prepare")):
        severity = _to_str(item.get("severity")) or "medium"
        if severity not in {"high", "medium", "low"}:
            severity = "medium"
        title = _to_str(item.get("title"))
        if not title:
            continue
        signals.append(
            {
                "title": title,
                "severity": severity,
                "why_it_matters": _to_str(item.get("why_it_matters")) or "This may come up as a credibility gap.",
                "prep_action": _to_str(item.get("prep_action")) or "Prepare one concrete example before the interview.",
                "related_requirements": _to_str_list(item.get("related_requirements")) or [title],
            }
        )
    return signals[:4] if signals else _default_weak_signals(application_context)


def _normalize_questions(
    result: dict[str, Any],
    application_context: dict[str, Any],
    count: int,
    weak_signals: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    raw_questions = _to_object_list(result.get("questions"))
    if not raw_questions:
        return _default_questions(application_context, count)

    weak_titles = {item["title"] for item in weak_signals}
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(raw_questions[:count]):
        question = _to_str(item.get("question")) or f"Question {index + 1}"
        focus_pool = (
            application_context["interview_focus"]
            or application_context["priority_requirements"]
            or [application_context["role_label"]]
        )
        focus_area = _to_str(item.get("focus_area")) or focus_pool[index % len(focus_pool)]
        normalized.append(
            {
                "question": question,
                "answer": _to_str(item.get("answer")) or "Prepare a concise answer grounded in your strongest relevant example.",
                "key_points": _to_str_list(item.get("key_points")) or [focus_area, "Specific example", "Outcome"],
                "answer_structure": _to_str_list(item.get("answer_structure")) or _default_answer_structure(question),
                "follow_up_questions": _to_str_list(item.get("follow_up_questions")) or _default_follow_ups(focus_area),
                "focus_area": focus_area,
                "why_asked": _to_str(item.get("why_asked")) or f"This checks whether you can prove {focus_area} with specifics.",
                "practice_first": bool(item.get("practice_first")) or focus_area in weak_titles,
            }
        )
    if len(normalized) < count:
        normalized.extend(_default_questions(application_context, count - len(normalized)))
    return normalized[:count]


def _normalize_top_actions(
    result: dict[str, Any],
    weak_signals: list[dict[str, Any]],
) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    for item in _to_object_list(result.get("top_actions")):
        priority = _to_str(item.get("priority")) or "medium"
        if priority not in {"high", "medium", "low"}:
            priority = "medium"
        actions.append(
            {
                "title": _to_str(item.get("title")) or "Top action",
                "action": _to_str(item.get("action")) or "Practice the highest-risk gap with a stronger example.",
                "priority": priority,
            }
        )
    if actions:
        return actions[:3]

    fallback: list[dict[str, str]] = []
    for signal in weak_signals[:2]:
        fallback.append(
            {
                "title": f"Prepare {signal['title']}",
                "action": signal["prep_action"],
                "priority": signal["severity"],
            }
        )
    fallback.append(
        {
            "title": "Turn strong stories into repeatable answers",
            "action": "Practice 2-3 strongest examples in a tight structure so follow-up questions feel easy.",
            "priority": "medium",
        }
    )
    return fallback[:3]


def _normalize_interviewer_notes(
    result: dict[str, Any],
    application_context: dict[str, Any],
    weak_signals: list[dict[str, Any]],
) -> list[str]:
    notes = _to_str_list(result.get("interviewer_notes"))
    if notes:
        return notes[:4]

    fallback = [
        application_context["recruiter_summary"],
        "Lead with the strongest matching story before moving into weaker or adjacent experience.",
    ]
    if weak_signals:
        fallback.append(
            f"Be ready to clarify {weak_signals[0]['title']} with a concrete, non-defensive example."
        )
    return fallback[:4]


async def generate_interview_questions(
    resume_text: str,
    job_description: str,
    num_questions: int | None,
    resume_analysis: dict[str, Any] | None = None,
    job_match: dict[str, Any] | None = None,
) -> dict[str, Any]:
    count = max(3, min(num_questions or 5, 12))
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
        "questions": _default_questions(application_context, count),
        "focus_areas": _default_focus_areas(application_context),
        "weak_signals_to_prepare": _default_weak_signals(application_context),
        "interviewer_notes": [],
    }

    system_prompt, user_prompt = build_interview_prompt(
        resume_text,
        job_description,
        count,
        locked_payload,
        application_context,
    )
    result = await complete_structured(system_prompt, user_prompt)

    summary_raw = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    weak_signals = _normalize_weak_signals(result, application_context)
    questions = _normalize_questions(result, application_context, count, weak_signals)
    focus_areas = _normalize_focus_areas(result, application_context)
    interviewer_notes = _normalize_interviewer_notes(result, application_context, weak_signals)
    top_actions = _normalize_top_actions(result, weak_signals)

    return {
        "schema_version": SCHEMA_VERSION,
        "summary": {
            "headline": _to_str(summary_raw.get("headline")) or _default_headline(application_context),
            "verdict": _to_str(summary_raw.get("verdict")) or "Gap-first practice plan",
            "confidence_note": _to_str(summary_raw.get("confidence_note")) or CONFIDENCE_NOTE,
        },
        "top_actions": top_actions,
        "generated_at": generated_at,
        "questions": questions,
        "focus_areas": focus_areas,
        "weak_signals_to_prepare": weak_signals,
        "interviewer_notes": interviewer_notes,
    }
