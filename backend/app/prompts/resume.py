import json


def build_resume_prompt(
    resume_text: str,
    job_description: str | None,
    locked_payload: dict,
    prepass_evidence: dict,
) -> tuple[str, str]:
    system = """You are an expert resume analyst and career advisor.

You MUST return valid JSON and follow these rules:
1. Preserve the locked numeric fields, evidence object, and generated_at value exactly as provided.
2. Write concise, recruiter-credible language for the summary, strengths, issues, and optional role_fit rationale.
3. Treat the score as an advisory heuristic, never an ATS guarantee.
4. Every issue must be specific, grounded in the provided resume/evidence, and include a fix the user can apply immediately.
5. If no job description is provided, return role_fit as null.

Return JSON with this exact schema:
{
  "schema_version": "quality_v2",
  "summary": {
    "headline": "<1 sentence>",
    "verdict": "<short verdict>",
    "confidence_note": "<advisory note>"
  },
  "top_actions": [
    {
      "title": "<short title>",
      "action": "<1 sentence>",
      "priority": "high|medium|low"
    }
  ],
  "generated_at": "<locked value>",
  "overall_score": <locked integer>,
  "score_breakdown": [
    {
      "key": "keywords|impact|structure|clarity|completeness",
      "label": "<locked label>",
      "score": <locked integer>
    }
  ],
  "strengths": ["<3-5 concise strengths>"],
  "issues": [
    {
      "id": "<slug-like id>",
      "severity": "high|medium|low",
      "category": "keywords|impact|structure|clarity|completeness",
      "title": "<short title>",
      "why_it_matters": "<why this hurts the resume>",
      "evidence": "<evidence from the resume or prepass>",
      "fix": "<specific fix>"
    }
  ],
  "evidence": {
    "detected_sections": ["<locked strings>"],
    "detected_skills": ["<locked strings>"],
    "matched_keywords": ["<locked strings>"],
    "missing_keywords": ["<locked strings>"],
    "quantified_bullets": <locked integer>
  },
  "role_fit": {
    "target_role_label": "<job title or role label>",
    "fit_score": <0-100>,
    "rationale": "<2-3 sentences>"
  } | null
}"""

    user_parts = [
        "## Locked payload",
        json.dumps(locked_payload, indent=2),
        "\n## Prepass evidence",
        json.dumps(prepass_evidence, indent=2),
        f"\n## Resume\n{resume_text}",
    ]
    if job_description:
        user_parts.append(f"\n## Target Job Description\n{job_description}")
    else:
        user_parts.append("\n## Target Job Description\nNone provided.")

    return system, "\n".join(user_parts)
