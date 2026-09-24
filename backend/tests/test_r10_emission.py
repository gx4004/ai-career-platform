"""R10 operational-event emission at the authoritative backend boundaries (#136).

Covers acceptance criteria 2/3/4: the shared tool pipeline emits cache
hit/miss/write outcomes and one grouped provider-incident event per user-visible
failure (internal retries already collapsed), and the job-import endpoint records
only an allowlisted source family — never the raw URL.
"""
from __future__ import annotations

import pytest

from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics import ActivationEventCreate
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


@pytest.mark.parametrize(
    "tool_name",
    ["cv-quality", "cv-tailoring", "application-reviewer", "application-packet"],
)
def test_build_ahead_pipeline_tools_have_bounded_operational_ids(tool_name):
    event = ActivationEventCreate(
        event_name="r10_generation_phase",
        tool_id=tool_name,
        access_mode="authenticated",
        duration_ms=1,
        operational_dimension="provider",
    )

    assert event.tool_id == tool_name


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
async def test_disabled_cache_emits_no_false_miss_or_write_evidence(db, monkeypatch):
    clear_cache()
    monkeypatch.setattr("app.services.tool_pipeline.settings.RESULT_CACHE_ENABLED", False)
    service_calls = 0

    async def service(**_):
        nonlocal service_calls
        service_calls += 1
        return {"summary": "ok"}

    kwargs = dict(
        tool_name="resume",
        service_fn=service,
        service_kwargs={},
        label_fn=lambda result: "label",
        resume_text="a sufficiently long cache-disabled resume body",
        db=db,
        current_user=None,
    )

    await run_tool_pipeline(**kwargs)
    await run_tool_pipeline(**kwargs)

    assert service_calls == 2
    assert _outcomes(db, "r10_cache_outcome") == []
    phases = [dimension for dimension, _ in _outcomes(db, "r10_generation_phase")]
    assert phases.count("cache") == 2
    assert phases.count("provider") == 2


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
async def test_degraded_run_records_its_incident_and_is_not_cached(db):
    """Spec decision #7 lets Resume/Job Match swallow a provider failure.

    Those two services catch the exception and return a heuristic-only result,
    so the pipeline takes its *success* path. The incident accumulator was read
    only in the failure path, so a real outage degraded both scoring tools while
    emitting no incident at all — blinding the D-055/#138 trigger to exactly the
    outage it exists to detect — and the degraded answer was then written to the
    result cache and replayed for the whole TTL.
    """
    clear_cache()

    async def degrading_service(**_):
        # What resume_analyzer/job_matcher do: the LLM client recorded the
        # category on its way out, the service caught the error and returned a
        # heuristic result instead of raising.
        set_provider_incident("unavailable")
        return {"summary": "heuristic fallback"}

    kwargs = dict(
        tool_name="resume",
        service_fn=degrading_service,
        service_kwargs={},
        label_fn=lambda result: "label",
        resume_text="a sufficiently long degraded resume body for hashing",
        db=db,
        current_user=None,
    )

    await run_tool_pipeline(**kwargs)

    incidents = _outcomes(db, "r10_provider_incident")
    assert len(incidents) == 1
    assert incidents[0][0] == "unavailable"

    outcomes = [outcome for _, outcome in _outcomes(db, "r10_cache_outcome")]
    assert "miss" in outcomes
    assert "write" not in outcomes, (
        "a degraded result must not be cached: replaying it for the cache TTL "
        "extends one outage into an hour of silently degraded answers"
    )

    # The next request must reach the service again rather than being served
    # the degraded payload.
    calls = 0

    async def healthy_service(**_):
        nonlocal calls
        calls += 1
        return {"summary": "full result"}

    await run_tool_pipeline(**{**kwargs, "service_fn": healthy_service})
    assert calls == 1


@pytest.mark.asyncio
async def test_recovered_provider_retry_is_not_reported_as_an_incident(db):
    """A run that retried and then succeeded is not a user-visible incident.

    D-055 counts user-visible incidents. The client records a category on every
    failed attempt, so the accumulator must be cleared when a later attempt
    succeeds — otherwise reading it on the success path would count healthy runs.
    """
    clear_cache()

    async def recovering_service(**_):
        from app.services.ai_client import complete_structured

        return await complete_structured("system", "user")

    attempts = 0

    async def flaky_dispatch(*_args, **_kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("transient provider blip")
        return {"summary": "full result"}

    import app.services.ai_client as ai_client

    original = ai_client._call_vertex
    ai_client._call_vertex = flaky_dispatch
    original_delay = ai_client._RETRY_BASE_DELAY
    ai_client._RETRY_BASE_DELAY = 0.0
    try:
        await run_tool_pipeline(
            tool_name="resume",
            service_fn=recovering_service,
            service_kwargs={},
            label_fn=lambda result: "label",
            resume_text="a sufficiently long recovered resume body for hashing",
            db=db,
            current_user=None,
        )
    finally:
        ai_client._call_vertex = original
        ai_client._RETRY_BASE_DELAY = original_delay

    assert attempts == 2
    assert _outcomes(db, "r10_provider_incident") == []
    outcomes = [outcome for _, outcome in _outcomes(db, "r10_cache_outcome")]
    assert "write" in outcomes, "a fully successful run must still be cached"


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
