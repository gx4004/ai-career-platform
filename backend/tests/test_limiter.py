"""Behaviour of the per-route request limits."""

from unittest.mock import AsyncMock

from app.schemas.tools import ImportedJobResponse

_RESUME_PAYLOAD = {
    "resume_text": (
        "Professional Summary\nPython engineer.\n"
        "Experience\n- Built APIs.\nSkills\nPython"
    )
}


def test_tool_route_returns_429_past_its_limit(client, mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "A useful resume review.",
                "verdict": "Promising",
                "confidence_note": "Directional only.",
            },
            "strengths": ["Clear skills"],
            "issues": [],
        }
    )

    statuses = [
        client.post("/api/v1/resume/analyze", json=_RESUME_PAYLOAD).status_code
        for _ in range(11)
    ]

    assert statuses == [200] * 10 + [429]


def test_limits_are_per_route(client, mock_ai_result, monkeypatch):
    """Exhausting one route's limit leaves other routes available."""
    mock_ai_result(
        {
            "summary": {
                "headline": "A useful resume review.",
                "verdict": "Promising",
                "confidence_note": "Directional only.",
            },
            "strengths": ["Clear skills"],
            "issues": [],
        }
    )
    for _ in range(10):
        client.post("/api/v1/resume/analyze", json=_RESUME_PAYLOAD)
    assert client.post("/api/v1/resume/analyze", json=_RESUME_PAYLOAD).status_code == 429

    scrape = AsyncMock(
        return_value=ImportedJobResponse(
            job_title="Engineer",
            company_name="Example",
            job_description="A safe imported job description.",
            source_url="https://example.com/job",
        )
    )
    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", scrape)

    response = client.post(
        "/api/v1/job-posts/import-url", json={"url": "https://example.com/job"}
    )

    assert response.status_code == 200


def test_login_returns_429_past_its_limit(client, test_user):
    statuses = [
        client.post(
            "/api/v1/auth/login",
            json={"email": "test@example.com", "password": "wrong-password"},
        ).status_code
        for _ in range(11)
    ]

    assert statuses == [401] * 10 + [429]
