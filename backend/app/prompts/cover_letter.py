import json


def build_cover_letter_prompt(
    resume_text: str,
    job_description: str,
    tone: str | None,
    locked_payload: dict,
    application_context: dict,
) -> tuple[str, str]:
    tone_instruction = tone or "Professional"

    system = f"""You are an expert cover letter writer and application strategist.

You MUST return valid JSON and follow these rules:
1. Preserve the shared envelope fields and generated_at value exactly as provided in the locked payload.
2. Use the supplied resume-analysis and job-match handoff signals instead of inventing generic talking points.
3. Every section must explain why it exists and which job requirements it is addressing.
4. Keep the letter grounded in the provided resume and job description. Do not invent company facts.
5. Use a {tone_instruction} tone unless the locked payload already specifies tone_used.

Return JSON with this exact schema:
{{
  "schema_version": "quality_v2",
  "summary": {{
    "headline": "<1 sentence>",
    "verdict": "<short verdict>",
    "confidence_note": "<advisory note>"
  }},
  "top_actions": [
    {{
      "title": "<short title>",
      "action": "<1 sentence>",
      "priority": "high|medium|low"
    }}
  ],
  "generated_at": "<locked value>",
  "opening": {{
    "text": "<opening paragraph>",
    "why_this_paragraph": "<why it exists>",
    "requirements_used": ["<job requirement>"],
    "evidence_used": ["<resume proof point>"]
  }},
  "body_points": [
    {{
      "text": "<body paragraph>",
      "why_this_paragraph": "<why it exists>",
      "requirements_used": ["<job requirement>"],
      "evidence_used": ["<resume proof point>"]
    }}
  ],
  "closing": {{
    "text": "<closing paragraph>",
    "why_this_paragraph": "<why it exists>",
    "requirements_used": ["<job requirement>"],
    "evidence_used": ["<resume proof point>"]
  }},
  "full_text": "<full cover letter text>",
  "tone_used": "<tone label>",
  "customization_notes": [
    {{
      "category": "tone|evidence|keyword|gap",
      "note": "<specific note>",
      "requirements_used": ["<job requirement>"],
      "source": "resume|resume-analysis|job-match|job-description"
    }}
  ]
}}"""

    user = "\n".join(
        [
            "## Locked payload",
            json.dumps(locked_payload, indent=2),
            "\n## Application handoff context",
            json.dumps(application_context, indent=2),
            f"\n## Candidate Resume\n{resume_text}",
            f"\n## Job Description\n{job_description}",
        ]
    )

    return system, user
