from datetime import UTC, datetime

from app.services.rate_limit_events import (
    collect_rate_limit_evidence,
    rate_limit_route_family,
    record_rate_limit_event,
    threshold_evidence_for_rejection,
)


def test_rate_limit_paths_collapse_to_bounded_families():
    assert rate_limit_route_family("/api/v1/auth/login") == "auth"
    assert rate_limit_route_family("/api/v1/resume/analyze") == "tools"
    assert rate_limit_route_family("/api/v1/history/workspaces/private-id/tasks") == "campaigns"
    assert rate_limit_route_family("/api/v1/packets/private-id/accept") == "queue"
    assert rate_limit_route_family("/unexpected/private/path") == "other"


def test_rejection_flood_coalesces_to_one_threshold_event_per_family_bucket():
    now = datetime(2026, 8, 12, 12, 0, tzinfo=UTC)
    emitted = [
        event
        for index in range(100)
        if (event := threshold_evidence_for_rejection(
            route_family="auth",
            identity_type="guest" if index % 2 == 0 else "account",
            now=now,
        )) is not None
    ]

    assert emitted == [{
        "route_family": "auth",
        "identity_type": "mixed",
        "metric_value": 50,
    }]


def test_evidence_counter_failure_is_bounded_and_drops_private_detail(
    monkeypatch, caplog
):
    def fail_increment(*_args, **_kwargs):
        raise RuntimeError("private storage detail")

    monkeypatch.setattr(
        "app.services.rate_limit_events.abuse_counters.increment",
        fail_increment,
    )

    collect_rate_limit_evidence(route_family="auth", identity_type="guest")

    assert "rate_limit_evidence_failed error_type=RuntimeError" in caplog.text
    assert "private storage detail" not in caplog.text


def test_evidence_session_failure_is_bounded_and_drops_private_detail(
    monkeypatch, caplog
):
    def fail_session():
        raise RuntimeError("private database detail")

    monkeypatch.setattr("app.services.rate_limit_events.SessionLocal", fail_session)

    record_rate_limit_event(route_family="auth", identity_type="guest")

    assert "rate-limit evidence persist failed error_type=RuntimeError" in caplog.text
    assert "private database detail" not in caplog.text
