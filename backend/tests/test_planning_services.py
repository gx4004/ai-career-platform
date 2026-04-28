import pytest

from app.services.career_recommender import recommend_career
from app.services.portfolio_planner import recommend_portfolio


@pytest.mark.asyncio
async def test_career_recommendation_for_career_changer_into_new_discipline(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {
            "recommended_direction": {
                "role_title": "Data Analyst",
                "fit_score": 66,
                "transition_timeline": "6-12 months",
                "why_now": "The communication and reporting baseline transfers well.",
                "confidence": "medium",
            },
            "paths": [
                {
                    "role_title": "Data Analyst",
                    "fit_score": 66,
                    "transition_timeline": "6-12 months",
                    "rationale": "This is the cleanest adjacent change with explicit analysis proof to build.",
                    "strengths_to_leverage": ["Communication", "Analytics"],
                    "gaps_to_close": ["SQL", "Data Storytelling"],
                    "risk_level": "medium",
                }
            ],
            "skill_gaps": [
                {
                    "skill": "SQL",
                    "urgency": "high",
                    "why_it_matters": "Analyst hiring managers expect direct evidence here.",
                    "how_to_build": "Publish one analysis that uses SQL to answer a business question.",
                }
            ],
        }

    monkeypatch.setattr("app.services.career_recommender.complete_structured", fake_complete)

    result = await recommend_career(
        "Summary\nCustomer success lead with reporting and stakeholder communication experience.\nExperience\n- Managed enterprise renewals and quarterly business reviews.\nSkills\nCommunication, Leadership, Analytics",
        "Data Analyst",
    )

    assert result["recommended_direction"]["role_title"] == "Data Analyst"
    assert any(path["role_title"] == "Data Analyst" for path in result["paths"])
    assert result["skill_gaps"][0]["urgency"] == "high"
    assert result["top_actions"]


@pytest.mark.asyncio
async def test_career_recommendation_for_same_discipline_growth_keeps_senior_track(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {}

    monkeypatch.setattr("app.services.career_recommender.complete_structured", fake_complete)

    result = await recommend_career(
        "Summary\nBackend engineer with 7 years of Python and cloud experience.\nExperience\n- Improved API reliability by 30%.\n- Led migration of 4 services to containers.\nSkills\nPython, SQL, APIs, AWS, Docker, Leadership",
        "Senior Backend Engineer",
    )

    assert result["recommended_direction"]["role_title"] in {
        "Senior Backend Engineer",
        "Staff Backend Engineer",
    }
    assert result["paths"]
    assert result["next_steps"]


@pytest.mark.asyncio
async def test_career_passes_feedback_to_prompt_builder(monkeypatch):
    """Pin the regen feedback wiring: previously the router accepted feedback,
    tool_pipeline sanitized it, then the service silently dropped it because
    the prompt builder kwarg was never threaded through."""
    captured: dict[str, object] = {}

    def fake_build_prompt(*_args, feedback=None, **_kwargs):
        captured["feedback"] = feedback
        return ("system", "user")

    async def fake_complete(*_args, **_kwargs):
        return {}

    monkeypatch.setattr("app.services.career_recommender.build_career_prompt", fake_build_prompt)
    monkeypatch.setattr("app.services.career_recommender.complete_structured", fake_complete)

    await recommend_career(
        "Summary\nBackend engineer with 5 years of Python experience.\nExperience\n- Shipped APIs.\nSkills\nPython, SQL",
        "Senior Backend Engineer",
        feedback="Push more leadership-focused options and skip the platform track.",
    )

    assert captured["feedback"] == "Push more leadership-focused options and skip the platform track."


@pytest.mark.asyncio
async def test_career_recommendation_with_sparse_resume_has_fallback_structure(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {}

    monkeypatch.setattr("app.services.career_recommender.complete_structured", fake_complete)

    result = await recommend_career(
        "Worked on software projects.\nTeam player.",
        None,
    )

    assert result["summary"]["headline"]
    assert result["recommended_direction"]["role_title"]
    assert result["paths"]
    assert result["skill_gaps"]
    assert result["top_actions"]


@pytest.mark.asyncio
async def test_portfolio_planning_for_strong_resume_with_clear_target_role(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {
            "recommended_start_project": "Operational Intake Service",
            "sequence_plan": [
                {
                    "order": 1,
                    "project_title": "Operational Intake Service",
                    "reason": "This gives the fastest backend proof signal.",
                }
            ],
        }

    monkeypatch.setattr("app.services.portfolio_planner.complete_structured", fake_complete)

    result = await recommend_portfolio(
        "Summary\nBackend engineer with Python, SQL, and AWS experience.\nExperience\n- Built APIs and improved reliability.\nSkills\nPython, SQL, APIs, AWS, Docker",
        "Backend Engineer",
    )

    assert result["target_role"] == "Backend Engineer"
    assert result["recommended_start_project"] == "Operational Intake Service"
    assert result["portfolio_strategy"]["headline"]
    assert result["projects"]
    assert result["presentation_tips"]


@pytest.mark.asyncio
async def test_portfolio_planning_accepts_prefilled_career_direction_like_any_direct_target_role(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {}

    monkeypatch.setattr("app.services.portfolio_planner.complete_structured", fake_complete)

    prefilled_target_role = "Platform Engineer"
    result = await recommend_portfolio(
        "Summary\nBackend engineer with Python and cloud deployment experience.\nExperience\n- Built services and improved deployment reliability.\nSkills\nPython, APIs, AWS, Docker, CI/CD",
        prefilled_target_role,
    )

    assert result["target_role"] == prefilled_target_role
    assert result["recommended_start_project"]
    assert {item["order"] for item in result["sequence_plan"]} == {1, 2, 3}
