"""Length validation on every tool's request schema.

The frontend caps resume_text at 50K and job_description at 20K. Direct API
calls bypassed those caps before this test, which let an unauthenticated
caller waste an LLM round-trip per request (rate-limited to 10/min, but
still a 50MB-resume request would burn CPU before failing).

This file exercises the boundary at the Pydantic layer so the constraints
cannot drift back to "string with no min/max" in a future refactor.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.tools import ResumeAnalysisHandoff

PREFIX = "/api/v1"

VALID_RESUME = (
    "Professional Summary\nPython engineer with SQL experience.\n"
    "Experience\n- Built APIs for 3 internal teams.\n"
    "Skills\nPython, SQL\nEducation\nBS Computer Science"
)
VALID_JD = "Backend Engineer\nNeed Python, SQL, APIs, and cloud deployment experience."


def _resume_too_short():
    return "x" * 49


def _resume_too_long():
    return "x" * 50_001


def _jd_too_long():
    return "x" * 20_001


def _feedback_too_long():
    return "x" * 2_001


def _target_role_too_long():
    return "x" * 201


@pytest.mark.parametrize(
    "path,base_payload",
    [
        ("/resume/analyze", {"resume_text": VALID_RESUME}),
        ("/job-match/match", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/cover-letter/generate", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/interview/questions", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/career/recommend", {"resume_text": VALID_RESUME}),
        ("/portfolio/recommend", {"resume_text": VALID_RESUME, "target_role": "Backend Engineer"}),
    ],
)
def test_revision_parent_id_is_bounded(client, auth_headers, path, base_payload):
    response = client.post(
        f"{PREFIX}{path}",
        headers=auth_headers,
        json={**base_payload, "parent_run_id": "x" * 101},
    )

    assert response.status_code == 422


def test_workspace_context_ids_and_count_are_bounded(client, auth_headers):
    oversized_id = client.post(
        f"{PREFIX}/resume/analyze",
        headers=auth_headers,
        json={
            "resume_text": VALID_RESUME,
            "workspace_context": {"workspace_id": "x" * 101},
        },
    )
    excessive_links = client.post(
        f"{PREFIX}/resume/analyze",
        headers=auth_headers,
        json={
            "resume_text": VALID_RESUME,
            "workspace_context": {
                "linked_history_ids": [f"run-{index}" for index in range(51)]
            },
        },
    )

    assert oversized_id.status_code == 422
    assert excessive_links.status_code == 422


@pytest.mark.parametrize("path", ["/cover-letter/generate", "/interview/questions"])
def test_nested_handoff_complexity_is_bounded(client, auth_headers, path):
    base_payload = {"resume_text": VALID_RESUME, "job_description": VALID_JD}
    excessive_list = client.post(
        f"{PREFIX}{path}",
        headers=auth_headers,
        json={
            **base_payload,
            "resume_analysis": {"strengths": ["signal"] * 101},
        },
    )
    excessive_string = client.post(
        f"{PREFIX}{path}",
        headers=auth_headers,
        json={
            **base_payload,
            "job_match": {"recruiter_summary": "x" * 20_001},
        },
    )

    assert excessive_list.status_code == 422
    assert excessive_string.status_code == 422


def test_deep_unknown_handoff_data_hits_complexity_guard_without_recursion_error():
    nested: dict = {}
    cursor = nested
    for _ in range(1_100):
        child: dict = {}
        cursor["child"] = child
        cursor = child

    with pytest.raises(ValidationError, match="too complex"):
        ResumeAnalysisHandoff.model_validate({"unknown": nested})


def test_invalid_unicode_handoff_is_a_validation_error():
    with pytest.raises(ValidationError, match="valid UTF-8"):
        ResumeAnalysisHandoff.model_validate({"strengths": ["\ud800"]})


@pytest.fixture
def _patch_ai(mock_ai_result):
    """Default AI mock so successful submissions in the table return 200."""
    mock_ai_result(
        {
            "summary": {
                "headline": "Test headline.",
                "verdict": "Test verdict",
                "confidence_note": "Test note.",
            },
            "strengths": ["Test strength."],
            "issues": [],
            "requirements": [],
            "tailoring_actions": [],
            "interview_focus": [],
            "recruiter_summary": "Test summary.",
            "questions": [
                {
                    "question": "Q",
                    "answer": "A",
                    "key_points": [],
                    "answer_structure": [],
                    "follow_up_questions": [],
                    "focus_area": "Backend",
                    "why_asked": "Test.",
                    "practice_first": False,
                }
            ],
            "focus_areas": [],
            "weak_signals_to_prepare": [],
            "interviewer_notes": [],
            "opening": {"text": "Dear team", "why_this_paragraph": "Hook", "requirements_used": []},
            "body_points": [{"text": "Body", "why_this_paragraph": "Proof", "requirements_used": []}],
            "closing": {"text": "Best", "why_this_paragraph": "Close", "requirements_used": []},
            "full_text": "Dear team\nBody\nBest",
            "tone_used": "Professional",
            "customization_notes": [],
            "recommended_direction": {
                "role_title": "Backend Engineer",
                "fit_score": 70,
                "transition_timeline": "3 months",
                "why_now": "Strong fit.",
                "confidence": "medium",
            },
            "paths": [],
            "current_skills": [],
            "target_skills": [],
            "skill_gaps": [],
            "next_steps": [],
            "portfolio_strategy": {
                "headline": "Build proof.",
                "focus": "Backend.",
                "proof_goal": "Hireable signal.",
            },
            "projects": [],
            "recommended_start_project": "Service",
            "sequence_plan": [],
            "presentation_tips": [],
        }
    )


@pytest.mark.parametrize(
    "path,base_payload",
    [
        ("/resume/analyze", {"resume_text": VALID_RESUME}),
        ("/job-match/match", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/cover-letter/generate", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/interview/questions", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/career/recommend", {"resume_text": VALID_RESUME}),
        ("/portfolio/recommend", {"resume_text": VALID_RESUME, "target_role": "Backend Engineer"}),
    ],
)
def test_resume_text_min_length(client, auth_headers, path, base_payload, _patch_ai):
    payload = {**base_payload, "resume_text": _resume_too_short()}
    resp = client.post(f"{PREFIX}{path}", json=payload, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "path,base_payload",
    [
        ("/resume/analyze", {}),
        ("/job-match/match", {"job_description": VALID_JD}),
        ("/cover-letter/generate", {"job_description": VALID_JD}),
        ("/interview/questions", {"job_description": VALID_JD}),
        ("/career/recommend", {}),
        ("/portfolio/recommend", {"target_role": "Backend Engineer"}),
    ],
)
def test_resume_text_max_length(client, auth_headers, path, base_payload, _patch_ai):
    payload = {**base_payload, "resume_text": _resume_too_long()}
    resp = client.post(f"{PREFIX}{path}", json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_resume_text_bounds_count_unicode_code_points(client, auth_headers, _patch_ai):
    accepted = client.post(
        f"{PREFIX}/resume/analyze",
        json={"resume_text": "🧭" * 50_000},
        headers=auth_headers,
    )
    rejected = client.post(
        f"{PREFIX}/resume/analyze",
        json={"resume_text": "🧭" * 50_001},
        headers=auth_headers,
    )

    assert accepted.status_code == 200
    assert rejected.status_code == 422


def test_parent_identifier_bound_counts_unicode_code_points(
    client, auth_headers, _patch_ai
):
    accepted = client.post(
        f"{PREFIX}/resume/analyze",
        json={"resume_text": VALID_RESUME, "parent_run_id": "🧭" * 100},
        headers=auth_headers,
    )
    rejected = client.post(
        f"{PREFIX}/resume/analyze",
        json={"resume_text": VALID_RESUME, "parent_run_id": "🧭" * 101},
        headers=auth_headers,
    )

    assert accepted.status_code == 404
    assert rejected.status_code == 422


@pytest.mark.parametrize(
    "path,base_payload",
    [
        ("/resume/analyze", {"resume_text": VALID_RESUME}),
        ("/job-match/match", {"resume_text": VALID_RESUME}),
        ("/cover-letter/generate", {"resume_text": VALID_RESUME}),
        ("/interview/questions", {"resume_text": VALID_RESUME}),
    ],
)
def test_job_description_max_length(client, auth_headers, path, base_payload, _patch_ai):
    payload = {**base_payload, "job_description": _jd_too_long()}
    resp = client.post(f"{PREFIX}{path}", json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_job_match_job_description_min_length(client, auth_headers, _patch_ai):
    """Job Match enforces min_length on job_description — empty/thin JDs
    would otherwise produce a phantom 58% match score with 0/0 requirements."""
    payload = {
        "resume_text": VALID_RESUME,
        "job_description": "x" * 19,
    }
    resp = client.post(f"{PREFIX}/job-match/match", json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_cover_letter_job_description_min_length(client, auth_headers, _patch_ai):
    """Cover Letter mirrors Job Match: a thin JD produces a generic "this role"
    letter dressed as a targeted draft — worse than an explicit input error."""
    payload = {
        "resume_text": VALID_RESUME,
        "job_description": "x" * 19,
    }
    resp = client.post(f"{PREFIX}/cover-letter/generate", json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_interview_job_description_min_length(client, auth_headers, _patch_ai):
    """Interview mirrors Job Match + Cover Letter: a thin JD produces
    default-templated questions on a phantom role — worse than a clear
    input error."""
    payload = {
        "resume_text": VALID_RESUME,
        "job_description": "x" * 19,
    }
    resp = client.post(f"{PREFIX}/interview/questions", json=payload, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "path,base_payload",
    [
        ("/resume/analyze", {"resume_text": VALID_RESUME}),
        ("/job-match/match", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/cover-letter/generate", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/interview/questions", {"resume_text": VALID_RESUME, "job_description": VALID_JD}),
        ("/career/recommend", {"resume_text": VALID_RESUME}),
        ("/portfolio/recommend", {"resume_text": VALID_RESUME, "target_role": "Backend Engineer"}),
    ],
)
def test_feedback_max_length(client, auth_headers, path, base_payload, _patch_ai):
    payload = {**base_payload, "feedback": _feedback_too_long()}
    resp = client.post(f"{PREFIX}{path}", json=payload, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "path,base_payload",
    [
        ("/career/recommend", {"resume_text": VALID_RESUME}),
        ("/portfolio/recommend", {"resume_text": VALID_RESUME}),
    ],
)
def test_target_role_max_length(client, auth_headers, path, base_payload, _patch_ai):
    payload = {**base_payload, "target_role": _target_role_too_long()}
    resp = client.post(f"{PREFIX}{path}", json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_cover_letter_tone_max_length(client, auth_headers, _patch_ai):
    payload = {
        "resume_text": VALID_RESUME,
        "job_description": VALID_JD,
        "tone": "x" * 51,
    }
    resp = client.post(f"{PREFIX}/cover-letter/generate", json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_interview_num_questions_bounds(client, auth_headers, _patch_ai):
    """Pydantic bounds match the service-side clamp (3-12). Sending values
    outside that range used to be silently truncated, so callers received a
    different question count than they asked for; now they get 422."""
    for bad in (0, 2, 13, 21):
        resp = client.post(
            f"{PREFIX}/interview/questions",
            json={
                "resume_text": VALID_RESUME,
                "job_description": VALID_JD,
                "num_questions": bad,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422, f"num_questions={bad} should be rejected"


def test_interview_practice_feedback_bounds(client):
    too_long_question = client.post(
        f"{PREFIX}/interview/practice-feedback",
        json={"question": "x" * 4_001, "user_answer": "ok"},
    )
    assert too_long_question.status_code == 422

    too_long_answer = client.post(
        f"{PREFIX}/interview/practice-feedback",
        json={"question": "ok", "user_answer": "x" * 8_001},
    )
    assert too_long_answer.status_code == 422

    too_long_model = client.post(
        f"{PREFIX}/interview/practice-feedback",
        json={"question": "ok", "user_answer": "ok", "model_answer": "x" * 4_001},
    )
    assert too_long_model.status_code == 422
