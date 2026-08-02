"""R10 operational scaling-trigger scorecard (issue #136, parent #135).

Covers the parent spec's Testing Decisions for the scorecard slice: accepted /
rejected event shapes on the allowlist, per-trigger fired / not-fired / stale /
insufficient-sample aggregate logic, provider-incident grouping, the
false-positive reset (a transient breach that does not sustain), import
source-family mapping that retains no full URL, and admin access gating. All
evidence stays on the existing first-party analytics boundary — no new vendor.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User
from app.schemas.analytics import ActivationEventCreate
from app.services.scorecard import (
    capture_database_snapshot,
    compute_scorecard,
    evaluate_database_growth,
    forecast_storage_pct,
    group_provider_incidents,
)

PREFIX = "/api/v1"

FIXED_NOW = datetime(2026, 7, 11, 12, 0, tzinfo=UTC)


@pytest.fixture
def admin_headers(db):
    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Admin User",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def _event(db, *, created_at: datetime, **fields) -> None:
    db.add(AnalyticsEvent(created_at=created_at, **fields))
    db.commit()


def _trigger(card, trigger_id: str):
    return next(t for t in card.triggers if t.id == trigger_id)


# ── Allowlist: accepted / rejected event shapes (AC 1) ─────────────────────


def test_allowlist_accepts_r10_operational_shapes():
    ActivationEventCreate(event_name="r10_cache_outcome", operational_outcome="hit")
    ActivationEventCreate(
        event_name="r10_provider_incident", operational_dimension="timeout"
    )
    ActivationEventCreate(
        event_name="r10_database_snapshot",
        operational_dimension="storage_pct",
        metric_value=42.5,
    )
    ActivationEventCreate(
        event_name="r10_database_query",
        operational_dimension="history_list",
        duration_ms=25,
    )
    ActivationEventCreate(
        event_name="r10_generation_phase",
        tool_id="resume",
        access_mode="guest_demo",
        operational_dimension="generation",
        duration_ms=123,
    )
    ActivationEventCreate(
        event_name="r10_rate_limit_event",
        operational_dimension="auth",
        operational_outcome="guest",
    )
    ActivationEventCreate(
        event_name="r10_import_outcome",
        operational_dimension="greenhouse",
        operational_outcome="success",
    )


@pytest.mark.parametrize(
    "fields",
    [
        # Free-text / high-cardinality values the allowlist must reject.
        {"event_name": "r10_cache_outcome", "operational_outcome": "bogus"},
        {"event_name": "r10_provider_incident", "operational_dimension": "boom: stacktrace"},
        # A full URL / hostname must never be accepted as a dimension.
        {"event_name": "r10_import_outcome", "operational_dimension": "https://evil.com/path?token=abc"},
        # An unknown extra field (e.g. a raw identifier) is forbidden.
        {"event_name": "r10_cache_outcome", "user_id": "u_123"},
        # An unknown event name is forbidden.
        {"event_name": "r10_totally_made_up"},
        {"event_name": "r10_rate_limit_event", "operational_dimension": "auth"},
        {
            "event_name": "r10_rate_limit_event",
            "operational_dimension": "auth",
            "operational_outcome": "guest",
            "user_id": "u_123",
        },
    ],
)
def test_allowlist_rejects_disallowed_shapes(fields):
    with pytest.raises(Exception):
        ActivationEventCreate(**fields)


# ── Provider-incident grouping (AC 3) ──────────────────────────────────────


def test_group_provider_incidents_collapses_close_failures():
    base = FIXED_NOW
    # Three failures within one minute = one incident (retry storm).
    close = [base, base + timedelta(seconds=10), base + timedelta(seconds=20)]
    assert group_provider_incidents(close) == 1


def test_group_provider_incidents_separates_distant_failures():
    base = FIXED_NOW
    spread = [base, base + timedelta(minutes=10), base + timedelta(minutes=20)]
    assert group_provider_incidents(spread) == 3
    assert group_provider_incidents([]) == 0


def test_provider_trigger_fires_on_three_incidents(db):
    for day in (2, 6, 10):
        _event(
            db,
            event_name="r10_provider_incident",
            operational_dimension="timeout",
            created_at=FIXED_NOW - timedelta(days=day),
        )
    card = compute_scorecard(db, now=FIXED_NOW)
    trig = _trigger(card, "provider_incidents")
    assert trig.state == "fired"
    assert trig.review_required is True
    assert trig.response_ticket == 138
    assert trig.evidence_detail["incidents"] == 3


def test_provider_trigger_not_fired_when_grouped_below_threshold(db):
    # A five-failure retry storm inside one minute is a single incident.
    for i in range(5):
        _event(
            db,
            event_name="r10_provider_incident",
            operational_dimension="unavailable",
            created_at=FIXED_NOW - timedelta(days=1) + timedelta(seconds=i * 5),
        )
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "provider_incidents")
    assert trig.state == "not_fired"
    assert trig.review_required is False
    assert trig.evidence_detail["incidents"] == 1


# ── Cache / multi-instance (AC per D-054, ADR 0004) ────────────────────────


def test_cache_trigger_not_fired_on_single_instance(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.API_REPLICA_CLASS", "single")
    for _ in range(150):
        _event(db, event_name="r10_cache_outcome", operational_outcome="miss", created_at=FIXED_NOW)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "cache_multi_instance")
    assert trig.state == "not_fired"


def test_cache_trigger_fires_on_multi_instance_inefficiency(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.API_REPLICA_CLASS", "multi")
    for _ in range(150):
        _event(db, event_name="r10_cache_outcome", operational_outcome="miss", created_at=FIXED_NOW)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "cache_multi_instance")
    assert trig.state == "fired"
    assert trig.response_ticket == 137


def test_cache_trigger_insufficient_when_multi_but_low_sample(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.API_REPLICA_CLASS", "multi")
    for _ in range(5):
        _event(db, event_name="r10_cache_outcome", operational_outcome="hit", created_at=FIXED_NOW)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "cache_multi_instance")
    assert trig.state == "insufficient_sample"


# ── Latency + false-positive reset (AC per D-056) ──────────────────────────


def _insert_latency_day(db, *, days_ago: int, count: int, duration_ms: int):
    day_at = FIXED_NOW.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago) + timedelta(hours=12)
    for _ in range(count):
        _event(
            db,
            event_name="tool_run_completed",
            tool_id="resume",
            duration_ms=duration_ms,
            created_at=day_at,
        )


def test_latency_sustained_breach_reports_insufficient_for_abandonment(db):
    # p95 > 60s on each of the last 3 days, sufficient sample each day.
    for day in (1, 2, 3):
        _insert_latency_day(db, days_ago=day, count=25, duration_ms=90000)
    _event(
        db,
        event_name="generation_loader_abandoned",
        tool_id="resume",
        duration_ms=45000,
        created_at=FIXED_NOW - timedelta(days=1),
    )
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "latency_abandonment")
    # Sustained latency breach, but no accepted material-elevation threshold → cannot fire.
    assert trig.state == "insufficient_sample"
    assert "resume" in str(trig.evidence_detail["sustained_breach_tools"])
    assert trig.evidence_detail["loader_abandonments"] == 1


def test_latency_false_positive_reset_when_a_day_recovers(db):
    # Days 1 and 3 breach, but day 2 recovers → streak resets → not fired.
    _insert_latency_day(db, days_ago=1, count=25, duration_ms=90000)
    _insert_latency_day(db, days_ago=2, count=25, duration_ms=1000)
    _insert_latency_day(db, days_ago=3, count=25, duration_ms=90000)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "latency_abandonment")
    assert trig.state == "not_fired"


def test_latency_insufficient_when_daily_sample_too_small(db):
    for day in (1, 2, 3):
        _insert_latency_day(db, days_ago=day, count=5, duration_ms=90000)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "latency_abandonment")
    assert trig.state == "insufficient_sample"


# ── Abuse / cost (AC per D-057) ────────────────────────────────────────────


def test_abuse_cost_fires_when_cost_exceeds_budget(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.COST_ALERT_USD_24H", 5.0)
    for _ in range(3):
        _event(
            db,
            event_name="tool_run_completed",
            tool_id="resume",
            cost_estimate=Decimal("2.000000"),
            created_at=FIXED_NOW - timedelta(hours=1),
        )
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "abuse_cost")
    assert trig.state == "fired"
    assert trig.response_ticket == 140


def test_abuse_cost_not_fired_under_budget(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.COST_ALERT_USD_24H", 5.0)
    _event(
        db,
        event_name="tool_run_completed",
        tool_id="resume",
        cost_estimate=Decimal("1.000000"),
        created_at=FIXED_NOW - timedelta(hours=1),
    )
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "abuse_cost")
    assert trig.state == "not_fired"


def _insert_rate_limit_window(db, *, window: int, family: str, count: int):
    boundary = FIXED_NOW.replace(minute=0, second=0, microsecond=0)
    created_at = boundary - timedelta(minutes=window * 15 - 1)
    for _ in range(count):
        _event(
            db,
            event_name="r10_rate_limit_event",
            operational_dimension=family,
            operational_outcome="guest",
            created_at=created_at,
        )


def test_abuse_cost_fires_for_one_family_across_three_completed_windows(db):
    for window in (1, 2, 3):
        _insert_rate_limit_window(db, window=window, family="auth", count=50)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "abuse_cost")
    assert trig.state == "fired"
    assert trig.evidence_detail["rate_limit_sustained_families"] == "auth"


def test_abuse_cost_resets_when_rate_pressure_is_not_consecutive(db):
    _insert_rate_limit_window(db, window=1, family="auth", count=50)
    _insert_rate_limit_window(db, window=2, family="auth", count=49)
    _insert_rate_limit_window(db, window=3, family="auth", count=50)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "abuse_cost")
    assert trig.state == "not_fired"


# ── Database growth (pure threshold logic, AC per D-058) ───────────────────


def test_database_growth_pure_logic():
    assert evaluate_database_growth(80.0)[0] == "fired"
    assert evaluate_database_growth(50.0)[0] == "not_fired"
    assert evaluate_database_growth(None)[0] == "insufficient_sample"


def test_database_trigger_insufficient_on_sqlite(db):
    # No configured capacity + SQLite pool without introspection → unknown.
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "database_growth")
    assert trig.state == "insufficient_sample"


def test_database_trigger_reports_bounded_query_family_p95_without_firing(db):
    for duration in (10, 20, 30, 40):
        _event(
            db,
            event_name="r10_database_query",
            operational_dimension="history_list",
            duration_ms=duration,
            created_at=FIXED_NOW - timedelta(days=1),
        )
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "database_growth")
    assert trig.state == "insufficient_sample"
    assert trig.evidence_detail["query_samples_7d"] == 4
    assert trig.evidence_detail["query_p95_ms"] == "history_list:40.0"
    assert trig.evidence_detail["query_budget"] == "not accepted"


def test_database_snapshot_records_only_available_bounded_metrics(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.scorecard.gather_database_evidence", lambda _db: (42.5, 0.25)
    )
    assert capture_database_snapshot(db) == 2
    rows = db.query(AnalyticsEvent).order_by(AnalyticsEvent.created_at).all()
    assert [(row.operational_dimension, float(row.metric_value)) for row in rows] == [
        ("storage_pct", 42.5),
        ("pool_checkout_ratio", 0.25),
    ]


def test_storage_forecast_requires_seven_days_and_projects_ninety_days():
    assert forecast_storage_pct([(FIXED_NOW, 50.0)]) is None
    assert forecast_storage_pct(
        [(FIXED_NOW - timedelta(days=6), 50.0), (FIXED_NOW, 56.0)]
    ) is None
    assert forecast_storage_pct(
        [(FIXED_NOW - timedelta(days=10), 50.0), (FIXED_NOW, 60.0)]
    ) == 150.0


def test_database_trigger_fires_when_capacity_forecast_reaches_limit(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.scorecard.gather_database_evidence", lambda _db: (60.0, 0.1)
    )
    _event(
        db,
        event_name="r10_database_snapshot",
        operational_dimension="storage_pct",
        metric_value=50,
        created_at=FIXED_NOW - timedelta(days=10),
    )
    _event(
        db,
        event_name="r10_database_snapshot",
        operational_dimension="storage_pct",
        metric_value=60,
        created_at=FIXED_NOW,
    )
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "database_growth")
    assert trig.state == "fired"
    assert trig.evidence_detail["storage_forecast_90d_pct"] == 150.0


# ── Import concentration (AC per D-059) ────────────────────────────────────


def _insert_import(db, *, family: str, outcome: str, count: int):
    for _ in range(count):
        _event(
            db,
            event_name="r10_import_outcome",
            operational_dimension=family,
            operational_outcome=outcome,
            created_at=FIXED_NOW - timedelta(days=1),
        )


def test_import_trigger_fires_on_concentrated_failure(db):
    _insert_import(db, family="greenhouse", outcome="success", count=40)
    _insert_import(db, family="greenhouse", outcome="failure", count=20)  # 60 attempts, 33%
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "import_concentration")
    assert trig.state == "fired"
    assert trig.response_ticket == 142
    assert trig.evidence_detail["top_family"] == "greenhouse"


def test_import_trigger_not_fired_when_healthy(db):
    _insert_import(db, family="lever", outcome="success", count=58)
    _insert_import(db, family="lever", outcome="failure", count=2)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "import_concentration")
    assert trig.state == "not_fired"


def test_import_trigger_insufficient_below_min_attempts(db):
    _insert_import(db, family="workday", outcome="success", count=10)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "import_concentration")
    assert trig.state == "insufficient_sample"


# ── Full card shape + admin access gating ──────────────────────────────────


def test_scorecard_has_all_six_triggers_with_plan(db):
    card = compute_scorecard(db, now=FIXED_NOW)
    ids = {t.id for t in card.triggers}
    assert ids == {
        "cache_multi_instance",
        "provider_incidents",
        "latency_abandonment",
        "abuse_cost",
        "database_growth",
        "import_concentration",
    }
    for t in card.triggers:
        # Every trigger names its predeclared plan (AC: threshold, window,
        # min-sample, owner, rollback, exit criteria, linked response ticket).
        assert t.threshold and t.observation_window and t.minimum_sample
        assert t.owner and t.rollback and t.exit_criteria
        assert 137 <= t.response_ticket <= 142
        # A crossed threshold only asks for review; it never auto-enables.
        assert t.review_required == (t.state == "fired")


def test_scorecard_requires_authentication(client):
    assert client.get(f"{PREFIX}/admin/scorecard").status_code == 401


def test_scorecard_rejects_non_admin(client, auth_headers):
    assert client.get(f"{PREFIX}/admin/scorecard", headers=auth_headers).status_code == 403


def test_scorecard_allows_admin(client, admin_headers):
    resp = client.get(f"{PREFIX}/admin/scorecard", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["replica_class"]
    assert len(body["triggers"]) == 6
