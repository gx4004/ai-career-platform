"""R10 operational scaling-trigger scorecard (issue #136, parent #135).

Read-only instrument. For each of the six predeclared R10 scaling triggers it
reads the first-party operational evidence already collected on the R6
analytics/admin boundary (D-053) plus live runtime introspection (declared
replica class, connection-pool checkout, database storage), decides whether the
trigger's threshold is met on a sufficient, sustained sample, and surfaces the
result beside its owner, rollback, and exit criteria.

It never enables a response. A crossed threshold produces ``state="fired"`` and
``review_required=True`` linking the deferred response ticket (#137–#142); the
scorecard makes the next frontier visible and records when evidence is
insufficient or a breach did not sustain (a reset false positive). This mirrors
the trigger semantics in the parent spec: "a threshold must be sustained for its
stated window and based on a minimum useful sample before a response ticket
becomes the frontier" (D-052).
"""
from __future__ import annotations

import logging
import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models.analytics_event import AnalyticsEvent
from app.schemas.admin import AdminScorecardResponse, ScorecardTrigger, TriggerState
from app.schemas.analytics import IMPORT_FAILURE_OUTCOMES
from app.services.analytics import safe_record_activation_event
from app.services.rate_limit_events import (
    RATE_LIMIT_BUCKET_SECONDS,
    RATE_LIMIT_EVIDENCE_THRESHOLD,
)

logger = logging.getLogger("app.scorecard")

# ── Trigger thresholds (verbatim from the parent spec #135 / D-054–D-059) ──

CACHE_WINDOW_DAYS = 7
CACHE_MIN_SAMPLE = 100

PROVIDER_INCIDENT_WINDOW_DAYS = 30
PROVIDER_INCIDENT_THRESHOLD = 3
# Provider-caused failures closer together than this gap belong to one incident
# window; this is the *read-side* grouping (the write side already collapses a
# request's internal retries into a single incident event).
PROVIDER_INCIDENT_GAP_SECONDS = 300

LATENCY_WINDOW_DAYS = 3
LATENCY_MIN_DAILY_SAMPLE = 20

ABUSE_COST_WINDOW_HOURS = 24
RATE_LIMIT_WINDOW_MINUTES = RATE_LIMIT_BUCKET_SECONDS // 60
RATE_LIMIT_WINDOW_THRESHOLD = RATE_LIMIT_EVIDENCE_THRESHOLD
RATE_LIMIT_CONSECUTIVE_WINDOWS = 3

DB_STORAGE_TRIGGER_PCT = 70.0

IMPORT_WINDOW_DAYS = 14
IMPORT_MIN_ATTEMPTS = 50
IMPORT_FAILURE_RATE = 0.25
IMPORT_FAILURE_SHARE = 0.40
IMPORT_MIN_FAILURES_FOR_SHARE = 10


# Static, predeclared plan for each trigger: owner, rollback, exit criteria, and
# the deferred response ticket a fired trigger authorises *review* of. Threshold
# / window / minimum-sample strings are rendered from the constants above so the
# displayed numbers cannot drift from the logic.
_TRIGGER_META: dict[str, dict[str, object]] = {
    "cache_multi_instance": {
        "label": "Multi-instance / cache",
        "threshold": (
            f"≥2 verified API replicas AND {CACHE_WINDOW_DAYS}-day material "
            "duplicate provider cost or cache-efficiency loss vs the accepted budget"
        ),
        "observation_window": f"{CACHE_WINDOW_DAYS} days",
        "minimum_sample": f"≥{CACHE_MIN_SAMPLE} cache observations in window",
        "response_ticket": 137,
        "response_ticket_title": "Respond to verified multi-instance cache inefficiency",
        "owner": "Product owner (infrastructure)",
        "rollback": "Configuration-first: disable the distributed cache back to in-process, fail-open (ADR 0004)",
        "exit_criteria": "Replica count returns to one, or 7-day cache efficiency/cost returns within the accepted budget",
    },
    "provider_incidents": {
        "label": "Provider incidents",
        "threshold": (
            f"≥{PROVIDER_INCIDENT_THRESHOLD} user-visible provider incidents in "
            f"{PROVIDER_INCIDENT_WINDOW_DAYS} days, or provider-caused availability "
            "breaches the accepted 7-day SLO"
        ),
        "observation_window": f"{PROVIDER_INCIDENT_WINDOW_DAYS} days",
        "minimum_sample": "Any grouped incident (retries collapsed into one)",
        "response_ticket": 138,
        "response_ticket_title": "Qualify and circuit-break a provider fallback after incidents",
        "owner": "Product owner (with privacy/processor review)",
        "rollback": "Circuit breaker returns to closed; no fallback vendor stays configured until R8 quality + processor review pass",
        "exit_criteria": "Incident count falls below threshold across a full window with no SLO breach",
    },
    "latency_abandonment": {
        "label": "Perceived generation latency / abandonment",
        "threshold": (
            f"A tool's submit-to-result p95 breaches its {settings.LATENCY_P95_BUDGET_MS} ms "
            f"budget for {LATENCY_WINDOW_DAYS} consecutive daily windows AND loader "
            "abandonment is materially elevated"
        ),
        "observation_window": f"{LATENCY_WINDOW_DAYS} consecutive daily windows",
        "minimum_sample": f"≥{LATENCY_MIN_DAILY_SAMPLE} completed runs per tool per day",
        "response_ticket": 139,
        "response_ticket_title": "Add real staged generation progress after latency evidence",
        "owner": "Product owner (with developer)",
        "rollback": "Feature-flag staged progress off; the request still returns one validated JSON result (D-056)",
        "exit_criteria": "p95 returns within budget for a full window, or the abandonment signal is instrumented and shows no elevation",
    },
    "abuse_cost": {
        "label": "Abuse / cost pressure",
        "threshold": (
            "One route emits ≥50 limit events in 15 min for 3 consecutive windows, "
            f"or provider LLM cost exceeds ${settings.COST_ALERT_USD_24H:.2f} over "
            f"{ABUSE_COST_WINDOW_HOURS}h"
        ),
        "observation_window": f"15-min limit windows / rolling {ABUSE_COST_WINDOW_HOURS}h cost",
        "minimum_sample": "Sustained limit windows or a fired cost alert",
        "response_ticket": 140,
        "response_ticket_title": "Escalate quotas and challenge only the attacked flow",
        "owner": "Product owner",
        "rollback": "Configuration-first quota tuning; a challenge is scoped to the attacked flow only, never a global CAPTCHA switch (D-057)",
        "exit_criteria": "Cost returns within budget and limit-event pressure subsides across consecutive windows",
    },
    "database_growth": {
        "label": "Database growth",
        "threshold": (
            "A representative query breaches its accepted p95, pool checkout "
            f"pressure is sustained, storage reaches {DB_STORAGE_TRIGGER_PCT:.0f}%, "
            "or the 90-day forecast reaches provisioned capacity"
        ),
        "observation_window": "Rolling; capacity-plan before saturation",
        "minimum_sample": "Configured DB capacity + representative query volume",
        "response_ticket": 141,
        "response_ticket_title": "Optimize the measured PostgreSQL bottleneck",
        "owner": "Product owner (with developer)",
        "rollback": "Additive indexes / bounded query changes are revertible by migration; D-031 primary retention is never auto-pruned (D-058)",
        "exit_criteria": "Query p95 and pool/storage headroom return within the accepted budget after the change",
    },
    "import_concentration": {
        "label": "Job-import source concentration",
        "threshold": (
            f"An allowlisted source family has ≥{IMPORT_MIN_ATTEMPTS} attempts in "
            f"{IMPORT_WINDOW_DAYS} days with a ≥{IMPORT_FAILURE_RATE:.0%} failure rate, "
            f"or produces ≥{IMPORT_FAILURE_SHARE:.0%} of import failures"
        ),
        "observation_window": f"{IMPORT_WINDOW_DAYS} days",
        "minimum_sample": f"≥{IMPORT_MIN_ATTEMPTS} attempts for a family",
        "response_ticket": 142,
        "response_ticket_title": "Specialize or reduce the concentrated job-import source",
        "owner": "Product owner (with terms review)",
        "rollback": "Any source adapter sits behind a kill switch back to the generic path + paste fallback (D-059)",
        "exit_criteria": "The family's failure rate/share returns within budget, or its scope is honestly reduced",
    },
}


def _as_utc(value: datetime | None) -> datetime | None:
    """Normalise a possibly naive stored timestamp to timezone-aware UTC."""
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _p95(values: Sequence[float]) -> float | None:
    """Nearest-rank p95 of a non-empty sample, else None."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(0, math.ceil(0.95 * len(ordered)) - 1)
    return float(ordered[min(rank, len(ordered) - 1)])


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


# ── Per-trigger evaluators. Each returns the dynamic fields for one trigger. ──


def _evaluate_cache(db: Session, now: datetime) -> dict[str, object]:
    window_start = now - timedelta(days=CACHE_WINDOW_DAYS)
    rows = (
        db.query(AnalyticsEvent.operational_outcome, func.count(AnalyticsEvent.id))
        .filter(
            AnalyticsEvent.event_name == "r10_cache_outcome",
            AnalyticsEvent.created_at >= window_start,
        )
        .group_by(AnalyticsEvent.operational_outcome)
        .all()
    )
    counts = {outcome: count for outcome, count in rows}
    hits = counts.get("hit", 0)
    misses = counts.get("miss", 0)
    writes = counts.get("write", 0)
    failures = counts.get("failure", 0)
    lookups = hits + misses + failures
    hit_ratio = round(hits / lookups, 4) if lookups else 0.0
    last_at = _as_utc(
        db.query(func.max(AnalyticsEvent.created_at))
        .filter(
            AnalyticsEvent.event_name == "r10_cache_outcome",
            AnalyticsEvent.created_at >= window_start,
        )
        .scalar()
    )
    detail: dict[str, float | int | str] = {
        "replica_class": settings.API_REPLICA_CLASS,
        "hits": hits,
        "misses": misses,
        "writes": writes,
        "failures": failures,
        "hit_ratio": hit_ratio,
    }

    multi_instance = settings.API_REPLICA_CLASS.lower() != "single"
    if not multi_instance:
        # Multi-instance topology alone starts the review; a single process
        # cannot duplicate provider cost across replicas, so the distributed
        # cache is out of scope regardless of hit ratio (ADR 0004).
        state: TriggerState = "not_fired"
        evidence = (
            f"Single-instance topology; distributed-cache review not triggered. "
            f"Hit ratio {hit_ratio:.0%} over {lookups} lookups."
        )
    elif lookups < CACHE_MIN_SAMPLE:
        state = "insufficient_sample"
        evidence = (
            f"Multi-instance declared but only {lookups} cache observations "
            f"(need ≥{CACHE_MIN_SAMPLE}) to judge duplicate cost."
        )
    else:
        # D-052 requires a predeclared, accepted cache-efficiency or duplicate-
        # provider-cost budget before this evidence may authorize #137 review.
        # No such budget is accepted yet; do not invent a 50% threshold.
        state = "insufficient_sample"
        evidence = (
            f"Multi-instance evidence collected: hit ratio {hit_ratio:.0%}, "
            f"{failures} lookup failures over {lookups} lookups; an accepted "
            "cache-efficiency/cost budget is still required."
        )
    return {
        "state": state,
        "evidence": evidence,
        "evidence_detail": detail,
        "last_evidence_at": _iso(last_at),
        "evidence_fresh": last_at is not None and last_at >= window_start,
    }


def group_provider_incidents(
    timestamps: Sequence[datetime],
    *,
    gap_seconds: int = PROVIDER_INCIDENT_GAP_SECONDS,
) -> int:
    """Group sorted provider-failure timestamps into distinct incident windows.

    Consecutive failures within ``gap_seconds`` of each other belong to one
    incident; a larger gap starts a new one. Pure and deterministic so the
    grouping rule is unit-testable without a database.
    """
    if not timestamps:
        return 0
    ordered = sorted(_as_utc(t) for t in timestamps)
    incidents = 1
    previous = ordered[0]
    for current in ordered[1:]:
        if (current - previous).total_seconds() > gap_seconds:
            incidents += 1
        previous = current
    return incidents


def _evaluate_provider(db: Session, now: datetime) -> dict[str, object]:
    window_start = now - timedelta(days=PROVIDER_INCIDENT_WINDOW_DAYS)
    events = (
        db.query(AnalyticsEvent.created_at, AnalyticsEvent.operational_dimension)
        .filter(
            AnalyticsEvent.event_name == "r10_provider_incident",
            AnalyticsEvent.created_at >= window_start,
        )
        .order_by(AnalyticsEvent.created_at)
        .all()
    )
    timestamps = [row[0] for row in events]
    incidents = group_provider_incidents(timestamps)
    by_category: dict[str, int] = {}
    for _, category in events:
        if category is not None:
            by_category[category] = by_category.get(category, 0) + 1
    last_at = _as_utc(timestamps[-1]) if timestamps else None
    detail: dict[str, float | int | str] = {
        "incidents": incidents,
        "raw_failures": len(timestamps),
        **{f"category_{k}": v for k, v in by_category.items()},
    }
    if incidents >= PROVIDER_INCIDENT_THRESHOLD:
        state: TriggerState = "fired"
        evidence = (
            f"{incidents} grouped provider incidents in "
            f"{PROVIDER_INCIDENT_WINDOW_DAYS}d (≥{PROVIDER_INCIDENT_THRESHOLD})."
        )
    else:
        # The incident branch is below threshold, but the accepted trigger is an
        # OR with a provider-caused availability-SLO branch. That SLO and its
        # authoritative signal are not yet accepted, so the whole trigger cannot
        # truthfully be cleared as not fired.
        state = "insufficient_sample"
        evidence = (
            f"{incidents} grouped provider incidents in "
            f"{PROVIDER_INCIDENT_WINDOW_DAYS}d (threshold {PROVIDER_INCIDENT_THRESHOLD}); "
            f"{len(timestamps)} raw failures. Provider availability-SLO evidence "
            "is not configured."
        )
    return {
        "state": state,
        "evidence": evidence,
        "evidence_detail": detail,
        "last_evidence_at": _iso(last_at),
        "evidence_fresh": last_at is not None,
    }


def _evaluate_latency(db: Session, now: datetime) -> dict[str, object]:
    budget = settings.LATENCY_P95_BUDGET_MS
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Each tool sustains a breach only if it breaches every one of the last
    # LATENCY_WINDOW_DAYS complete daily windows. A day that recovers resets the
    # streak — that is the false-positive reset the spec requires.
    per_tool_breaches: dict[str, list[bool | None]] = {}
    worst_p95 = 0.0
    evaluated_days = 0
    for day_index in range(1, LATENCY_WINDOW_DAYS + 1):
        day_end = today_start - timedelta(days=day_index - 1)
        day_start = today_start - timedelta(days=day_index)
        rows = (
            db.query(AnalyticsEvent.tool_id, AnalyticsEvent.duration_ms)
            .filter(
                AnalyticsEvent.event_name == "tool_run_completed",
                AnalyticsEvent.duration_ms.isnot(None),
                AnalyticsEvent.tool_id.isnot(None),
                AnalyticsEvent.created_at >= day_start,
                AnalyticsEvent.created_at < day_end,
            )
            .all()
        )
        by_tool: dict[str, list[float]] = {}
        for tool_id, duration in rows:
            by_tool.setdefault(tool_id, []).append(float(duration))
        day_had_sample = False
        for tool_id, durations in by_tool.items():
            if len(durations) < LATENCY_MIN_DAILY_SAMPLE:
                # Missing evidence is distinct from a healthy daily window: it
                # can neither sustain a breach nor clear the trigger.
                per_tool_breaches.setdefault(tool_id, []).append(None)
                continue
            day_had_sample = True
            p95 = _p95(durations) or 0.0
            worst_p95 = max(worst_p95, p95)
            per_tool_breaches.setdefault(tool_id, []).append(p95 > budget)
        if day_had_sample:
            evaluated_days += 1

    sustained = [
        tool_id
        for tool_id, breaches in per_tool_breaches.items()
        if len(breaches) == LATENCY_WINDOW_DAYS
        and all(breach is True for breach in breaches)
    ]
    fully_evaluated_tools = [
        tool_id
        for tool_id, breaches in per_tool_breaches.items()
        if len(breaches) == LATENCY_WINDOW_DAYS
        and all(breach is not None for breach in breaches)
    ]
    abandonment_rows = (
        db.query(AnalyticsEvent.tool_id, func.count(AnalyticsEvent.id))
        .filter(
            AnalyticsEvent.event_name == "generation_loader_abandoned",
            AnalyticsEvent.created_at >= today_start - timedelta(days=LATENCY_WINDOW_DAYS),
            AnalyticsEvent.tool_id.isnot(None),
        )
        .group_by(AnalyticsEvent.tool_id)
        .all()
    )
    abandonment_counts = {tool_id: count for tool_id, count in abandonment_rows}
    detail: dict[str, float | int | str] = {
        "budget_ms": budget,
        "worst_p95_ms": round(worst_p95, 1),
        "days_with_sample": evaluated_days,
        "sustained_breach_tools": ", ".join(sorted(sustained)) or "none",
        "loader_abandonments": sum(abandonment_counts.values()),
        "loader_abandonments_by_tool": ", ".join(
            f"{tool}:{count}" for tool, count in sorted(abandonment_counts.items())
        ) or "none",
    }
    if sustained:
        # The abandonment signal now exists, but no material-elevation comparison
        # threshold was accepted in #139. Do not invent one and auto-authorize UI.
        state: TriggerState = "insufficient_sample"
        evidence = (
            f"p95 breach sustained {LATENCY_WINDOW_DAYS}d for {', '.join(sorted(sustained))} "
            f"(worst {worst_p95:.0f} ms > {budget} ms); observed "
            f"{sum(abandonment_counts.values())} loader abandonments, but #139 has no "
            "accepted material-elevation threshold."
        )
    elif not fully_evaluated_tools:
        state = "insufficient_sample"
        evidence = (
            f"No tool had at least {LATENCY_MIN_DAILY_SAMPLE} completed runs on each of "
            f"the last {LATENCY_WINDOW_DAYS} days; p95 not evaluable across the full window."
        )
    else:
        state = "not_fired"
        evidence = (
            f"No tool sustained a p95 breach across {LATENCY_WINDOW_DAYS} consecutive days "
            f"(worst {worst_p95:.0f} ms vs {budget} ms budget)."
        )
    return {
        "state": state,
        "evidence": evidence,
        "evidence_detail": detail,
        "last_evidence_at": None,
        "evidence_fresh": evaluated_days > 0,
    }


def _evaluate_abuse_cost(db: Session, now: datetime) -> dict[str, object]:
    window_start = now - timedelta(hours=ABUSE_COST_WINDOW_HOURS)
    total_cost = (
        db.query(func.coalesce(func.sum(AnalyticsEvent.cost_estimate), 0)).filter(
            AnalyticsEvent.created_at >= window_start
        ).scalar()
    )
    total_cost_f = float(total_cost or 0)
    budget = settings.COST_ALERT_USD_24H
    current_boundary = now.replace(
        minute=(now.minute // RATE_LIMIT_WINDOW_MINUTES) * RATE_LIMIT_WINDOW_MINUTES,
        second=0,
        microsecond=0,
    )
    rate_rows = (
        db.query(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.operational_outcome,
            AnalyticsEvent.metric_value,
            AnalyticsEvent.created_at,
        )
        .filter(
            AnalyticsEvent.event_name == "r10_rate_limit_event",
            AnalyticsEvent.created_at
            >= current_boundary
            - timedelta(
                minutes=RATE_LIMIT_WINDOW_MINUTES * RATE_LIMIT_CONSECUTIVE_WINDOWS
            ),
            AnalyticsEvent.created_at < current_boundary,
        )
        .all()
    )
    counts_by_family: dict[str, list[int]] = {}
    identity_breakdown: dict[tuple[str, str], list[int]] = {}
    for family, identity_type, metric_value, created_at in rate_rows:
        event_at = _as_utc(created_at)
        minutes_before_boundary = (current_boundary - event_at).total_seconds() / 60
        window_index = int((minutes_before_boundary - 0.000001) // RATE_LIMIT_WINDOW_MINUTES)
        if 0 <= window_index < RATE_LIMIT_CONSECUTIVE_WINDOWS:
            route_family = family or "other"
            identity = identity_type or "unknown"
            weight = int(metric_value) if metric_value is not None else 1
            counts_by_family.setdefault(
                route_family, [0] * RATE_LIMIT_CONSECUTIVE_WINDOWS
            )[window_index] += weight
            identity_breakdown.setdefault(
                (route_family, identity), [0] * RATE_LIMIT_CONSECUTIVE_WINDOWS
            )[window_index] += weight
    sustained_flows = [
        family
        for family, counts in counts_by_family.items()
        if all(count >= RATE_LIMIT_WINDOW_THRESHOLD for count in counts)
    ]
    max_rate_events = max(
        (max(counts) for counts in counts_by_family.values()), default=0
    )
    sustained_flow_labels = sorted(sustained_flows)
    breakdown_labels = [
        f"{family}/{identity_type}={','.join(str(value) for value in counts)}"
        for (family, identity_type), counts in sorted(identity_breakdown.items())
    ]
    detail: dict[str, float | int | str] = {
        "cost_24h_usd": round(total_cost_f, 6),
        "cost_alert_budget_usd": budget,
        "rate_limit_max_15m": max_rate_events,
        "rate_limit_sustained_flows": ", ".join(sustained_flow_labels) or "none",
        "rate_limit_identity_breakdown": "; ".join(breakdown_labels) or "none",
        "rate_limit_windows": RATE_LIMIT_CONSECUTIVE_WINDOWS,
    }
    if sustained_flows:
        state: TriggerState = "fired"
        evidence = (
            f"Rate-limit pressure sustained for {', '.join(sustained_flow_labels)}: "
            f"≥{RATE_LIMIT_WINDOW_THRESHOLD} events in each of "
            f"{RATE_LIMIT_CONSECUTIVE_WINDOWS} consecutive {RATE_LIMIT_WINDOW_MINUTES}-min windows."
        )
    elif total_cost_f > budget:
        state: TriggerState = "fired"
        evidence = (
            f"Provider cost ${total_cost_f:.4f} over {ABUSE_COST_WINDOW_HOURS}h exceeds "
            f"the ${budget:.2f} alert budget."
        )
    else:
        state = "not_fired"
        evidence = (
            f"Provider cost ${total_cost_f:.4f} over {ABUSE_COST_WINDOW_HOURS}h within the "
            f"${budget:.2f} budget; no route family sustained rate-limit pressure."
        )
    return {
        "state": state,
        "evidence": evidence,
        "evidence_detail": detail,
        "last_evidence_at": _iso(
            max((_as_utc(created_at) for _, _, _, created_at in rate_rows), default=None)
        ),
        "evidence_fresh": True,
    }


def gather_database_evidence(db: Session) -> tuple[float | None, float | None]:
    """Best-effort live DB storage-headroom % and pool-checkout ratio.

    Returns ``(storage_pct, pool_checkout_ratio)`` where either element is
    ``None`` when the signal is unavailable (e.g. SQLite in tests, or no
    configured capacity). Never raises: introspection failures degrade to
    ``None`` so the scorecard reports insufficient evidence rather than erroring.
    """
    storage_pct: float | None = None
    capacity = settings.DB_CAPACITY_BYTES
    if capacity > 0:
        try:
            used = db.execute(
                text("SELECT pg_database_size(current_database())")
            ).scalar()
            if used is not None:
                storage_pct = round(float(used) / capacity * 100, 2)
        except Exception:  # noqa: BLE001 — non-Postgres or permission; treat as unknown
            storage_pct = None

    pool_ratio: float | None = None
    try:
        pool = db.get_bind().pool
        checked_out = pool.checkedout()
        capacity_conns = pool.size() + getattr(pool, "_max_overflow", 0)
        if capacity_conns > 0:
            pool_ratio = round(checked_out / capacity_conns, 4)
    except Exception:  # noqa: BLE001 — pool without introspection (e.g. StaticPool)
        pool_ratio = None
    return storage_pct, pool_ratio


def capture_database_snapshot(db: Session) -> int:
    """Persist available bounded storage/pool measurements for sustained evidence."""
    storage_pct, pool_ratio = gather_database_evidence(db)
    samples = (
        ("storage_pct", storage_pct),
        ("pool_checkout_ratio", pool_ratio),
    )
    recorded = 0
    for metric, value in samples:
        if value is None:
            continue
        safe_record_activation_event(
            db,
            event_name="r10_database_snapshot",
            operational_dimension=metric,
            metric_value=value,
        )
        recorded += 1
    return recorded


def forecast_storage_pct(
    samples: Sequence[tuple[datetime, float]], *, horizon_days: int = 90
) -> float | None:
    """Linear percentage forecast after at least seven days of sampled evidence."""
    if len(samples) < 2:
        return None
    ordered = sorted((_as_utc(at), value) for at, value in samples)
    span_days = (ordered[-1][0] - ordered[0][0]).total_seconds() / 86_400
    if span_days < 7:
        return None
    slope_per_day = (ordered[-1][1] - ordered[0][1]) / span_days
    return round(max(0.0, ordered[-1][1] + slope_per_day * horizon_days), 2)


def evaluate_database_growth(storage_pct: float | None) -> tuple[TriggerState, str]:
    """Pure threshold logic for the database-growth trigger (D-058).

    Fires only on a hard, measured storage-headroom breach. Pool checkout
    pressure is shown as supporting evidence but not fired on, because a single
    live reading cannot establish that it is *sustained*; query-plan p95 and the
    90-day capacity forecast requires at least seven days of bounded samples, so
    with no storage signal the trigger reports insufficient evidence rather than
    guessing.
    """
    if storage_pct is not None and storage_pct >= DB_STORAGE_TRIGGER_PCT:
        return "fired", (
            f"Storage at {storage_pct:.1f}% of provisioned capacity "
            f"(≥{DB_STORAGE_TRIGGER_PCT:.0f}%)."
        )
    if storage_pct is not None:
        return "not_fired", (
            f"Storage at {storage_pct:.1f}% of capacity (< {DB_STORAGE_TRIGGER_PCT:.0f}%); "
            "query-plan evidence and a mature 90-day forecast remain required."
        )
    return "insufficient_sample", (
        "No provisioned-capacity/storage signal available (set DB_CAPACITY_BYTES on "
        "Postgres); query-plan evidence and a mature forecast remain required."
    )


def _evaluate_database(db: Session, now: datetime) -> dict[str, object]:
    storage_pct, pool_ratio = gather_database_evidence(db)
    query_rows = (
        db.query(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.duration_ms,
        )
        .filter(
            AnalyticsEvent.event_name == "r10_database_query",
            AnalyticsEvent.duration_ms.isnot(None),
            AnalyticsEvent.created_at >= now - timedelta(days=7),
        )
        .all()
    )
    query_durations: dict[str, list[float]] = {}
    for family, duration in query_rows:
        query_durations.setdefault(family, []).append(float(duration))
    query_p95 = {
        family: round(_p95(durations) or 0.0, 1)
        for family, durations in query_durations.items()
    }
    snapshot_rows = (
        db.query(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.metric_value,
            AnalyticsEvent.created_at,
        )
        .filter(
            AnalyticsEvent.event_name == "r10_database_snapshot",
            AnalyticsEvent.metric_value.isnot(None),
            AnalyticsEvent.created_at >= now - timedelta(days=30),
        )
        .order_by(AnalyticsEvent.created_at)
        .all()
    )
    storage_samples = [
        (_as_utc(created_at), float(value))
        for metric, value, created_at in snapshot_rows
        if metric == "storage_pct"
    ]
    pool_samples = [
        float(value)
        for metric, value, _ in snapshot_rows
        if metric == "pool_checkout_ratio"
    ]
    storage_forecast = forecast_storage_pct(storage_samples)
    latest_sampled_storage = storage_samples[-1][1] if storage_samples else None
    effective_storage = storage_pct if storage_pct is not None else latest_sampled_storage
    state, evidence = evaluate_database_growth(effective_storage)
    if storage_forecast is not None and storage_forecast >= 100:
        state = "fired"
        evidence = (
            f"90-day storage forecast reaches {storage_forecast:.1f}% of provisioned capacity."
        )
    detail: dict[str, float | int | str] = {
        "storage_pct": effective_storage if effective_storage is not None else "unknown",
        "pool_checkout_ratio": pool_ratio if pool_ratio is not None else "unknown",
        "storage_trigger_pct": DB_STORAGE_TRIGGER_PCT,
        "query_samples_7d": len(query_rows),
        "query_p95_ms": ", ".join(
            f"{family}:{value:.1f}" for family, value in sorted(query_p95.items())
        ) or "none",
        "query_budget": "not accepted",
        "snapshot_samples_30d": len(snapshot_rows),
        "pool_checkout_max_30d": round(max(pool_samples), 4) if pool_samples else "unknown",
        "storage_forecast_90d_pct": storage_forecast if storage_forecast is not None else "unknown",
    }
    if query_rows:
        evidence += (
            f" Representative query p95 observed for {len(query_p95)} families, "
            "but no accepted p95 budget exists; query timing alone cannot fire #141."
        )
    return {
        "state": state,
        "evidence": evidence,
        "evidence_detail": detail,
        "last_evidence_at": _iso(now),
        "evidence_fresh": bool(snapshot_rows) or storage_pct is not None or pool_ratio is not None,
    }


def _evaluate_import(db: Session, now: datetime) -> dict[str, object]:
    window_start = now - timedelta(days=IMPORT_WINDOW_DAYS)
    rows = (
        db.query(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.operational_outcome,
            func.count(AnalyticsEvent.id),
        )
        .filter(
            AnalyticsEvent.event_name == "r10_import_outcome",
            AnalyticsEvent.created_at >= window_start,
        )
        .group_by(
            AnalyticsEvent.operational_dimension,
            AnalyticsEvent.operational_outcome,
        )
        .all()
    )
    attempts: dict[str, int] = {}
    failures: dict[str, int] = {}
    for family, outcome, count in rows:
        family = family or "other"
        attempts[family] = attempts.get(family, 0) + count
        # Import failures now carry a bounded category, so matching the bare
        # legacy literal would silently stop counting every categorised failure
        # and under-report the very concentration this trigger measures.
        if outcome in IMPORT_FAILURE_OUTCOMES:
            failures[family] = failures.get(family, 0) + count
    total_attempts = sum(attempts.values())
    total_failures = sum(failures.values())

    fired_family: str | None = None
    fired_reason = ""
    for family, family_attempts in attempts.items():
        family_failures = failures.get(family, 0)
        rate = family_failures / family_attempts if family_attempts else 0.0
        share = family_failures / total_failures if total_failures else 0.0
        if family_attempts >= IMPORT_MIN_ATTEMPTS and rate >= IMPORT_FAILURE_RATE:
            fired_family = family
            fired_reason = f"{family_attempts} attempts, {rate:.0%} failure rate"
            break
        if (
            total_failures >= IMPORT_MIN_FAILURES_FOR_SHARE
            and share >= IMPORT_FAILURE_SHARE
        ):
            fired_family = family
            fired_reason = f"{share:.0%} of all import failures"
            break

    last_at = _as_utc(
        db.query(func.max(AnalyticsEvent.created_at))
        .filter(
            AnalyticsEvent.event_name == "r10_import_outcome",
            AnalyticsEvent.created_at >= window_start,
        )
        .scalar()
    )
    top_family = max(attempts, key=lambda k: attempts[k]) if attempts else "none"
    detail: dict[str, float | int | str] = {
        "total_attempts": total_attempts,
        "total_failures": total_failures,
        "top_family": top_family,
        "top_family_attempts": attempts.get(top_family, 0) if attempts else 0,
    }
    if fired_family is not None:
        state: TriggerState = "fired"
        evidence = f"Source family '{fired_family}' concentrated failure: {fired_reason}."
    elif total_attempts < IMPORT_MIN_ATTEMPTS:
        state = "insufficient_sample"
        evidence = (
            f"Only {total_attempts} import attempts in {IMPORT_WINDOW_DAYS}d "
            f"(need ≥{IMPORT_MIN_ATTEMPTS} for a family) to judge concentration."
        )
    else:
        state = "not_fired"
        evidence = (
            f"No source family concentrated failures across {total_attempts} attempts "
            f"({total_failures} failures) in {IMPORT_WINDOW_DAYS}d."
        )
    return {
        "state": state,
        "evidence": evidence,
        "evidence_detail": detail,
        "last_evidence_at": _iso(last_at),
        "evidence_fresh": last_at is not None and last_at >= window_start,
    }


_EVALUATORS = {
    "cache_multi_instance": _evaluate_cache,
    "provider_incidents": _evaluate_provider,
    "latency_abandonment": _evaluate_latency,
    "abuse_cost": _evaluate_abuse_cost,
    "database_growth": _evaluate_database,
    "import_concentration": _evaluate_import,
}


def compute_scorecard(db: Session, *, now: datetime | None = None) -> AdminScorecardResponse:
    """Compute the full read-only R10 scaling-trigger scorecard.

    Evaluates every trigger over its own observation window ending at ``now``
    (injectable for deterministic tests). Never enables a response — a fired
    trigger only sets ``review_required`` and links its deferred response ticket.
    """
    if now is None:
        now = datetime.now(UTC)
    window_start = now - timedelta(days=PROVIDER_INCIDENT_WINDOW_DAYS)

    triggers: list[ScorecardTrigger] = []
    for trigger_id, meta in _TRIGGER_META.items():
        computed = _EVALUATORS[trigger_id](db, now)
        state = computed["state"]
        triggers.append(
            ScorecardTrigger(
                id=trigger_id,
                label=meta["label"],
                threshold=meta["threshold"],
                observation_window=meta["observation_window"],
                minimum_sample=meta["minimum_sample"],
                evidence=computed["evidence"],
                evidence_detail=computed["evidence_detail"],
                evidence_fresh=computed["evidence_fresh"],
                last_evidence_at=computed["last_evidence_at"],
                state=state,
                review_required=state == "fired",
                response_ticket=meta["response_ticket"],
                response_ticket_title=meta["response_ticket_title"],
                owner=meta["owner"],
                rollback=meta["rollback"],
                exit_criteria=meta["exit_criteria"],
            )
        )

    return AdminScorecardResponse(
        generated_at=now.isoformat(),
        window_start=window_start.isoformat(),
        window_end=now.isoformat(),
        replica_class=settings.API_REPLICA_CLASS,
        triggers=triggers,
    )
