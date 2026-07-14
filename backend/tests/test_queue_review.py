"""Queue review surface actions + global pause (R15 #183).

Covers the per-packet decisions (accept guarded by the approval predicate, plus
skip / reject / edit), their audit trail, and the global pause halting preparation.
"""

from __future__ import annotations

import pytest

from app.models.application_packet import ApplicationPacket
from app.models.queue_audit_event import QueueAuditEvent
from app.services.application_packets import prepare_packets
from app.services.packet_approval import (
    PacketNotApprovableError,
    store_stop_answer,
)
from app.services.packet_gate import is_queue_paused
from app.services.queue_review import (
    PacketDecisionLockedError,
    PacketNotFoundError,
    accept_packet,
    edit_packet,
    pause_queue,
    queue_review_state,
    reject_packet,
    resume_queue,
    skip_packet,
)

# Reuse the preparation-path helpers from the packet-prep suite so the pause test
# drives the real ``prepare_packets`` flow (ranker patch, rule, listing, CV, stub).
from tests.test_application_packets import (
    _add_cv_variant,
    _add_listing,
    _add_rule,
    _patch_rank,
    _rec,
    _stub_compose,
)

VALID_RATIONALE = {"composite_score": 80, "signals": [], "matched_rules": []}


def _make_packet(
    db,
    user_id: str,
    *,
    unresolved: list[dict] | None = None,
    status: str = "prepared",
    decision: str = "pending",
) -> ApplicationPacket:
    packet = ApplicationPacket(
        user_id=user_id,
        campaign_id="campaign-1",
        listing_id=None,
        cv_variant_id="cv-1",
        drafts_run_id="run-1",
        match_rationale=VALID_RATIONALE,
        unresolved_questions=unresolved or [],
        status=status,
        gate_state="passed",
        decision=decision,
        estimated_cost_usd=0.02,
    )
    db.add(packet)
    db.commit()
    db.refresh(packet)
    return packet


def _audit_actions(db, user_id: str) -> list[str]:
    return [
        row.action
        for row in db.query(QueueAuditEvent)
        .filter(QueueAuditEvent.user_id == user_id)
        .order_by(QueueAuditEvent.created_at.asc(), QueueAuditEvent.id)
    ]


# ── Accept is guarded by the approval predicate (D-095) ──


def test_accept_blocked_while_unresolved(db, test_user):
    packet = _make_packet(
        db,
        test_user.id,
        status="blocked",
        unresolved=[
            {"field": "salary", "category": "salary", "question": "Desired salary?"}
        ],
    )
    with pytest.raises(PacketNotApprovableError):
        accept_packet(db, test_user.id, packet.id)
    db.refresh(packet)
    # No transition, and no ``packet_accepted`` audit event was written.
    assert packet.decision == "pending"
    assert "packet_accepted" not in _audit_actions(db, test_user.id)


def test_accept_succeeds_when_no_unresolved(db, test_user):
    packet = _make_packet(db, test_user.id, unresolved=[])
    result = accept_packet(db, test_user.id, packet.id)
    assert result.decision == "accepted"
    db.refresh(packet)
    assert packet.decision == "accepted"
    assert _audit_actions(db, test_user.id) == ["packet_accepted"]


def test_accept_succeeds_after_answering_stop(db, test_user):
    packet = _make_packet(
        db,
        test_user.id,
        status="blocked",
        unresolved=[
            {"field": "salary", "category": "salary", "question": "Desired salary?"}
        ],
    )
    # Blocked until the owner answers the mandatory stop (the only way to resolve it).
    with pytest.raises(PacketNotApprovableError):
        accept_packet(db, test_user.id, packet.id)
    store_stop_answer(db, test_user.id, packet.id, field="salary", answer="Market rate")
    result = accept_packet(db, test_user.id, packet.id)
    assert result.decision == "accepted"
    actions = _audit_actions(db, test_user.id)
    assert "stop_answer_recorded" in actions
    assert "packet_accepted" in actions


# ── Skip / reject / edit transitions each record their audit event ──


def test_skip_transition_and_audit(db, test_user):
    packet = _make_packet(db, test_user.id)
    result = skip_packet(db, test_user.id, packet.id)
    assert result.decision == "skipped"
    assert _audit_actions(db, test_user.id) == ["packet_skipped"]


def test_reject_transition_and_audit(db, test_user):
    packet = _make_packet(db, test_user.id)
    result = reject_packet(db, test_user.id, packet.id)
    assert result.decision == "rejected"
    assert _audit_actions(db, test_user.id) == ["packet_rejected"]


def test_edit_reopens_to_pending_and_audits(db, test_user):
    # A dismissed packet the owner reopens for material edits (D-073).
    packet = _make_packet(db, test_user.id, decision="rejected")
    result = edit_packet(db, test_user.id, packet.id)
    assert result.decision == "pending"
    # The packet still only references its materials — edit copies no content.
    assert result.cv_variant_id == "cv-1"
    assert result.drafts_run_id == "run-1"
    assert _audit_actions(db, test_user.id) == ["packet_edited"]


# ── An accepted decision cannot be silently overwritten ──


def test_skip_reject_edit_refused_once_accepted(db, test_user):
    packet = _make_packet(db, test_user.id, decision="accepted")
    for action in (skip_packet, reject_packet, edit_packet):
        with pytest.raises(PacketDecisionLockedError):
            action(db, test_user.id, packet.id)
    db.refresh(packet)
    # The decision stays exactly what it was — no action snuck through.
    assert packet.decision == "accepted"
    assert _audit_actions(db, test_user.id) == []


def test_action_on_missing_packet_raises(db, test_user):
    for action in (accept_packet, skip_packet, reject_packet, edit_packet):
        with pytest.raises(PacketNotFoundError):
            action(db, test_user.id, "does-not-exist")


def test_actions_are_owner_scoped(db, test_user):
    from app.auth.security import hash_password
    from app.models.user import User

    other = User(email="other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    packet = _make_packet(db, other.id)
    # The owner cannot act on another user's packet.
    with pytest.raises(PacketNotFoundError):
        accept_packet(db, test_user.id, packet.id)


# ── Global pause halts preparation; resume restores it ──


@pytest.mark.asyncio
async def test_pause_halts_prepare_and_resume_restores(db, test_user, monkeypatch):
    _add_listing(db, "listing-pause")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("listing-pause")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])

    # Paused: preparation refuses immediately and prepares nothing.
    pause_queue(db, test_user.id)
    assert is_queue_paused(db) is True
    assert queue_review_state(db).paused is True
    halted = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert halted.prepares is False
    assert halted.reason == "halted"
    assert db.query(ApplicationPacket).count() == 0

    # Resumed: preparation runs again.
    resume_queue(db, test_user.id)
    assert is_queue_paused(db) is False
    ready = await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    assert ready.prepares is True
    assert ready.prepared_count == 1

    actions = _audit_actions(db, test_user.id)
    assert "queue_paused" in actions
    assert "queue_resumed" in actions


def test_pause_state_reported_for_ui(db, test_user):
    assert queue_review_state(db).paused is False
    pause_queue(db, test_user.id)
    state = queue_review_state(db)
    assert state.paused is True
    assert state.preparation_halted is False
