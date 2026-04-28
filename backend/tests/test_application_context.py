"""Unit tests for application_context.py — the cross-tool handoff builder."""

from app.services.application_context import build_application_handoff

RESUME = (
    "Professional Summary\n"
    "Python engineer with 5 years of SQL experience.\n"
    "Experience\n"
    "- Built APIs for 3 internal teams reducing latency by 40%.\n"
    "- Owned migration of legacy service to FastAPI.\n"
    "Skills\n"
    "Python, SQL, FastAPI, Docker\n"
    "Education\n"
    "BS Computer Science"
)

JOB_DESC = (
    "Backend Engineer\n"
    "Need Python, SQL, APIs, Kubernetes, and cloud deployment experience."
)


# ---------- empty inputs (fallback paths) ----------

def test_empty_resume_analysis_and_job_match():
    result = build_application_handoff(RESUME, JOB_DESC)

    assert result["role_label"]
    assert isinstance(result["matched_keywords"], list)
    assert isinstance(result["missing_keywords"], list)
    assert isinstance(result["requirements"], list)
    assert isinstance(result["tailoring_actions"], list)
    assert isinstance(result["resume_strengths"], list)
    assert isinstance(result["resume_gaps"], list)
    assert result["recruiter_summary"]
    assert result["prepass_evidence"]


def test_none_resume_analysis_and_job_match():
    result = build_application_handoff(RESUME, JOB_DESC, None, None)
    assert result["matched_keywords"]
    assert result["missing_keywords"]


# ---------- with real data ----------

def test_with_full_resume_analysis():
    resume_analysis = {
        "strengths": ["Strong Python skills", "Clear structure"],
        "issues": [
            {
                "title": "Missing metrics",
                "severity": "high",
                "why_it_matters": "Numbers improve credibility.",
                "fix": "Add numbers.",
            }
        ],
        "role_fit": {
            "target_role_label": "Senior Backend Engineer",
            "fit_score": 72,
        },
        "evidence": {
            "quantified_bullets": 3,
        },
    }
    job_match = {
        "requirements": [
            {
                "requirement": "Python",
                "importance": "must",
                "status": "matched",
                "resume_evidence": "Python listed.",
                "suggested_fix": "Keep visible.",
            },
            {
                "requirement": "Kubernetes",
                "importance": "preferred",
                "status": "missing",
                "resume_evidence": "None found.",
                "suggested_fix": "Add k8s example.",
            },
        ],
        "tailoring_actions": [
            {
                "section": "experience",
                "keyword": "Kubernetes",
                "action": "Add deployment ownership.",
            }
        ],
        "interview_focus": ["System design"],
        "matched_keywords": ["Python", "SQL"],
        "missing_keywords": ["Kubernetes"],
        "recruiter_summary": "Good fit with infra gap.",
    }

    result = build_application_handoff(RESUME, JOB_DESC, resume_analysis, job_match)

    assert result["role_label"] == "Senior Backend Engineer"
    assert "Python" in result["matched_keywords"]
    assert "Kubernetes" in result["missing_keywords"]
    assert len(result["requirements"]) >= 1
    assert result["tailoring_actions"][0]["keyword"] == "Kubernetes"
    assert result["resume_strengths"] == ["Strong Python skills", "Clear structure"]
    assert result["resume_gaps"][0]["title"] == "Missing metrics"
    assert result["quantified_bullets"] == 3
    assert result["recruiter_summary"] == "Good fit with infra gap."


# ---------- keyword deduplication ----------

def test_keyword_deduplication():
    job_match = {
        "matched_keywords": ["Python", "python", "SQL"],
        "missing_keywords": ["Kubernetes", "kubernetes"],
    }
    result = build_application_handoff(RESUME, JOB_DESC, {}, job_match)

    lowered_matched = [k.lower() for k in result["matched_keywords"]]
    assert len(lowered_matched) == len(set(lowered_matched)), "Duplicate matched keywords"

    lowered_missing = [k.lower() for k in result["missing_keywords"]]
    assert len(lowered_missing) == len(set(lowered_missing)), "Duplicate missing keywords"


# ---------- normalization edge cases ----------

def test_requirements_invalid_importance_filtered():
    job_match = {
        "requirements": [
            {
                "requirement": "Python",
                "importance": "critical",  # invalid — should be filtered
                "status": "matched",
                "resume_evidence": "Yes.",
                "suggested_fix": "Keep.",
            }
        ],
    }
    result = build_application_handoff(RESUME, JOB_DESC, {}, job_match)
    # The invalid card gets filtered; fallback cards are generated instead
    assert isinstance(result["requirements"], list)
    assert len(result["requirements"]) >= 1


def test_tailoring_actions_invalid_section_normalised():
    job_match = {
        "tailoring_actions": [
            {
                "section": "header",  # invalid — normalised to "experience"
                "keyword": "Python",
                "action": "Do something.",
            }
        ],
    }
    result = build_application_handoff(RESUME, JOB_DESC, {}, job_match)
    assert result["tailoring_actions"][0]["section"] == "experience"


def test_strengths_capped_at_four():
    resume_analysis = {
        "strengths": ["A", "B", "C", "D", "E", "F"],
    }
    result = build_application_handoff(RESUME, JOB_DESC, resume_analysis, {})
    assert len(result["resume_strengths"]) <= 4


def test_gaps_capped_at_four():
    resume_analysis = {
        "issues": [
            {"title": f"Issue {i}", "severity": "medium", "why_it_matters": "m", "fix": "f"}
            for i in range(6)
        ],
    }
    result = build_application_handoff(RESUME, JOB_DESC, resume_analysis, {})
    assert len(result["resume_gaps"]) <= 4
