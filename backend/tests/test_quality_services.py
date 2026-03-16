import pytest

from app.services.cover_letter_gen import generate_cover_letter
from app.services.interview_gen import generate_interview_questions
from app.services.job_matcher import match_job
from app.services.resume_analyzer import analyze_resume


@pytest.mark.asyncio
async def test_resume_analysis_without_job_description_returns_no_role_fit(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {
            "summary": {"headline": "Needs stronger evidence."},
            "strengths": ["Shows core technical experience."],
        }

    monkeypatch.setattr("app.services.resume_analyzer.complete_structured", fake_complete)

    result = await analyze_resume(
        "Summary\nBackend developer with Python experience.\nExperience\n- Built internal APIs.\nSkills\nPython\nEducation\nBS degree",
        None,
    )

    assert result["role_fit"] is None
    assert result["issues"]
    assert len(result["score_breakdown"]) == 5


@pytest.mark.asyncio
async def test_resume_analysis_for_sparse_resume_surfaces_impact_issue(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {"strengths": ["Clear role title."]}

    monkeypatch.setattr("app.services.resume_analyzer.complete_structured", fake_complete)

    result = await analyze_resume(
        "Summary\nSoftware engineer\nExperience\nWorked on backend systems.",
        "Backend Engineer\nNeed Python, SQL, APIs, and cloud deployment experience.",
    )

    assert any(issue["category"] == "impact" for issue in result["issues"])
    assert result["evidence"]["quantified_bullets"] == 0
    assert result["top_actions"]


@pytest.mark.asyncio
async def test_resume_analysis_for_strong_aligned_resume_has_role_fit(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {
            "summary": {"headline": "Strong foundation for the target role."},
            "strengths": ["Uses concrete backend evidence."],
            "role_fit": {
                "target_role_label": "Senior Backend Engineer",
                "fit_score": 88,
                "rationale": "Relevant API and cloud experience is easy to spot.",
            },
        }

    monkeypatch.setattr("app.services.resume_analyzer.complete_structured", fake_complete)

    result = await analyze_resume(
        "Summary\nSenior backend engineer with Python and cloud experience.\nExperience\n- Improved API latency by 35% across 4 services.\n- Reduced deployment failures by 22% with CI/CD automation.\nSkills\nPython, SQL, FastAPI, AWS, Docker\nEducation\nBS Computer Science",
        "Senior Backend Engineer\nNeed Python, SQL, APIs, AWS, Docker, and CI/CD experience.",
    )

    assert result["overall_score"] >= 70
    assert result["role_fit"] is not None
    assert result["evidence"]["matched_keywords"]


@pytest.mark.asyncio
async def test_job_match_for_career_changer_can_return_borderline_or_stretch(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {
            "requirements": [
                {
                    "requirement": "SQL",
                    "importance": "must",
                    "status": "partial",
                    "resume_evidence": "The resume shows analytics tooling but not direct SQL ownership.",
                    "suggested_fix": "Add one example where SQL drove analysis or reporting.",
                }
            ],
            "tailoring_actions": [
                {
                    "section": "projects",
                    "keyword": "SQL",
                    "action": "Add a project that shows hands-on SQL work and outcomes.",
                }
            ],
            "interview_focus": ["How your prior experience transfers to SQL-heavy work."],
            "recruiter_summary": "Transferable strengths are present, but direct evidence is still thin.",
        }

    monkeypatch.setattr("app.services.job_matcher.complete_structured", fake_complete)

    result = await match_job(
        "Summary\nCustomer success lead moving toward analytics.\nExperience\n- Managed enterprise clients and reporting workflows.\nSkills\nCommunication, Leadership, Analytics",
        "Data Analyst\nNeed SQL, dashboards, data analysis, and stakeholder communication.",
    )

    assert result["verdict"] in {"borderline", "stretch"}
    assert result["requirements"][0]["status"] == "partial"
    assert result["tailoring_actions"]


@pytest.mark.asyncio
async def test_job_match_for_aligned_resume_surfaces_missing_keyword_focus(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {
            "requirements": [
                {
                    "requirement": "Kubernetes",
                    "importance": "preferred",
                    "status": "missing",
                    "resume_evidence": "No Kubernetes example appears in the resume.",
                    "suggested_fix": "Add container orchestration experience from production or side projects.",
                }
            ],
            "interview_focus": ["How you would approach container orchestration in production."],
            "recruiter_summary": "Strong backend baseline with one infrastructure gap to close.",
        }

    monkeypatch.setattr("app.services.job_matcher.complete_structured", fake_complete)

    result = await match_job(
        "Summary\nBackend engineer building Python APIs.\nExperience\n- Built FastAPI services and improved reliability by 28%.\nSkills\nPython, SQL, FastAPI, Docker, AWS",
        "Backend Engineer\nNeed Python, SQL, FastAPI, Docker, AWS, and Kubernetes experience.",
    )

    assert "Kubernetes" in result["missing_keywords"]
    assert result["top_actions"]
    assert result["recruiter_summary"]


@pytest.mark.asyncio
async def test_cover_letter_uses_handoff_signals_for_notes_and_actions(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {}

    monkeypatch.setattr("app.services.cover_letter_gen.complete_structured", fake_complete)

    result = await generate_cover_letter(
        "Summary\nBackend engineer with Python and cloud delivery experience.\nExperience\n- Improved API latency by 31%.\nSkills\nPython, SQL, AWS, Docker",
        "Backend Engineer\nNeed Python, SQL, Kubernetes, AWS, and CI/CD experience.",
        "Warm",
        {
            "issues": [
                {
                    "title": "The strongest claims need more measurable evidence",
                    "severity": "medium",
                    "why_it_matters": "Numbers improve trust.",
                    "fix": "Bring one stronger metric into the lead paragraph.",
                }
            ]
        },
        {
            "missing_keywords": ["Kubernetes", "CI/CD"],
            "tailoring_actions": [
                {
                    "section": "experience",
                    "keyword": "Kubernetes",
                    "action": "Connect a deployment story to orchestration ownership.",
                }
            ],
        },
    )

    assert result["schema_version"] == "quality_v2"
    assert result["opening"]["requirements_used"]
    assert result["body_points"]
    assert any(
        "Kubernetes" in note["note"] or "Kubernetes" in note["requirements_used"]
        for note in result["customization_notes"]
    )
    assert result["top_actions"]


@pytest.mark.asyncio
async def test_interview_handoff_surfaces_weak_signals_and_gap_first_questions(monkeypatch):
    async def fake_complete(*_args, **_kwargs):
        return {
            "questions": [
                {
                    "question": "How would you talk about Kubernetes readiness?",
                    "answer": "I would connect adjacent deployment experience to concrete orchestration decisions.",
                    "key_points": ["Deployment ownership"],
                }
            ]
        }

    monkeypatch.setattr("app.services.interview_gen.complete_structured", fake_complete)

    result = await generate_interview_questions(
        "Summary\nBackend engineer.\nExperience\n- Built Python services.\nSkills\nPython, SQL, AWS",
        "Backend Engineer\nNeed Python, SQL, AWS, Kubernetes, and CI/CD experience.",
        4,
        None,
        {
            "requirements": [
                {
                    "requirement": "Kubernetes",
                    "importance": "must",
                    "status": "missing",
                    "resume_evidence": "No orchestration example appears in the resume.",
                    "suggested_fix": "Prepare a side-project or adjacent deployment example.",
                }
            ],
            "interview_focus": ["Kubernetes", "Deployment trade-offs"],
        },
    )

    assert result["schema_version"] == "quality_v2"
    assert result["focus_areas"]
    assert result["weak_signals_to_prepare"]
    assert any(item["practice_first"] for item in result["questions"])
    assert result["interviewer_notes"]
