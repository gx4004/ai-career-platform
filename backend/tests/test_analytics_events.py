"""R6 activation-event persistence (issue #104).

Covers the parent spec's Testing Decisions for this slice:
- the shared write seam's contract (allowlisted shape is durably queryable; a
  disallowed/free-text field is rejected the same way ingestion rejects unknown
  fields);
- the frontend-telemetry ingestion endpoint now also persists what it accepts;
- the backend tool-run start/complete/fail calls persist unconditionally
  (no client/cookie is involved, so consent does not gate them, D-038).
"""
from __future__ import annotations

from decimal import Decimal
from typing import get_args

import pytest
from pydantic import ValidationError

from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics import ActivationEventCreate
from app.schemas.telemetry import TelemetryEventName
from app.services.analytics import record_activation_event
from app.services.tool_pipeline import run_tool_pipeline

PREFIX = "/api/v1"


# --- Shared write seam: contract ------------------------------------------


def test_record_activation_event_persists_allowlisted_row(db):
    row = record_activation_event(
        db,
        event_name="tool_run_started",
        tool_id="resume",
        access_mode="guest_demo",
    )

    stored = db.query(AnalyticsEvent).all()
    assert len(stored) == 1
    assert stored[0].id == row.id
    assert stored[0].event_name == "tool_run_started"
    assert stored[0].tool_id == "resume"
    assert stored[0].access_mode == "guest_demo"


def test_record_activation_event_accepts_backend_metrics(db):
    record_activation_event(
        db,
        event_name="tool_run_completed",
        tool_id="job-match",
        access_mode="authenticated",
        duration_ms=1234,
        cost_estimate=Decimal("0.004200"),
        saved=True,
    )

    stored = db.query(AnalyticsEvent).one()
    assert stored.duration_ms == 1234
    assert Decimal(str(stored.cost_estimate)) == Decimal("0.004200")
    assert stored.saved is True


@pytest.mark.parametrize(
    "field, value",
    [
        ("resume_text", "private resume content"),
        ("job_description", "private role"),
        ("generated_content", "cover letter body"),
        ("email", "user@example.com"),
        ("error_message", "Failure for user@example.com"),
        ("history_id", "stable-run-id"),
        ("stack_trace", "Traceback (most recent call last)"),
        ("route", "/resume/result/stable-run-id"),
    ],
)
def test_record_activation_event_rejects_disallowed_fields(db, field, value):
    """A disallowed/free-text field is rejected the same way ingestion rejects
    unknown fields — via the shared allowlist, before anything is written."""
    with pytest.raises(ValidationError):
        record_activation_event(db, event_name="frontend_error", **{field: value})

    assert db.query(AnalyticsEvent).count() == 0


def test_activation_allowlist_is_a_superset_of_frontend_taxonomy():
    """Drift guard: every frontend-telemetry event name is accepted by the
    durable write seam, so a legitimately ingested event can always persist."""
    for name in get_args(TelemetryEventName):
        model = ActivationEventCreate(event_name=name)
        assert model.event_name == name


# --- Frontend-telemetry ingestion endpoint now persists --------------------


def test_ingestion_endpoint_persists_accepted_event(client, db):
    resp = client.post(
        f"{PREFIX}/telemetry/events",
        json={
            "event_name": "export_action_used",
            "tool_id": "resume",
            "access_mode": "guest_demo",
            "saved": False,
            "export_format": "md",
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"accepted": True}

    stored = db.query(AnalyticsEvent).one()
    assert stored.event_name == "export_action_used"
    assert stored.tool_id == "resume"
    assert stored.export_format == "md"


def test_ingestion_endpoint_rejects_sensitive_field_and_persists_nothing(client, db):
    resp = client.post(
        f"{PREFIX}/telemetry/events",
        json={
            "event_name": "frontend_error",
            "failure_category": "render_error",
            "resume_text": "private resume",
        },
    )

    assert resp.status_code == 422
    assert db.query(AnalyticsEvent).count() == 0


# --- Backend tool-run calls persist unconditionally ------------------------


async def test_pipeline_persists_started_and_completed(db):
    async def service_fn(**kwargs):
        return {"summary": {"headline": "ok"}}

    await run_tool_pipeline(
        tool_name="resume",
        service_fn=service_fn,
        service_kwargs={"resume_text": "x"},
        label_fn=lambda result: "label",
        resume_text="Some resume text for a guest run.",
        current_user=None,
        db=db,
    )

    names = [e.event_name for e in db.query(AnalyticsEvent).all()]
    assert "tool_run_started" in names
    assert "tool_run_completed" in names

    completed = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "tool_run_completed")
        .one()
    )
    # Backend-observed run: guest access mode, no client/cookie involved.
    assert completed.tool_id == "resume"
    assert completed.access_mode == "guest_demo"
    assert completed.duration_ms is not None


async def test_pipeline_persists_failure_with_allowlisted_category(db):
    async def failing_service(**kwargs):
        raise RuntimeError("boom with user@example.com in the message")

    with pytest.raises(RuntimeError):
        await run_tool_pipeline(
            tool_name="cover-letter",
            service_fn=failing_service,
            service_kwargs={"resume_text": "x"},
            label_fn=lambda result: "label",
            resume_text="Some resume text for a failing run.",
            current_user=None,
            db=db,
        )

    failed = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "tool_run_failed")
        .one()
    )
    assert failed.tool_id == "cover-letter"
    assert failed.level == "error"
    # The raw exception class name is high-cardinality and never persisted; the
    # durable event carries only the allowlisted category.
    assert failed.failure_category == "tool_request_failed"
