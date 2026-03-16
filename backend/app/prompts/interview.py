import json


def build_interview_prompt(
    resume_text: str,
    job_description: str,
    num_questions: int,
    locked_payload: dict,
    application_context: dict,
) -> tuple[str, str]:
    system = f"""You are an expert interview coach and hiring manager.

You MUST return valid JSON and follow these rules:
1. Preserve the shared envelope fields and generated_at value exactly as provided in the locked payload.
2. Use the supplied resume-analysis and job-match handoff signals to choose priorities, especially weak signals and interview focus.
3. Generate exactly {num_questions} questions.
4. Questions marked practice_first=true should focus on weaker or missing evidence.
5. Every answer must stay grounded in the resume and job description. Do not invent experience.

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
  "questions": [
    {{
      "question": "<interview question>",
      "answer": "<sample answer grounded in the resume>",
      "key_points": ["<key point>"],
      "answer_structure": ["<step>"],
      "follow_up_questions": ["<follow-up question>"],
      "focus_area": "<focus area label>",
      "why_asked": "<why an interviewer would ask this>",
      "practice_first": true
    }}
  ],
  "focus_areas": [
    {{
      "title": "<focus area>",
      "reason": "<why it matters>",
      "requirements_used": ["<job requirement>"],
      "practice_first": true
    }}
  ],
  "weak_signals_to_prepare": [
    {{
      "title": "<weak signal>",
      "severity": "high|medium|low",
      "why_it_matters": "<why it matters>",
      "prep_action": "<specific prep action>",
      "related_requirements": ["<job requirement>"]
    }}
  ],
  "interviewer_notes": ["<note>"]
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
