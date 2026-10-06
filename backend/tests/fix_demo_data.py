"""One-off repair for a demo account seeded before B16 (2026-10-06).

Not imported by the production app. Applies to an EXISTING seeded account what the
seeds now do on a fresh one (tests.seed_campaigns):

(a) links each application to the Discover listing for the same job (title + company),
    so Discover shows the job as Added instead of offering to add it again;
(b) dates "you applied" (applied_at, the applied snapshot and its events) before any
    move on from Applied, and never after the application's last activity;
(c) names the account and its CV headers "Alex Morgan" (headline and location too).

Idempotent: a second run reports nothing to change. Dry-run by default (nothing is
written); pass --apply to write. Same shape as the seeds: it writes straight to the
database DATABASE_URL points at.

Usage: python -m tests.fix_demo_data <email> [--apply]
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta

import app.models  # noqa: F401  (register every mapper)
from app.database import SessionLocal
from app.models.campaign_event import CampaignEvent
from app.models.user import User
from app.models.workspace import Workspace
from tests.seed_campaigns import (
    apply_demo_identity,
    backdate_applied,
    link_discovery_listings,
)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _fix_chronology(db, user: User) -> list[str]:
    changes: list[str] = []
    for workspace in db.query(Workspace).filter_by(user_id=user.id).order_by(Workspace.created_at):
        if workspace.applied_at is None:
            continue
        applied_at = _utc(workspace.applied_at)
        moved_on = [
            _utc(event.created_at)
            for event in db.query(CampaignEvent).filter_by(workspace_id=workspace.id, event_type="status_changed")
            if (event.details or {}).get("from") == "applied"
        ]
        if moved_on:
            latest = min(moved_on) - timedelta(days=2)
            if workspace.created_at is not None:
                latest = max(latest, _utc(workspace.created_at) + timedelta(hours=1))
            if applied_at < min(moved_on):
                continue
        else:
            latest = _utc(workspace.updated_at)
            if applied_at <= latest:
                continue
        backdate_applied(db, workspace, latest)
        changes.append(f"{workspace.label}: applied {applied_at.isoformat()} -> {latest.isoformat()}")
    return changes


def repair(db, email: str, *, apply: bool) -> list[str]:
    """What (a)-(c) change for the account; written only when ``apply`` is true."""
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None:
        raise LookupError(f"no account for {email}")
    changes = [
        *link_discovery_listings(db, user),
        *_fix_chronology(db, user),
        *apply_demo_identity(db, user),
    ]
    if apply:
        db.commit()
    else:
        db.rollback()
    return changes


def main(argv: list[str]) -> int:
    args = [arg for arg in argv if arg != "--apply"]
    if len(args) != 1:
        print("usage: python -m tests.fix_demo_data <email> [--apply]", file=sys.stderr)
        return 2
    apply = "--apply" in argv
    db = SessionLocal()
    try:
        try:
            changes = repair(db, args[0], apply=apply)
        except LookupError:
            print("not-found")
            return 1
    finally:
        db.close()
    for change in changes:
        print(change)
    print(f"{'applied' if apply else 'dry run, nothing written'}: {len(changes)} change(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
