"""LLM_PROVIDER=fake — each caller's real service normalization/validation.

These tests set ``settings.LLM_PROVIDER = "fake"`` and call the actual
`app/services/*.py` entry point (not `fake_llm` directly), so a bug in either
the fixture's shape or a marker mismatch shows up as a real normalization
failure or a degraded result, exactly like it would for an operator running
the app locally.

"Non-degraded" is asserted concretely per caller (see each test), not just
"didn't raise": several of these services (Resume, Job Match, CV Quality)
have a silent heuristic/degraded fallback that also returns 200, so a bare
"no exception" assertion would pass even if the fake path were broken.
"""

from __future__ import annotations

import pytest

RESUME_TEXT = (
    "Professional Summary\n"
    "Python engineer with SQL experience.\n"
    "Experience\n"
    "- Built APIs for 3 internal teams.\n"
    "- Reduced checkout latency by 30% through query caching.\n"
    "Skills\n"
    "Python, SQL, Docker\n"
    "Education\n"
    "BS Computer Science"
)
JOB_DESCRIPTION = (
    "Backend Engineer\n"
    "Need Python, SQL, APIs, and cloud deployment experience. Kubernetes is a plus."
)


@pytest.fixture(autouse=True)
def _fake_provider(monkeypatch):
    monkeypatch.setattr("app.services.ai_client.settings.LLM_PROVIDER", "fake")


# ---------------------------------------------------------------------------
# Resume Analyzer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resume_analyzer_fake_provider_is_not_degraded():
    from app.services import resume_analyzer

    result = await resume_analyzer.analyze_resume(RESUME_TEXT, JOB_DESCRIPTION)

    # The heuristic fallback (`_build_heuristic_fallback`, taken only when
    # `complete_structured` raises) always uses this exact constant. The fake
    # provider's own confidence note is deliberately worded differently, so
    # this only holds if the LLM branch actually ran.
    assert result["summary"]["confidence_note"] != resume_analyzer.CONFIDENCE_NOTE
    assert result["issues"]
    assert result["strengths"]
    assert len(result["score_breakdown"]) == 5
    assert result["role_fit"] is not None
    assert 0 <= result["role_fit"]["fit_score"] <= 100


# ---------------------------------------------------------------------------
# Job Match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_job_matcher_fake_provider_is_not_degraded():
    from app.services import job_matcher

    result = await job_matcher.match_job(RESUME_TEXT, JOB_DESCRIPTION)

    assert result["summary"]["confidence_note"] != job_matcher.CONFIDENCE_NOTE
    assert result["requirements"]
    assert result["tailoring_actions"] or result["missing_keywords"]
    assert result["recruiter_summary"]


# ---------------------------------------------------------------------------
# Cover Letter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cover_letter_fake_provider_is_not_degraded():
    from app.services import cover_letter_gen

    result = await cover_letter_gen.generate_cover_letter(
        RESUME_TEXT, JOB_DESCRIPTION, "Professional"
    )

    assert result["summary"]["confidence_note"] != cover_letter_gen.CONFIDENCE_NOTE
    assert result["full_text"]
    assert result["opening"]["text"]
    assert result["body_points"]
    assert result["closing"]["text"]


# ---------------------------------------------------------------------------
# Interview Q&A
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_interview_questions_fake_provider_is_not_degraded():
    from app.services import interview_gen

    result = await interview_gen.generate_interview_questions(RESUME_TEXT, JOB_DESCRIPTION, 7)

    assert result["summary"]["confidence_note"] != interview_gen.CONFIDENCE_NOTE
    # `count = max(3, min(num_questions or 5, 12))` — exactly the requested count.
    assert len(result["questions"]) == 7
    for question in result["questions"]:
        assert question["question"]
        assert question["answer"]


@pytest.mark.asyncio
async def test_interview_practice_feedback_fake_provider_is_not_degraded():
    from app.services import interview_gen

    result = await interview_gen.evaluate_practice_answer(
        "Tell me about a time you improved performance.",
        "I profiled the checkout path and cut latency by 30% by caching a hot query.",
    )

    assert result["is_empty_answer"] is False
    assert result["strengths"]
    assert result["overall_feedback"] != "Review your answer and refine with specific examples."


@pytest.mark.asyncio
async def test_interview_practice_feedback_empty_answer_still_goes_through_fake_provider():
    from app.services import interview_gen

    result = await interview_gen.evaluate_practice_answer(
        "Tell me about a time you improved performance.", ""
    )

    assert result["is_empty_answer"] is True
    assert result["suggestions"]


# ---------------------------------------------------------------------------
# Career Path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_career_recommender_fake_provider_is_not_degraded():
    from app.services import career_recommender

    result = await career_recommender.recommend_career(RESUME_TEXT, "Staff Backend Engineer")

    assert result["summary"]["confidence_note"] != career_recommender.CONFIDENCE_NOTE
    assert result["paths"]
    assert result["recommended_direction"]["role_title"]
    assert result["skill_gaps"]
    assert result["next_steps"]


# ---------------------------------------------------------------------------
# Portfolio Planner
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_portfolio_planner_fake_provider_is_not_degraded():
    from app.services import portfolio_planner

    result = await portfolio_planner.recommend_portfolio(RESUME_TEXT, "Backend Engineer")

    assert result["summary"]["confidence_note"] != portfolio_planner.CONFIDENCE_NOTE
    assert result["projects"]
    assert result["recommended_start_project"]
    assert result["presentation_tips"]


# ---------------------------------------------------------------------------
# CV Studio: Tailoring, Quality, Evidence Import, Application Packets
# ---------------------------------------------------------------------------

_CV_SECTIONS = [
    {
        "id": "sec-exp",
        "kind": "experience",
        "title": "Experience",
        "visible": True,
        "position": 0,
        "entries": [
            {"id": "e1", "evidence_item_id": None, "body": "Built APIs for 3 internal teams.", "position": 0},
        ],
    },
    {
        "id": "sec-skills",
        "kind": "skills",
        "title": "Skills",
        "visible": True,
        "position": 1,
        "entries": [
            {"id": "e2", "evidence_item_id": None, "body": "Python, SQL, Docker", "position": 0},
        ],
    },
]


@pytest.mark.asyncio
async def test_cv_tailoring_fake_provider_is_not_degraded():
    from app.services import cv_tailoring

    result = await cv_tailoring.generate_cv_tailoring(
        RESUME_TEXT,
        sections=_CV_SECTIONS,
        job_description=JOB_DESCRIPTION,
        job_title="Backend Engineer",
    )

    # `generate_cv_tailoring` raises ValueError if a proposed change fails the
    # cited-quote/trust check, so a non-empty, successfully returned list here
    # already proves the fake fixture cited real entry text verbatim.
    assert result["changes"]
    entries_by_id = {entry["id"]: entry for section in _CV_SECTIONS for entry in section["entries"]}
    for change in result["changes"]:
        assert change["before"] == entries_by_id[change["entry_id"]]["body"]
        assert change["after"] != change["before"]


@pytest.mark.asyncio
async def test_cv_quality_fake_provider_is_not_degraded():
    from app.services import cv_quality

    result = await cv_quality.analyze_cv_quality(RESUME_TEXT, sections=_CV_SECTIONS)

    # `analyze_cv_quality` falls back to `scoring_mode: "heuristic"` whenever
    # `complete_structured` raises or the model omits a dimension score.
    assert result["scoring_mode"] == "blended"
    assert {item["key"] for item in result["dimensions"]} == {
        "impact",
        "clarity",
        "completeness",
        "structure",
    }


@pytest.mark.asyncio
async def test_evidence_import_fake_provider_is_not_degraded():
    from app.services import evidence_import

    proposals = await evidence_import.generate_import_proposals(RESUME_TEXT)

    # `generate_import_proposals` degrades to `[]` on any LLM failure.
    assert proposals
    for proposal in proposals:
        assert proposal.content


@pytest.mark.asyncio
async def test_application_packets_compose_materials_fake_provider_is_not_degraded():
    from app.services import application_packets

    result = await application_packets.compose_packet_materials(
        resume_text=RESUME_TEXT,
        job_description=JOB_DESCRIPTION,
        listing_title="Backend Engineer",
        company="Acme",
    )

    assert result["cover_letter"] is not None
    assert result["cover_letter"]["body"]
    assert result["screening_answers"]
    # Both fixture questions are generic ("why are you a fit" / "relevant
    # experience") and must not trip the never-draft stop-question classifier.
    assert result["unresolved_questions"] == []


# ---------------------------------------------------------------------------
# Dispatch registry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fake_provider_raises_for_an_unrecognized_prompt():
    from app.services.fake_llm import fake_complete_structured

    with pytest.raises(ValueError, match="no registered fixture"):
        await fake_complete_structured("An entirely unrelated system prompt.", "user prompt")
