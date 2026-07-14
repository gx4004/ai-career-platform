"""Approval freeze, duplicate prevention, and submission handoff (R15 #185).

Covers the R15 finale built on top of #183 accept: freezing an immutable by-value
snapshot that survives later material edits (D-096), refusing duplicate approvals on
both axes (D-098), linking a campaign-timeline event, handing off to the official
destination with NO submission endpoint (ADR 0009), and the cascade + export (D-099).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from app.auth.security import create_access_token, hash_password
from app.models.application_packet import ApplicationPacket
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.campaign_snapshot import CampaignSubmissionSnapshot
from app.models.cv_document import CvDocument, CvVariant
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.services.data_export import export_career_data
from app.services.packet_approval import PacketNotApprovableError, store_stop_answer
from app.services.packet_approval_snapshot import (
    DuplicatePacketApprovalError,
    approve_packet,
)
from app.services.queue_review import PacketNotFoundError
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1"

VALID_RATIONALE = {"composite_score": 80, "signals": [], "matched_rules": []}


# ── Helper: a fully composed, approvable packet with real referenced materials ──


def _approvable_packet(
    db,
    user_id: str,
    *,
    company: str = "Acme",
    role: str = "Senior Backend Engineer",
    source_url: str | None = "https://jobs.example/apply/1",
    listing_id: str | None = "listing-1",
    unresolved: list[dict] | None = None,
) -> ApplicationPacket:
    campaign = Workspace(user_id=user_id, label=f"{role} — {company}", company=company, role=role)
    db.add(campaign)
    db.flush()
    listing = CampaignListing(
        workspace_id=campaign.id,
        title=role,
        company=company,
        description="We build reliable backend systems for a growing team.",
        source_url=source_url,
        retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
    )
    db.add(listing)
    db.flush()
    campaign.current_listing_id = listing.id

    sections = [
        {
            "id": "sec-exp",
            "kind": "experience",
            "title": "Experience",
            "visible": True,
            "position": 0,
            "entries": [
                {"id": "ent-1", "evidence_item_id": None, "body": "Original.", "position": 0}
            ],
        }
    ]
    doc = CvDocument(user_id=user_id, name="My CV", sections=sections)
    db.add(doc)
    db.flush()
    variant = CvVariant(document_id=doc.id, name="Base", target_role=role, sections=sections)
    db.add(variant)
    db.flush()

    drafts = ToolRun(
        user_id=user_id,
        workspace_id=campaign.id,
        tool_name="application-packet",
        label="Packet drafts",
        result_payload={"cover_letter": {"body": "Original cover letter."}},
    )
    db.add(drafts)
    db.flush()

    packet = ApplicationPacket(
        user_id=user_id,
        campaign_id=campaign.id,
        listing_id=listing_id,
        cv_variant_id=variant.id,
        drafts_run_id=drafts.id,
        match_rationale=VALID_RATIONALE,
        unresolved_questions=unresolved or [],
        status="blocked" if unresolved else "prepared",
        gate_state="passed",
        decision="pending",
        estimated_cost_usd=0.02,
    )
    db.add(packet)
    db.commit()
    db.refresh(packet)
    return packet


# ── Freeze + handoff + timeline (D-096, ADR 0009) ──


def test_approval_freezes_snapshot_and_hands_off(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    result = approve_packet(db, test_user.id, packet.id)

    # Decision transition happened.
    assert result.packet.decision == "accepted"

    # By-value freeze captured the resolved materials.
    content = result.snapshot.content
    assert content["cv_variant"]["sections"][0]["entries"][0]["body"] == "Original."
    assert content["drafts"]["cover_letter"]["body"] == "Original cover letter."
    assert content["listing"]["source_url"] == "https://jobs.example/apply/1"
    assert result.snapshot.content_sha256

    # Handoff surfaces the official destination — the product never submits.
    assert result.handoff.destination_url == "https://jobs.example/apply/1"
    assert "submits" in result.handoff.instructions

    # A single immutable snapshot row exists for the packet.
    rows = db.query(PacketApprovalSnapshot).filter(
        PacketApprovalSnapshot.packet_id == packet.id
    ).all()
    assert len(rows) == 1


def test_approval_links_campaign_timeline_event(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    result = approve_packet(db, test_user.id, packet.id)

    events = (
        db.query(CampaignEvent)
        .filter(
            CampaignEvent.workspace_id == packet.campaign_id,
            CampaignEvent.event_type == "packet_approved",
        )
        .all()
    )
    assert len(events) == 1
    details = events[0].details
    # Only ids + hash — never material content.
    assert details["packet_id"] == packet.id
    assert details["snapshot_id"] == result.snapshot.id
    assert "Original cover letter." not in json.dumps(details)


# ── Immutability: the snapshot survives later edits to referenced materials (D-096) ──


def test_snapshot_survives_material_edits(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    result = approve_packet(db, test_user.id, packet.id)
    original_sha = result.snapshot.content_sha256

    # Edit every referenced material AFTER approval.
    variant = db.query(CvVariant).filter(CvVariant.id == packet.cv_variant_id).one()
    variant.sections = [{"id": "s1", "title": "Experience", "entries": [{"body": "REWRITTEN."}]}]
    drafts = db.query(ToolRun).filter(ToolRun.id == packet.drafts_run_id).one()
    drafts.result_payload = {"cover_letter": {"body": "REGENERATED."}}
    listing = (
        db.query(CampaignListing)
        .filter(CampaignListing.workspace_id == packet.campaign_id)
        .one()
    )
    listing.description = "COMPLETELY DIFFERENT LISTING."
    listing.source_url = "https://jobs.example/apply/CHANGED"
    db.commit()

    # The frozen snapshot is unchanged: content, hash, and destination all intact.
    row = db.query(PacketApprovalSnapshot).filter(
        PacketApprovalSnapshot.packet_id == packet.id
    ).one()
    frozen = json.loads(row.content_json)
    assert frozen["cv_variant"]["sections"][0]["entries"][0]["body"] == "Original."
    assert frozen["drafts"]["cover_letter"]["body"] == "Original cover letter."
    assert "REWRITTEN." not in row.content_json
    assert "REGENERATED." not in row.content_json
    assert "COMPLETELY DIFFERENT" not in row.content_json
    assert row.content_sha256 == original_sha
    assert row.destination_url == "https://jobs.example/apply/1"


def test_no_update_path_for_snapshot(db, test_user):
    """No update service and no re-approval — the snapshot is write-once (D-096)."""
    import app.services.packet_approval_snapshot as svc

    # The service module exposes creation, export, and cascade-delete only.
    assert not any(
        name.startswith(("update", "edit", "modify")) for name in dir(svc)
    )

    packet = _approvable_packet(db, test_user.id)
    approve_packet(db, test_user.id, packet.id)
    # Re-approving the same packet is refused — the row can never be rewritten.
    with pytest.raises(DuplicatePacketApprovalError, match="already been approved"):
        approve_packet(db, test_user.id, packet.id)


def test_no_submission_endpoint_exists():
    """The API surface contains no submission endpoint (ADR 0009)."""
    from app.main import app

    for route in app.routes:
        path = getattr(route, "path", "")
        name = getattr(route, "name", "") or ""
        assert "submit" not in path.lower(), f"unexpected submission path: {path}"
        assert "submit" not in name.lower(), f"unexpected submission route: {name}"

    # The packet router exposes accept/skip/reject/edit — but nothing that submits.
    # Read routes from the router module itself, not the shared `app` singleton, so
    # this is deterministic regardless of test collection order / import effects.
    from app.routers import packets

    packet_paths = [getattr(r, "path", "") for r in packets.router.routes]
    assert any(p.endswith("/accept") for p in packet_paths)
    assert not any("submit" in p for p in packet_paths)


# ── Guard is re-enforced at approval (D-095) ──


def test_approval_blocked_while_unresolved(db, test_user):
    packet = _approvable_packet(
        db,
        test_user.id,
        unresolved=[{"field": "salary", "category": "salary", "question": "Desired salary?"}],
    )
    with pytest.raises(PacketNotApprovableError):
        approve_packet(db, test_user.id, packet.id)
    # No transition, no snapshot frozen.
    db.refresh(packet)
    assert packet.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 0

    # Answering the stop unlocks approval.
    store_stop_answer(db, test_user.id, packet.id, field="salary", answer="Market rate")
    result = approve_packet(db, test_user.id, packet.id)
    assert result.packet.decision == "accepted"


# ── Duplicate prevention, both axes (D-098) ──


def test_duplicate_previously_approved_packet(db, test_user):
    """Axis 1: a second packet for the same role is refused after one is approved."""
    first = _approvable_packet(db, test_user.id, listing_id="listing-a")
    approve_packet(db, test_user.id, first.id)

    # A distinct packet in a distinct campaign, but the SAME company + role.
    second = _approvable_packet(db, test_user.id, listing_id="listing-b")
    with pytest.raises(DuplicatePacketApprovalError, match="already approved an application"):
        approve_packet(db, test_user.id, second.id)
    # The duplicate never transitioned or froze.
    db.refresh(second)
    assert second.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 1


def test_duplicate_existing_campaign_submission(db, test_user):
    """Axis 2: an existing campaign already at submission for the role blocks approval."""
    # An existing campaign for the same role that already reached submission (R13).
    other_campaign = Workspace(
        user_id=test_user.id, company="Acme", role="Senior Backend Engineer"
    )
    db.add(other_campaign)
    db.flush()
    db.add(
        CampaignSubmissionSnapshot(
            workspace_id=other_campaign.id, content_json="{}", content_sha256="x"
        )
    )
    db.commit()

    packet = _approvable_packet(db, test_user.id)
    with pytest.raises(DuplicatePacketApprovalError, match="reached submission"):
        approve_packet(db, test_user.id, packet.id)
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_distinct_roles_are_not_duplicates(db, test_user):
    """Different roles approve independently — dedupe is keyed on the role, not the user."""
    a = _approvable_packet(db, test_user.id, role="Backend Engineer", listing_id="la")
    b = _approvable_packet(db, test_user.id, role="Frontend Engineer", listing_id="lb")
    approve_packet(db, test_user.id, a.id)
    approve_packet(db, test_user.id, b.id)
    assert db.query(PacketApprovalSnapshot).count() == 2


# ── Owner scoping ──


def test_approval_owner_scoped(db, test_user):
    other = User(email="other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    packet = _approvable_packet(db, other.id)
    with pytest.raises(PacketNotFoundError):
        approve_packet(db, test_user.id, packet.id)


# ── Deletion cascade + export (D-099) ──


def test_deletion_cascade_removes_snapshots(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    approve_packet(db, test_user.id, packet.id)
    assert db.query(PacketApprovalSnapshot).count() == 1

    delete_all_user_data(db, test_user.id)
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_export_includes_snapshots(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    approve_packet(db, test_user.id, packet.id)

    export = export_career_data(db, test_user.id)
    snapshots = export.packet_approval_snapshots.snapshots
    assert len(snapshots) == 1
    assert snapshots[0].packet_id == packet.id
    assert snapshots[0].content["cv_variant"]["sections"][0]["entries"][0]["body"] == "Original."


# ── Endpoint: accept approves, freezes, hands off, and refuses duplicates (409) ──


def test_accept_endpoint_approves_and_hands_off(client, auth_headers, db, test_user):
    packet = _approvable_packet(db, test_user.id)
    resp = client.post(f"{PREFIX}/packets/{packet.id}/accept", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["packet"]["decision"] == "accepted"
    assert body["snapshot"]["content_sha256"]
    assert body["handoff"]["destination_url"] == "https://jobs.example/apply/1"


def test_accept_endpoint_duplicate_returns_409(client, auth_headers, db, test_user):
    first = _approvable_packet(db, test_user.id, listing_id="listing-a")
    assert (
        client.post(f"{PREFIX}/packets/{first.id}/accept", headers=auth_headers).status_code
        == 200
    )
    second = _approvable_packet(db, test_user.id, listing_id="listing-b")
    resp = client.post(f"{PREFIX}/packets/{second.id}/accept", headers=auth_headers)
    assert resp.status_code == 409
    assert "already approved an application" in resp.json()["detail"]


def test_accept_endpoint_unresolved_returns_409(client, auth_headers, db, test_user):
    packet = _approvable_packet(
        db,
        test_user.id,
        unresolved=[{"field": "salary", "category": "salary", "question": "Desired salary?"}],
    )
    resp = client.post(f"{PREFIX}/packets/{packet.id}/accept", headers=auth_headers)
    assert resp.status_code == 409
