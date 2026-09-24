import pytest

from app.config import Settings, settings
from app.schemas.access_policy import ResultAccessDecision
from app.schemas.cv_documents import CvDocumentCreate
from app.services.cv_documents import create_document
from app.services.result_access import evaluate_result_access
from app.services.tool_runs import build_tool_response

PREFIX = "/api/v1"

FULL_CONTROL = {
    "state": "full",
    "treatment": "control",
    "reason": "policy_disabled",
    "can_export": True,
    "policy_version": "control-v1",
}

RESUME_TEXT = (
    "Professional Summary\nPython engineer with SQL experience.\n"
    "Experience\n- Built APIs for 3 internal teams.\nSkills\nPython, SQL\n"
    "Education\nBS Computer Science"
)
JOB_DESCRIPTION = (
    "Backend Engineer\nNeed Python, SQL, APIs, and cloud deployment experience."
)

# Each tool service reads only the keys it owns out of the mocked provider
# response, so one superset fixture drives all six endpoints without hiding
# which endpoint is under test.
PROVIDER_RESULT = {
    "summary": {
        "headline": "Promising resume with a few high-value fixes.",
        "verdict": "Promising but uneven",
        "confidence_note": "Directional heuristic only.",
    },
    # Resume Analyzer
    "strengths": ["Clear formatting"],
    "issues": [
        {
            "id": "impact-1",
            "severity": "high",
            "category": "impact",
            "title": "Add metrics",
            "why_it_matters": "Numbers improve credibility.",
            "evidence": "Most bullets are qualitative.",
            "fix": "Quantify 2-3 bullets.",
        }
    ],
    # Job Match
    "requirements": [
        {
            "requirement": "Python",
            "importance": "must",
            "status": "matched",
            "resume_evidence": "Python is listed in skills and experience.",
            "suggested_fix": "Keep Python visible in impact bullets.",
        }
    ],
    "tailoring_actions": [
        {
            "section": "experience",
            "keyword": "Kubernetes",
            "action": "Add deployment ownership to the strongest backend bullet.",
        }
    ],
    "interview_focus": ["Deployment trade-offs"],
    "recruiter_summary": "Good backend match with one clear infrastructure gap.",
    # Cover Letter
    "opening": {
        "text": "Dear Hiring Manager...",
        "why_this_paragraph": "It names the role and the strongest proof point.",
        "requirements_used": ["Python"],
        "evidence_used": [],
    },
    "body_points": [
        {
            "text": "I built and owned backend APIs.",
            "why_this_paragraph": "It maps directly to the must-have requirement.",
            "requirements_used": ["Python"],
            "evidence_used": [],
        }
    ],
    "closing": {
        "text": "Thank you for your consideration.",
        "why_this_paragraph": "It closes with a clear next step.",
        "requirements_used": [],
        "evidence_used": [],
    },
    "full_text": "Dear Hiring Manager...\n\nThank you for your consideration.",
    "tone_used": "Professional",
    "customization_notes": [
        {
            "category": "keyword",
            "note": "Make deployment ownership more explicit.",
            "requirements_used": ["Python"],
            "source": "job-match",
        }
    ],
    # Interview Q&A
    "questions": [
        {
            "question": "Tell me about yourself",
            "answer": "I am...",
            "key_points": ["Experience", "Skills"],
            "answer_structure": ["Situation", "Task", "Action", "Result"],
            "follow_up_questions": ["What changed because of your work?"],
            "focus_area": "Backend foundations",
            "why_asked": "To understand your fit quickly.",
            "practice_first": False,
        }
    ],
    "focus_areas": [
        {
            "title": "Backend foundations",
            "reason": "This role needs immediate backend credibility.",
            "requirements_used": ["Python", "SQL"],
            "practice_first": False,
        }
    ],
    "weak_signals_to_prepare": [
        {
            "title": "Kubernetes",
            "severity": "high",
            "why_it_matters": "No direct orchestration example is visible.",
            "prep_action": "Prepare one adjacent infrastructure example.",
            "related_requirements": ["Kubernetes"],
        }
    ],
    "interviewer_notes": ["Lead with your strongest API story."],
    # Career Path
    "recommended_direction": {
        "role_title": "Senior Backend Engineer",
        "fit_score": 81,
        "transition_timeline": "3-6 months",
        "why_now": "The resume already shows the core backend stack.",
        "confidence": "medium",
    },
    "paths": [
        {
            "role_title": "Senior Backend Engineer",
            "fit_score": 81,
            "transition_timeline": "3-6 months",
            "rationale": "This is the strongest same-discipline growth move.",
            "strengths_to_leverage": ["Python", "APIs"],
            "gaps_to_close": ["Leadership", "Observability"],
            "risk_level": "medium",
        }
    ],
    "current_skills": ["Python"],
    "target_skills": ["System Design"],
    "skill_gaps": [
        {
            "skill": "Leadership",
            "urgency": "high",
            "why_it_matters": "Senior roles need broader scope evidence.",
            "how_to_build": "Own a cross-team initiative and document the result.",
        }
    ],
    "next_steps": [
        {
            "timeframe": "Next 30 days",
            "action": "Add one proof point that shows ownership beyond implementation.",
        }
    ],
    # Portfolio Planner
    "portfolio_strategy": {
        "headline": "Build a tight backend proof set.",
        "focus": "Start with one operational service and then deepen production signals.",
        "proof_goal": "Make the backend role feel earned before interviews.",
    },
    "projects": [
        {
            "project_title": "Operational Intake Service",
            "description": "Build a production-leaning backend workflow.",
            "skills": ["FastAPI"],
            "complexity": "foundational",
            "why_this_project": "It proves core backend ownership quickly.",
            "deliverables": ["README", "Deployed service"],
            "hiring_signals": ["API design", "Testing"],
            "estimated_timeline": "2-3 weeks",
        }
    ],
    "recommended_start_project": "Operational Intake Service",
    "sequence_plan": [
        {
            "order": 1,
            "project_title": "Operational Intake Service",
            "reason": "This is the fastest credible proof move.",
        }
    ],
    "presentation_tips": ["Explain the trade-offs, not just the features."],
}

# The six tools in registry order (Resume -> Job Match -> Career Path ->
# Cover Letter -> Interview Q&A -> Portfolio).
TOOL_ENDPOINTS = [
    ("resume", "/resume/analyze", {"resume_text": RESUME_TEXT, "job_description": JOB_DESCRIPTION}),
    (
        "job-match",
        "/job-match/match",
        {"resume_text": RESUME_TEXT, "job_description": JOB_DESCRIPTION},
    ),
    ("career", "/career/recommend", {"resume_text": RESUME_TEXT}),
    (
        "cover-letter",
        "/cover-letter/generate",
        {"resume_text": RESUME_TEXT, "job_description": JOB_DESCRIPTION},
    ),
    (
        "interview",
        "/interview/questions",
        {"resume_text": RESUME_TEXT, "job_description": JOB_DESCRIPTION},
    ),
    (
        "portfolio",
        "/portfolio/recommend",
        {"resume_text": RESUME_TEXT, "target_role": "Backend Engineer"},
    ),
]
TOOL_IDS = [entry[0] for entry in TOOL_ENDPOINTS]

POLICY_STATES = [(False, "policy_disabled"), (True, "no_candidate_selected")]
POLICY_IDS = ["policy-off", "policy-on"]


def _cv_document(db, test_user):
    return create_document(
        db,
        test_user.id,
        CvDocumentCreate(
            name="Synthetic CV",
            sections=[
                {
                    "id": "summary",
                    "kind": "summary",
                    "title": "Summary",
                    "position": 0,
                    "entries": [
                        {
                            "id": "s1",
                            "evidence_item_id": None,
                            "body": "Engineer building accessible systems.",
                            "position": 0,
                        }
                    ],
                }
            ],
        ),
    )


def _denied_export(*args, **kwargs) -> ResultAccessDecision:
    """Build the one decision the shipped literal types cannot express yet.

    ``model_construct`` skips validation on purpose: widening
    ``ResultAccessDecision.can_export`` to make this reachable in production
    would make the seam capable of expressing a gated decision, which D-048 and
    ADR 0003 defer until a candidate is selected. The refusal branch still has
    to be executable, so only the test builds this value.
    """
    return ResultAccessDecision.model_construct(
        state="full",
        treatment="control",
        reason="no_candidate_selected",
        can_export=False,
        policy_version="control-v1",
    )


def test_result_access_policy_defaults_off_and_preserves_full_control():
    assert Settings(_env_file=None).RESULT_ACCESS_POLICY_ENABLED is False
    decision = evaluate_result_access(
        surface="export", tool_name="resume", access_mode="guest_demo"
    )
    assert decision.model_dump() == FULL_CONTROL


def test_enabling_candidate_neutral_seam_still_grants_full_control(monkeypatch):
    monkeypatch.setattr(settings, "RESULT_ACCESS_POLICY_ENABLED", True)
    decision = evaluate_result_access(
        surface="saved_result", tool_name="interview", access_mode="authenticated"
    )
    assert decision.state == "full"
    assert decision.can_export is True
    assert decision.reason == "no_candidate_selected"


def test_live_tool_response_carries_explicit_server_decision():
    response = build_tool_response(
        {"summary": "synthetic"},
        tool_name="resume",
        history_id=None,
        access_mode="guest_demo",
    )
    assert response["access_decision"]["state"] == "full"
    assert response["access_decision"]["can_export"] is True


# --- HTTP boundary: every delivery surface carries a server decision ---


@pytest.mark.parametrize("policy_enabled,expected_reason", POLICY_STATES, ids=POLICY_IDS)
@pytest.mark.parametrize("tool_name,path,body", TOOL_ENDPOINTS, ids=TOOL_IDS)
def test_authenticated_tool_endpoints_carry_the_server_decision(
    client,
    auth_headers,
    mock_ai_result,
    monkeypatch,
    tool_name,
    path,
    body,
    policy_enabled,
    expected_reason,
):
    monkeypatch.setattr(settings, "RESULT_ACCESS_POLICY_ENABLED", policy_enabled)
    mock_ai_result(PROVIDER_RESULT)

    response = client.post(f"{PREFIX}{path}", json=body, headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["access_mode"] == "authenticated"
    assert payload["access_decision"] == {**FULL_CONTROL, "reason": expected_reason}


@pytest.mark.parametrize("policy_enabled,expected_reason", POLICY_STATES, ids=POLICY_IDS)
@pytest.mark.parametrize("tool_name,path,body", TOOL_ENDPOINTS, ids=TOOL_IDS)
def test_guest_tool_endpoints_carry_the_same_server_decision(
    client,
    mock_ai_result,
    monkeypatch,
    tool_name,
    path,
    body,
    policy_enabled,
    expected_reason,
):
    monkeypatch.setattr(settings, "RESULT_ACCESS_POLICY_ENABLED", policy_enabled)
    mock_ai_result(PROVIDER_RESULT)

    response = client.post(f"{PREFIX}{path}", json=body)

    assert response.status_code == 200
    payload = response.json()
    assert payload["access_mode"] == "guest_demo"
    assert payload["saved"] is False
    assert payload["access_decision"] == {**FULL_CONTROL, "reason": expected_reason}


@pytest.mark.parametrize("policy_enabled,expected_reason", POLICY_STATES, ids=POLICY_IDS)
@pytest.mark.parametrize("authenticated", [True, False], ids=["authenticated", "guest"])
def test_interview_practice_feedback_carries_the_server_decision(
    client,
    auth_headers,
    monkeypatch,
    authenticated,
    policy_enabled,
    expected_reason,
):
    monkeypatch.setattr(settings, "RESULT_ACCESS_POLICY_ENABLED", policy_enabled)

    async def fake_evaluate(*args, **kwargs):
        return {
            "strengths": ["Clear structure"],
            "weaknesses": [],
            "suggestions": ["Add one measurable outcome."],
            "overall_feedback": "Promising answer.",
            "is_empty_answer": False,
        }

    monkeypatch.setattr("app.routers.interview.evaluate_practice_answer", fake_evaluate)

    response = client.post(
        f"{PREFIX}/interview/practice-feedback",
        json={
            "question": "Tell me about yourself",
            "user_answer": "I build backend APIs.",
            "model_answer": "Use a concise STAR structure.",
        },
        headers=auth_headers if authenticated else None,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["overall_feedback"] == "Promising answer."
    assert payload["access_decision"] == {**FULL_CONTROL, "reason": expected_reason}


@pytest.mark.parametrize("policy_enabled,expected_reason", POLICY_STATES, ids=POLICY_IDS)
@pytest.mark.parametrize("artifact_format", ["pdf", "docx"], ids=["pdf", "docx"])
def test_cv_artifact_export_is_delivered_through_the_seam(
    client,
    auth_headers,
    db,
    test_user,
    monkeypatch,
    artifact_format,
    policy_enabled,
    expected_reason,
):
    monkeypatch.setattr(settings, "RESULT_ACCESS_POLICY_ENABLED", policy_enabled)
    document = _cv_document(db, test_user)

    seen: list[dict] = []
    real_evaluate = evaluate_result_access

    def recording_evaluate(**kwargs):
        seen.append(kwargs)
        return real_evaluate(**kwargs)

    monkeypatch.setattr("app.routers.cv_documents.evaluate_result_access", recording_evaluate)

    response = client.get(
        f"{PREFIX}/cv-documents/{document.id}/artifacts/{artifact_format}"
        "?template=ats-essential",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert seen and seen[0]["surface"] == "export"
    assert seen[0]["access_mode"] == "authenticated"
    assert real_evaluate(**seen[0]).reason == expected_reason


# --- HTTP boundary: the refusal branch is reachable and refuses early ---


def test_history_pdf_export_refuses_before_rendering_when_export_is_denied(
    client, auth_headers, test_user, db, monkeypatch
):
    from app.models.tool_run import ToolRun

    run = ToolRun(
        user_id=test_user.id,
        tool_name="cover-letter",
        label="Cover letter",
        result_payload={"full_text": "Dear Hiring Manager..."},
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    def fail_if_rendered(*args, **kwargs):
        raise AssertionError("Withheld exports must not render bytes")

    monkeypatch.setattr(
        "app.services.pdf_export.generate_cover_letter_pdf", fail_if_rendered
    )
    monkeypatch.setattr("app.routers.history.evaluate_result_access", _denied_export)

    response = client.get(f"{PREFIX}/history/{run.id}/export/pdf", headers=auth_headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Export is not available"


@pytest.mark.parametrize("artifact_format", ["pdf", "docx"], ids=["pdf", "docx"])
def test_cv_artifact_export_refuses_before_rendering_when_export_is_denied(
    client, auth_headers, db, test_user, monkeypatch, artifact_format
):
    document = _cv_document(db, test_user)

    def fail_if_rendered(*args, **kwargs):
        raise AssertionError("Withheld exports must not render bytes")

    monkeypatch.setattr("app.routers.cv_documents.render_pdf", fail_if_rendered)
    monkeypatch.setattr("app.routers.cv_documents.render_docx", fail_if_rendered)
    monkeypatch.setattr("app.routers.cv_documents.evaluate_result_access", _denied_export)

    response = client.get(
        f"{PREFIX}/cv-documents/{document.id}/artifacts/{artifact_format}"
        "?template=ats-essential",
        headers=auth_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Export is not available"


# --- HTTP boundary: a client cannot propose its own entitlement ---


@pytest.mark.parametrize("tool_name,path,body", TOOL_ENDPOINTS, ids=TOOL_IDS)
def test_client_supplied_entitlement_cannot_change_the_server_decision(
    client, auth_headers, mock_ai_result, tool_name, path, body
):
    mock_ai_result(PROVIDER_RESULT)

    response = client.post(
        f"{PREFIX}{path}",
        json={
            **body,
            "access_decision": {
                "state": "full",
                "treatment": "paid",
                "reason": "client_override",
                "can_export": True,
                "policy_version": "attacker-v1",
            },
            "entitlement": "premium",
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["access_decision"] == FULL_CONTROL


def test_client_supplied_entitlement_cannot_change_the_practice_feedback_decision(
    client, auth_headers, monkeypatch
):
    async def fake_evaluate(*args, **kwargs):
        return {
            "strengths": [],
            "weaknesses": [],
            "suggestions": [],
            "overall_feedback": "Promising answer.",
            "is_empty_answer": False,
        }

    monkeypatch.setattr("app.routers.interview.evaluate_practice_answer", fake_evaluate)

    response = client.post(
        f"{PREFIX}/interview/practice-feedback",
        json={
            "question": "Tell me about yourself",
            "user_answer": "I build backend APIs.",
            "access_decision": {
                "state": "full",
                "treatment": "paid",
                "reason": "client_override",
                "can_export": True,
                "policy_version": "attacker-v1",
            },
            "entitlement": "premium",
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["access_decision"] == FULL_CONTROL
