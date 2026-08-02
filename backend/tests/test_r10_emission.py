"""R10 operational-event emission at the authoritative backend boundaries (#136).

Covers acceptance criteria 2/3/4: the shared tool pipeline emits cache
hit/miss/write outcomes and one grouped provider-incident event per user-visible
failure (internal retries already collapsed), and the job-import endpoint records
only an allowlisted source family — never the raw URL.
"""
from __future__ import annotations

import pytest

from app.models.analytics_event import AnalyticsEvent
from app.schemas.tools import ImportedJobResponse
from app.services.import_source import set_import_outcome
from app.services.provider_incident import set_provider_incident
from app.services.result_cache import clear_cache
from app.services.tool_pipeline import run_tool_pipeline

PREFIX = "/api/v1"


def _outcomes(db, event_name: str):
    rows = (
        db.query(
            AnalyticsEvent.operational_dimension, AnalyticsEvent.operational_outcome
        )
        .filter(AnalyticsEvent.event_name == event_name)
        .all()
    )
    return rows


@pytest.mark.asyncio
async def test_pipeline_emits_cache_miss_then_write_then_hit(db):
    clear_cache()

    async def service(**_):
        return {"summary": "ok"}

    kwargs = dict(
        tool_name="resume",
        service_fn=service,
        service_kwargs={},
        label_fn=lambda r: "label",
        resume_text="a sufficiently long resume body for hashing",
        db=db,
        current_user=None,
    )

    await run_tool_pipeline(**kwargs)
    outcomes = [o for _, o in _outcomes(db, "r10_cache_outcome")]
    assert "miss" in outcomes
    assert "write" in outcomes
    phases = [dimension for dimension, _ in _outcomes(db, "r10_generation_phase")]
    assert phases == ["sanitize", "cache", "provider", "persist", "finalize"]

    # Identical inputs → cache hit on the second run.
    await run_tool_pipeline(**kwargs)
    outcomes = [o for _, o in _outcomes(db, "r10_cache_outcome")]
    assert "hit" in outcomes
    phases = [dimension for dimension, _ in _outcomes(db, "r10_generation_phase")]
    assert phases[-4:] == ["sanitize", "cache", "persist", "finalize"]


@pytest.mark.asyncio
async def test_pipeline_emits_one_provider_incident_per_failure(db):
    clear_cache()

    async def failing_service(**_):
        # Simulate what the LLM client does after exhausting retries: it records
        # the incident category once, then raises the user-visible error.
        set_provider_incident("timeout")
        raise RuntimeError("AI service temporarily unavailable")

    with pytest.raises(RuntimeError):
        await run_tool_pipeline(
            tool_name="resume",
            service_fn=failing_service,
            service_kwargs={},
            label_fn=lambda r: "label",
            resume_text="another sufficiently long resume body",
            db=db,
            current_user=None,
        )

    incidents = _outcomes(db, "r10_provider_incident")
    # Exactly one incident event, carrying the category (not the raw message).
    assert len(incidents) == 1
    assert incidents[0][0] == "timeout"
    phases = [dimension for dimension, _ in _outcomes(db, "r10_generation_phase")]
    assert phases == ["sanitize", "cache", "provider"]


@pytest.mark.asyncio
async def test_import_endpoint_records_family_not_url(client, db, monkeypatch):
    raw_url = "https://boards.greenhouse.io/acme/jobs/4815162342?token=secret"

    async def fake_scrape(url: str) -> ImportedJobResponse:
        set_import_outcome("success")
        return ImportedJobResponse(
            job_title="Engineer",
            company_name="Acme",
            job_description="x" * 200,
            source_url=url,
        )

    monkeypatch.setattr("app.routers.job_posts.scrape_job_posting", fake_scrape)

    resp = client.post(f"{PREFIX}/job-posts/import-url", json={"url": raw_url})
    assert resp.status_code == 200

    rows = _outcomes(db, "r10_import_outcome")
    assert len(rows) == 1
    dimension, outcome = rows[0]
    assert dimension == "greenhouse"
    assert outcome == "success"
    assert (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "r10_import_outcome")
        .one()
        .duration_ms
        >= 0
    )

    # No stored analytics row may contain any fragment of the raw URL.
    all_values = [
        str(v)
        for row in db.query(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.operational_outcome,
            AnalyticsEvent.event_name,
        ).all()
        for v in row
    ]
    assert not any("greenhouse.io" in v or "secret" in v or "4815162342" in v for v in all_values)
