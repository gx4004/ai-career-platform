from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics import ActivationEventCreate

logger = logging.getLogger("app.analytics")

# Rolling retention window for the durable activation-event store (D-037). Rows
# whose server ingest time (`created_at`) is strictly older than this many days
# are pruned; anything on or within the window is always kept.
ACTIVATION_EVENT_RETENTION_DAYS = 180


def record_activation_event(db: Session, **fields: Any) -> AnalyticsEvent:
    """The single shared write seam for the durable activation-event store (D-037).

    This is the only path that writes a row to `analytics_events`. It routes
    every field through the `ActivationEventCreate` allowlist first, so any
    disallowed or free-text field (resume/JD/generated content, email, stack
    traces, raw log lines) raises `pydantic.ValidationError` — rejected exactly
    the way the frontend-telemetry ingestion endpoint already rejects unknown
    fields (`extra="forbid"`).

    Writes on the caller's request-scoped session and commits it, so the event
    survives even if the surrounding request later fails and rolls back (e.g. a
    backend tool-run that records its started/failed event and then raises).
    Because it commits the whole session, callers must invoke it only at a point
    where committing is safe — i.e. no unrelated half-written row is pending. All
    current call sites satisfy this: the frontend-telemetry endpoint holds only
    the event, and the tool pipeline records after `persist_tool_run` has already
    committed (or, on the failure/started paths, before any tool-run row exists).

    Callers treat the write as best-effort and must not let an operational
    failure here break the user-facing flow; use `safe_record_activation_event`
    for that.
    """
    event = ActivationEventCreate(**fields)
    row = AnalyticsEvent(**event.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
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
