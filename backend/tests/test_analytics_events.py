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
from app.schemas.analytics import ActivationEventCreate, ProfileEventName
from app.schemas.telemetry import TelemetryEventName
from app.services.analytics import record_activation_event
from app.services.llm_cost import record_llm_usage
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


# --- R11 profile-adoption allowlist (issue #150, D-067) --------------------


def test_profile_event_names_are_accepted_by_the_write_seam(db):
    """Drift guard: every R11 profile-adoption event name is accepted by the
    durable write seam, so the profile service seam can always persist."""
    for name in get_args(ProfileEventName):
        row = record_activation_event(
            db,
            event_name=name,
            evidence_kind="skill",
            evidence_provenance="imported",
        )
        assert row.event_name == name


def test_record_profile_event_persists_allowlisted_dimensions(db):
    row = record_activation_event(
        db,
        event_name="profile_item_confirmed",
        evidence_kind="experience",
        evidence_provenance="user-entered",
        confirmation_transition="confirmed",
    )

    stored = db.query(AnalyticsEvent).one()
    assert stored.id == row.id
    assert stored.event_name == "profile_item_confirmed"
    assert stored.evidence_kind == "experience"
    assert stored.evidence_provenance == "user-entered"
    assert stored.confirmation_transition == "confirmed"


@pytest.mark.parametrize(
    "field, value",
    [
        # Free-text evidence content and identifying strings that must NEVER ride
        # along on a profile event (D-067).
        ("content", {"statement": "Led the migration at Acme Corp."}),
        ("statement", "Improved throughput by 30% at Contoso University"),
        ("employer", "Acme Corp"),
        ("institution", "MIT"),
        ("item_id", "stable-evidence-item-id"),
        ("evidence_text", "free-text career claim"),
    ],
)
def test_profile_event_rejects_free_text_content(db, field, value):
    """A profile event carrying any free-text content or stable identifier is
    rejected by the same allowlist (`extra="forbid"`) before anything is written
    — evidence text can never reach the analytics store (D-067)."""
    with pytest.raises(ValidationError):
        record_activation_event(
            db,
            event_name="profile_item_created",
            evidence_kind="achievement",
            evidence_provenance="imported",
            **{field: value},
        )

    assert db.query(AnalyticsEvent).count() == 0


@pytest.mark.parametrize(
    "field, value",
    [
        ("evidence_kind", "not-a-kind"),
        ("evidence_provenance", "made-up"),
        ("confirmation_transition", "half-confirmed"),
    ],
)
def test_profile_event_rejects_out_of_set_dimension_values(db, field, value):
    """Each profile dimension is a closed Literal set, so a value outside it is
    rejected — the columns can only ever hold low-cardinality allowlisted terms."""
    with pytest.raises(ValidationError):
        record_activation_event(
            db, event_name="profile_item_created", **{field: value}
        )

    assert db.query(AnalyticsEvent).count() == 0


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


def test_ingestion_persists_bounded_loader_abandonment(client, db):
    response = client.post(
        f"{PREFIX}/telemetry/events",
        json={
            "event_name": "generation_loader_abandoned",
            "tool_id": "resume",
            "access_mode": "guest_demo",
            "duration_ms": 45000,
        },
    )
    assert response.status_code == 200
    stored = db.query(AnalyticsEvent).one()
    assert stored.duration_ms == 45000
    assert stored.tool_id == "resume"


def test_ingestion_rejects_client_duration_on_unrelated_event(client, db):
    response = client.post(
        f"{PREFIX}/telemetry/events",
        json={"event_name": "landing_page_viewed", "duration_ms": 123},
    )
    assert response.status_code == 422
    assert db.query(AnalyticsEvent).count() == 0


@pytest.mark.parametrize(
    "payload, expected_tool_id",
    [
        ({"event_name": "landing_page_viewed"}, None),
        (
            {"event_name": "workflow_continued", "tool_id": "resume",
             "access_mode": "authenticated"},
            "resume",
        ),
        (
            {"event_name": "auth_signup_source", "tool_id": "job-match",
             "session_status": "guest"},
            "job-match",
        ),
    ],
)
def test_ingestion_endpoint_persists_r6_wired_events(client, db, payload, expected_tool_id):
    """R6 taxonomy-gap events (D-040) flow through the existing ingestion path
    and land durably: the new `landing_page_viewed` plus the two previously
    dead-on-arrival names `workflow_continued` and `auth_signup_source`."""
    resp = client.post(f"{PREFIX}/telemetry/events", json=payload)

    assert resp.status_code == 200
    stored = db.query(AnalyticsEvent).one()
    assert stored.event_name == payload["event_name"]
    assert stored.tool_id == expected_tool_id


# --- R9 dormant ad-path removal (issue #127) ------------------------------


@pytest.mark.parametrize(
    "removed_event_name",
    ["ad_shown", "ad_completed", "ad_blocked", "countdown_completed"],
)
def test_ingestion_endpoint_rejects_removed_ad_event_names(client, db, removed_event_name):
    """The dormant ad/countdown telemetry names are gone from the contract
    (D-051): the ingestion endpoint rejects them and persists nothing."""
    resp = client.post(
        f"{PREFIX}/telemetry/events",
        json={"event_name": removed_event_name, "tool_id": "resume"},
    )

    assert resp.status_code == 422
    assert db.query(AnalyticsEvent).count() == 0


def test_ingestion_endpoint_rejects_removed_unlock_method_field(client, db):
    """The `unlock_method` dimension only ever carried ad/countdown unlock
    telemetry; it is removed from the contract and rejected as an unknown
    field (extra="forbid"), persisting nothing."""
    resp = client.post(
        f"{PREFIX}/telemetry/events",
        json={
            "event_name": "result_page_loaded",
            "tool_id": "resume",
            "unlock_method": "ad",
        },
    )

    assert resp.status_code == 422
    assert db.query(AnalyticsEvent).count() == 0


@pytest.mark.parametrize(
    "removed_event_name",
    ["ad_shown", "ad_completed", "ad_blocked", "countdown_completed"],
)
def test_write_seam_rejects_removed_ad_event_names(db, removed_event_name):
    """The durable write seam no longer accepts the removed ad/countdown event
    names, so a stray caller cannot re-introduce them."""
    with pytest.raises(ValidationError):
        record_activation_event(db, event_name=removed_event_name, tool_id="resume")

    assert db.query(AnalyticsEvent).count() == 0


def test_write_seam_rejects_removed_unlock_method_field(db):
    with pytest.raises(ValidationError):
        record_activation_event(
            db, event_name="result_page_loaded", unlock_method="countdown"
        )

    assert db.query(AnalyticsEvent).count() == 0


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
    # This service raised before reaching the model provider, so no tokens were
    # consumed and duration is persisted but cost is not (issue #106).
    assert failed.duration_ms is not None
    assert failed.cost_estimate is None


# --- Backend tool-run cost estimate (issue #106) ---------------------------


async def test_completed_run_persists_duration_and_cost(db):
    """Every successful run that reached the provider persists a non-null
    duration AND a non-null cost estimate derived from actual token usage."""

    async def service_fn(**kwargs):
        # Mirrors the real provider path: the LLM client records the call's
        # actual token usage into the request-scoped accumulator mid-run.
        record_llm_usage(model="gemini-2.5-flash", prompt_tokens=1500, output_tokens=400)
        return {"summary": {"headline": "ok"}}

    await run_tool_pipeline(
        tool_name="job-match",
        service_fn=service_fn,
        service_kwargs={"resume_text": "x"},
        label_fn=lambda result: "label",
        resume_text="Some resume text for a run that calls the model.",
        current_user=None,
        db=db,
    )

    completed = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "tool_run_completed")
        .one()
    )
    assert completed.duration_ms is not None
    assert completed.cost_estimate is not None
    assert Decimal(str(completed.cost_estimate)) > 0


async def test_failure_after_provider_call_persists_cost(db):
    """A failure after the provider already consumed tokens persists whatever
    cost is available at the point of failure (issue #106)."""

    async def failing_service(**kwargs):
        record_llm_usage(model="gemini-2.5-flash", prompt_tokens=800, output_tokens=100)
        raise RuntimeError("parse failure after the model was called")

    with pytest.raises(RuntimeError):
        await run_tool_pipeline(
            tool_name="interview",
            service_fn=failing_service,
            service_kwargs={"resume_text": "x"},
            label_fn=lambda result: "label",
            resume_text="Some resume text for a run that fails after the model.",
            current_user=None,
            db=db,
        )

    failed = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "tool_run_failed")
        .one()
    )
    assert failed.duration_ms is not None
    assert failed.cost_estimate is not None
    assert Decimal(str(failed.cost_estimate)) > 0
