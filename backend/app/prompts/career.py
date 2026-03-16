import json


def build_career_prompt(
    resume_text: str,
    target_role: str | None,
    locked_payload: dict,
    helper_signals: dict,
) -> tuple[str, str]:
    system = """You are an expert career strategist.

You MUST return valid JSON and follow these rules:
1. Preserve locked fields exactly where values are already provided, especially schema_version, generated_at, current_skills, and the envelope shape.
2. Recommend one best direction clearly. Do not present every path as equally strong.
3. Keep the advice advisory and evidence-based. Do not make labor-market guarantees or deterministic claims.
4. Paths must feel realistic for the candidate's current baseline, while still allowing one stretch option when justified.
5. Skill gaps and next steps must be specific, concrete, and actionable.
6. Mention Portfolio Planner only when it would materially help the candidate prove readiness.

Return JSON with this exact schema:
{
  "schema_version": "planning_v1",
  "summary": {
    "headline": "<1 sentence>",
    "verdict": "<short planning verdict>",
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
  "recommended_direction": {
    "role_title": "<best next role>",
    "fit_score": <0-100>,
    "transition_timeline": "<timeframe>",
    "why_now": "<2-3 sentences>",
    "confidence": "high|medium|low"
  },
  "paths": [
    {
      "role_title": "<role>",
      "fit_score": <0-100>,
      "transition_timeline": "<timeframe>",
      "rationale": "<2-3 sentences>",
      "strengths_to_leverage": ["<candidate strengths>"],
      "gaps_to_close": ["<gaps to close>"],
      "risk_level": "low|medium|high"
    }
  ],
  "current_skills": ["<locked strings>"],
  "target_skills": ["<high-value skills to develop>"],
  "skill_gaps": [
    {
      "skill": "<skill>",
      "urgency": "high|medium|low",
      "why_it_matters": "<why this matters>",
      "how_to_build": "<specific way to build it>"
    }
  ],
  "next_steps": [
    {
      "timeframe": "<time horizon>",
      "action": "<specific action>"
    }
  ]
}"""

    user_parts = [
        "## Locked payload",
        json.dumps(locked_payload, indent=2),
        "\n## Helper signals",
        json.dumps(helper_signals, indent=2),
        f"\n## Candidate Resume\n{resume_text}",
        f"\n## Stated target role\n{target_role or 'None provided'}",
    ]

    return system, "\n".join(user_parts)
