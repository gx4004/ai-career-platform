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
from time import perf_counter

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User
from app.schemas.analytics import ActivationEventCreate
from app.services.analytics import record_database_query_timing
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
        event_name="r10_provider_incident",
        level="error",
        tool_id="resume",
        access_mode="guest_demo",
        operational_dimension="timeout",
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
        operational_dimension="provider",
        duration_ms=123,
    )
    ActivationEventCreate(
        event_name="r10_rate_limit_event",
        operational_dimension="auth",
        operational_outcome="guest",
        metric_value=1,
    )
    ActivationEventCreate(
        event_name="r10_import_outcome",
        operational_dimension="greenhouse",
        operational_outcome="success",
        duration_ms=25,
    )


@pytest.mark.parametrize("outcome", ["success", "failure"])
def test_r10_import_outcome_values_remain_compatible_with_source_health(outcome):
    event = ActivationEventCreate(
        event_name="discovery_source_fetch_outcome",
        operational_dimension="licensed",
        operational_outcome=outcome,
    )

    assert event.operational_outcome == outcome


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
            "metric_value": 1,
            "user_id": "u_123",
        },
        # R10 dimensions are exclusive to their authoritative event shapes.
        {"event_name": "landing_page_viewed", "operational_dimension": "provider"},
        {"event_name": "landing_page_viewed", "operational_dimension": "storage_pct"},
        {
            "event_name": "r10_database_query",
            "operational_dimension": "provider",
            "duration_ms": 5,
        },
        {
            "event_name": "r10_import_outcome",
            "operational_dimension": "greenhouse",
            "operational_outcome": "success",
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
    # Below the incident threshold, and no started runs to judge the SLO half.
    assert trig.state == "insufficient_sample"
    assert trig.review_required is False
    assert trig.evidence_detail["incidents"] == 1


def _insert_started_runs(db, *, count: int, days_ago: int = 1):
    for _ in range(count):
        _event(
            db,
            event_name="tool_run_started",
            tool_id="resume",
            access_mode="account",
            created_at=FIXED_NOW - timedelta(days=days_ago),
        )


def _insert_incidents(db, *, count: int, days_ago: int = 1):
    # Spread beyond the grouping gap so each failure is its own incident.
    for i in range(count):
        _event(
            db,
            event_name="r10_provider_incident",
            operational_dimension="timeout",
            created_at=FIXED_NOW - timedelta(days=days_ago) + timedelta(minutes=i * 10),
        )


def test_provider_trigger_fires_when_availability_breaches_slo(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.scorecard.settings.PROVIDER_AVAILABILITY_SLO_PCT", 99.0
    )
    _insert_started_runs(db, count=100)
    # Two incidents stay under the ≥3 incident-count branch, so only the
    # availability branch can fire: 98% against a 99% SLO.
    _insert_incidents(db, count=2)

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "provider_incidents")

    assert trig.state == "fired"
    assert trig.review_required is True
    assert trig.response_ticket == 138
    assert trig.evidence_detail["availability_pct"] == 98.0


def test_provider_trigger_not_fired_when_availability_meets_slo(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.scorecard.settings.PROVIDER_AVAILABILITY_SLO_PCT", 99.0
    )
    _insert_started_runs(db, count=200)
    _insert_incidents(db, count=1)

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "provider_incidents")

    # Both branches are now evaluable, so the trigger can honestly clear.
    assert trig.state == "not_fired"
    assert trig.review_required is False
    assert trig.evidence_detail["availability_pct"] == 99.5


def test_provider_trigger_keeps_a_thin_run_sample_out_of_the_slo_verdict(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.scorecard.settings.PROVIDER_AVAILABILITY_SLO_PCT", 99.0
    )
    # 98.99% availability — a breach if the ratio were trusted, but one incident
    # in 99 runs is noise, not an SLO measurement.
    _insert_started_runs(db, count=99)
    _insert_incidents(db, count=1)

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "provider_incidents")

    assert trig.state == "insufficient_sample"
    assert trig.review_required is False
    assert trig.evidence_detail["availability_pct"] == "unknown"


# ── Cache / multi-instance (AC per D-054, ADR 0004) ────────────────────────


def test_cache_trigger_not_fired_on_single_instance(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.API_REPLICA_CLASS", "single")
    for _ in range(150):
        _event(db, event_name="r10_cache_outcome", operational_outcome="miss", created_at=FIXED_NOW)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "cache_multi_instance")
    assert trig.state == "not_fired"


def test_cache_trigger_fires_when_hit_ratio_is_below_the_floor(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.API_REPLICA_CLASS", "multi")
    monkeypatch.setattr("app.services.scorecard.settings.CACHE_HIT_RATIO_FLOOR", 0.5)
    for _ in range(150):
        _event(db, event_name="r10_cache_outcome", operational_outcome="miss", created_at=FIXED_NOW)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "cache_multi_instance")
    assert trig.state == "fired"
    assert trig.review_required is True
    assert trig.response_ticket == 137


def test_cache_trigger_not_fired_when_hit_ratio_meets_the_floor(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.API_REPLICA_CLASS", "multi")
    monkeypatch.setattr("app.services.scorecard.settings.CACHE_HIT_RATIO_FLOOR", 0.5)
    for _ in range(120):
        _event(db, event_name="r10_cache_outcome", operational_outcome="hit", created_at=FIXED_NOW)
    for _ in range(30):
        _event(db, event_name="r10_cache_outcome", operational_outcome="miss", created_at=FIXED_NOW)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "cache_multi_instance")
    assert trig.state == "not_fired"
    assert trig.review_required is False
    assert trig.evidence_detail["hit_ratio"] == 0.8


def test_cache_trigger_insufficient_when_multi_but_low_sample(db, monkeypatch):
    monkeypatch.setattr("app.services.scorecard.settings.API_REPLICA_CLASS", "multi")
    for _ in range(5):
        _event(db, event_name="r10_cache_outcome", operational_outcome="hit", created_at=FIXED_NOW)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "cache_multi_instance")
    assert trig.state == "insufficient_sample"


# ── Latency + false-positive reset (AC per D-056) ──────────────────────────


def _insert_latency_day(
    db,
    *,
    days_ago: int,
    count: int,
    duration_ms: int,
    tool_id: str = "resume",
):
    day_at = FIXED_NOW.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago) + timedelta(hours=12)
    for _ in range(count):
        _event(
            db,
            event_name="tool_run_completed",
            tool_id=tool_id,
            duration_ms=duration_ms,
            created_at=day_at,
        )


def _insert_abandonments(
    db,
    *,
    days_ago: int,
    count: int,
    tool_id: str = "resume",
):
    day_at = FIXED_NOW.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago) + timedelta(hours=12)
    for _ in range(count):
        _event(
            db,
            event_name="generation_loader_abandoned",
            tool_id=tool_id,
            duration_ms=45000,
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
    # Sustained latency breach, but the window before it holds no attempts at
    # all, so there is nothing to call the abandonment "elevated" against.
    assert trig.state == "insufficient_sample"
    assert "resume" in str(trig.evidence_detail["sustained_breach_tools"])
    assert trig.evidence_detail["loader_abandonments"] == 1
    assert trig.evidence_detail["abandonment_rate_by_tool"] == "none"


def test_latency_fires_when_abandonment_is_materially_elevated(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.scorecard.settings.LOADER_ABANDONMENT_ELEVATION_FACTOR", 2.0
    )
    for day in (1, 2, 3):
        _insert_latency_day(db, days_ago=day, count=25, duration_ms=90000)
    for day in (4, 5, 6):
        _insert_latency_day(db, days_ago=day, count=25, duration_ms=1000)
    _insert_abandonments(db, days_ago=1, count=10)  # 10/85 ≈ 11.8%
    _insert_abandonments(db, days_ago=4, count=3)  # 3/78 ≈ 3.8% baseline

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "latency_abandonment")

    assert trig.state == "fired"
    assert trig.review_required is True
    assert trig.response_ticket == 139
    assert trig.evidence_detail["abandonment_elevated_tools"] == "resume"


def test_latency_not_fired_when_abandonment_matches_its_baseline(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.scorecard.settings.LOADER_ABANDONMENT_ELEVATION_FACTOR", 2.0
    )
    for day in (1, 2, 3):
        _insert_latency_day(db, days_ago=day, count=25, duration_ms=90000)
    for day in (4, 5, 6):
        _insert_latency_day(db, days_ago=day, count=25, duration_ms=1000)
    _insert_abandonments(db, days_ago=1, count=3)
    _insert_abandonments(db, days_ago=4, count=3)

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "latency_abandonment")

    # The p95 breach sustained, but abandonment held at its own baseline — the
    # trigger's AND is not satisfied, so it clears instead of asking for review.
    assert trig.state == "not_fired"
    assert trig.review_required is False
    assert trig.evidence_detail["abandonment_elevated_tools"] == "none"


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


def test_latency_insufficient_when_daily_samples_are_split_across_tools(db):
    for day, tool_id in ((1, "resume"), (2, "job-match"), (3, "career")):
        _insert_latency_day(
            db,
            days_ago=day,
            count=25,
            duration_ms=1000,
            tool_id=tool_id,
        )

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "latency_abandonment")

    assert trig.state == "insufficient_sample"


def test_latency_insufficient_when_one_tool_has_an_under_sampled_day(db):
    _insert_latency_day(db, days_ago=1, count=25, duration_ms=1000)
    _insert_latency_day(db, days_ago=2, count=5, duration_ms=1000)
    _insert_latency_day(db, days_ago=3, count=25, duration_ms=1000)

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


def _insert_rate_limit_window(
    db, *, window: int, family: str, count: int, identity_type: str = "guest"
):
    boundary = FIXED_NOW.replace(minute=0, second=0, microsecond=0)
    created_at = boundary - timedelta(minutes=window * 15 - 1)
    for _ in range(count):
        _event(
            db,
            event_name="r10_rate_limit_event",
            operational_dimension=family,
            operational_outcome=identity_type,
            metric_value=1,
            created_at=created_at,
        )


def test_abuse_cost_fires_for_one_family_across_three_completed_windows(db):
    for window in (1, 2, 3):
        _insert_rate_limit_window(db, window=window, family="auth", count=50)
    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "abuse_cost")
    assert trig.state == "fired"
    assert trig.evidence_detail["rate_limit_sustained_flows"] == "auth"


def test_abuse_cost_combines_account_and_guest_pressure_by_route_family(db):
    for window in (1, 2, 3):
        _insert_rate_limit_window(
            db, window=window, family="auth", count=25, identity_type="guest"
        )
        _insert_rate_limit_window(
            db, window=window, family="auth", count=25, identity_type="account"
        )

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "abuse_cost")

    assert trig.state == "fired"
    assert trig.evidence_detail["rate_limit_sustained_flows"] == "auth"


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


def _insert_query_timings(db, *, family: str, count: int, duration_ms: int):
    for _ in range(count):
        _event(
            db,
            event_name="r10_database_query",
            operational_dimension=family,
            duration_ms=duration_ms,
            created_at=FIXED_NOW - timedelta(days=1),
        )


def test_database_trigger_reports_bounded_query_family_p95_without_firing(
    db, monkeypatch
):
    monkeypatch.setattr("app.services.scorecard.settings.DB_QUERY_P95_BUDGET_MS", 250)
    # Four timings, every one of them over budget: a p95 this thin is not a p95,
    # so the budget must not turn it into a verdict.
    for duration in (400, 410, 420, 430):
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
    assert trig.evidence_detail["query_p95_ms"] == "history_list:430.0"
    assert trig.evidence_detail["query_budget_ms"] == 250
    assert trig.evidence_detail["query_budget_breaches"] == "none"


def test_database_trigger_fires_when_a_query_family_breaches_its_p95_budget(
    db, monkeypatch
):
    monkeypatch.setattr("app.services.scorecard.settings.DB_QUERY_P95_BUDGET_MS", 250)
    _insert_query_timings(db, family="history_list", count=25, duration_ms=400)
    _insert_query_timings(db, family="workspace_list", count=25, duration_ms=20)

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "database_growth")

    assert trig.state == "fired"
    assert trig.review_required is True
    assert trig.response_ticket == 141
    assert trig.evidence_detail["query_budget_breaches"] == "history_list"


def test_database_trigger_reports_every_instrumented_family_without_firing(
    db, monkeypatch
):
    monkeypatch.setattr("app.services.scorecard.settings.DB_QUERY_P95_BUDGET_MS", 250)
    # #141: the trigger is blind to any read path that is not instrumented, so
    # every family must survive the write seam's allowlist and reach the same
    # bounded p95 report. Written through `record_database_query_timing` on
    # purpose — inserting rows directly would bypass the allowlist this asserts.
    families = (
        "history_list",
        "workspace_list",
        "admin_runs",
        "campaign_detail",
        "history_detail",
    )
    for family in families:
        record_database_query_timing(db, query_family=family, started_at=perf_counter())
    now = datetime.now(UTC)

    trig = _trigger(compute_scorecard(db, now=now), "database_growth")
    assert trig.state == "insufficient_sample"
    assert trig.evidence_detail["query_samples_7d"] == len(families)
    reported = {
        entry.split(":")[0] for entry in trig.evidence_detail["query_p95_ms"].split(", ")
    }
    assert reported == set(families)
    # One timing per family is under the per-family minimum, so richer coverage
    # must not move the trigger's state (D-053, ADR 0004).
    assert trig.evidence_detail["query_budget_ms"] == 250
    assert trig.evidence_detail["query_budget_breaches"] == "none"


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


@pytest.mark.parametrize(
    "category",
    ["failure_blocked", "failure_timeout", "failure_unavailable", "failure_unparseable", "failure_empty"],
)
def test_import_trigger_counts_every_categorised_failure(db, category):
    """Bounded failure categories must still count toward the #142 trigger.

    The trigger previously matched the bare `failure` literal. Once the scraper
    began recording *why* an import failed, matching that literal alone would
    have silently stopped counting every categorised failure — under-reporting
    the concentration the trigger exists to measure, in the exact release that
    made the evidence more precise.
    """
    _insert_import(db, family="greenhouse", outcome="success", count=40)
    _insert_import(db, family="greenhouse", outcome=category, count=20)

    trig = _trigger(compute_scorecard(db, now=FIXED_NOW), "import_concentration")

    assert trig.state == "fired"
    assert trig.evidence_detail["top_family"] == "greenhouse"


def test_import_trigger_does_not_count_a_low_quality_success_as_failure(db):
    """`success_low_quality` means the fetch worked; it is not a failure."""
    _insert_import(db, family="lever", outcome="success", count=40)
    _insert_import(db, family="lever", outcome="success_low_quality", count=20)

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
