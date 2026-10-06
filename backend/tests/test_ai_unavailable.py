"""A generative tool whose model call gave up answers 503 with a sentence, never an unexplained 500."""

import pytest

from app.services import career_recommender, cover_letter_gen

PREFIX = "/api/v1"
RESUME = (
    "Jordan Rivera\nSenior Backend Engineer\n"
    "- Built Python and PostgreSQL services handling 2M requests a day.\n"
    "- Led the migration of 14 services to Kubernetes with zero downtime.\n"
    "Skills: Python, PostgreSQL, Kubernetes, AWS\n"
)


@pytest.mark.parametrize("failure", [RuntimeError("AI service temporarily unavailable."), TimeoutError("timed out")])
def test_a_generative_tool_reports_the_ai_service_unavailable(client, auth_headers, monkeypatch, failure):
    async def gives_up(*_args, **_kwargs):
        raise failure

    monkeypatch.setattr(career_recommender, "complete_structured", gives_up)
    resp = client.post(
        f"{PREFIX}/career/recommend",
        json={"resume_text": RESUME + f"\n{type(failure).__name__}", "target_role": "Staff Backend Engineer"},
        headers=auth_headers,
    )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "The AI service is unavailable right now. Please try again in a moment."


def test_a_programming_error_is_still_a_500(client, auth_headers, monkeypatch):
    async def broken(*_args, **_kwargs):
        raise KeyError("missing field")

    monkeypatch.setattr(cover_letter_gen, "complete_structured", broken)
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, raise_server_exceptions=False) as http:
        resp = http.post(
            f"{PREFIX}/cover-letter/generate",
            json={"resume_text": RESUME, "job_description": "Staff Backend Engineer at Northwind Labs. " * 3},
            headers=auth_headers,
        )
    assert resp.status_code == 500
