from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from time import perf_counter
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.analytics_event import AnalyticsEvent
from app.schemas.admin import (
    AdminActivationResponse,
    AdminDevelopmentLoopResponse,
    AdminProfileAdoptionResponse,
    DevelopmentGapKindCount,
    DevelopmentResponseKindCount,
    DevelopmentStateTransitionCount,
    FailureCategoryCount,
    FunnelStepCount,
    ProfileKindCount,
    ProfileProvenanceCount,
    ProfileTransitionCount,
    ToolLatencyCost,
)
from app.schemas.analytics import ActivationEventCreate
from app.schemas.telemetry import AccessMode

logger = logging.getLogger("app.analytics")

# Rolling retention window for the durable activation-event store (D-037). Rows
# whose server ingest time (`created_at`) is strictly older than this many days
# are pruned; anything on or within the window is always kept.
ACTIVATION_EVENT_RETENTION_DAYS = 180

# Default admin-dashboard window: a rolling two weeks (D-039, parent #103). The
# read endpoint uses this when the caller supplies no explicit date window.
ACTIVATION_DEFAULT_WINDOW_DAYS = 14

# The six funnel taxonomy steps, in order, each mapped to the activation event
# name(s) that realise it. The completion step counts the backend-authoritative
# ``tool_run_completed`` (fired unconditionally for every run incl. guest, and
# the source of the #106 duration/cost metrics); its consent-gated frontend twin
# ``tool_run_succeeded`` is intentionally not summed here to avoid double
# counting a single run. ``workflow_continued`` and ``auth_signup_source`` are
# the two events wired live in #105 (previously dead), and ``landing_page_viewed``
# is the new entry-point event, so all six steps are real signals.
ACTIVATION_FUNNEL_STEPS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("landing", "Landing viewed", ("landing_page_viewed",)),
    ("tool_started", "Tool started", ("tool_run_started",)),
    ("completed", "Tool completed", ("tool_run_completed",)),
    ("connected_next_step", "Connected next step", ("workflow_continued",)),
    ("signup", "Signup", ("auth_signup_source",)),
    ("revisit_export", "Revisit / export", ("workspace_resumed", "export_action_used")),
)


def _quantize_cost(value: Any) -> Decimal | None:
    """Normalise an aggregate cost to the store's 6-decimal precision."""
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal("0.000001"))


def record_database_query_timing(
    db: Session, *, query_family: str, started_at: float
) -> None:
    """Persist one bounded representative-query duration (#141, D-053)."""
    safe_record_activation_event(
        db,
        event_name="r10_database_query",
        operational_dimension=query_family,
        duration_ms=max(0, int((perf_counter() - started_at) * 1000)),
    )


def aggregate_activation_metrics(
    db: Session,
    *,
    window_start: datetime,
    window_end: datetime,
    access_mode: AccessMode | None = None,
    tool_id: str | None = None,
) -> AdminActivationResponse:
    """Aggregate the activation-event store into the admin dashboard shape (D-039).

    Read-only. Returns the six-step funnel counts, failure counts by allowlisted
    category, and per-tool latency/cost (over completed runs), all restricted to
    ``[window_start, window_end]`` (by server ingest time) and, when
    ``access_mode`` is given, to events tagged with that access mode. When
    ``tool_id`` is given, every aggregate is restricted to that tool. Plain
    aggregate counts only — the dashboard renders them as tables, with no
    charting library (ADR 0001).
    """

    def scoped(query):
        query = query.filter(
            AnalyticsEvent.created_at >= window_start,
            AnalyticsEvent.created_at <= window_end,
        )
        if access_mode is not None:
            query = query.filter(AnalyticsEvent.access_mode == access_mode)
        if tool_id is not None:
            query = query.filter(AnalyticsEvent.tool_id == tool_id)
        return query

    counts_by_name = dict(
        scoped(db.query(AnalyticsEvent.event_name, func.count(AnalyticsEvent.id)))
        .group_by(AnalyticsEvent.event_name)
        .all()
    )
    funnel = [
        FunnelStepCount(
            step=step,
            label=label,
            count=sum(counts_by_name.get(name, 0) for name in names),
        )
        for step, label, names in ACTIVATION_FUNNEL_STEPS
    ]

    failure_rows = (
        scoped(db.query(AnalyticsEvent.failure_category, func.count(AnalyticsEvent.id)))
        .filter(AnalyticsEvent.failure_category.isnot(None))
        .group_by(AnalyticsEvent.failure_category)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .all()
    )
    failures = [
        FailureCategoryCount(failure_category=category, count=count)
        for category, count in failure_rows
    ]

    tool_rows = (
        scoped(
            db.query(
                AnalyticsEvent.tool_id,
                func.count(AnalyticsEvent.id),
                func.avg(AnalyticsEvent.duration_ms),
                func.sum(AnalyticsEvent.cost_estimate),
                func.avg(AnalyticsEvent.cost_estimate),
            )
        )
        .filter(
            AnalyticsEvent.event_name == "tool_run_completed",
            AnalyticsEvent.tool_id.isnot(None),
        )
        .group_by(AnalyticsEvent.tool_id)
        .order_by(AnalyticsEvent.tool_id)
        .all()
    )
    tools = [
        ToolLatencyCost(
            tool_id=tool_id,
            runs=runs,
            avg_duration_ms=(round(float(avg_duration), 1) if avg_duration is not None else None),
            total_cost_estimate=_quantize_cost(total_cost),
            avg_cost_estimate=_quantize_cost(avg_cost),
        )
        for tool_id, runs, avg_duration, total_cost, avg_cost in tool_rows
    ]

    return AdminActivationResponse(
        window_start=window_start.isoformat(),
        window_end=window_end.isoformat(),
        access_mode=access_mode,
        tool_id=tool_id,
        funnel=funnel,
        failures=failures,
        tools=tools,
    )


def aggregate_profile_adoption(
    db: Session,
    *,
    window_start: datetime,
    window_end: datetime,
) -> AdminProfileAdoptionResponse:
    """Aggregate allowlisted profile events into the admin adoption view (D-067, #150).

    Read-only. Answers "is the Evidence Profile being adopted and trusted?" from
    the same first-party analytics store: lifecycle totals, created items grouped
    by kind and provenance class (adoption breadth), and explicit trust decisions
    grouped by their resulting confirmation state (confirmed vs rejected). Every
    figure is a bounded low-cardinality count — no evidence content is reachable
    from these events. Restricted to ``[window_start, window_end]`` by server
    ingest time. Plain aggregate counts only, rendered as tables (ADR 0001).
    """

    def scoped(query):
        return query.filter(
            AnalyticsEvent.created_at >= window_start,
            AnalyticsEvent.created_at <= window_end,
        )

    counts_by_name = dict(
        scoped(db.query(AnalyticsEvent.event_name, func.count(AnalyticsEvent.id)))
        .filter(AnalyticsEvent.event_name.like("profile_item_%"))
        .group_by(AnalyticsEvent.event_name)
        .all()
    )

    kind_rows = (
        scoped(db.query(AnalyticsEvent.evidence_kind, func.count(AnalyticsEvent.id)))
        .filter(
            AnalyticsEvent.event_name == "profile_item_created",
            AnalyticsEvent.evidence_kind.isnot(None),
        )
        .group_by(AnalyticsEvent.evidence_kind)
        .order_by(func.count(AnalyticsEvent.id).desc(), AnalyticsEvent.evidence_kind)
        .all()
    )
    provenance_rows = (
        scoped(db.query(AnalyticsEvent.evidence_provenance, func.count(AnalyticsEvent.id)))
        .filter(
            AnalyticsEvent.event_name == "profile_item_created",
            AnalyticsEvent.evidence_provenance.isnot(None),
        )
        .group_by(AnalyticsEvent.evidence_provenance)
        .order_by(func.count(AnalyticsEvent.id).desc(), AnalyticsEvent.evidence_provenance)
        .all()
    )
    # Trust signal: only the explicit user confirm/reject decisions (an edit also
    # lands as `unconfirmed`, but the trust view counts decisions, not reversions).
    transition_rows = (
        scoped(
            db.query(AnalyticsEvent.confirmation_transition, func.count(AnalyticsEvent.id))
        )
        .filter(
            AnalyticsEvent.event_name.in_(
                ("profile_item_confirmed", "profile_item_rejected")
            ),
            AnalyticsEvent.confirmation_transition.isnot(None),
        )
        .group_by(AnalyticsEvent.confirmation_transition)
        .order_by(func.count(AnalyticsEvent.id).desc(), AnalyticsEvent.confirmation_transition)
        .all()
    )

    return AdminProfileAdoptionResponse(
        window_start=window_start.isoformat(),
        window_end=window_end.isoformat(),
        total_created=counts_by_name.get("profile_item_created", 0),
        total_deleted=counts_by_name.get("profile_item_deleted", 0),
        created_by_kind=[
            ProfileKindCount(kind=kind, count=count) for kind, count in kind_rows
        ],
        created_by_provenance=[
            ProfileProvenanceCount(provenance=provenance, count=count)
            for provenance, count in provenance_rows
        ],
        confirmation_transitions=[
            ProfileTransitionCount(transition=transition, count=count)
            for transition, count in transition_rows
        ],
    )


def aggregate_development_loop(
    db: Session,
    *,
    window_start: datetime,
    window_end: datetime,
) -> AdminDevelopmentLoopResponse:
    """Aggregate R17 lifecycle events without exposing a person or claim (D-114)."""

    def scoped(query):
        return query.filter(
            AnalyticsEvent.created_at >= window_start,
            AnalyticsEvent.created_at <= window_end,
        )

    counts_by_name = dict(
        scoped(db.query(AnalyticsEvent.event_name, func.count(AnalyticsEvent.id)))
        .filter(AnalyticsEvent.event_name.like("development_item_%"))
        .group_by(AnalyticsEvent.event_name)
        .all()
    )
    gap_rows = (
        scoped(
            db.query(
                AnalyticsEvent.development_gap_kind,
                func.count(AnalyticsEvent.id),
            )
        )
        .filter(
            AnalyticsEvent.event_name == "development_item_created",
            AnalyticsEvent.development_gap_kind.isnot(None),
        )
        .group_by(AnalyticsEvent.development_gap_kind)
        .order_by(
            func.count(AnalyticsEvent.id).desc(),
            AnalyticsEvent.development_gap_kind,
        )
        .all()
    )
    response_rows = (
        scoped(
            db.query(
                AnalyticsEvent.development_response_kind,
                func.count(AnalyticsEvent.id),
            )
        )
        .filter(
            AnalyticsEvent.event_name == "development_item_created",
            AnalyticsEvent.development_response_kind.isnot(None),
        )
        .group_by(AnalyticsEvent.development_response_kind)
        .order_by(
            func.count(AnalyticsEvent.id).desc(),
            AnalyticsEvent.development_response_kind,
        )
        .all()
    )
    transition_rows = (
        scoped(
            db.query(
                AnalyticsEvent.development_state_from,
                AnalyticsEvent.development_state_to,
                func.count(AnalyticsEvent.id),
            )
        )
        .filter(
            AnalyticsEvent.event_name == "development_item_state_changed",
            AnalyticsEvent.development_state_from.isnot(None),
            AnalyticsEvent.development_state_to.isnot(None),
        )
        .group_by(
            AnalyticsEvent.development_state_from,
            AnalyticsEvent.development_state_to,
        )
        .order_by(
            func.count(AnalyticsEvent.id).desc(),
            AnalyticsEvent.development_state_from,
            AnalyticsEvent.development_state_to,
        )
        .all()
    )

    return AdminDevelopmentLoopResponse(
        window_start=window_start.isoformat(),
        window_end=window_end.isoformat(),
        total_items_created=counts_by_name.get("development_item_created", 0),
        total_items_deleted=counts_by_name.get("development_item_deleted", 0),
        total_state_transitions=counts_by_name.get(
            "development_item_state_changed", 0
        ),
        created_by_gap_kind=[
            DevelopmentGapKindCount(gap_kind=gap_kind, count=count)
            for gap_kind, count in gap_rows
        ],
        created_by_response_kind=[
            DevelopmentResponseKindCount(
                response_kind=response_kind,
                count=count,
            )
            for response_kind, count in response_rows
        ],
        state_transitions=[
            DevelopmentStateTransitionCount(
                from_state=state_from,
                to_state=state_to,
                count=count,
            )
            for state_from, state_to, count in transition_rows
        ],
    )


def record_activation_event(
    db: Session,
    *,
    commit: bool = True,
    **fields: Any,
) -> AnalyticsEvent:
    """The single shared write seam for the durable activation-event store (D-037).

    This is the only path that writes a row to `analytics_events`. It routes
    every field through the `ActivationEventCreate` allowlist first, so any
    disallowed or free-text field (resume/JD/generated content, email, stack
    traces, raw log lines) raises `pydantic.ValidationError` — rejected exactly
    the way the frontend-telemetry ingestion endpoint already rejects unknown
    fields (`extra="forbid"`).

    Writes on the caller's request-scoped session and normally commits it, so the event
    survives even if the surrounding request later fails and rolls back (e.g. a
    backend tool-run that records its started/failed event and then raises).
    Because it commits the whole session, callers must invoke it only at a point
    where committing is safe — i.e. no unrelated half-written row is pending. All
    current committing call sites satisfy this: the frontend-telemetry endpoint holds only
    the event, and the tool pipeline records after `persist_tool_run` has already
    committed (or, on the failure/started paths, before any tool-run row exists).

    Ordinary operational callers treat the write as best-effort and must not let
    a failure break the user-facing flow; they use `safe_record_activation_event`.
    Security/audit transitions may instead pass ``commit=False`` and deliberately
    propagate failure so the governed state and its required evidence commit or
    roll back together.
    """
    event = ActivationEventCreate(**fields)
    row = AnalyticsEvent(**event.model_dump(exclude_none=True))
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        # Security/audit transitions may need the allowlisted event and the
        # governed state change to share one atomic transaction.
        db.flush()
    return row


def prune_activation_events(
    db: Session,
    *,
    now: datetime | None = None,
    retention_days: int = ACTIVATION_EVENT_RETENTION_DAYS,
) -> int:
    """Delete activation-event rows older than the retention window (D-037).

    Pure data-lifecycle operation, kept independent of the scheduler that drives
    it so the retention boundary is deterministically testable. Rows whose
    `created_at` is strictly older than ``now - retention_days`` are removed;
    rows on or within that boundary are always kept (a row exactly
    ``retention_days`` old is treated as still in-window). Returns the number of
    rows deleted. ``now`` is injectable so tests can pin the boundary without
    depending on the wall clock; it defaults to the current UTC time.
    """
    if now is None:
        now = datetime.now(UTC)
    cutoff = now - timedelta(days=retention_days)
    deleted = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted


def safe_record_activation_event(db: Session, **fields: Any) -> None:
    """Best-effort wrapper: persist an activation event, never raise into the caller.

    Activation instrumentation must never break a tool run or a telemetry
    ingest. Operational failures (DB down, rolled-back session) are swallowed
    with a warning; the event name is logged for triage but no payload is, to
    keep sensitive content out of logs. Allowlist misuse still surfaces in tests
    because those call `record_activation_event` directly.
    """
    try:
        record_activation_event(db, **fields)
    except Exception as exc:  # noqa: BLE001 — instrumentation is best-effort
        try:
            db.rollback()
        except Exception:  # noqa: BLE001 — rollback failure must not mask original
            pass
        logger.warning(
            "activation event persist failed event_name=%s error_type=%s",
            fields.get("event_name"),
            type(exc).__name__,
        )
