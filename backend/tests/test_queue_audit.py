"""R15 #186 — queue lifecycle, audit, and telemetry boundaries.

Covers the append-only queue audit log (D-098), the complete account-deletion
cascade + export over every queue table (D-099), and the telemetry allowlist
boundary that keeps rule values, draft text, and stop answers out of analytics.
"""

import inspect
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.auth.security import hash_password
from app.models.application_packet import ApplicationPacket
from app.models.packet_stop_answer import PacketStopAnswer
from app.models.queue_audit_event import QueueAuditEvent
from app.models.queue_rule import QueueRule, QueueSettings
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.analytics import ActivationEventCreate
from app.schemas.queue_rules import QueueRuleUpsert, QueueSettingsUpsert
from app.services import queue_audit
from app.services.data_export import export_career_data
from app.services.queue_audit import (
    delete_queue_audit_events,
    list_queue_audit_events,
    record_queue_audit_event,
)
from app.services.queue_rules import delete_rule, upsert_rule, upsert_settings
from app.services.tool_runs import delete_all_user_data


def _user(db, email="audit@example.com") -> User:
    user = User(email=email, hashed_password=hash_password("password123"), full_name="A")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── Append-only (D-098) ──


def test_record_appends_immutable_rows(db):
    user = _user(db)
    record_queue_audit_event(db, user_id=user.id, action="queue_paused")
    record_queue_audit_event(db, user_id=user.id, action="queue_resumed")
    rows = list_queue_audit_events(db, user.id)
    assert [r.action for r in rows] == ["queue_paused", "queue_resumed"]
    # Re-recording the same action appends a NEW row; it never mutates an existing one.
    record_queue_audit_event(db, user_id=user.id, action="queue_paused")
    assert len(list_queue_audit_events(db, user.id)) == 3


def test_module_exposes_no_single_row_mutation_path(db):
    """The only removal path is the owner-scoped cascade; there is no update or
    delete-by-id API, so product code cannot alter history in place."""
    names = {n for n, _ in inspect.getmembers(queue_audit, inspect.isfunction)}
    assert "record_queue_audit_event" in names
    assert "delete_queue_audit_events" in names  # cascade-only bulk delete
    forbidden = {
        n
        for n in names
        if any(v in n for v in ("update", "edit", "mutate")) or n == "delete_queue_audit_event"
    }
    assert forbidden == set()


# ── Actions are audited ──


def test_rule_and_settings_actions_emit_audit_events(db):
    user = _user(db)
    upsert_rule(db, user.id, QueueRuleUpsert(rule_type="role", keywords=["engineer"]))
    delete_rule(db, user.id, "role")
    upsert_settings(
        db, user.id, QueueSettingsUpsert(max_packets_per_run=5, cost_ceiling_usd=1.0)
    )
    actions = [r.action for r in list_queue_audit_events(db, user.id)]
    assert actions == ["rule_upserted", "rule_deleted", "settings_updated"]
    # The rule value (keyword) is never stored on the audit row — only the dimension class.
    first = list_queue_audit_events(db, user.id)[0]
    assert first.details == {"rule_type": "role"}
    assert "engineer" not in str(first.details)


# ── Complete cascade + export (D-099) ──


def _seed_every_queue_table(db, user: User) -> None:
    workspace = Workspace(user_id=user.id, label="W")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    db.add_all(
        [
            QueueRule(user_id=user.id, rule_type="role", keywords=["x"]),
            QueueSettings(
                user_id=user.id, max_packets_per_run=3, cost_ceiling_usd=Decimal("1.0")
            ),
        ]
    )
    packet = ApplicationPacket(
        user_id=user.id,
        campaign_id=workspace.id,
        match_rationale={"score": 1},
        unresolved_questions=[],
        status="prepared",
        gate_state="passed",
        estimated_cost_usd=Decimal("0.05"),
    )
    db.add(packet)
    db.commit()
    db.refresh(packet)
    db.add(
        PacketStopAnswer(
            user_id=user.id,
            packet_id=packet.id,
            field="work_authorization",
            category="work_authorization",
            answer_text="secret answer",
        )
    )
    db.commit()
    record_queue_audit_event(db, user_id=user.id, action="packet_prepared", packet_id=packet.id)


def test_account_deletion_cascades_over_every_queue_table(db):
    user = _user(db)
    _seed_every_queue_table(db, user)
    # Sanity: rows exist in each queue table before deletion.
    for model in (QueueRule, QueueSettings, ApplicationPacket, PacketStopAnswer, QueueAuditEvent):
        assert db.query(model).filter(model.user_id == user.id).count() >= 1

    delete_all_user_data(db, user.id)

    for model in (QueueRule, QueueSettings, ApplicationPacket, PacketStopAnswer, QueueAuditEvent):
        assert db.query(model).filter(model.user_id == user.id).count() == 0


def test_audit_history_joins_machine_readable_export(db):
    user = _user(db)
    record_queue_audit_event(
        db, user_id=user.id, action="rule_upserted", details={"rule_type": "location"}
    )
    export = export_career_data(db, user.id)
    assert [e.action for e in export.queue_audit.events] == ["rule_upserted"]
    assert export.queue_audit.events[0].details == {"rule_type": "location"}


def test_reprepared_audit_action_does_not_break_export(db):
    """D-099 regression: the ``packet_reprepared`` action (written by the #268
    reprepare recovery path) must be in the export allowlist, or the entire
    career-data export raises ValidationError and the user cannot download any data.
    """
    user = _user(db)
    record_queue_audit_event(db, user_id=user.id, action="packet_reprepared", packet_id="pkt-1")
    export = export_career_data(db, user.id)
    assert [e.action for e in export.queue_audit.events] == ["packet_reprepared"]


def test_delete_queue_audit_events_is_owner_scoped(db):
    keep = _user(db, email="keep@example.com")
    drop = _user(db, email="drop@example.com")
    record_queue_audit_event(db, user_id=keep.id, action="queue_paused")
    record_queue_audit_event(db, user_id=drop.id, action="queue_paused")
    delete_queue_audit_events(db, drop.id)
    db.commit()
    assert list_queue_audit_events(db, drop.id) == []
    assert len(list_queue_audit_events(db, keep.id)) == 1


# ── Telemetry boundary (allowlist rejects sensitive queue fields) ──


def test_allowlist_permits_only_bounded_queue_gate_events():
    # A bounded gate event is accepted.
    ActivationEventCreate(event_name="packet_queue_gate", operational_outcome="passed")


@pytest.mark.parametrize(
    "forbidden",
    [
        {"role": "senior engineer"},  # rule value
        {"cost_ceiling_usd": 500},  # rule value
        {"cover_letter": "Dear team, ..."},  # draft text
        {"draft_text": "tailored summary"},  # draft text
        {"stop_answer": "US citizen"},  # stop answer
        {"answer_text": "requires visa"},  # stop answer
        {"packet_id": "pkt_123"},  # entity id / user data
    ],
)
def test_allowlist_rejects_rule_values_draft_text_and_stop_answers(forbidden):
    with pytest.raises(ValidationError):
        ActivationEventCreate(
            event_name="packet_queue_gate",
            operational_outcome="passed",
            **forbidden,
        )
