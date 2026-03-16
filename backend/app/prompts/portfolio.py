import json


def build_portfolio_prompt(
    resume_text: str,
    target_role: str,
    locked_payload: dict,
    helper_signals: dict,
) -> tuple[str, str]:
    system = """You are an expert portfolio strategist and technical mentor.

You MUST return valid JSON and follow these rules:
1. Preserve locked fields exactly where values are already provided, especially schema_version, generated_at, target_role, and the envelope shape.
2. Recommend concrete proof-building work for the target role instead of generic practice projects.
3. Avoid vague advice like "build a dashboard" or "make a CRUD app" unless it is tied to a clear hiring signal for this role.
4. Sequence projects intentionally so the first project is the easiest strong proof move, not just the smallest idea.
5. Deliverables and hiring signals must explain what a reviewer should see and why it matters.
6. Keep the advice credible and advisory, not deterministic.

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
  "target_role": "<locked target role>",
  "portfolio_strategy": {
    "headline": "<1 sentence>",
    "focus": "<2-3 sentences>",
    "proof_goal": "<1 sentence>"
  },
  "projects": [
    {
      "project_title": "<descriptive project name>",
      "description": "<2-3 sentence description>",
      "skills": ["<skills demonstrated>"],
      "complexity": "foundational|intermediate|advanced",
      "why_this_project": "<why this is worth building>",
      "deliverables": ["<specific output>"],
      "hiring_signals": ["<what it proves to hiring teams>"],
      "estimated_timeline": "<timeframe>"
    }
  ],
  "recommended_start_project": "<single project title>",
  "sequence_plan": [
    {
      "order": <integer>,
      "project_title": "<project title>",
      "reason": "<why it belongs in this sequence slot>"
    }
  ],
  "presentation_tips": ["<tips for showing the work publicly>"]
}"""

    user = "\n".join(
        [
            "## Locked payload",
            json.dumps(locked_payload, indent=2),
            "\n## Helper signals",
            json.dumps(helper_signals, indent=2),
            f"\n## Candidate Resume\n{resume_text}",
            f"\n## Target Role\n{target_role}",
        ]
    )

    return system, user
