import json
import logging

from app.main import _scrub_sentry_event
from app.schemas.telemetry import TelemetryEventRequest
from app.services.ai_client import _safe_parse_json
from app.services.observability import (
    _TELEMETRY_FIELDS,
    log_frontend_telemetry,
    log_user_account_deleted,
)


def test_scrub_sentry_event_removes_request_body_and_cookies():
    event = {
        "request": {
            "url": "https://example.com/api/v1/resume/analyze",
            "method": "POST",
            "data": {"resume_text": "secret resume content"},
            "cookies": {"cw_access": "jwt-token"},
        },
    }

    scrubbed = _scrub_sentry_event(event, None)

    assert "data" not in scrubbed["request"]
    assert "cookies" not in scrubbed["request"]


def test_scrub_sentry_event_redacts_sensitive_headers():
    event = {
        "request": {
            "headers": {
                "Authorization": "Bearer abc",
                "Cookie": "cw_access=xyz",
                "X-CSRF-Token": "nonce",
                "Content-Type": "application/json",
                "User-Agent": "test",
            },
        },
    }

    scrubbed = _scrub_sentry_event(event, None)
    headers = scrubbed["request"]["headers"]

    assert headers["Authorization"] == "[scrubbed]"
    assert headers["Cookie"] == "[scrubbed]"
    assert headers["X-CSRF-Token"] == "[scrubbed]"
    assert headers["Content-Type"] == "application/json"
    assert headers["User-Agent"] == "test"


def test_scrub_sentry_event_drops_entire_stable_user_context():
    event = {
        "user": {
            "id": "u-1",
            "email": "user@example.com",
            "ip_address": "1.2.3.4",
            "username": "user",
        },
    }

    scrubbed = _scrub_sentry_event(event, None)

    assert "user" not in scrubbed


def test_scrub_sentry_event_handles_missing_keys_gracefully():
    event = {}

    scrubbed = _scrub_sentry_event(event, None)

    assert scrubbed == {}


def test_scrub_sentry_event_handles_non_dict_shapes():
    event = {"request": "not-a-dict", "user": ["also", "not", "a", "dict"]}

    scrubbed = _scrub_sentry_event(event, None)

    assert scrubbed["request"] == "not-a-dict"
    assert "user" not in scrubbed


def test_scrub_sentry_event_strips_url_query_and_fragment():
    event = {
        "request": {
            "url": "https://example.com/reset-password?token=secret-jwt#anchor",
            "query_string": "token=secret-jwt",
        },
    }

    scrubbed = _scrub_sentry_event(event, None)

    assert scrubbed["request"]["url"] == "https://example.com/reset-password"
    assert "query_string" not in scrubbed["request"]


def test_scrub_sentry_event_leaves_url_without_query_alone():
    event = {"request": {"url": "https://example.com/dashboard"}}

    scrubbed = _scrub_sentry_event(event, None)

    assert scrubbed["request"]["url"] == "https://example.com/dashboard"


def test_malformed_model_output_is_not_written_to_logs(caplog):
    private_output = '{"resume_text":"private resume for user@example.com"'

    try:
        _safe_parse_json(private_output, "test-provider")
    except ValueError:
        pass

    assert "private resume" not in caplog.text
    assert "user@example.com" not in caplog.text


# ── R3 #78: the log seams themselves must be allowlisted, not caller-trusted ──


def test_frontend_telemetry_log_drops_fields_outside_the_ingestion_schema(caplog):
    """The log seam re-applies the allowlist instead of trusting its caller.

    `/telemetry/events` validates against a schema that forbids extra fields,
    which made this safe only by caller discipline. A second caller — or a
    refactor that skipped validation — would splat user content into stdout.
    """
    caplog.set_level(logging.INFO)

    log_frontend_telemetry(
        {
            "event_name": "tool_run_failed",
            "resume_text": "private resume for user@example.com",
            "job_description": "confidential posting",
        }
    )

    assert "private resume" not in caplog.text
    assert "user@example.com" not in caplog.text
    assert "confidential posting" not in caplog.text
    # The allowlisted field still gets through — this must drop content, not
    # silently disable telemetry.
    assert "tool_run_failed" in caplog.text


def test_frontend_telemetry_log_reports_dropped_field_names_not_values(caplog):
    """A dropped field must stay discoverable without leaking what it held.

    Field names are developer-authored; their values are user content.
    """
    caplog.set_level(logging.INFO)

    log_frontend_telemetry({"event_name": "frontend_error", "resume_text": "secret"})

    assert "resume_text" in caplog.text
    assert "secret" not in caplog.text


def test_frontend_telemetry_allowlist_tracks_the_ingestion_schema():
    """Derived from the schema, not a second hand-maintained list.

    A field added to `TelemetryEventRequest` must become loggable without
    anyone remembering to update observability.py.
    """
    assert _TELEMETRY_FIELDS == frozenset(TelemetryEventRequest.model_fields)


def test_account_deletion_audit_logs_counts_and_no_user_content(caplog):
    """Pins the erasure audit line's exact field set (D-031).

    The line deliberately carries `user_id` after the row is gone — regulators
    need a record the request was honoured. Everything else must be counts, so
    nothing here may grow into carrying name, email, or content. Without this
    test a future edit could add PII to a GDPR audit trail silently.
    """
    caplog.set_level(logging.INFO)

    log_user_account_deleted(
        user_id="user-123",
        runs_deleted=4,
        workspaces_deleted=2,
        evidence_items_deleted=7,
        cv_documents_deleted=1,
        cv_variants_deleted=3,
        development_items_deleted=5,
        user_record_deleted=True,
    )

    line = json.loads(
        next(record.message for record in caplog.records if "user_account_deleted" in record.message)
    )

    assert line == {
        "event": "user_account_deleted",
        "user_id": "user-123",
        "runs_deleted": 4,
        "workspaces_deleted": 2,
        "evidence_items_deleted": 7,
        "cv_documents_deleted": 1,
        "cv_variants_deleted": 3,
        "development_items_deleted": 5,
        "user_record_deleted": True,
    }
