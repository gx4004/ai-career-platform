"""Deterministic, schema-valid LLM fixtures for ``LLM_PROVIDER=fake``.

Vertex is not configured on a local checkout, so running any tool locally with
the real provider fails closed (or, for Resume/Job Match, silently degrades to
the heuristic-only fallback). This module gives local development and demos a
believable stand-in: every caller's prompt shape is matched by a small marker
substring each prompt builder already puts at the top of its system prompt
(see ``app/prompts/*.py`` and the inline system prompts in
``app/services/{cv_tailoring,cv_quality,application_packets}.py``), and the
matching builder below returns realistic, schema-valid JSON built from the
caller's own ``user_prompt`` content where that content is available (e.g.
CV Studio tailoring must cite the entry text verbatim, so the fixture reads it
back out of the prompt instead of inventing text).

Every builder here returns data shaped to pass the *real* service-side
normalization/validation in the corresponding ``app/services/*.py`` module —
not a raw echo of the prompt. Nothing here marks a run as degraded: callers
that fall back to heuristics only do so when ``complete_structured`` raises,
and this provider never raises for a prompt it recognizes.

Marker-substring dispatch (not a passed-in caller hint) was chosen because
``tests/e2e_server.py`` already monkeypatches ``complete_structured`` directly
on each service module for its own deterministic-provider needs, so nothing
here can assume every caller threads a hint through; the system prompt is the
one thing every caller already provides unprompted.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

# ---------------------------------------------------------------------------
# Prompt-parsing helpers
#
# Every builder below reconstructs just enough of the caller's own input
# (locked payload, prepass evidence, structured CV sections, ...) from the
# user_prompt string to produce a response that survives that caller's
# normalization/validation. Callers embed these as ``json.dumps(..., indent=2)``
# blocks after a "## Heading" marker; a compact regex range can't span nested
# braces reliably, so a real JSON decoder is used instead.
# ---------------------------------------------------------------------------


def _json_after(text: str, marker: str) -> Any | None:
    """Decode the first JSON value (object or array) that follows `marker`.

    Uses ``json.JSONDecoder.raw_decode`` from the first ``{``/``[`` after the
    marker so trailing prose in the same prompt (the next "## Heading", plain
    text, ...) never breaks the parse.
    """
    idx = text.find(marker)
    if idx == -1:
        return None
    start = idx + len(marker)
    brace_at = None
    for i in range(start, len(text)):
        if text[i] in "{[":
            brace_at = i
            break
    if brace_at is None:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(text[brace_at:])
    except json.JSONDecodeError:
        return None
    return value


def _line_after(text: str, marker: str) -> str:
    """Return the text on the same line immediately following `marker`."""
    idx = text.find(marker)
    if idx == -1:
        return ""
    rest = text[idx + len(marker) :]
    return rest.split("\n", 1)[0].strip()


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _first_or(items: list[str], default: str) -> str:
    return items[0] if items else default


# ---------------------------------------------------------------------------
# Resume Analyzer — marker from app/prompts/resume.py build_resume_prompt
# ---------------------------------------------------------------------------

_MARKER_RESUME = "You are an expert resume analyst and career advisor."


def _resume_analyzer(system_prompt: str, user_prompt: str) -> dict:
    prepass = _json_after(user_prompt, "## Prepass evidence") or {}
    missing = _string_list(prepass.get("missing_keywords"))
    matched = _string_list(prepass.get("matched_keywords"))
    skills = _string_list(prepass.get("detected_skills"))
    focus_keyword = _first_or(missing, _first_or(skills, "the target role's core requirements"))

    category_order = ["keywords", "impact", "structure", "clarity", "completeness"]
    base_scores = {"keywords": 68, "impact": 72, "structure": 78, "clarity": 74, "completeness": 70}
    if matched:
        base_scores["keywords"] = min(92, base_scores["keywords"] + 6 * min(len(matched), 3))
    if missing:
        base_scores["keywords"] = max(45, base_scores["keywords"] - 4 * min(len(missing), 4))

    issues = [
        {
            "id": "keywords-close-the-gap",
            "severity": "high" if missing else "low",
            "category": "keywords",
            "title": f"Direct evidence for {focus_keyword} is thin",
            "why_it_matters": "Recruiters and ATS filters scan for this term before reading the rest of the resume.",
            "evidence": f"The resume does not clearly show {focus_keyword} in a bullet or the summary.",
            "fix": f"Add one bullet that names {focus_keyword} together with a concrete outcome.",
        },
        {
            "id": "impact-quantify-outcomes",
            "severity": "medium",
            "category": "impact",
            "title": "A few bullets still describe duties, not outcomes",
            "why_it_matters": "Numbers make impact easy to trust at a glance.",
            "evidence": "Several experience lines describe responsibilities without a measurable result.",
            "fix": "Rewrite two bullets to lead with the outcome: scope, speed, revenue, or reliability.",
        },
    ]
    strengths = [
        f"Shows real experience with {', '.join(matched[:3])}." if matched else "Covers a clear, readable set of core sections.",
        "Uses a scannable structure a recruiter can skim in under a minute.",
    ]
    if skills:
        strengths.append(f"Surfaces relevant tooling, including {', '.join(skills[:3])}.")

    return {
        "schema_version": "quality_v2",
        "summary": {
            "headline": f"The resume already covers the basics; closing the gap on {focus_keyword} is the highest-leverage next edit.",
            "verdict": "Promising but uneven" if missing else "Strong foundation",
            "confidence_note": "Directional read from the resume text and job description you provided.",
        },
        "top_actions": [
            {
                "title": f"Prove {focus_keyword}",
                "action": f"Add a specific, measurable bullet that demonstrates {focus_keyword}.",
                "priority": "high" if missing else "medium",
            },
            {
                "title": "Quantify two more bullets",
                "action": "Attach a number, scope, or outcome to your strongest recent bullets.",
                "priority": "medium",
            },
        ],
        "llm_score_breakdown": [{"key": key, "score": base_scores[key]} for key in category_order],
        "strengths": strengths[:5],
        "issues": issues,
        "role_fit": {
            "target_role_label": prepass.get("target_role_label") or "the target role",
            "fit_score": max(40, min(90, 55 + 6 * len(matched) - 5 * len(missing))),
            "rationale": (
                f"Matched signal for {', '.join(matched[:3]) or 'a few relevant areas'} already reads as credible, "
                f"but {focus_keyword} needs clearer proof before this reads as a strong match."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Job Match — marker from app/prompts/job_match.py build_job_match_prompt
# ---------------------------------------------------------------------------

_MARKER_JOB_MATCH = "You are an expert job matching analyst."


def _job_matcher(system_prompt: str, user_prompt: str) -> dict:
    prepass = _json_after(user_prompt, "## Prepass evidence") or {}
    matched = _string_list(prepass.get("matched_keywords"))
    missing = _string_list(prepass.get("missing_keywords"))

    requirements = []
    for keyword in matched[:3]:
        requirements.append(
            {
                "requirement": keyword,
                "importance": "must",
                "status": "matched",
                "resume_evidence": f"The resume already references {keyword} directly.",
                "suggested_fix": f"Keep {keyword} visible in both skills and your strongest bullet.",
            }
        )
    for keyword in missing[:3]:
        requirements.append(
            {
                "requirement": keyword,
                "importance": "must",
                "status": "missing",
                "resume_evidence": f"No direct evidence for {keyword} was found in the resume.",
                "suggested_fix": f"Add a bullet that proves {keyword} with a concrete example.",
            }
        )
    if not requirements:
        requirements.append(
            {
                "requirement": "Role alignment",
                "importance": "preferred",
                "status": "partial",
                "resume_evidence": "The resume shows adjacent experience without an exact keyword match.",
                "suggested_fix": "Mirror the job description's own language where it is honestly true.",
            }
        )

    missing_keywords = [
        {
            "keyword": keyword,
            "contextual_guidance": f"Work {keyword} into an existing bullet where it is genuinely true.",
            "anti_stuffing_note": "Only add it if you can back it up in an interview.",
        }
        for keyword in missing[:4]
    ]

    tailoring_actions = [
        {
            "section": "experience",
            "keyword": keyword,
            "action": f"Add a specific example that proves {keyword} with scope and outcome.",
        }
        for keyword in missing[:3]
    ]

    verdict = "strong" if len(matched) >= len(missing) and matched else "borderline"
    return {
        "schema_version": "quality_v2",
        "summary": {
            "headline": "The resume aligns on the core requirements; a few targeted edits close the rest of the gap."
            if matched
            else "The resume reads as a stretch for this role without clearer targeted evidence.",
            "verdict": verdict,
            "confidence_note": "Directional heuristic based on keyword and evidence overlap.",
        },
        "top_actions": [
            {
                "title": f"Close the {missing[0]} gap" if missing else "Keep the strongest matches visible",
                "action": tailoring_actions[0]["action"] if tailoring_actions else "Keep top matches in the summary and skills section.",
                "priority": "high" if missing else "medium",
            }
        ],
        "verdict": verdict,
        "requirements": requirements[:6],
        "missing_keywords": missing_keywords,
        "tailoring_actions": tailoring_actions[:4],
        "interview_focus": (missing[:3] or matched[:3]) or ["Role-specific scope and ownership"],
        "recruiter_summary": (
            f"This candidate shows evidence for {', '.join(matched[:3]) or 'some relevant experience'}, "
            f"but still needs clearer proof for {', '.join(missing[:3]) or 'a few remaining requirements'} to read as a strong match."
        ),
    }


# ---------------------------------------------------------------------------
# Cover Letter — marker from app/prompts/cover_letter.py build_cover_letter_prompt
# ---------------------------------------------------------------------------

_MARKER_COVER_LETTER = "You are an expert cover letter writer and application strategist."


def _cover_letter(system_prompt: str, user_prompt: str) -> dict:
    locked = _json_after(user_prompt, "## Locked payload") or {}
    tone = str(locked.get("tone_used") or "Professional")

    opening = {
        "text": (
            "I'm writing to apply for this role. The overlap between what you're building and what I've "
            "shipped recently made this one worth a direct, specific pitch rather than a generic cover letter."
        ),
        "why_this_paragraph": "Opens with a direct, specific hook instead of a generic greeting.",
        "requirements_used": [],
        "evidence_used": [],
    }
    body_points = [
        {
            "text": (
                "In my most recent role I owned a project end to end, from the first design decision to the "
                "rollout, and the concrete result was a measurable improvement the team still points back to."
            ),
            "why_this_paragraph": "Leads with the strongest available proof point.",
            "requirements_used": [],
            "evidence_used": [],
        },
        {
            "text": (
                "I also spend real time on the parts of the job that don't show up in a headline metric: "
                "documentation, mentoring, and making sure the next person can pick up what I built."
            ),
            "why_this_paragraph": "Rounds out the pitch with durable, less flashy strengths.",
            "requirements_used": [],
            "evidence_used": [],
        },
    ]
    closing = {
        "text": "I'd welcome the chance to talk through how this experience maps onto your team's current priorities.",
        "why_this_paragraph": "Ends with a concrete, low-friction next step.",
        "requirements_used": [],
        "evidence_used": [],
    }
    full_text = "\n\n".join([opening["text"], *[bp["text"] for bp in body_points], closing["text"]])

    return {
        "schema_version": "quality_v2",
        "summary": {
            "headline": "A grounded, role-specific draft ready for a quick personal pass before sending.",
            "verdict": "Application-ready draft",
            "confidence_note": "Generated from the resume and job description you provided; review before sending.",
        },
        "top_actions": [
            {
                "title": "Add one more concrete number",
                "action": "Swap a general claim for a specific metric wherever you have one.",
                "priority": "medium",
            }
        ],
        "opening": opening,
        "body_points": body_points,
        "closing": closing,
        "full_text": full_text,
        "tone_used": tone,
        "customization_notes": [
            {
                "category": "tone",
                "note": f"Written in a {tone.lower()} register to match the requested tone.",
                "requirements_used": [],
                "source": "job-description",
            }
        ],
    }


# ---------------------------------------------------------------------------
# Interview Q&A — two markers from app/prompts/interview.py
# ---------------------------------------------------------------------------

_MARKER_INTERVIEW_QUESTIONS = "You are an expert interview coach and hiring manager."
_MARKER_INTERVIEW_PRACTICE = "You are an interview coach evaluating a practice answer."

_QUESTION_COUNT_RE = re.compile(r"Generate exactly (\d+) questions")


def _interview_questions(system_prompt: str, user_prompt: str) -> dict:
    match = _QUESTION_COUNT_RE.search(system_prompt)
    count = max(3, min(int(match.group(1)), 12)) if match else 5

    handoff = _json_after(user_prompt, "## Application handoff context") or {}
    focus_pool = (
        _string_list(handoff.get("interview_focus"))
        or _string_list(handoff.get("priority_requirements"))
        or ["your strongest relevant project"]
    )
    weak = _string_list(handoff.get("missing_keywords"))

    questions = []
    for index in range(count):
        focus_area = focus_pool[index % len(focus_pool)]
        questions.append(
            {
                "question": f"Walk me through a time you demonstrated {focus_area}.",
                "answer": (
                    f"I'd anchor this in a specific project where {focus_area} mattered: what the starting "
                    f"situation was, the decision I made, and the measurable outcome that followed."
                ),
                "key_points": [focus_area, "Specific example", "Measurable outcome"],
                "answer_structure": ["Situation", "Task", "Action", "Result"],
                "follow_up_questions": [
                    f"What would you have done differently on {focus_area}?",
                    f"How did you measure success for {focus_area}?",
                ],
                "focus_area": focus_area,
                "why_asked": f"Checks whether you can make {focus_area} concrete and credible under follow-up.",
                "practice_first": focus_area in weak or index == 0,
            }
        )

    return {
        "schema_version": "quality_v2",
        "summary": {
            "headline": "A gap-first practice set focused on the role's highest-value themes.",
            "verdict": "Gap-first practice plan",
            "confidence_note": "Advisory practice plan based on resume and role signals.",
        },
        "top_actions": [
            {
                "title": f"Rehearse {focus_pool[0]} out loud",
                "action": "Practice your strongest story for this topic until it fits in under 90 seconds.",
                "priority": "high",
            }
        ],
        "questions": questions,
        "focus_areas": [
            {
                "title": focus_area,
                "reason": f"The role leans heavily on {focus_area}; interviewers will probe for specifics.",
                "requirements_used": [focus_area],
                "practice_first": focus_area in weak,
            }
            for focus_area in focus_pool[:4]
        ],
        "weak_signals_to_prepare": [
            {
                "title": keyword,
                "severity": "high",
                "why_it_matters": f"No direct resume evidence for {keyword} was detected.",
                "prep_action": f"Prepare one concrete example that proves {keyword} before the interview.",
                "related_requirements": [keyword],
            }
            for keyword in weak[:4]
        ],
        "interviewer_notes": [
            "Lead with the strongest matching story before moving into weaker or adjacent experience.",
        ],
    }


def _interview_practice_feedback(system_prompt: str, user_prompt: str) -> dict:
    is_empty = "(No answer provided)" in user_prompt
    if is_empty:
        return {
            "strengths": [],
            "weaknesses": [],
            "suggestions": [
                "Open with the specific situation and your role in it.",
                "State the concrete action you took, not just the goal.",
                "Close with a measurable result and what you'd repeat or change.",
            ],
            "overall_feedback": "No answer was submitted; use the structure above to build one before your next attempt.",
            "is_empty_answer": True,
        }
    return {
        "strengths": [
            "The answer stays grounded in a real, specific situation.",
            "It states a concrete action rather than a vague intention.",
        ],
        "weaknesses": [
            "The result is described qualitatively rather than with a number.",
        ],
        "suggestions": [
            "Add one measurable outcome to close the answer.",
            "Trim the setup so the action and result get more airtime.",
        ],
        "overall_feedback": "Solid, specific answer — tightening the setup and adding a number would make it land harder.",
        "is_empty_answer": False,
    }


# ---------------------------------------------------------------------------
# Career Path — marker from app/prompts/career.py build_career_prompt
# ---------------------------------------------------------------------------

_MARKER_CAREER = "You are an expert career strategist."


def _career(system_prompt: str, user_prompt: str) -> dict:
    helper = _json_after(user_prompt, "## Helper signals") or {}
    discipline_label = str(helper.get("discipline_label") or "your current discipline")
    target_role = _line_after(user_prompt, "## Stated target role\n") or f"Senior {discipline_label}"
    skills = _string_list(helper.get("detected_skills"))

    paths = [
        {
            "role_title": target_role,
            "fit_score": 78,
            "transition_timeline": "3-6 months",
            "rationale": f"Your background in {discipline_label} already covers most of what this role expects.",
            "strengths_to_leverage": skills[:3] or ["Existing domain experience"],
            "gaps_to_close": ["A visible proof project for the target scope"],
            "risk_level": "low",
        },
        {
            "role_title": f"Staff {discipline_label}",
            "fit_score": 62,
            "transition_timeline": "9-12 months",
            "rationale": "A stretch option that pays off once the core gaps close.",
            "strengths_to_leverage": skills[:2] or ["Track record of ownership"],
            "gaps_to_close": ["Broader cross-team scope", "A track record at higher ambiguity"],
            "risk_level": "medium",
        },
    ]
    return {
        "schema_version": "planning_v1",
        "summary": {
            "headline": f"The clearest next move is {target_role}, and the gaps to close are specific and compact.",
            "verdict": "Best next move identified",
            "confidence_note": "Advisory, evidence-based read on your resume and target role.",
        },
        "top_actions": [
            {
                "title": "Close the top skill gap",
                "action": paths[0]["gaps_to_close"][0],
                "priority": "high",
            }
        ],
        "recommended_direction": {
            "role_title": target_role,
            "fit_score": paths[0]["fit_score"],
            "transition_timeline": paths[0]["transition_timeline"],
            "why_now": f"Your {discipline_label} background is already close to this role's baseline expectations.",
            "confidence": "medium",
        },
        "paths": paths,
        "target_skills": ["Systems design", "Stakeholder communication"],
        "skill_gaps": [
            {
                "skill": paths[0]["gaps_to_close"][0],
                "urgency": "high",
                "why_it_matters": f"Without it, {target_role} will feel like a stretch instead of a clear next step.",
                "how_to_build": "Ship one visible project that exercises this gap end to end.",
            }
        ],
        "next_steps": [
            {"timeframe": "This month", "action": f"Draft a one-page proof plan for {target_role}."},
            {"timeframe": "Next quarter", "action": "Ship the proof project and add it to your resume."},
        ],
    }


# ---------------------------------------------------------------------------
# Portfolio Planner — marker from app/prompts/portfolio.py build_portfolio_prompt
# ---------------------------------------------------------------------------

_MARKER_PORTFOLIO = "You are an expert portfolio strategist and technical mentor."


def _portfolio(system_prompt: str, user_prompt: str) -> dict:
    target_role = _line_after(user_prompt, "## Target Role\n") or "the target role"
    helper = _json_after(user_prompt, "## Helper signals") or {}
    focus_skills = _string_list(helper.get("focus_skills")) or ["Systems design", "Testing", "Communication"]

    projects = [
        {
            "project_title": "End-to-End Proof Project",
            "description": (
                f"Design and ship a small but complete system that demonstrates {focus_skills[0]} under "
                f"realistic constraints, with a short write-up of the trade-offs you made."
            ),
            "skills": focus_skills[:4],
            "complexity": "foundational",
            "why_this_project": f"It gives a reviewer fast, concrete proof you can operate like a {target_role}.",
            "deliverables": ["Working demo", "Short write-up", "Public repo"],
            "hiring_signals": [f"Can own {focus_skills[0]} end to end", "Explains trade-offs clearly"],
            "estimated_timeline": "2-3 weeks",
        },
        {
            "project_title": "Depth Follow-Up Project",
            "description": (
                f"Extend the first project with one harder constraint that specifically targets {focus_skills[-1]}, "
                f"and document what changed and why."
            ),
            "skills": focus_skills[1:5] or focus_skills,
            "complexity": "intermediate",
            "why_this_project": "Shows depth beyond a single surface-level project.",
            "deliverables": ["Updated demo", "Before/after notes"],
            "hiring_signals": ["Iterates on real feedback", "Handles added complexity without a rewrite"],
            "estimated_timeline": "2-4 weeks",
        },
    ]
    return {
        "schema_version": "planning_v1",
        "summary": {
            "headline": f"Two focused projects, sequenced to build the fastest credible proof for {target_role}.",
            "verdict": "Proof roadmap ready",
            "confidence_note": "Advisory portfolio guidance based on resume evidence and role-fit heuristics.",
        },
        "top_actions": [
            {
                "title": f"Start {projects[0]['project_title']}",
                "action": "Scope the first project down to something shippable in under three weeks.",
                "priority": "high",
            }
        ],
        "target_role": target_role,
        "portfolio_strategy": {
            "headline": f"Build a compact proof set that makes you look credible for {target_role}.",
            "focus": f"Prioritize {focus_skills[0]} first, then layer in {focus_skills[-1]}.",
            "proof_goal": f"Make it easy for a reviewer to say this person can already operate like a {target_role}.",
        },
        "projects": projects,
        "recommended_start_project": projects[0]["project_title"],
        "presentation_tips": [
            "Lead with a 30-second demo before any code walkthrough.",
            "Name the hardest trade-off you made and why you made it.",
        ],
    }


# ---------------------------------------------------------------------------
# CV Studio: Tailoring — inline system prompt in app/services/cv_tailoring.py
# ---------------------------------------------------------------------------

_MARKER_CV_TAILORING = "Propose only truthful reframing grounded in existing CV text or confirmed evidence."


def _cv_tailoring(system_prompt: str, user_prompt: str) -> dict:
    job_title = _line_after(user_prompt, "Target title:") or "the target role"
    sections = _json_after(user_prompt, "Structured document:\n") or []

    changes: list[dict[str, Any]] = []
    for section in sections:
        entries = section.get("entries") or []
        if not entries:
            continue
        entry = entries[0]
        before = str(entry.get("body", ""))
        if not before:
            continue
        after = (before.rstrip(". ") + f", tailored to highlight fit for {job_title}.")[:4999]
        changes.append(
            {
                "id": f"tailor-{section.get('id')}-{entry.get('id')}"[:100],
                "section_id": section.get("id"),
                "entry_id": entry.get("id"),
                "before": before,
                "after": after,
                "job_requirement": f"Demonstrated fit for {job_title}",
                "evidence_item_ids": [],
                "support": "document",
            }
        )
        if len(changes) >= 4:
            break

    return {"changes": changes}


# ---------------------------------------------------------------------------
# CV Studio: Quality scoring — inline system prompt in app/services/cv_quality.py
# ---------------------------------------------------------------------------

_MARKER_CV_QUALITY = "Score CV editing quality by impact, clarity, completeness, and structure."


def _cv_quality(system_prompt: str, user_prompt: str) -> dict:
    return {
        "scores": [
            {"key": "impact", "score": 74},
            {"key": "clarity", "score": 80},
            {"key": "completeness", "score": 69},
            {"key": "structure", "score": 77},
        ]
    }


# ---------------------------------------------------------------------------
# Evidence Profile import — marker from app/prompts/evidence_import.py
# ---------------------------------------------------------------------------

_MARKER_EVIDENCE_IMPORT = "You are an information-extraction assistant for a career workbench."


_SECTION_HEADER_RE = re.compile(r"^[A-Z][A-Za-z ]{2,30}$")


def _find_role_and_employer(lines: list[str]) -> tuple[str, str]:
    """A "Role at Employer" / "Role | Employer" line, if the resume has one."""
    for line in lines:
        for sep in (" at ", " @ ", " | "):
            if sep in line:
                role, _, employer = line.partition(sep)
                role, employer = role.strip(), employer.strip()
                if role and employer:
                    return role[:80], employer[:80]
    return (lines[0][:80] if lines else "Professional experience"), "Employer named in the resume"


def _find_skill_line(lines: list[str]) -> str:
    """A comma-separated line (a skills list) over a prose sentence."""
    for line in lines:
        if line.count(",") >= 2 and len(line) < 200 and not _SECTION_HEADER_RE.match(line):
            return line.split(",", 1)[0].strip()[:60]
    return "Core professional skill"


def _find_achievement_line(lines: list[str]) -> str:
    """A quantified bullet (has a digit/%/$) rather than a plain section header."""
    for line in lines:
        if _SECTION_HEADER_RE.match(line):
            continue
        if re.search(r"[\d%$]", line) and len(line) > 15:
            return line.lstrip("-•* ").strip()[:200]
    return "A measurable outcome described in the resume."


def _evidence_import(system_prompt: str, user_prompt: str) -> dict:
    resume_text = user_prompt.split("RESUME TEXT:\n", 1)[-1]
    lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    role, employer = _find_role_and_employer(lines)

    proposals = [
        {
            "kind": "experience",
            "content": {
                "role": role,
                "employer": employer,
                "summary": "Role responsibilities and scope as described in the resume.",
            },
        },
        {
            "kind": "skill",
            "content": {"name": _find_skill_line(lines)},
        },
        {
            "kind": "achievement",
            "content": {"statement": _find_achievement_line(lines)},
        },
    ]
    return {"proposals": proposals}


# ---------------------------------------------------------------------------
# Application Packets: cover letter + screening drafts — inline system prompt
# in app/services/application_packets.py compose_packet_materials
# ---------------------------------------------------------------------------

_MARKER_APPLICATION_PACKETS = "You prepare an application packet's cover letter and screening-answer drafts."


def _application_packets(system_prompt: str, user_prompt: str) -> dict:
    role_line = _line_after(user_prompt, "# Role\n") or "this role"
    return {
        "cover_letter": {
            "body": (
                f"I'm applying for {role_line} because the scope maps closely onto work I've already shipped. "
                "In my most recent role I owned a project end to end and the team still points back to the "
                "result. I'd welcome the chance to talk through how that experience applies here."
            ),
            "support": "document",
            "evidence_item_ids": [],
        },
        "screening_answers": [
            {
                "question": "Why are you a good fit for this role?",
                "answer": "My most recent project overlaps directly with this role's core scope, and I delivered it end to end.",
                "support": "document",
                "evidence_item_ids": [],
            },
            {
                "question": "What relevant experience do you bring to this position?",
                "answer": "I've owned similar scope before, from the initial design decision through rollout and follow-up.",
                "support": "document",
                "evidence_item_ids": [],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_REGISTRY: list[tuple[str, Callable[[str, str], dict]]] = [
    (_MARKER_CV_TAILORING, _cv_tailoring),
    (_MARKER_CV_QUALITY, _cv_quality),
    (_MARKER_EVIDENCE_IMPORT, _evidence_import),
    (_MARKER_APPLICATION_PACKETS, _application_packets),
    (_MARKER_RESUME, _resume_analyzer),
    (_MARKER_JOB_MATCH, _job_matcher),
    (_MARKER_COVER_LETTER, _cover_letter),
    (_MARKER_INTERVIEW_PRACTICE, _interview_practice_feedback),
    (_MARKER_INTERVIEW_QUESTIONS, _interview_questions),
    (_MARKER_CAREER, _career),
    (_MARKER_PORTFOLIO, _portfolio),
]


async def fake_complete_structured(
    system_prompt: str,
    user_prompt: str,
    schema: dict | None = None,
    model_override: str | None = None,
) -> dict:
    """Return a deterministic, schema-valid fixture for the calling prompt.

    Matches the same ``(system_prompt, user_prompt, schema=None,
    model_override=None) -> dict`` shape as ``complete_structured`` so
    ``ai_client._call_fake`` can await it directly. Dispatch is by system-prompt
    marker substring (see module docstring) rather than an explicit caller
    hint, so every existing call site works unmodified.
    """
    for marker, builder in _REGISTRY:
        if marker in system_prompt:
            return builder(system_prompt, user_prompt)
    raise ValueError(
        "LLM_PROVIDER=fake has no registered fixture for this prompt. Add a "
        "marker + builder in app/services/fake_llm.py for the new caller."
    )
