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


@pytest.mark.asyncio
async def test_cv_tailoring_fake_provider_targets_a_bullet_when_the_entry_has_bullets():
    """A bullet-bearing entry renders its bullets, not its body (#322); the
    fake fixture must cite and target the bullet, or the demo flow would
    exercise a dead code path the real model prompt also uses.
    """
    from app.services import cv_tailoring
    from app.services.cv_tailoring import read_change_field

    sections = [
        {
            "id": "sec-exp",
            "kind": "experience",
            "title": "Experience",
            "visible": True,
            "position": 0,
            "entries": [
                {
                    "id": "e1",
                    "evidence_item_id": None,
                    "body": "Senior Engineer",
                    "position": 0,
                    "heading": "Senior Engineer",
                    "bullets": ["Built APIs for 3 internal teams.", "Reduced latency by 20%."],
                }
            ],
        }
    ]
    result = await cv_tailoring.generate_cv_tailoring(
        RESUME_TEXT, sections=sections, job_description=JOB_DESCRIPTION, job_title="Backend Engineer"
    )
    assert result["changes"]
    change = result["changes"][0]
    assert change["field"] == "bullets[0]"
    entry = sections[0]["entries"][0]
    assert change["before"] == read_change_field(entry, change["field"]) == entry["bullets"][0]


@pytest.mark.asyncio
async def test_evidence_import_fake_provider_is_not_degraded():
    from app.services import evidence_import

    proposals = await evidence_import.extract_resume_evidence(RESUME_TEXT)

    # `extract_resume_evidence` degrades to `[]` on any LLM failure.
    assert proposals
    for proposal in proposals:
        assert proposal.content


@pytest.mark.asyncio
async def test_application_drafts_fake_provider_is_not_degraded():
    from app.services import application_drafts

    result = await application_drafts.compose_application_drafts(
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
    assert result["open_questions"] == []


# ---------------------------------------------------------------------------
# Realism: fixtures derive their output from the input (ticket B3)
#
# These run at the HTTP seam (real app + tool pipeline + fake provider). Expected
# values come from the inputs below and the documented bands, never from the
# fixture code.
# ---------------------------------------------------------------------------

BACKEND_RESUME = (
    "Jordan Rivera\n"
    "Senior Backend Engineer\n"
    "Professional Summary\n"
    "Senior backend engineer with 9 years of experience building payment APIs and platform services.\n"
    "Experience\n"
    "Senior Backend Engineer at Stripe Labs\n"
    "- Led migration of 40 services to Kubernetes, cutting deploy time by 70%.\n"
    "- Designed a PostgreSQL sharding scheme that handled 12000 requests per second.\n"
    "- Mentored 5 engineers and ran the on-call rotation.\n"
    "Backend Engineer at Northwind\n"
    "- Built REST APIs in Python and FastAPI serving 3 million users.\n"
    "- Reduced checkout latency by 30% through Redis caching.\n"
    "Skills\n"
    "Python, Go, PostgreSQL, Redis, Docker, Kubernetes, AWS, FastAPI, SQL\n"
    "Education\n"
    "BS Computer Science"
)
BACKEND_JD = (
    "Staff Platform Engineer at Acme Cloud\n"
    "We need Python, Go, Kubernetes, Terraform and observability experience. "
    "You will design APIs, own reliability and mentor engineers."
)
DESIGNER_RESUME = (
    "Maya Chen\n"
    "Product Designer\n"
    "Professional Summary\n"
    "Product designer with 6 years of experience in UX research and design systems for B2B SaaS.\n"
    "Experience\n"
    "Senior Product Designer at Lumen Health\n"
    "- Built a design system adopted by 4 product teams, cutting handoff time by 35%.\n"
    "- Ran 40 user interviews and shipped an onboarding redesign that lifted activation by 18%.\n"
    "Product Designer at Paperplane\n"
    "- Designed mobile checkout flows in Figma and prototyped usability tests.\n"
    "Skills\n"
    "Figma, User Research, Prototyping, Design Systems, Accessibility\n"
    "Education\n"
    "BA Interaction Design"
)
DESIGNER_JD = (
    "Senior Product Designer at Brightside\n"
    "Own UX research, Figma prototyping, accessibility and design systems for our consumer app."
)
CHEF_RESUME = (
    "Luca Moretti\n"
    "Head Chef\n"
    "Experience\n"
    "Head Chef at Trattoria Verde\n"
    "- Ran a kitchen brigade of 12 and cut food waste by 22%.\n"
    "- Designed a seasonal tasting menu that raised average spend by 15%.\n"
    "Skills\n"
    "Menu design, Food safety, Team leadership\n"
    "Education\n"
    "Culinary diploma"
)
SOFTWARE_JD = (
    "Senior Software Engineer at Orbit\n"
    "Must have Python, Kubernetes, Terraform, React, GraphQL and PostgreSQL experience."
)

PREFIX = "/api/v1"


def _post(client, auth_headers, path: str, **body):
    response = client.post(f"{PREFIX}/{path}", json=body, headers=auth_headers)
    assert response.status_code == 200, response.text
    return response.json()


def _confirm(db, user, kind: str, content: dict, *, confirmed: bool = True):
    from app.models.evidence_item import EvidenceItem

    db.add(
        EvidenceItem(
            user_id=user.id,
            kind=kind,
            content=content,
            provenance="user-entered",
            confirmation_state="confirmed" if confirmed else "unconfirmed",
        )
    )
    db.commit()


def _resume_band(score: int) -> str:
    # Resume Analyzer bands (spec / quality bands): >=85 strong, >=70 promising, else needs evidence.
    if score >= 85:
        return "Strong foundation"
    if score >= 70:
        return "Promising but uneven"
    return "Needs stronger evidence"


def test_career_without_a_target_role_recommends_a_real_role(client, auth_headers):
    for resume in (BACKEND_RESUME, DESIGNER_RESUME):
        data = _post(client, auth_headers, "career/recommend", resume_text=resume, target_role="")
        everything = str(data).lower()
        assert "none provided" not in everything
        assert data["recommended_direction"]["role_title"].strip()
        assert data["recommended_direction"]["role_title"] in data["summary"]["headline"]


def test_career_keeps_the_stated_target_role_as_the_recommendation(client, auth_headers):
    data = _post(
        client, auth_headers, "career/recommend",
        resume_text=BACKEND_RESUME, target_role="Staff Platform Engineer",
    )
    assert data["recommended_direction"]["role_title"] == "Staff Platform Engineer"
    assert "Staff Platform Engineer" in data["summary"]["headline"]


def test_career_returns_three_to_five_distinct_directions_that_follow_the_resume(client, auth_headers):
    backend = _post(client, auth_headers, "career/recommend", resume_text=BACKEND_RESUME)
    designer = _post(client, auth_headers, "career/recommend", resume_text=DESIGNER_RESUME)
    for data in (backend, designer):
        assert 3 <= len(data["paths"]) <= 5
        scores = [path["fit_score"] for path in data["paths"]]
        assert len(set(scores)) == len(scores)
        titles = [path["role_title"] for path in data["paths"]]
        assert len(set(titles)) == len(titles)
        assert len(data["next_steps"]) >= 3
    assert {p["role_title"] for p in backend["paths"]}.isdisjoint({p["role_title"] for p in designer["paths"]})
    # The senior backend resume lists Python/FastAPI; the designer lists Figma.
    assert "Python" in str(backend["paths"]) and "Figma" not in str(backend["paths"])
    assert "Figma" in str(designer["paths"]) and "Python" not in str(designer["paths"])


def test_career_cites_confirmed_evidence_but_never_unconfirmed(client, auth_headers, db, test_user):
    _confirm(db, test_user, "achievement", {"statement": "Cut p95 latency by 41 percent across the ledger service"})
    _confirm(db, test_user, "achievement", {"statement": "Won the Zephyr hackathon grand prize"}, confirmed=False)
    data = _post(client, auth_headers, "career/recommend", resume_text=BACKEND_RESUME)
    text = str(data)
    assert "Cut p95 latency by 41 percent across the ledger service" in text
    assert "Zephyr" not in text


def test_cover_letter_names_role_company_candidate_and_quotes_the_resume(client, auth_headers):
    letter = _post(
        client, auth_headers, "cover-letter/generate",
        resume_text=BACKEND_RESUME, job_description=BACKEND_JD, tone="Professional",
    )
    text = letter["full_text"]
    assert "Staff Platform Engineer" in text
    assert "Acme Cloud" in text
    assert "Jordan Rivera" in text
    assert "70%" in text or "40 services" in text  # a real quantified bullet from the resume
    assert "Kubernetes" in text  # a skill the resume and JD share
    assert "this role" not in letter["opening"]["text"]


def test_cover_letters_differ_per_resume_and_job(client, auth_headers):
    backend = _post(client, auth_headers, "cover-letter/generate", resume_text=BACKEND_RESUME, job_description=BACKEND_JD)
    designer = _post(client, auth_headers, "cover-letter/generate", resume_text=DESIGNER_RESUME, job_description=DESIGNER_JD)
    assert "Maya Chen" in designer["full_text"] and "Brightside" in designer["full_text"]
    assert "Jordan Rivera" not in designer["full_text"] and "Maya Chen" not in backend["full_text"]
    backend_paragraphs = set(backend["full_text"].split("\n\n"))
    assert backend_paragraphs.isdisjoint(designer["full_text"].split("\n\n"))


def test_cover_letter_tone_changes_the_voice(client, auth_headers):
    professional = _post(client, auth_headers, "cover-letter/generate", resume_text=BACKEND_RESUME, job_description=BACKEND_JD, tone="Professional")
    warm = _post(client, auth_headers, "cover-letter/generate", resume_text=BACKEND_RESUME, job_description=BACKEND_JD, tone="Warm")
    assert professional["opening"]["text"] != warm["opening"]["text"]
    assert warm["tone_used"] == "Warm"


def test_cover_letter_regenerate_acts_on_the_users_feedback(client, auth_headers):
    base = _post(client, auth_headers, "cover-letter/generate", resume_text=BACKEND_RESUME, job_description=BACKEND_JD)
    shorter = _post(
        client, auth_headers, "cover-letter/generate",
        resume_text=BACKEND_RESUME, job_description=BACKEND_JD, feedback="Make it shorter and more concise.",
    )
    assert shorter["full_text"] != base["full_text"]
    assert len(shorter["full_text"]) < len(base["full_text"])
    assert any("shorter" in note["note"].lower() for note in shorter["customization_notes"])


def test_cover_letter_cites_confirmed_evidence_but_never_unconfirmed(client, auth_headers, db, test_user):
    _confirm(db, test_user, "achievement", {"statement": "Cut p95 latency by 41 percent across the ledger service"})
    _confirm(db, test_user, "achievement", {"statement": "Won the Zephyr hackathon grand prize"}, confirmed=False)
    letter = _post(client, auth_headers, "cover-letter/generate", resume_text=BACKEND_RESUME, job_description=BACKEND_JD)
    assert "Cut p95 latency by 41 percent across the ledger service" in letter["full_text"]
    assert "Zephyr" not in str(letter)


def test_interview_questions_are_distinct_grounded_and_not_all_practice_first(client, auth_headers):
    deck = _post(
        client, auth_headers, "interview/questions",
        resume_text=BACKEND_RESUME, job_description=BACKEND_JD, num_questions=8,
    )
    questions = deck["questions"]
    assert len(questions) == 8
    texts = [q["question"] for q in questions]
    assert len(set(texts)) == 8
    assert len({q["answer"] for q in questions}) == 8
    flagged = [q for q in questions if q["practice_first"]]
    assert 0 < len(flagged) < len(questions)
    # Only topics the posting asks for and the resume lacks are practice-first.
    assert all(q["focus_area"].lower() not in BACKEND_RESUME.lower() for q in flagged)
    assert any(q["focus_area"] == "Terraform" for q in flagged)
    joined = " ".join(texts + [q["answer"] for q in questions])
    assert "70%" in joined or "40 services" in joined  # quotes a real resume fact
    assert "Staff Platform Engineer" in str(deck["summary"])


def test_interview_questions_differ_across_resumes(client, auth_headers):
    backend = _post(client, auth_headers, "interview/questions", resume_text=BACKEND_RESUME, job_description=BACKEND_JD, num_questions=6)
    designer = _post(client, auth_headers, "interview/questions", resume_text=DESIGNER_RESUME, job_description=DESIGNER_JD, num_questions=6)
    assert {q["question"] for q in backend["questions"]}.isdisjoint({q["question"] for q in designer["questions"]})
    assert "Brightside" in str(designer["summary"]) or "Senior Product Designer" in str(designer["summary"])


def test_interview_questions_cite_confirmed_evidence_but_never_unconfirmed(client, auth_headers, db, test_user):
    _confirm(db, test_user, "achievement", {"statement": "Cut p95 latency by 41 percent across the ledger service"})
    _confirm(db, test_user, "achievement", {"statement": "Won the Zephyr hackathon grand prize"}, confirmed=False)
    deck = _post(client, auth_headers, "interview/questions", resume_text=BACKEND_RESUME, job_description=BACKEND_JD, num_questions=8)
    assert "Cut p95 latency by 41 percent across the ledger service" in str(deck)
    assert "Zephyr" not in str(deck)


def test_practice_feedback_depends_on_the_answer(client, auth_headers):
    question = "Tell me about a time you improved the performance of a slow service."
    strong = _post(
        client, auth_headers, "interview/practice-feedback",
        question=question,
        user_answer=(
            "Our checkout service was slow at peak. I profiled it, found one hot query, added a Redis cache "
            "and rewrote the index, which cut p95 latency by 30% and saved us two servers. I then wrote a "
            "runbook so the team could repeat the approach."
        ),
    )
    vague = _post(client, auth_headers, "interview/practice-feedback", question=question, user_answer="We made it faster as a team.")
    assert any("30%" in item for item in strong["strengths"])
    assert any("number" in item.lower() or "measur" in item.lower() for item in vague["weaknesses"])
    assert strong["overall_feedback"] != vague["overall_feedback"]
    assert any("short" in item.lower() or "detail" in item.lower() for item in vague["weaknesses"])


def test_practice_feedback_for_an_empty_answer_names_the_question_topic(client, auth_headers):
    data = _post(
        client, auth_headers, "interview/practice-feedback",
        question="Describe how you would design a rate limiter.", user_answer="",
    )
    assert data["is_empty_answer"] is True
    assert "rate limiter" in str(data).lower()


def test_portfolio_start_here_project_is_step_one_and_plan_is_foundational_to_advanced(client, auth_headers):
    rank = {"foundational": 1, "intermediate": 2, "advanced": 3}
    for resume, role in ((BACKEND_RESUME, "Staff Platform Engineer"), (DESIGNER_RESUME, "Senior Product Designer")):
        data = _post(client, auth_headers, "portfolio/recommend", resume_text=resume, target_role=role)
        plan = data["sequence_plan"]
        assert plan[0]["order"] == 1
        assert plan[0]["project_title"] == data["recommended_start_project"]
        assert data["top_actions"][0]["title"].endswith(data["recommended_start_project"])
        by_title = {p["project_title"]: p for p in data["projects"]}
        complexity = [rank[by_title[step["project_title"]]["complexity"]] for step in plan]
        assert complexity == sorted(complexity)
        assert len(data["projects"]) >= 3
        assert role in data["summary"]["headline"]
        assert len({step["reason"] for step in plan}) == len(plan)


def test_portfolio_projects_differ_per_role_and_resume(client, auth_headers):
    backend = _post(client, auth_headers, "portfolio/recommend", resume_text=BACKEND_RESUME, target_role="Staff Platform Engineer")
    designer = _post(client, auth_headers, "portfolio/recommend", resume_text=DESIGNER_RESUME, target_role="Senior Product Designer")
    assert {p["project_title"] for p in backend["projects"]}.isdisjoint({p["project_title"] for p in designer["projects"]})
    assert "End-to-End Proof Project" not in str(backend) + str(designer)
    assert "Python" in str(backend["projects"]) or "Kubernetes" in str(backend["projects"])


def test_resume_verdict_and_headline_agree_with_the_locked_score(client, auth_headers):
    seen_bands = set()
    for resume, jd in ((BACKEND_RESUME, BACKEND_JD), (DESIGNER_RESUME, DESIGNER_JD), (CHEF_RESUME, SOFTWARE_JD), (BACKEND_RESUME, None)):
        body = {"resume_text": resume}
        if jd:
            body["job_description"] = jd
        data = _post(client, auth_headers, "resume/analyze", **body)
        band = _resume_band(data["overall_score"])
        seen_bands.add(band)
        assert data["summary"]["verdict"] == band
        headline = data["summary"]["headline"].lower()
        if band == "Strong foundation":
            assert "stretch" not in headline and "needs clearer evidence" not in headline
        else:
            assert "strong foundation" not in headline and "already strong" not in headline
    assert len(seen_bands) >= 2


def test_resume_issues_quote_the_actual_resume_and_differ_per_input(client, auth_headers):
    backend = _post(client, auth_headers, "resume/analyze", resume_text=BACKEND_RESUME, job_description=BACKEND_JD)
    designer = _post(client, auth_headers, "resume/analyze", resume_text=DESIGNER_RESUME, job_description=DESIGNER_JD)
    assert {i["title"] for i in backend["issues"]} != {i["title"] for i in designer["issues"]}
    assert "Terraform" in str(backend["issues"]) + str(backend["top_actions"])
    assert "Python" in str(backend["strengths"]) or "70%" in str(backend["strengths"])
    assert "Figma" in str(designer["strengths"]) + str(designer["issues"])
    assert backend["role_fit"]["target_role_label"] == "Staff Platform Engineer"
    assert designer["role_fit"]["target_role_label"] != backend["role_fit"]["target_role_label"]
    assert "the target role" not in str(backend["role_fit"]) + str(designer["role_fit"])


def test_job_match_headline_agrees_with_score_and_verdict(client, auth_headers):
    verdicts = {}
    for resume, jd in ((DESIGNER_RESUME, DESIGNER_JD), (BACKEND_RESUME, BACKEND_JD), (CHEF_RESUME, SOFTWARE_JD)):
        data = _post(client, auth_headers, "job-match/match", resume_text=resume, job_description=jd)
        score, verdict = data["match_score"], data["verdict"]
        expected = "strong" if score >= 78 else "borderline" if score >= 55 else "stretch"
        assert verdict == expected
        assert data["summary"]["verdict"] == verdict
        headline = data["summary"]["headline"].lower()
        if verdict == "stretch":
            assert "aligns" not in headline and "already covers" not in headline
        if verdict == "strong":
            assert "stretch" not in headline
        verdicts[verdict] = data["summary"]["headline"]
    assert len(verdicts) == 3
    assert len(set(verdicts.values())) == 3


def test_job_match_output_names_the_job_and_resume_specifics(client, auth_headers):
    data = _post(client, auth_headers, "job-match/match", resume_text=BACKEND_RESUME, job_description=BACKEND_JD)
    assert "Terraform" in {m["keyword"] for m in data["missing_keywords"]}
    assert "Terraform" in str(data["tailoring_actions"])
    assert "Kubernetes" in data["recruiter_summary"] or "Python" in data["recruiter_summary"]
    assert "Staff Platform Engineer" in str(data["summary"]) + data["recruiter_summary"]


@pytest.mark.asyncio
async def test_cv_tailoring_rewrites_tie_to_the_job_and_the_cv():
    from app.services import cv_tailoring

    sections = [
        {
            "id": "sec-exp", "kind": "experience", "title": "Experience", "visible": True, "position": 0,
            "entries": [
                {"id": "e1", "evidence_item_id": None, "body": "Platform engineer", "position": 0,
                 "heading": "Platform engineer", "bullets": ["Mentored 5 engineers.", "Improved reliability across 40 services using Kubernetes operators."]},
                {"id": "e2", "evidence_item_id": None, "body": "Built REST APIs in Python serving 3 million users.", "position": 1},
            ],
        },
    ]
    result = await cv_tailoring.generate_cv_tailoring(
        BACKEND_RESUME, sections=sections, job_description=BACKEND_JD, job_title="Staff Platform Engineer"
    )
    assert result["changes"]
    by_entry = {change["entry_id"]: change for change in result["changes"]}
    # The first bullet has no posting term, so the rewrite lands on the bullet that does.
    assert by_entry["e1"]["field"] == "bullets[1]"
    assert by_entry["e1"]["after"].startswith("Using Kubernetes operators, improved reliability")
    assert by_entry["e2"]["after"] == "In Python, built REST APIs serving 3 million users."
    for change in result["changes"]:
        # No boilerplate appended to the user's own words: a rewrite only reorders.
        assert "(" not in change["after"] and "framed for" not in change["after"]
        assert change["after"] != change["before"]
        assert sorted(change["after"].lower().replace(",", "").rstrip(".").split()) == sorted(
            change["before"].lower().replace(",", "").rstrip(".").split()
        )
    requirements = [change["job_requirement"] for change in result["changes"]]
    assert len(set(requirements)) == len(requirements)
    assert any("Kubernetes" in r for r in requirements)
    assert any("Python" in r for r in requirements)


@pytest.mark.asyncio
async def test_cv_tailoring_never_appends_boilerplate_when_nothing_can_be_reordered():
    from app.services import cv_tailoring

    sections = [
        {
            "id": "sec-exp", "kind": "experience", "title": "Experience", "visible": True, "position": 0,
            "entries": [{"id": "e1", "evidence_item_id": None, "body": "Ran the kitchen.", "position": 0}],
        },
    ]
    result = await cv_tailoring.generate_cv_tailoring(
        CHEF_RESUME, sections=sections, job_description=SOFTWARE_JD, job_title="Senior Software Engineer"
    )
    for change in result["changes"]:
        assert change["after"] == change["before"]
        assert "framed for" not in change["after"] and "(" not in change["after"]
        assert "Senior Software Engineer" in change["job_requirement"]


@pytest.mark.asyncio
async def test_evidence_import_proposes_every_fact_found_and_nothing_invented():
    from app.services import evidence_import

    proposals = await evidence_import.extract_resume_evidence(BACKEND_RESUME)
    by_kind: dict[str, list[dict]] = {}
    for proposal in proposals:
        by_kind.setdefault(proposal.kind, []).append(proposal.content)
    roles = {(c.get("role"), c.get("employer")) for c in by_kind["experience"]}
    assert ("Senior Backend Engineer", "Stripe Labs") in roles
    assert ("Backend Engineer", "Northwind") in roles
    skills = {c["name"] for c in by_kind["skill"]}
    assert {"Python", "Kubernetes", "PostgreSQL"} <= skills
    statements = [c["statement"] for c in by_kind["achievement"]]
    assert any("70%" in s for s in statements) and any("30%" in s for s in statements)
    resume_lines = BACKEND_RESUME.lower()
    for content in (c for contents in by_kind.values() for c in contents):
        assert "employer named in the resume" not in str(content).lower()
    for statement in statements:
        assert statement.lower().rstrip(".") in resume_lines


@pytest.mark.asyncio
async def test_evidence_import_does_not_invent_a_role_when_the_resume_has_none():
    from app.services import evidence_import

    proposals = await evidence_import.extract_resume_evidence(RESUME_TEXT)
    assert not [p for p in proposals if p.kind == "experience"]
    assert {p.content.get("name") for p in proposals if p.kind == "skill"} >= {"Python", "SQL", "Docker"}


@pytest.mark.asyncio
async def test_application_drafts_name_the_role_and_company_and_quote_the_cv():
    from app.services import application_drafts

    backend = await application_drafts.compose_application_drafts(
        resume_text=BACKEND_RESUME, job_description=BACKEND_JD,
        listing_title="Staff Platform Engineer", company="Acme Cloud",
    )
    designer = await application_drafts.compose_application_drafts(
        resume_text=DESIGNER_RESUME, job_description=DESIGNER_JD,
        listing_title="Senior Product Designer", company="Brightside",
    )
    body = backend["cover_letter"]["body"]
    assert "Staff Platform Engineer" in body and "Acme Cloud" in body
    assert "70%" in body or "40 services" in body
    assert "Brightside" in designer["cover_letter"]["body"]
    assert backend["cover_letter"]["body"] != designer["cover_letter"]["body"]
    answers = {a["answer"] for a in backend["screening_answers"]}
    assert answers.isdisjoint({a["answer"] for a in designer["screening_answers"]})
    assert backend["open_questions"] == []


@pytest.mark.asyncio
async def test_fake_provider_is_deterministic_for_the_same_input():
    from app.prompts.career import build_career_prompt
    from app.services.fake_llm import fake_complete_structured

    system, user = build_career_prompt(BACKEND_RESUME, "", {"summary": {}}, {"discipline_label": "backend engineering", "detected_skills": ["Python"]})
    assert await fake_complete_structured(system, user) == await fake_complete_structured(system, user)


# ---------------------------------------------------------------------------
# Dispatch registry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fake_provider_raises_for_an_unrecognized_prompt():
    from app.services.fake_llm import fake_complete_structured

    with pytest.raises(ValueError, match="no registered fixture"):
        await fake_complete_structured("An entirely unrelated system prompt.", "user prompt")


PROSE_RESUME = (
    "I worked as a bookkeeper for a regional dental group for 6 years, reconciling 40 accounts every month. "
    "I trained 3 junior clerks and cut month-end close from 9 days to 5. I am comfortable with Excel and payroll."
)
PROSE_JD = "Accounts Payable Specialist at Harbor Foods\nManage invoices, reconcile accounts and support month-end close."


def test_a_prose_only_resume_reads_naturally_in_cover_letter_and_interview(client, auth_headers):
    letter = _post(
        client, auth_headers, "cover-letter/generate",
        resume_text=PROSE_RESUME, job_description=PROSE_JD, tone="Professional",
    )
    text = str(letter)
    assert 'my work included "I ' not in text
    assert "background in the core requirements" not in text
    assert "With my experience" not in text
    assert "bookkeeper" in text

    deck = _post(client, auth_headers, "interview/questions", resume_text=PROSE_RESUME, job_description=PROSE_JD, num_questions=5)
    deck_text = str(deck)
    assert "path that i " not in deck_text
    assert 'my work included "I ' not in deck_text
    assert len({q["focus_area"] for q in deck["questions"]}) >= 3
    assert deck_text.count("your strongest relevant project") <= 1


def test_a_thin_resume_without_handoff_signals_still_gets_distinct_interview_focus_areas(client, auth_headers):
    deck = _post(client, auth_headers, "interview/questions", resume_text=PROSE_RESUME, job_description=PROSE_JD, num_questions=6)
    assert len({q["focus_area"] for q in deck["questions"]}) >= 3
    assert len({q["question"] for q in deck["questions"]}) == len(deck["questions"])


@pytest.mark.asyncio
async def test_application_drafts_quote_a_prose_resume_without_garbling_it():
    from app.services import application_drafts

    drafts = await application_drafts.compose_application_drafts(
        resume_text=PROSE_RESUME, job_description=PROSE_JD,
        listing_title="Accounts Payable Specialist", company="Harbor Foods",
    )
    everything = str(drafts)
    assert 'my work included "I ' not in everything
    assert "Harbor Foods" in drafts["cover_letter"]["body"]
    assert "bookkeeper" in everything


def test_portfolio_requires_a_target_role_instead_of_writing_around_a_blank_one(client, auth_headers):
    # The Portfolio Planner builds toward a role (spec: resume + target role), so a blank role is
    # refused at the request instead of producing "Portfolio Roadmap ()" and a role-less strategy.
    response = client.post(
        "/api/v1/portfolio/recommend",
        json={"resume_text": BACKEND_RESUME, "target_role": ""},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_resume_analysis_without_a_job_description_never_refers_to_one(client, auth_headers):
    for resume in (BACKEND_RESUME, CHEF_RESUME, DESIGNER_RESUME):
        data = _post(client, auth_headers, "resume/analyze", resume_text=resume)
        summary = data["summary"]
        assert "this role" not in summary["headline"].lower()
        # Pointing the user at the missing input is fine; claiming they provided one is not.
        assert "job description you provided" not in summary["confidence_note"].lower()


def test_resume_analysis_with_a_job_description_still_names_it_in_the_note(client, auth_headers):
    data = _post(client, auth_headers, "resume/analyze", resume_text=BACKEND_RESUME, job_description=BACKEND_JD)
    assert "job description" in data["summary"]["confidence_note"].lower()
