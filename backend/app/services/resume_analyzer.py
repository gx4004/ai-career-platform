from __future__ import annotations

from datetime import datetime, timezone

from app.prompts.resume import build_resume_prompt
from app.services.ai_client import complete_structured
from app.services.quality_signals import (
    ResumePrepass,
    build_resume_prepass,
    compute_overall_score,
    compute_resume_breakdown,
)

SCHEMA_VERSION = "quality_v2"
CONFIDENCE_NOTE = (
    "Directional heuristic based on the resume text and detected evidence, not a "
    "recruiter decision or ATS guarantee."
)


def _resume_verdict(score: int) -> str:
    if score >= 85:
        return "Strong foundation"
    if score >= 70:
        return "Promising but uneven"
    return "Needs stronger evidence"


def _default_headline(score: int, missing_keywords: list[str]) -> str:
    if score >= 85:
        return "Strong foundation with a few high-value refinements left."
    if missing_keywords:
        return "The next revision should close the biggest keyword and evidence gaps."
    return "The resume needs clearer evidence before it will feel competitive."


def _severity_from_score(score: int) -> str:
    if score < 55:
        return "high"
    if score < 72:
        return "medium"
    return "low"


def _heuristic_issues(
    prepass: ResumePrepass,
    score_breakdown: list[dict[str, int | str]],
) -> list[dict[str, str]]:
    breakdown = {str(item["key"]): int(item["score"]) for item in score_breakdown}
    issues: list[dict[str, str]] = []

    if prepass.missing_keywords:
        missing = ", ".join(prepass.missing_keywords[:4])
        issues.append(
            {
                "id": "keywords-cover-missing-keywords",
                "severity": _severity_from_score(breakdown["keywords"]),
                "category": "keywords",
                "title": "Important target-role keywords are still missing",
                "why_it_matters": "Recruiters scan for job-specific language before they read details.",
                "evidence": f"Missing keywords detected: {missing}.",
                "fix": "Add direct evidence for the most important missing keywords in your summary, skills, and experience bullets.",
            }
        )

    if prepass.quantified_bullets < 2:
        issues.append(
            {
                "id": "impact-add-measurable-results",
                "severity": _severity_from_score(breakdown["impact"]),
                "category": "impact",
                "title": "Impact is not backed up with enough measurable results",
                "why_it_matters": "Without numbers, it is harder for a hiring manager to trust the scale of your work.",
                "evidence": f"Only {prepass.quantified_bullets} resume lines appear to include metrics or concrete outcomes.",
                "fix": "Rewrite 2-3 bullets with metrics, scope, speed, revenue, reliability, or user impact.",
            }
        )

    missing_sections = [
        section
        for section in ("Summary", "Experience", "Skills", "Education")
        if section not in prepass.detected_sections
    ]
    if missing_sections:
        issues.append(
            {
                "id": "completeness-add-core-sections",
                "severity": _severity_from_score(breakdown["completeness"]),
                "category": "completeness",
                "title": "Core resume sections are missing or hard to detect",
                "why_it_matters": "When expected sections are unclear, important evidence is easier to miss.",
                "evidence": f"Detected sections: {', '.join(prepass.detected_sections) or 'none'}. Missing likely sections: {', '.join(missing_sections)}.",
                "fix": "Use explicit section headers for the missing areas so recruiters can scan the resume faster.",
            }
        )

    if prepass.bullet_lines < 4:
        issues.append(
            {
                "id": "structure-use-scannable-bullets",
                "severity": _severity_from_score(breakdown["structure"]),
                "category": "structure",
                "title": "The resume could be easier to scan",
                "why_it_matters": "Dense paragraphs slow recruiters down and hide evidence that should stand out.",
                "evidence": f"Only {prepass.bullet_lines} bullet-style lines were detected.",
                "fix": "Convert dense experience descriptions into short bullets with one achievement per line.",
            }
        )

    if prepass.word_count < 140:
        issues.append(
            {
                "id": "clarity-add-context",
                "severity": _severity_from_score(breakdown["clarity"]),
                "category": "clarity",
                "title": "The resume may be too thin to communicate your scope clearly",
                "why_it_matters": "If the document is too brief, recruiters cannot quickly see context, ownership, and outcomes.",
                "evidence": f"Approximate word count: {prepass.word_count}.",
                "fix": "Add concise context to each role: what you owned, what changed, and why it mattered.",
            }
        )

    return issues[:5]


def _fallback_strengths(prepass: ResumePrepass) -> list[str]:
    strengths: list[str] = []
    if len(prepass.detected_sections) >= 4:
        strengths.append("Covers the main resume sections recruiters expect to scan first.")
    if prepass.quantified_bullets >= 2:
        strengths.append("Includes measurable outcomes that make impact easier to trust.")
    if prepass.detected_skills:
        strengths.append(
            f"Surfaces relevant skills clearly, including {', '.join(prepass.detected_skills[:4])}."
        )
    if prepass.matched_keywords:
        strengths.append(
            f"Already aligns to the target role in places, including {', '.join(prepass.matched_keywords[:4])}."
        )
    if not strengths:
        strengths.append("Provides enough raw material to improve with more specific evidence and structure.")
    return strengths[:4]


def _normalize_summary(result: dict, overall_score: int, prepass: ResumePrepass) -> dict[str, str]:
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    return {
        "headline": str(summary.get("headline") or _default_headline(overall_score, prepass.missing_keywords)),
        "verdict": str(summary.get("verdict") or _resume_verdict(overall_score)),
        "confidence_note": str(summary.get("confidence_note") or CONFIDENCE_NOTE),
    }


def _normalize_issues(
    result: dict,
    prepass: ResumePrepass,
    score_breakdown: list[dict[str, int | str]],
) -> list[dict[str, str]]:
    raw_items = result.get("issues") if isinstance(result.get("issues"), list) else []
    normalized: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category") or "").strip()
        severity = str(item.get("severity") or "").strip()
        if category not in {"keywords", "impact", "structure", "clarity", "completeness"}:
            continue
        if severity not in {"high", "medium", "low"}:
            severity = "medium"
        normalized.append(
            {
                "id": str(item.get("id") or f"{category}-{len(normalized) + 1}"),
                "severity": severity,
                "category": category,
                "title": str(item.get("title") or "Resume issue"),
                "why_it_matters": str(item.get("why_it_matters") or "This weakens the resume's first read."),
                "evidence": str(item.get("evidence") or "The current resume text does not make this evidence easy to find."),
                "fix": str(item.get("fix") or "Revise the resume so this signal is explicit and easier to verify."),
            }
        )

    if normalized:
        return normalized[:5]
    return _heuristic_issues(prepass, score_breakdown)


def _normalize_top_actions(issues: list[dict[str, str]], result: dict) -> list[dict[str, str]]:
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
                "action": str(item.get("action") or "Revise the resume to make this evidence easier to spot."),
                "priority": priority,
            }
        )
    if normalized:
        return normalized[:3]

    return [
        {
            "title": issue["title"],
            "action": issue["fix"],
            "priority": issue["severity"],
        }
        for issue in issues[:3]
    ]


def _normalize_role_fit(
    result: dict,
    prepass: ResumePrepass,
    overall_score: int,
) -> dict | None:
    if not prepass.target_role_label:
        return None

    raw_role_fit = result.get("role_fit") if isinstance(result.get("role_fit"), dict) else {}
    fit_score = int(raw_role_fit.get("fit_score") or max(45, overall_score - 5))
    rationale = str(
        raw_role_fit.get("rationale")
        or (
            f"The resume already shows some alignment through {', '.join(prepass.matched_keywords[:3]) or 'relevant experience'}, "
            f"but it would read as stronger with clearer evidence for {', '.join(prepass.missing_keywords[:3]) or 'the highest-priority role keywords'}."
        )
    )
    return {
        "target_role_label": str(raw_role_fit.get("target_role_label") or prepass.target_role_label),
        "fit_score": max(0, min(fit_score, 100)),
        "rationale": rationale,
    }


async def analyze_resume(
    resume_text: str, job_description: str | None
) -> dict:
    prepass = build_resume_prepass(resume_text, job_description)
    score_breakdown = compute_resume_breakdown(prepass)
    overall_score = compute_overall_score(score_breakdown)
    generated_at = datetime.now(timezone.utc).isoformat()

    locked_payload = {
        "schema_version": SCHEMA_VERSION,
        "summary": {
            "headline": _default_headline(overall_score, prepass.missing_keywords),
            "verdict": _resume_verdict(overall_score),
            "confidence_note": CONFIDENCE_NOTE,
        },
        "top_actions": [],
        "generated_at": generated_at,
        "overall_score": overall_score,
        "score_breakdown": score_breakdown,
        "strengths": [],
        "issues": [],
        "evidence": prepass.evidence(),
        "role_fit": None,
    }

    system_prompt, user_prompt = build_resume_prompt(
        resume_text,
        job_description,
        locked_payload,
        prepass.evidence(),
    )
    result = await complete_structured(system_prompt, user_prompt)

    summary = _normalize_summary(result, overall_score, prepass)
    issues = _normalize_issues(result, prepass, score_breakdown)
    top_actions = _normalize_top_actions(issues, result)
    strengths = result.get("strengths") if isinstance(result.get("strengths"), list) else []
    strengths = [str(item) for item in strengths if str(item).strip()] or _fallback_strengths(prepass)

    return {
        "schema_version": SCHEMA_VERSION,
        "summary": summary,
        "top_actions": top_actions,
        "generated_at": generated_at,
        "overall_score": overall_score,
        "score_breakdown": score_breakdown,
        "strengths": strengths[:5],
        "issues": issues,
        "evidence": prepass.evidence(),
        "role_fit": _normalize_role_fit(result, prepass, overall_score),
    }
