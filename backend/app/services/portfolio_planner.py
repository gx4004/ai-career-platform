from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.prompts.portfolio import build_portfolio_prompt
from app.services.ai_client import complete_structured
from app.services.quality_signals import (
    build_resume_prepass,
    discipline_label,
    infer_resume_discipline,
    infer_resume_seniority,
    infer_resume_years_experience,
    ordered_unique,
    seniority_label,
)

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "planning_v1"
CONFIDENCE_NOTE = (
    "Advisory portfolio guidance based on resume evidence and lightweight role-fit "
    "heuristics, not a prediction of what any hiring manager will require."
)

ROLE_FOCUS_SKILLS: dict[str, list[str]] = {
    "backend-engineering": ["APIs", "Testing", "Cloud Architecture", "Observability", "System Design"],
    "frontend-engineering": ["TypeScript", "Accessibility", "Design Systems", "Frontend Performance", "Experimentation"],
    "full-stack-engineering": ["APIs", "TypeScript", "Cloud Architecture", "Product Thinking", "Testing"],
    "data-analytics": ["SQL", "Data Storytelling", "Experimentation", "Data Modeling", "Automation"],
    "product-design": ["User Research", "Accessibility", "Design Systems", "Storytelling", "Prototyping"],
    "product-management": ["Prioritization", "Analytics", "Roadmapping", "Stakeholder Management", "Experimentation"],
    "general-technology": ["Communication", "Systems Thinking", "Project Management", "Data Analysis", "Storytelling"],
}

PROJECT_TEMPLATES: dict[str, list[dict[str, object]]] = {
    "backend-engineering": [
        {
            "project_title": "Operational Intake Service",
            "description": "Build a production-leaning service around a real intake workflow with validation, persistence, retries, and documented trade-offs. Frame it as the kind of backend ownership expected from a {target_role}.",
            "skills": ["APIs", "Testing", "SQL", "Cloud Architecture"],
            "complexity": "foundational",
            "why_this_project": "It proves you can own the boring-but-critical backend details that hiring teams trust first: data shape, failure handling, and operational clarity.",
            "deliverables": ["Architecture note", "Deployed service", "Test suite", "README with trade-offs"],
            "hiring_signals": ["Ships backend scope beyond CRUD", "Understands reliability basics", "Can explain implementation choices"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Observability Upgrade Lab",
            "description": "Take a service and add logs, metrics, alerts, and a lightweight incident runbook. Show how you would make a backend system diagnosable under load and failure.",
            "skills": ["Observability", "Cloud Architecture", "System Design", "Testing"],
            "complexity": "intermediate",
            "why_this_project": "It turns a code sample into operational proof, which is often the missing hiring signal for backend candidates.",
            "deliverables": ["Monitoring dashboard screenshots", "Runbook", "Load-test summary", "Before/after instrumentation notes"],
            "hiring_signals": ["Thinks about production readiness", "Understands operational feedback loops", "Can communicate trade-offs clearly"],
            "estimated_timeline": "3-4 weeks",
        },
        {
            "project_title": "Scale Readiness Capstone",
            "description": "Design and implement a system slice that uses asynchronous processing, documented scaling decisions, and a clear API boundary. Include the architecture rationale, not just the code.",
            "skills": ["System Design", "APIs", "Cloud Architecture", "Observability"],
            "complexity": "advanced",
            "why_this_project": "It gives you a capstone artifact that proves senior-level thinking, not just implementation ability.",
            "deliverables": ["Design doc", "Running demo", "Queue or event flow diagram", "Trade-off log"],
            "hiring_signals": ["Can reason about scale", "Writes credible architecture narratives", "Shows ownership beyond tickets"],
            "estimated_timeline": "4-6 weeks",
        },
    ],
    "frontend-engineering": [
        {
            "project_title": "Accessibility-first Workflow Surface",
            "description": "Build a multi-step product workflow with responsive layouts, keyboard support, and thoughtful empty states. Anchor the choices in what teams hiring a {target_role} expect to ship well.",
            "skills": ["TypeScript", "Accessibility", "React", "Frontend Performance"],
            "complexity": "foundational",
            "why_this_project": "It proves you can ship polished product UI, not just isolated components.",
            "deliverables": ["Live demo", "Accessibility notes", "Responsive walkthrough", "Component inventory"],
            "hiring_signals": ["Builds product-ready interfaces", "Understands accessibility", "Can explain UX decisions"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Design System Slice",
            "description": "Create a reusable component set with tokens, documentation, and usage rules, then show it inside a real product flow. Treat consistency and ergonomics as part of the project, not an afterthought.",
            "skills": ["Design Systems", "TypeScript", "Accessibility", "Storytelling"],
            "complexity": "intermediate",
            "why_this_project": "It demonstrates the judgment teams look for when they need someone who can scale UI quality across a product.",
            "deliverables": ["Component docs", "Token decisions", "Usage examples", "Change log"],
            "hiring_signals": ["Thinks in systems", "Balances polish and reuse", "Documents work for other developers and designers"],
            "estimated_timeline": "3-4 weeks",
        },
        {
            "project_title": "Performance Decision Lab",
            "description": "Instrument a real interface, identify the slowest path, and improve it with a clear narrative about the user impact. Pair code changes with the evidence that motivated them.",
            "skills": ["Frontend Performance", "Experimentation", "TypeScript", "Storytelling"],
            "complexity": "advanced",
            "why_this_project": "It converts a general front-end portfolio into proof that you can diagnose and improve product experience under real constraints.",
            "deliverables": ["Before/after metrics", "Profiling notes", "Decision memo", "Demo recording"],
            "hiring_signals": ["Uses evidence to guide changes", "Can optimize without cargo culting", "Communicates impact clearly"],
            "estimated_timeline": "4-5 weeks",
        },
    ],
    "full-stack-engineering": [
        {
            "project_title": "Workflow Ownership App",
            "description": "Build one focused product workflow end to end, including data model, UI, auth, and basic instrumentation. Treat it as a proof piece for a {target_role}, not just a toy app.",
            "skills": ["APIs", "TypeScript", "Testing", "Product Thinking"],
            "complexity": "foundational",
            "why_this_project": "It gives hiring teams a quick read on whether you can connect product needs to technical delivery across the stack.",
            "deliverables": ["Live app", "Architecture summary", "Key metrics plan", "Test coverage notes"],
            "hiring_signals": ["Can deliver end to end", "Understands product context", "Makes sensible scope choices"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Instrumentation and Experiment Layer",
            "description": "Add analytics, event tracking, and one hypothesis-driven iteration loop to a real app workflow. Show how technical decisions support learning, not just shipping.",
            "skills": ["Experimentation", "Analytics", "TypeScript", "APIs"],
            "complexity": "intermediate",
            "why_this_project": "It proves you understand how product decisions and engineering execution connect in practice.",
            "deliverables": ["Tracking plan", "Experiment brief", "Event schema", "Readout memo"],
            "hiring_signals": ["Builds with business context", "Understands instrumentation", "Can tell a product-impact story"],
            "estimated_timeline": "3-4 weeks",
        },
        {
            "project_title": "Scale and Reliability Capstone",
            "description": "Upgrade a full-stack project with background work, failure recovery, and a clear architecture narrative. Pair the feature set with production-minded explanations.",
            "skills": ["Cloud Architecture", "Observability", "System Design", "Testing"],
            "complexity": "advanced",
            "why_this_project": "It prevents your portfolio from looking shallow by proving you can think beyond the happy path.",
            "deliverables": ["System diagram", "Ops checklist", "Failure-mode tests", "Architecture walkthrough"],
            "hiring_signals": ["Can reason about real-world constraints", "Balances product and platform concerns", "Documents technical trade-offs"],
            "estimated_timeline": "4-6 weeks",
        },
    ],
    "data-analytics": [
        {
            "project_title": "Decision Memo Analysis",
            "description": "Take a messy dataset, answer a business question, and package the work as a concise recommendation memo with charts and caveats. Position it like a realistic proof piece for a {target_role}.",
            "skills": ["SQL", "Data Storytelling", "Analytics", "Communication"],
            "complexity": "foundational",
            "why_this_project": "It proves you can move from raw data to a decision, which is a stronger hiring signal than a generic dashboard alone.",
            "deliverables": ["SQL notebook or queries", "Recommendation memo", "Annotated visuals", "Assumptions log"],
            "hiring_signals": ["Answers business questions directly", "Communicates clearly", "Shows analytical judgment"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Analytics Pipeline Rebuild",
            "description": "Model and clean a small dataset into trustworthy tables with tests, documentation, and stakeholder-friendly naming. Focus on the reliability of the analysis layer, not just the output.",
            "skills": ["Data Modeling", "Automation", "Testing", "SQL"],
            "complexity": "intermediate",
            "why_this_project": "It shows you can make data usable by others, which separates analysts from pure report builders.",
            "deliverables": ["Data model diagram", "Test cases", "Transformation notes", "Documentation"],
            "hiring_signals": ["Understands data quality", "Builds reusable analysis assets", "Documents assumptions well"],
            "estimated_timeline": "3-4 weeks",
        },
        {
            "project_title": "Experiment Readout Capstone",
            "description": "Design a lightweight experiment or quasi-experiment, define success metrics, and write the readout as if a product or leadership team will use it to decide what ships next.",
            "skills": ["Experimentation", "Analytics", "Data Storytelling", "Stakeholder Communication"],
            "complexity": "advanced",
            "why_this_project": "It demonstrates strategic analytical judgment, not just technical querying ability.",
            "deliverables": ["Experiment brief", "Metric framework", "Readout memo", "Risk and caveat section"],
            "hiring_signals": ["Thinks like a decision partner", "Frames uncertainty clearly", "Connects analysis to action"],
            "estimated_timeline": "4-5 weeks",
        },
    ],
    "product-design": [
        {
            "project_title": "Workflow Redesign Case Study",
            "description": "Pick a real workflow with friction, redesign it with explicit user goals, and show the before/after rationale. Write it so a hiring team can see your design thinking, not just polished screens.",
            "skills": ["User Research", "Accessibility", "Storytelling", "Figma"],
            "complexity": "foundational",
            "why_this_project": "It proves you can tie design choices to user pain, which is more credible than a purely aesthetic portfolio piece.",
            "deliverables": ["Problem framing", "Annotated flows", "Prototype", "Case study narrative"],
            "hiring_signals": ["Thinks beyond visuals", "Frames user problems clearly", "Explains design decisions well"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Design System Extension",
            "description": "Create a small but coherent design system slice, then apply it to a realistic product flow. Document how the system improves speed, consistency, and accessibility.",
            "skills": ["Design Systems", "Accessibility", "Storytelling", "Product Collaboration"],
            "complexity": "intermediate",
            "why_this_project": "It proves you can design for teams and scale, not just for one-off screens.",
            "deliverables": ["Token set", "Component library", "Guidelines", "Applied product example"],
            "hiring_signals": ["Designs systematically", "Balances consistency and usability", "Documents work for collaborators"],
            "estimated_timeline": "3-4 weeks",
        },
        {
            "project_title": "Research-to-Prototype Capstone",
            "description": "Run a compact research cycle, synthesize the findings, and turn them into a prototype with a clear success hypothesis. Emphasize what changed because of the research.",
            "skills": ["User Research", "Prototyping", "Storytelling", "Product Strategy"],
            "complexity": "advanced",
            "why_this_project": "It shows maturity in evidence-based design, especially for teams that value decision quality over dribbble polish.",
            "deliverables": ["Research plan", "Synthesis board", "Prototype", "Validation summary"],
            "hiring_signals": ["Uses evidence to shape design", "Connects insight to execution", "Presents process clearly"],
            "estimated_timeline": "4-5 weeks",
        },
    ],
    "product-management": [
        {
            "project_title": "Opportunity Assessment Pack",
            "description": "Choose a product problem, frame the opportunity, and write a compact strategy memo with goals, scope, and decision criteria. Treat it as proof of how you think as a {target_role}.",
            "skills": ["Product Strategy", "Prioritization", "Communication", "Analytics"],
            "complexity": "foundational",
            "why_this_project": "It quickly shows whether you can structure product thinking in a way other teams can act on.",
            "deliverables": ["Opportunity memo", "Success metric draft", "Scope rationale", "Open questions list"],
            "hiring_signals": ["Frames problems well", "Makes sensible trade-offs", "Communicates clearly"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Execution System Redesign",
            "description": "Take an existing workflow and redesign the planning, prioritization, and measurement model around it. Focus on the operating system of delivery, not just feature ideation.",
            "skills": ["Roadmapping", "Stakeholder Management", "Prioritization", "Systems Thinking"],
            "complexity": "intermediate",
            "why_this_project": "It demonstrates how you turn strategy into a repeatable execution model, which is a strong PM hiring signal.",
            "deliverables": ["Roadmap slice", "Decision log", "Dependency map", "Stakeholder summary"],
            "hiring_signals": ["Can orchestrate cross-functional work", "Translates goals into plans", "Shows operating judgment"],
            "estimated_timeline": "3-4 weeks",
        },
        {
            "project_title": "Launch Strategy Capstone",
            "description": "Define a launch plan for a meaningful product change, including metrics, risks, sequencing, and iteration criteria. Show the logic behind the plan, not just the final slide.",
            "skills": ["Analytics", "Experimentation", "Roadmapping", "Stakeholder Management"],
            "complexity": "advanced",
            "why_this_project": "It proves you can think through downstream execution and learning loops, not just roadmap ideas.",
            "deliverables": ["Launch brief", "Metric tree", "Risk register", "Iteration plan"],
            "hiring_signals": ["Connects strategy to outcomes", "Handles ambiguity well", "Thinks through launch risk"],
            "estimated_timeline": "4-5 weeks",
        },
    ],
    "general-technology": [
        {
            "project_title": "Proof of Ownership Story",
            "description": "Take one piece of work you know well and turn it into a concise case study with scope, decisions, and outcomes. Use it to anchor the type of {target_role} work you want next.",
            "skills": ["Communication", "Storytelling", "Project Management"],
            "complexity": "foundational",
            "why_this_project": "If the baseline is still forming, the fastest credibility gain often comes from packaging one real example extremely well.",
            "deliverables": ["Case study write-up", "Before/after framing", "Decision notes", "Outcome summary"],
            "hiring_signals": ["Can explain ownership", "Makes transferable skills concrete", "Builds a credible narrative"],
            "estimated_timeline": "1-2 weeks",
        },
        {
            "project_title": "Systems Improvement Deep Dive",
            "description": "Document a process or product system, identify the biggest friction point, and propose a measurable improvement. Pair the recommendation with one concrete prototype or implementation slice.",
            "skills": ["Systems Thinking", "Communication", "Data Analysis"],
            "complexity": "intermediate",
            "why_this_project": "It shows structured problem solving even when your specialization is still broad.",
            "deliverables": ["System map", "Problem analysis", "Prototype or automation slice", "Measurement plan"],
            "hiring_signals": ["Can frame messy work clearly", "Uses evidence to prioritize", "Connects analysis to action"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Decision Support Capstone",
            "description": "Choose a realistic business or operational question and build the memo, artifact, and recommendation package needed to support a decision. Make the presentation quality part of the proof.",
            "skills": ["Storytelling", "Data Analysis", "Systems Thinking", "Communication"],
            "complexity": "advanced",
            "why_this_project": "It gives you a polished capstone that can travel across adjacent roles while your positioning sharpens.",
            "deliverables": ["Decision memo", "Evidence appendix", "Prototype or analysis asset", "Presentation deck"],
            "hiring_signals": ["Can support decisions with evidence", "Packages work professionally", "Shows cross-functional readiness"],
            "estimated_timeline": "3-4 weeks",
        },
    ],
}

COMPLEXITY_RANK = {
    "foundational": 1,
    "intermediate": 2,
    "advanced": 3,
}


def _to_string(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in (_to_string(item) for item in value) if item.strip()]


def _normalize_priority(value: object, default: str = "medium") -> str:
    priority = _to_string(value).lower()
    return priority if priority in {"high", "medium", "low"} else default


def _normalize_complexity(value: object, default: str = "intermediate") -> str:
    complexity = _to_string(value).lower()
    return complexity if complexity in COMPLEXITY_RANK else default


def _target_role_discipline(target_role: str, resume_discipline: str) -> str:
    lowered = target_role.lower()
    if any(term in lowered for term in ("backend", "platform", "api", "infrastructure")):
        return "backend-engineering"
    if any(term in lowered for term in ("frontend", "front-end", "ui")):
        return "frontend-engineering"
    if "full stack" in lowered or "full-stack" in lowered:
        return "full-stack-engineering"
    if any(term in lowered for term in ("data", "analytics", "analyst", "scientist")):
        return "data-analytics"
    if any(term in lowered for term in ("designer", "ux", "researcher")):
        return "product-design"
    if any(term in lowered for term in ("product manager", "program manager", "product operations")):
        return "product-management"
    return resume_discipline


def _format_template(template: dict[str, object], target_role: str) -> dict[str, object]:
    description = _to_string(template.get("description")).format(target_role=target_role)
    return {
        "project_title": _to_string(template.get("project_title")) or "Portfolio project",
        "description": description,
        "skills": ordered_unique(_string_list(template.get("skills")))[:5],
        "complexity": _normalize_complexity(template.get("complexity")),
        "why_this_project": _to_string(template.get("why_this_project")),
        "deliverables": ordered_unique(_string_list(template.get("deliverables")))[:5],
        "hiring_signals": ordered_unique(_string_list(template.get("hiring_signals")))[:5],
        "estimated_timeline": _to_string(template.get("estimated_timeline")) or "2-4 weeks",
    }


def _fallback_projects(
    target_role: str,
    target_discipline: str,
) -> list[dict[str, object]]:
    templates = PROJECT_TEMPLATES.get(target_discipline, PROJECT_TEMPLATES["general-technology"])
    return [_format_template(template, target_role) for template in templates[:3]]


def _normalize_projects(
    result: dict,
    fallback_projects: list[dict[str, object]],
) -> list[dict[str, object]]:
    raw_items = result.get("projects") if isinstance(result.get("projects"), list) else []
    if not raw_items:
        return fallback_projects

    fallback_by_title = {
        project["project_title"].lower(): project
        for project in fallback_projects
        if isinstance(project.get("project_title"), str)
    }
    normalized: list[dict[str, object]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        title = _to_string(item.get("project_title")) or _to_string(item.get("title"))
        if not title:
            continue
        fallback = fallback_by_title.get(title.lower(), fallback_projects[min(index, len(fallback_projects) - 1)])
        normalized.append(
            {
                "project_title": title,
                "description": _to_string(item.get("description"))
                or _to_string(fallback.get("description"))
                or "No project description was returned.",
                "skills": ordered_unique(_string_list(item.get("skills")) or _string_list(fallback.get("skills")))[:5],
                "complexity": _normalize_complexity(item.get("complexity"), _normalize_complexity(fallback.get("complexity"))),
                "why_this_project": _to_string(item.get("why_this_project"))
                or _to_string(fallback.get("why_this_project"))
                or "This project creates direct proof for the target role.",
                "deliverables": ordered_unique(_string_list(item.get("deliverables")) or _string_list(fallback.get("deliverables")))[:5],
                "hiring_signals": ordered_unique(_string_list(item.get("hiring_signals")) or _string_list(fallback.get("hiring_signals")))[:5],
                "estimated_timeline": _to_string(item.get("estimated_timeline"))
                or _to_string(fallback.get("estimated_timeline"))
                or "2-4 weeks",
            }
        )

    return normalized[:4] if normalized else fallback_projects


def _sequence_projects(
    projects: list[dict[str, object]],
    seniority: str,
    skill_count: int,
) -> list[dict[str, object]]:
    if not projects:
        return []

    ranked = list(projects)
    if seniority == "senior" and skill_count >= 5:
        ranked.sort(
            key=lambda item: (
                0 if _to_string(item.get("complexity")) == "intermediate" else 1,
                COMPLEXITY_RANK.get(_to_string(item.get("complexity")), 99),
            )
        )
    else:
        ranked.sort(key=lambda item: COMPLEXITY_RANK.get(_to_string(item.get("complexity")), 99))

    reasons = {
        1: "Start with the fastest credible proof piece so you can show direction quickly.",
        2: "Build this next once the first project gives you a stable story and reusable assets.",
        3: "Use this as the capstone once the earlier work has closed the biggest proof gaps.",
        4: "Only add this after the earlier roadmap pieces are already visible and polished.",
    }

    return [
        {
            "order": index + 1,
            "project_title": _to_string(project.get("project_title")),
            "reason": reasons[index + 1],
        }
        for index, project in enumerate(ranked[:4])
    ]


def _normalize_sequence_plan(
    result: dict,
    projects: list[dict[str, object]],
    fallback_sequence: list[dict[str, object]],
) -> list[dict[str, object]]:
    raw_items = result.get("sequence_plan") if isinstance(result.get("sequence_plan"), list) else []
    if not raw_items:
        return fallback_sequence

    project_titles = {
        _to_string(project.get("project_title")).lower()
        for project in projects
        if _to_string(project.get("project_title"))
    }
    normalized: list[dict[str, object]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        title = _to_string(item.get("project_title"))
        if not title or title.lower() not in project_titles:
            continue
        try:
            order = int(item.get("order"))
        except (TypeError, ValueError):
            order = index + 1
        normalized.append(
            {
                "order": max(1, min(order, len(projects))),
                "project_title": title,
                "reason": _to_string(item.get("reason")) or "This slot was chosen to keep the roadmap realistic.",
            }
        )

    normalized.sort(key=lambda item: int(item["order"]))
    return normalized[: len(projects)] if normalized else fallback_sequence


def _normalize_strategy(
    result: dict,
    target_role: str,
    focus_skills: list[str],
) -> dict[str, str]:
    raw = result.get("portfolio_strategy") if isinstance(result.get("portfolio_strategy"), dict) else {}
    return {
        "headline": _to_string(raw.get("headline"))
        or f"Build a compact proof set that makes you look credible for {target_role}.",
        "focus": _to_string(raw.get("focus"))
        or f"Prioritize a few role-shaped projects that show {_join_with_and(focus_skills[:3])} instead of trying to cover every possible skill at once.",
        "proof_goal": _to_string(raw.get("proof_goal"))
        or f"Make it easy for a hiring team to say, \"this person can already operate like a {target_role}.\"",
    }


def _normalize_summary(
    result: dict,
    target_role: str,
    recommended_start_project: str,
) -> dict[str, str]:
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    return {
        "headline": _to_string(summary.get("headline"))
        or f"Start with {recommended_start_project} to build the fastest credible proof for {target_role}.",
        "verdict": _to_string(summary.get("verdict")) or "Proof roadmap ready",
        "confidence_note": _to_string(summary.get("confidence_note")) or CONFIDENCE_NOTE,
    }


def _join_with_and(items: list[str]) -> str:
    cleaned = [item for item in items if item]
    if not cleaned:
        return "the right skills"
    if len(cleaned) == 1:
        return cleaned[0]
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"


def _normalize_presentation_tips(
    result: dict,
    target_role: str,
) -> list[str]:
    raw_items = _string_list(result.get("presentation_tips"))
    if raw_items:
        return raw_items[:5]

    return [
        f"Frame each project around the hiring signal it proves for {target_role}, not just the feature list.",
        "Show the artifact trail: decision doc, screenshots, code, and a short reflection on trade-offs.",
        "Write one concise README or case study per project so a reviewer can scan the problem, approach, and result quickly.",
        "Call out what you would improve next if the project were going live for real users or stakeholders.",
    ]


def _normalize_top_actions(
    result: dict,
    recommended_start_project: str,
    sequence_plan: list[dict[str, object]],
) -> list[dict[str, str]]:
    raw_items = result.get("top_actions") if isinstance(result.get("top_actions"), list) else []
    normalized: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "title": _to_string(item.get("title")) or "Top action",
                "action": _to_string(item.get("action")) or "Build the strongest proof project next.",
                "priority": _normalize_priority(item.get("priority")),
            }
        )
    if normalized:
        return normalized[:3]

    second_step = sequence_plan[1]["project_title"] if len(sequence_plan) > 1 else "the next roadmap project"
    return [
        {
            "title": "Start here",
            "action": f"Begin with {recommended_start_project} and ship the core proof artifacts before expanding scope.",
            "priority": "high",
        },
        {
            "title": "Sequence deliberately",
            "action": f"Do not skip straight to the capstone. Move into {second_step} once the first project has a clean narrative.",
            "priority": "medium",
        },
        {
            "title": "Show the work publicly",
            "action": "Package each project with a README or case study so the deliverables are visible without a live walkthrough.",
            "priority": "medium",
        },
    ]


async def recommend_portfolio(
    resume_text: str,
    target_role: str,
) -> dict:
    prepass = build_resume_prepass(resume_text, target_role)
    generated_at = datetime.now(UTC).isoformat()

    resume_discipline = infer_resume_discipline(resume_text, prepass.detected_skills)
    target_discipline = _target_role_discipline(target_role, resume_discipline)
    seniority = infer_resume_seniority(resume_text)
    years_experience = infer_resume_years_experience(resume_text)
    focus_skills = ROLE_FOCUS_SKILLS.get(target_discipline, ROLE_FOCUS_SKILLS["general-technology"])

    fallback_projects = _fallback_projects(target_role, target_discipline)
    fallback_sequence = _sequence_projects(fallback_projects, seniority, len(prepass.detected_skills))
    recommended_start_project = _to_string(fallback_sequence[0]["project_title"]) if fallback_sequence else ""

    locked_payload = {
        "schema_version": SCHEMA_VERSION,
        "summary": {
            "headline": f"Start with {recommended_start_project} to build the fastest credible proof for {target_role}.",
            "verdict": "Proof roadmap ready",
            "confidence_note": CONFIDENCE_NOTE,
        },
        "top_actions": [],
        "generated_at": generated_at,
        "target_role": target_role,
        "portfolio_strategy": {
            "headline": f"Build a compact proof set that makes you look credible for {target_role}.",
            "focus": f"Prioritize a few role-shaped projects that show {_join_with_and(focus_skills[:3])} instead of trying to cover every possible skill at once.",
            "proof_goal": f"Make it easy for a hiring team to say, \"this person can already operate like a {target_role}.\"",
        },
        "projects": fallback_projects,
        "recommended_start_project": recommended_start_project,
        "sequence_plan": fallback_sequence,
        "presentation_tips": [],
    }
    helper_signals = {
        "detected_sections": prepass.detected_sections,
        "detected_skills": prepass.detected_skills,
        "quantified_bullets": prepass.quantified_bullets,
        "word_count": prepass.word_count,
        "resume_discipline": resume_discipline,
        "resume_discipline_label": discipline_label(resume_discipline),
        "target_discipline": target_discipline,
        "target_discipline_label": discipline_label(target_discipline),
        "seniority": seniority,
        "seniority_label": seniority_label(seniority),
        "years_experience": years_experience,
        "focus_skills": focus_skills,
    }

    system_prompt, user_prompt = build_portfolio_prompt(
        resume_text,
        target_role,
        locked_payload,
        helper_signals,
    )
    try:
        result = await complete_structured(system_prompt, user_prompt)
    except Exception as exc:
        logger.warning("LLM call failed for portfolio planner: %s", exc, exc_info=True)
        raise

    projects = _normalize_projects(result, fallback_projects)
    sequence_plan = _normalize_sequence_plan(
        result,
        projects,
        _sequence_projects(projects, seniority, len(prepass.detected_skills)),
    )
    recommended_start_project = _to_string(result.get("recommended_start_project"))
    project_titles = {_to_string(project.get("project_title")) for project in projects}
    if recommended_start_project not in project_titles:
        recommended_start_project = _to_string(sequence_plan[0]["project_title"]) if sequence_plan else _to_string(projects[0]["project_title"])

    return {
        "schema_version": SCHEMA_VERSION,
        "summary": _normalize_summary(result, target_role, recommended_start_project),
        "top_actions": _normalize_top_actions(result, recommended_start_project, sequence_plan),
        "generated_at": generated_at,
        "target_role": target_role,
        "portfolio_strategy": _normalize_strategy(result, target_role, focus_skills),
        "projects": projects,
        "recommended_start_project": recommended_start_project,
        "sequence_plan": sequence_plan,
        "presentation_tips": _normalize_presentation_tips(result, target_role),
    }
