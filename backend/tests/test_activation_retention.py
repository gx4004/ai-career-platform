"""R6 activation-event retention prune (issue #107, D-037).

Covers the parent spec's Testing Decision for this slice: assert the prune
*query* excludes rows within the 180-day window and includes rows past it — a
data-lifecycle correctness test, not a test of the scheduler mechanism that
drives it (the recurring loop is deliberately not asserted here).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.analytics_event import AnalyticsEvent
from app.services.analytics import (
    ACTIVATION_EVENT_RETENTION_DAYS,
    prune_activation_events,
)


def _make_event(db, *, created_at: datetime, event_name: str = "tool_run_started"):
    row = AnalyticsEvent(event_name=event_name, created_at=created_at)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_retention_window_is_180_days():
    assert ACTIVATION_EVENT_RETENTION_DAYS == 180


def test_prune_removes_only_rows_past_the_window(db):
    now = datetime.now(UTC)

    # Clearly within the window — must survive.
    fresh = _make_event(db, created_at=now - timedelta(days=1)).id
    near_edge = _make_event(db, created_at=now - timedelta(days=179)).id
    # On the boundary (exactly 180 days) — still within the window, must survive.
    on_boundary = _make_event(db, created_at=now - timedelta(days=180)).id
    # Clearly past the window — must be removed. (Ids captured before the delete
    # expires the ORM instances.)
    just_past = _make_event(db, created_at=now - timedelta(days=181)).id
    ancient = _make_event(db, created_at=now - timedelta(days=400)).id

    deleted = prune_activation_events(db, now=now)

    assert deleted == 2

    surviving_ids = {row.id for row in db.query(AnalyticsEvent).all()}
    assert surviving_ids == {fresh, near_edge, on_boundary}
    assert just_past not in surviving_ids
    assert ancient not in surviving_ids


def test_prune_keeps_everything_when_all_rows_are_in_window(db):
    now = datetime.now(UTC)
    _make_event(db, created_at=now - timedelta(days=10))
    _make_event(db, created_at=now - timedelta(days=170))

    deleted = prune_activation_events(db, now=now)

    assert deleted == 0
    assert db.query(AnalyticsEvent).count() == 2


def test_prune_uses_a_180_day_cutoff_by_default(db):
    # Row is past the default 180-day window relative to the real clock; the
    # prune must remove it without a caller-supplied `now`.
    _make_event(db, created_at=datetime.now(UTC) - timedelta(days=181))

    deleted = prune_activation_events(db)

    assert deleted == 1
    assert db.query(AnalyticsEvent).count() == 0
