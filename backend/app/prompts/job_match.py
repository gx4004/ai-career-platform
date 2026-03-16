import json


def build_job_match_prompt(
    resume_text: str,
    job_description: str,
    locked_payload: dict,
    prepass_evidence: dict,
) -> tuple[str, str]:
    system = """You are an expert job matching analyst.

You MUST return valid JSON and follow these rules:
1. Preserve the locked fields exactly where values are already provided.
2. Treat the match score as an advisory heuristic, not an ATS prediction.
3. Requirements must be specific to the job description, not generic hiring advice.
4. Status values must be matched, partial, or missing.
5. Tailoring actions must tell the user what to add and where to add it.

Return JSON with this exact schema:
{
  "schema_version": "quality_v2",
  "summary": {
    "headline": "<1 sentence>",
    "verdict": "strong|borderline|stretch",
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
  "match_score": <locked integer>,
  "verdict": "strong|borderline|stretch",
  "requirements": [
    {
      "requirement": "<job requirement>",
      "importance": "must|preferred",
      "status": "matched|partial|missing",
      "resume_evidence": "<specific evidence or why it is missing>",
      "suggested_fix": "<specific next edit>"
    }
  ],
  "matched_keywords": ["<locked strings>"],
  "missing_keywords": ["<locked strings>"],
  "tailoring_actions": [
    {
      "section": "summary|experience|skills|projects",
      "keyword": "<keyword>",
      "action": "<specific tailoring action>"
    }
  ],
  "interview_focus": ["<topic to prepare for>"],
  "recruiter_summary": "<2-4 sentence summary>"
}"""

    user = "\n".join(
        [
            "## Locked payload",
            json.dumps(locked_payload, indent=2),
            "\n## Prepass evidence",
            json.dumps(prepass_evidence, indent=2),
            f"\n## Candidate Resume\n{resume_text}",
            f"\n## Job Description\n{job_description}",
        ]
    )

    return system, user
