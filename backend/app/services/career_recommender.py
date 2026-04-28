from __future__ import annotations

from datetime import UTC, datetime

from app.prompts.career import build_career_prompt
from app.services.ai_client import complete_structured
from app.services.quality_signals import (
    build_resume_prepass,
    discipline_label,
    infer_career_profile,
    infer_resume_discipline,
    infer_resume_seniority,
    infer_resume_years_experience,
    ordered_unique,
    seniority_label,
)

SCHEMA_VERSION = "planning_v1"
CONFIDENCE_NOTE = (
    "Advisory planning guidance based on resume evidence and lightweight transition "
    "heuristics, not a labor-market prediction or hiring guarantee."
)

DISCIPLINE_TARGET_SKILLS: dict[str, list[str]] = {
    "backend-engineering": [
        "System Design",
        "Cloud Architecture",
        "Testing",
        "CI/CD",
        "Observability",
        "Leadership",
    ],
    "frontend-engineering": [
        "TypeScript",
        "Accessibility",
        "Design Systems",
        "Frontend Performance",
        "Product Collaboration",
        "Experimentation",
    ],
    "full-stack-engineering": [
        "System Design",
        "TypeScript",
        "Cloud Architecture",
        "Product Thinking",
        "Testing",
        "Observability",
    ],
    "data-analytics": [
        "SQL",
        "Data Storytelling",
        "Experimentation",
        "Data Modeling",
        "Stakeholder Communication",
        "Automation",
    ],
    "product-design": [
        "User Research",
        "Accessibility",
        "Design Systems",
        "Prototyping",
        "Product Strategy",
        "Storytelling",
    ],
    "product-management": [
        "Prioritization",
        "Product Strategy",
        "Analytics",
        "Stakeholder Management",
        "Experiment Design",
        "Roadmapping",
    ],
    "general-technology": [
        "Communication",
        "Project Management",
        "Systems Thinking",
        "Data Analysis",
        "Leadership",
        "Storytelling",
    ],
}

DISCIPLINE_BUILD_GUIDES: dict[str, str] = {
    "System Design": "Write a lightweight design doc and explain trade-offs for a project you already know well.",
    "Cloud Architecture": "Deploy one project end to end and document the environment, monitoring, and rollback decisions.",
    "Testing": "Add integration tests plus one failure-mode test to a project and explain what they protect.",
    "CI/CD": "Automate linting, tests, and deployment checks in a public repo.",
    "Observability": "Instrument one project with logs, metrics, and a short incident-readiness runbook.",
    "Leadership": "Take visible ownership of scope, mentoring, or cross-functional coordination and describe outcomes clearly.",
    "TypeScript": "Ship one typed front-end or full-stack project and explain the strongest type-driven design choice.",
    "Accessibility": "Run an accessibility pass, fix meaningful issues, and document before/after decisions.",
    "Design Systems": "Create reusable components with usage guidance and naming principles.",
    "Frontend Performance": "Profile a UI, fix the slowest path, and publish the performance trade-offs you made.",
    "Product Collaboration": "Show how you translated goals into scoped work, success metrics, and iteration decisions.",
    "Experimentation": "Frame a hypothesis, define the metric, and explain what result would change your next step.",
    "SQL": "Use SQL in a project or analysis and publish the exact business question it answered.",
    "Data Storytelling": "Turn one analysis into a recommendation memo with visuals and explicit trade-offs.",
    "Data Modeling": "Model one messy dataset into clean, documented entities and explain your assumptions.",
    "Stakeholder Communication": "Summarize complex work in a one-page memo for non-specialists.",
    "Automation": "Remove one manual reporting or delivery step and quantify the time saved.",
    "User Research": "Interview or observe a small set of users and show how findings changed the work.",
    "Prototyping": "Build an interactive prototype and narrate the decision points it helped validate.",
    "Product Strategy": "Explain the user problem, the business goal, and why the chosen scope is the best next move.",
    "Storytelling": "Package your strongest project in a concise case study with evidence, choices, and outcomes.",
    "Prioritization": "Use a visible framework to rank opportunities and explain what you intentionally deferred.",
    "Analytics": "Define success metrics before building and revisit them after shipping.",
    "Stakeholder Management": "Show how you aligned multiple perspectives and resolved trade-offs.",
    "Roadmapping": "Break one goal into sequenced milestones with clear ownership and risk notes.",
    "Communication": "Translate technical work into business language and vice versa in your public materials.",
    "Project Management": "Scope one multi-step effort, track milestones, and reflect on what changed during delivery.",
    "Systems Thinking": "Map dependencies, constraints, and trade-offs before choosing an implementation path.",
}

PRIMARY_PATHS: dict[str, dict[str, dict[str, object]]] = {
    "backend-engineering": {
        "entry": {
            "role_title": "Backend Engineer",
            "fit_score": 84,
            "transition_timeline": "0-3 months",
            "risk_level": "low",
            "strengths_to_leverage": ["Python", "APIs", "SQL"],
            "gaps_to_close": ["Testing", "Cloud Architecture", "System Design"],
        },
        "mid": {
            "role_title": "Senior Backend Engineer",
            "fit_score": 82,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Python", "APIs", "System Design"],
            "gaps_to_close": ["Cloud Architecture", "Observability", "Leadership"],
        },
        "senior": {
            "role_title": "Staff Backend Engineer",
            "fit_score": 78,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["System Design", "Leadership", "Cloud Architecture"],
            "gaps_to_close": ["Observability", "Technical Strategy", "Cross-team Influence"],
        },
    },
    "frontend-engineering": {
        "entry": {
            "role_title": "Frontend Engineer",
            "fit_score": 84,
            "transition_timeline": "0-3 months",
            "risk_level": "low",
            "strengths_to_leverage": ["JavaScript", "React", "Accessibility"],
            "gaps_to_close": ["TypeScript", "Frontend Performance", "Design Systems"],
        },
        "mid": {
            "role_title": "Senior Frontend Engineer",
            "fit_score": 82,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["React", "TypeScript", "Accessibility"],
            "gaps_to_close": ["Design Systems", "Frontend Performance", "Leadership"],
        },
        "senior": {
            "role_title": "Staff Frontend Engineer",
            "fit_score": 77,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Design Systems", "Frontend Performance", "Leadership"],
            "gaps_to_close": ["Technical Strategy", "Cross-team Influence", "Experimentation"],
        },
    },
    "full-stack-engineering": {
        "entry": {
            "role_title": "Full Stack Engineer",
            "fit_score": 82,
            "transition_timeline": "0-3 months",
            "risk_level": "low",
            "strengths_to_leverage": ["APIs", "React", "JavaScript"],
            "gaps_to_close": ["TypeScript", "Testing", "Cloud Architecture"],
        },
        "mid": {
            "role_title": "Senior Full Stack Engineer",
            "fit_score": 80,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["APIs", "React", "System Design"],
            "gaps_to_close": ["Cloud Architecture", "Observability", "Leadership"],
        },
        "senior": {
            "role_title": "Technical Lead",
            "fit_score": 76,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["System Design", "Product Collaboration", "Leadership"],
            "gaps_to_close": ["Delegation", "Technical Strategy", "Cross-team Communication"],
        },
    },
    "data-analytics": {
        "entry": {
            "role_title": "Data Analyst",
            "fit_score": 84,
            "transition_timeline": "0-3 months",
            "risk_level": "low",
            "strengths_to_leverage": ["SQL", "Data Analysis", "Communication"],
            "gaps_to_close": ["Data Storytelling", "Experimentation", "Stakeholder Communication"],
        },
        "mid": {
            "role_title": "Senior Data Analyst",
            "fit_score": 81,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["SQL", "Data Storytelling", "Stakeholder Communication"],
            "gaps_to_close": ["Experimentation", "Automation", "Leadership"],
        },
        "senior": {
            "role_title": "Analytics Engineer",
            "fit_score": 77,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["SQL", "Automation", "Systems Thinking"],
            "gaps_to_close": ["Data Modeling", "Testing", "Platform Ownership"],
        },
    },
    "product-design": {
        "entry": {
            "role_title": "Product Designer",
            "fit_score": 84,
            "transition_timeline": "0-3 months",
            "risk_level": "low",
            "strengths_to_leverage": ["Figma", "Accessibility", "Communication"],
            "gaps_to_close": ["User Research", "Storytelling", "Design Systems"],
        },
        "mid": {
            "role_title": "Senior Product Designer",
            "fit_score": 81,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Figma", "User Research", "Design Systems"],
            "gaps_to_close": ["Product Strategy", "Storytelling", "Leadership"],
        },
        "senior": {
            "role_title": "Design Systems Designer",
            "fit_score": 77,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Design Systems", "Accessibility", "Cross-functional Communication"],
            "gaps_to_close": ["Governance", "Documentation", "Cross-team Influence"],
        },
    },
    "product-management": {
        "entry": {
            "role_title": "Product Manager",
            "fit_score": 82,
            "transition_timeline": "0-3 months",
            "risk_level": "low",
            "strengths_to_leverage": ["Communication", "Product Strategy", "Project Management"],
            "gaps_to_close": ["Analytics", "Experimentation", "Prioritization"],
        },
        "mid": {
            "role_title": "Senior Product Manager",
            "fit_score": 80,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Product Strategy", "Stakeholder Management", "Prioritization"],
            "gaps_to_close": ["Analytics", "Roadmapping", "Leadership"],
        },
        "senior": {
            "role_title": "Group Product Manager",
            "fit_score": 75,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Strategy", "Roadmapping", "Stakeholder Management"],
            "gaps_to_close": ["People Leadership", "Portfolio Thinking", "Org Communication"],
        },
    },
    "general-technology": {
        "entry": {
            "role_title": "Software Engineer",
            "fit_score": 72,
            "transition_timeline": "0-3 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Communication", "Project Management", "Technical Curiosity"],
            "gaps_to_close": ["Clear specialization", "Concrete project evidence", "Technical Storytelling"],
        },
        "mid": {
            "role_title": "Solutions Engineer",
            "fit_score": 70,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Communication", "Technical Storytelling", "Project Ownership"],
            "gaps_to_close": ["Product Depth", "Technical Breadth", "Customer-facing Proof"],
        },
        "senior": {
            "role_title": "Technical Program Manager",
            "fit_score": 68,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Leadership", "Project Management", "Systems Thinking"],
            "gaps_to_close": ["Operational Cadence", "Stakeholder Alignment", "Execution Metrics"],
        },
    },
}

ALTERNATE_PATHS: dict[str, list[dict[str, object]]] = {
    "backend-engineering": [
        {
            "role_title": "Platform Engineer",
            "fit_score": 76,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Python", "Cloud Architecture", "System Design"],
            "gaps_to_close": ["Observability", "Infrastructure Automation", "Reliability Ownership"],
        },
        {
            "role_title": "Engineering Manager",
            "fit_score": 67,
            "transition_timeline": "6-12 months",
            "risk_level": "high",
            "strengths_to_leverage": ["Leadership", "System Design", "Cross-functional Communication"],
            "gaps_to_close": ["Coaching", "Roadmapping", "People Management"],
        },
    ],
    "frontend-engineering": [
        {
            "role_title": "Design Systems Engineer",
            "fit_score": 77,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["React", "Accessibility", "Design Systems"],
            "gaps_to_close": ["Documentation", "API Design for Components", "Cross-team Enablement"],
        },
        {
            "role_title": "Frontend Lead",
            "fit_score": 68,
            "transition_timeline": "6-12 months",
            "risk_level": "high",
            "strengths_to_leverage": ["Frontend Performance", "Design Systems", "Leadership"],
            "gaps_to_close": ["Delegation", "Roadmapping", "Team Coaching"],
        },
    ],
    "full-stack-engineering": [
        {
            "role_title": "Product Engineer",
            "fit_score": 76,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["APIs", "React", "Product Collaboration"],
            "gaps_to_close": ["Experimentation", "Analytics", "Narrative Case Studies"],
        },
        {
            "role_title": "Platform Engineer",
            "fit_score": 71,
            "transition_timeline": "6-12 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["System Design", "APIs", "Cloud Architecture"],
            "gaps_to_close": ["Observability", "Infrastructure Automation", "Reliability Ownership"],
        },
    ],
    "data-analytics": [
        {
            "role_title": "Analytics Engineer",
            "fit_score": 77,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["SQL", "Automation", "Data Storytelling"],
            "gaps_to_close": ["Data Modeling", "Testing", "Transformation Ownership"],
        },
        {
            "role_title": "Product Analyst",
            "fit_score": 74,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Analytics", "Communication", "Experimentation"],
            "gaps_to_close": ["Product Strategy", "Instrumentation Planning", "Narrative Recommendations"],
        },
    ],
    "product-design": [
        {
            "role_title": "UX Researcher",
            "fit_score": 74,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Communication", "Accessibility", "Storytelling"],
            "gaps_to_close": ["Research Operations", "Interview Synthesis", "Insight Packaging"],
        },
        {
            "role_title": "Design Manager",
            "fit_score": 64,
            "transition_timeline": "6-12 months",
            "risk_level": "high",
            "strengths_to_leverage": ["Leadership", "Design Systems", "Cross-functional Communication"],
            "gaps_to_close": ["People Management", "Roadmapping", "Team Coaching"],
        },
    ],
    "product-management": [
        {
            "role_title": "Program Manager",
            "fit_score": 76,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Project Management", "Stakeholder Communication", "Roadmapping"],
            "gaps_to_close": ["Operational Metrics", "Dependency Management", "Execution Cadence"],
        },
        {
            "role_title": "Product Operations Manager",
            "fit_score": 73,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Analytics", "Stakeholder Management", "Systems Thinking"],
            "gaps_to_close": ["Operational Design", "Tooling Strategy", "Internal Enablement"],
        },
    ],
    "general-technology": [
        {
            "role_title": "Customer Success Manager",
            "fit_score": 69,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Communication", "Project Ownership", "Stakeholder Management"],
            "gaps_to_close": ["Renewal Strategy", "Product Knowledge", "Operational Metrics"],
        },
        {
            "role_title": "Operations Analyst",
            "fit_score": 67,
            "transition_timeline": "3-6 months",
            "risk_level": "medium",
            "strengths_to_leverage": ["Systems Thinking", "Communication", "Process Improvement"],
            "gaps_to_close": ["Analytics", "Automation", "Decision Support"],
        },
    ],
}


def _to_string(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in (_to_string(item) for item in value) if item.strip()]


def _bounded_int(value: object, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(0, min(parsed, 100))


def _normalize_priority(value: object, default: str = "medium") -> str:
    priority = _to_string(value).lower()
    return priority if priority in {"high", "medium", "low"} else default


def _normalize_risk(value: object, default: str = "medium") -> str:
    risk = _to_string(value).lower()
    return risk if risk in {"low", "medium", "high"} else default


def _confidence_from_fit(fit_score: int, evidence_depth: int) -> str:
    if fit_score >= 80 and evidence_depth >= 5:
        return "high"
    if fit_score >= 65:
        return "medium"
    return "low"


def _urgency_for_index(index: int, fit_score: int) -> str:
    if index == 0 or fit_score < 65:
        return "high"
    if index == 1:
        return "medium"
    return "low"


def _summarize_strengths(items: list[str]) -> str:
    if not items:
        return "transferable experience already visible in the resume"
    if len(items) == 1:
        return items[0]
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def _summarize_gaps(items: list[str]) -> str:
    if not items:
        return "stronger visible proof"
    if len(items) == 1:
        return items[0]
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def _target_role_discipline(target_role: str | None, resume_discipline: str) -> str:
    if not target_role:
        return resume_discipline

    lowered = target_role.lower()
    if any(term in lowered for term in ("backend", "platform", "api", "infrastructure")):
        return "backend-engineering"
    if any(term in lowered for term in ("frontend", "front-end", "ui", "design systems engineer")):
        return "frontend-engineering"
    if "full stack" in lowered or "full-stack" in lowered:
        return "full-stack-engineering"
    if any(term in lowered for term in ("data", "analytics", "analyst", "scientist")):
        return "data-analytics"
    if any(term in lowered for term in ("designer", "ux", "ui/ux", "researcher")):
        return "product-design"
    if any(term in lowered for term in ("product manager", "program manager", "product operations")):
        return "product-management"
    return resume_discipline


def _role_path_from_template(template: dict[str, object], current_skills: list[str], target_role: str | None) -> dict[str, object]:
    strengths = ordered_unique(
        _string_list(template.get("strengths_to_leverage")) + current_skills[:4]
    )[:4]
    gaps = ordered_unique(_string_list(template.get("gaps_to_close")))[:4]
    role_title = _to_string(template.get("role_title")) or "Recommended role"

    target_context = ""
    if target_role and role_title.lower() in target_role.lower():
        target_context = " It stays close to the stated target role, so progress here compounds directly."

    rationale = (
        f"This path builds on {_summarize_strengths(strengths[:3])}, while the main gaps to close are "
        f"{_summarize_gaps(gaps[:3])}.{target_context}"
    ).strip()

    return {
        "role_title": role_title,
        "fit_score": _bounded_int(template.get("fit_score"), 65),
        "transition_timeline": _to_string(template.get("transition_timeline")) or "3-6 months",
        "rationale": rationale,
        "strengths_to_leverage": strengths[:4],
        "gaps_to_close": gaps[:4],
        "risk_level": _normalize_risk(template.get("risk_level")),
    }


def _make_target_role_path(
    target_role: str,
    resume_discipline: str,
    target_discipline: str,
    seniority: str,
    current_skills: list[str],
) -> dict[str, object]:
    same_track = resume_discipline == target_discipline
    leadership_track = any(term in target_role.lower() for term in ("manager", "lead", "head"))
    stretch_terms = any(term in target_role.lower() for term in ("staff", "principal", "director", "head"))

    base_fit = 76 if same_track else 60
    if seniority == "entry" and stretch_terms:
        base_fit -= 14
    elif seniority == "mid" and stretch_terms:
        base_fit -= 8
    elif seniority == "senior" and same_track:
        base_fit += 4

    if leadership_track and "Leadership" in current_skills:
        base_fit += 4

    risk_level = "low" if same_track and not stretch_terms else "medium"
    if not same_track or (leadership_track and "Leadership" not in current_skills) or (seniority == "entry" and stretch_terms):
        risk_level = "high"

    transition_timeline = "0-3 months" if same_track and not stretch_terms else "3-6 months"
    if risk_level == "high":
        transition_timeline = "6-12 months"

    strengths = current_skills[:4] or ["Transferable experience", "Communication"]
    gaps = DISCIPLINE_TARGET_SKILLS.get(target_discipline, DISCIPLINE_TARGET_SKILLS["general-technology"])[:4]

    return {
        "role_title": target_role.strip(),
        "fit_score": _bounded_int(base_fit, 64),
        "transition_timeline": transition_timeline,
        "rationale": (
            f"This option reflects the stated target role directly. The strongest carry-over signals are "
            f"{_summarize_strengths(strengths[:3])}, and the main proof gaps are {_summarize_gaps(gaps[:3])}."
        ),
        "strengths_to_leverage": strengths[:4],
        "gaps_to_close": gaps[:4],
        "risk_level": risk_level,
    }


def _fallback_paths(
    resume_discipline: str,
    seniority: str,
    current_skills: list[str],
    target_role: str | None,
) -> list[dict[str, object]]:
    templates: list[dict[str, object]] = []
    primary = PRIMARY_PATHS.get(resume_discipline, PRIMARY_PATHS["general-technology"]).get(
        seniority,
        PRIMARY_PATHS["general-technology"]["mid"],
    )
    templates.append(primary)
    templates.extend(ALTERNATE_PATHS.get(resume_discipline, ALTERNATE_PATHS["general-technology"]))

    target_discipline = _target_role_discipline(target_role, resume_discipline)
    if target_role:
        templates.insert(
            0,
            _make_target_role_path(
                target_role,
                resume_discipline,
                target_discipline,
                seniority,
                current_skills,
            ),
        )

    paths: list[dict[str, object]] = []
    seen_titles: set[str] = set()
    for template in templates:
        normalized = _role_path_from_template(template, current_skills, target_role)
        title_key = normalized["role_title"].lower()
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        paths.append(normalized)

    return sorted(paths, key=lambda item: int(item["fit_score"]), reverse=True)[:4]


def _normalize_paths(
    result: dict,
    fallback_paths: list[dict[str, object]],
) -> list[dict[str, object]]:
    raw_items = result.get("paths") if isinstance(result.get("paths"), list) else []
    if not raw_items:
        return fallback_paths

    fallback_by_title = {
        path["role_title"].lower(): path
        for path in fallback_paths
        if isinstance(path.get("role_title"), str)
    }
    normalized: list[dict[str, object]] = []

    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        role_title = _to_string(item.get("role_title")) or _to_string(item.get("title"))
        if not role_title:
            continue
        fallback = fallback_by_title.get(role_title.lower(), fallback_paths[min(index, len(fallback_paths) - 1)])
        strengths = _string_list(item.get("strengths_to_leverage")) or _string_list(fallback.get("strengths_to_leverage"))
        gaps = _string_list(item.get("gaps_to_close")) or _string_list(fallback.get("gaps_to_close"))
        normalized.append(
            {
                "role_title": role_title,
                "fit_score": _bounded_int(item.get("fit_score"), int(fallback.get("fit_score", 65))),
                "transition_timeline": _to_string(item.get("transition_timeline"))
                or _to_string(fallback.get("transition_timeline"))
                or "3-6 months",
                "rationale": _to_string(item.get("rationale"))
                or _to_string(fallback.get("rationale"))
                or "This path uses transferable strengths while keeping the gaps explicit.",
                "strengths_to_leverage": ordered_unique(strengths)[:4],
                "gaps_to_close": ordered_unique(gaps)[:4],
                "risk_level": _normalize_risk(item.get("risk_level"), _normalize_risk(fallback.get("risk_level"))),
            }
        )

    return sorted(normalized or fallback_paths, key=lambda item: int(item["fit_score"]), reverse=True)[:4]


def _normalize_recommended_direction(
    result: dict,
    paths: list[dict[str, object]],
    evidence_depth: int,
) -> dict[str, object]:
    raw = result.get("recommended_direction") if isinstance(result.get("recommended_direction"), dict) else {}
    fallback = paths[0]
    fit_score = _bounded_int(raw.get("fit_score"), int(fallback["fit_score"]))
    return {
        "role_title": _to_string(raw.get("role_title")) or _to_string(fallback["role_title"]),
        "fit_score": fit_score,
        "transition_timeline": _to_string(raw.get("transition_timeline"))
        or _to_string(fallback["transition_timeline"]),
        "why_now": _to_string(raw.get("why_now"))
        or (
            f"This direction already has visible evidence in the resume through "
            f"{_summarize_strengths(_string_list(fallback.get('strengths_to_leverage'))[:3])}. "
            f"The remaining gaps are focused enough to close over {_to_string(fallback['transition_timeline'])}."
        ),
        "confidence": _normalize_priority(raw.get("confidence"), _confidence_from_fit(fit_score, evidence_depth)),
    }


def _normalize_summary(
    result: dict,
    recommended_direction: dict[str, object],
) -> dict[str, str]:
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    role_title = _to_string(recommended_direction.get("role_title")) or "the recommended direction"
    timeline = _to_string(recommended_direction.get("transition_timeline")) or "the next focused stretch"
    return {
        "headline": _to_string(summary.get("headline"))
        or f"The clearest next move is {role_title}, with a realistic transition window of {timeline}.",
        "verdict": _to_string(summary.get("verdict")) or "Best next move identified",
        "confidence_note": _to_string(summary.get("confidence_note")) or CONFIDENCE_NOTE,
    }


def _normalize_target_skills(
    result: dict,
    fallback_paths: list[dict[str, object]],
    resume_discipline: str,
    current_skills: list[str],
) -> list[str]:
    raw_items = _string_list(result.get("target_skills"))
    combined = raw_items[:]
    for path in fallback_paths[:2]:
        combined.extend(_string_list(path.get("gaps_to_close"))[:3])
    combined.extend(DISCIPLINE_TARGET_SKILLS.get(resume_discipline, DISCIPLINE_TARGET_SKILLS["general-technology"]))
    current_skill_keys = {skill.lower() for skill in current_skills}
    return [
        skill
        for skill in ordered_unique(combined)
        if skill.lower() not in current_skill_keys
    ][:6]


def _normalize_skill_gaps(
    result: dict,
    recommended_direction: dict[str, object],
    target_skills: list[str],
) -> list[dict[str, str]]:
    raw_items = result.get("skill_gaps") if isinstance(result.get("skill_gaps"), list) else []
    normalized: list[dict[str, str]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        skill = _to_string(item.get("skill"))
        if not skill:
            continue
        urgency = _normalize_priority(item.get("urgency"), _urgency_for_index(index, int(recommended_direction["fit_score"])))
        normalized.append(
            {
                "skill": skill,
                "urgency": urgency,
                "why_it_matters": _to_string(item.get("why_it_matters"))
                or f"The move toward {_to_string(recommended_direction['role_title'])} will feel less credible without visible evidence of {skill}.",
                "how_to_build": _to_string(item.get("how_to_build"))
                or DISCIPLINE_BUILD_GUIDES.get(skill, f"Build one concrete example that proves {skill} and explain the result."),
            }
        )

    if normalized:
        return normalized[:5]

    fit_score = int(recommended_direction["fit_score"])
    return [
        {
            "skill": skill,
            "urgency": _urgency_for_index(index, fit_score),
            "why_it_matters": f"The move toward {_to_string(recommended_direction['role_title'])} will feel less credible without visible evidence of {skill}.",
            "how_to_build": DISCIPLINE_BUILD_GUIDES.get(skill, f"Build one concrete example that proves {skill} and explain the result."),
        }
        for index, skill in enumerate(target_skills[:5])
    ]


def _portfolio_helpful(skill_gaps: list[dict[str, str]], fit_score: int) -> bool:
    if fit_score < 55:
        return False
    high_or_medium = [
        item for item in skill_gaps if item["urgency"] in {"high", "medium"}
    ]
    return len(high_or_medium) >= 2


def _normalize_next_steps(
    result: dict,
    recommended_direction: dict[str, object],
    skill_gaps: list[dict[str, str]],
) -> list[dict[str, str]]:
    raw_items = result.get("next_steps") if isinstance(result.get("next_steps"), list) else []
    normalized: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        timeframe = _to_string(item.get("timeframe"))
        action = _to_string(item.get("action"))
        if not timeframe or not action:
            continue
        normalized.append({"timeframe": timeframe, "action": action})

    if normalized:
        return normalized[:4]

    steps = [
        {
            "timeframe": "Next 2 weeks",
            "action": f"Choose {_to_string(recommended_direction['role_title'])} as the working direction and audit your resume against the strongest missing proof signals.",
        }
    ]

    if skill_gaps:
        steps.append(
            {
                "timeframe": "Next 30 days",
                "action": f"Build or deepen {_to_string(skill_gaps[0]['skill'])} through one scoped, evidence-rich example.",
            }
        )

    if _portfolio_helpful(skill_gaps, int(recommended_direction["fit_score"])):
        steps.append(
            {
                "timeframe": "Next 45-60 days",
                "action": "Open Portfolio Planner to turn the top gaps into one public proof project with clear deliverables.",
            }
        )

    steps.append(
        {
            "timeframe": "Next 60-90 days",
            "action": f"Retell your experience around {_to_string(recommended_direction['role_title'])} and start testing the story in networking conversations or targeted applications.",
        }
    )

    return steps[:4]


def _normalize_top_actions(
    result: dict,
    next_steps: list[dict[str, str]],
) -> list[dict[str, str]]:
    raw_items = result.get("top_actions") if isinstance(result.get("top_actions"), list) else []
    normalized: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "title": _to_string(item.get("title")) or "Top action",
                "action": _to_string(item.get("action")) or "Take the next strongest planning step.",
                "priority": _normalize_priority(item.get("priority")),
            }
        )

    if normalized:
        return normalized[:3]

    top_actions: list[dict[str, str]] = []
    for index, step in enumerate(next_steps[:3]):
        priority = "high" if index == 0 else "medium" if index == 1 else "low"
        title = step["timeframe"]
        if "Portfolio Planner" in step["action"]:
            title = "Build proof next"
            priority = "medium"
        top_actions.append(
            {
                "title": title,
                "action": step["action"],
                "priority": priority,
            }
        )
    return top_actions


async def recommend_career(
    resume_text: str,
    target_role: str | None,
    feedback: str | None = None,
) -> dict:
    prepass = build_resume_prepass(resume_text, target_role)
    generated_at = datetime.now(UTC).isoformat()

    current_skills = ordered_unique(prepass.detected_skills)[:8]
    resume_discipline = infer_resume_discipline(resume_text, prepass.detected_skills)
    seniority = infer_resume_seniority(resume_text)
    years_experience = infer_resume_years_experience(resume_text)

    fallback_paths = _fallback_paths(resume_discipline, seniority, current_skills, target_role)
    target_skills = _normalize_target_skills({}, fallback_paths, resume_discipline, current_skills)
    default_recommended = {
        "role_title": _to_string(fallback_paths[0]["role_title"]),
        "fit_score": int(fallback_paths[0]["fit_score"]),
        "transition_timeline": _to_string(fallback_paths[0]["transition_timeline"]),
        "why_now": (
            f"The resume already signals a base in {discipline_label(resume_discipline)}, and the next gaps are compact enough to close with focused proof-building."
        ),
        "confidence": _confidence_from_fit(int(fallback_paths[0]["fit_score"]), len(current_skills)),
    }
    locked_payload = {
        "schema_version": SCHEMA_VERSION,
        "summary": {
            "headline": f"The clearest next move is {default_recommended['role_title']}, with a realistic transition window of {default_recommended['transition_timeline']}.",
            "verdict": "Best next move identified",
            "confidence_note": CONFIDENCE_NOTE,
        },
        "top_actions": [],
        "generated_at": generated_at,
        "recommended_direction": default_recommended,
        "paths": fallback_paths,
        "current_skills": current_skills,
        "target_skills": target_skills,
        "skill_gaps": [],
        "next_steps": [],
    }
    helper_signals = {
        "detected_sections": prepass.detected_sections,
        "detected_skills": prepass.detected_skills,
        "word_count": prepass.word_count,
        "quantified_bullets": prepass.quantified_bullets,
        "inferred_discipline": resume_discipline,
        "discipline_label": discipline_label(resume_discipline),
        "inferred_seniority": seniority,
        "seniority_label": seniority_label(seniority),
        "years_experience": years_experience,
        "target_role": target_role,
    }

    career_profile = infer_career_profile(resume_text)

    system_prompt, user_prompt = build_career_prompt(
        resume_text,
        target_role,
        locked_payload,
        helper_signals,
        career_profile=career_profile,
        feedback=feedback,
    )
    result = await complete_structured(system_prompt, user_prompt)

    paths = _normalize_paths(result, fallback_paths)
    recommended_direction = _normalize_recommended_direction(result, paths, len(current_skills))
    target_skills = _normalize_target_skills(result, paths, resume_discipline, current_skills)
    skill_gaps = _normalize_skill_gaps(result, recommended_direction, target_skills)
    next_steps = _normalize_next_steps(result, recommended_direction, skill_gaps)
    top_actions = _normalize_top_actions(result, next_steps)

    return {
        "schema_version": SCHEMA_VERSION,
        "summary": _normalize_summary(result, recommended_direction),
        "top_actions": top_actions,
        "generated_at": generated_at,
        "recommended_direction": recommended_direction,
        "paths": paths,
        "current_skills": current_skills,
        "target_skills": target_skills,
        "skill_gaps": skill_gaps,
        "next_steps": next_steps,
    }
