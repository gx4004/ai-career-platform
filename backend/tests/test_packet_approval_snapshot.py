"""Immutable packet approval snapshots and manual handoff (R15 #185)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.auth.security import hash_password
from app.models.application_packet import ApplicationPacket
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.campaign_snapshot import CampaignSubmissionSnapshot
from app.models.cv_document import CvDocument, CvVariant
from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_source import DiscoverySource
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.queue_audit_event import QueueAuditEvent
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.application_packets import (
    PacketApprovalSnapshotResponse,
    PacketSubmissionHandoff,
)
from app.services.application_role_identity import (
    application_role_key,
    normalized_role_key,
)
from app.services.campaign_snapshots import (
    DuplicateRoleSubmissionError,
    capture_submission_snapshot,
)
from app.services.data_export import export_career_data
from app.services.packet_approval import (
    PacketNotApprovableError,
    StopAnswerError,
    store_stop_answer,
)
from app.services.packet_approval_snapshot import (
    DuplicatePacketApprovalError,
    preview_packet_approval,
)
from app.services.packet_approval_snapshot import (
    approve_packet as approve_packet_service,
)
from app.services.queue_review import (
    PacketGateBlockedError,
    PacketNotFoundError,
    edit_packet,
    reject_packet,
    skip_packet,
)
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1"
VALID_RATIONALE = {"composite_score": 80, "signals": [], "matched_rules": []}


def approve_packet(db, user_id: str, packet_id: str):
    """Exercise the mandatory service-level review checkpoint in focused tests."""
    preview = preview_packet_approval(db, user_id, packet_id)
    return approve_packet_service(
        db,
        user_id,
        packet_id,
        expected_material_sha256=preview.material_sha256,
    )


def _approvable_packet(
    db,
    user_id: str,
    *,
    company: str = "Acme",
    role: str = "Senior Backend Engineer",
    source_url: str | None = "https://jobs.example/apply/1",
    discovery_listing_id: str = "discovered-listing-1",
    unresolved: list[dict] | None = None,
    gate_state: str = "passed",
) -> ApplicationPacket:
    discovered_listing = db.get(DiscoveredListing, discovery_listing_id)
    if discovered_listing is None:
        discovered_listing = DiscoveredListing(
            id=discovery_listing_id,
            content_sha256=hashlib.sha256(discovery_listing_id.encode()).hexdigest(),
            title=role,
            company=company,
            description="Exact canonical listing content selected for this packet.",
        )
        db.add(discovered_listing)
        db.flush()
    selected_attribution_id = None
    if source_url is not None and not discovered_listing.attributions:
        source = DiscoverySource(
            source_key=f"packet-source-{discovery_listing_id}",
            display_name="Packet fixture source",
            source_family="licensed",
            owner="Discovery Operations",
            allowed_behavior="feed",
            rate_limit_per_minute=10,
            attribution_rule="Show source and original link",
            retention_days=30,
        )
        db.add(source)
        db.flush()
        attribution = DiscoveredListingAttribution(
                listing_id=discovered_listing.id,
                source_id=source.id,
                source_listing_key=discovery_listing_id,
                source_url=source_url,
                retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
            )
        db.add(attribution)
        db.flush()
        selected_attribution_id = attribution.id
    elif discovered_listing.attributions:
        selected_attribution_id = discovered_listing.attributions[-1].id
    campaign = Workspace(
        user_id=user_id,
        label=f"{role} — {company}",
        company=company,
        role=role,
        discovery_listing_id=discovery_listing_id,
    )
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
                {
                    "id": "ent-1",
                    "evidence_item_id": None,
                    "body": "Original.",
                    "position": 0,
                }
            ],
        }
    ]
    document = CvDocument(user_id=user_id, name="My CV", sections=sections)
    db.add(document)
    db.flush()
    variant = CvVariant(
        document_id=document.id,
        name="Base",
        target_role=role,
        sections=sections,
    )
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
        listing_id=discovery_listing_id,
        listing_attribution_id=selected_attribution_id,
        cv_variant_id=variant.id,
        drafts_run_id=drafts.id,
        match_rationale=VALID_RATIONALE,
        unresolved_questions=unresolved or [],
        status="blocked" if unresolved else "prepared",
        gate_state=gate_state,
        decision="pending",
        estimated_cost_usd=0.02,
    )
    db.add(packet)
    db.commit()
    db.refresh(packet)
    return packet


def test_approval_freezes_exact_materials_hands_off_and_links_timeline(db, test_user):
    packet = _approvable_packet(db, test_user.id)

    result = approve_packet(db, test_user.id, packet.id)

    assert result.packet.decision == "accepted"
    assert result.snapshot.packet_id == packet.id
    assert result.snapshot.listing_id == "discovered-listing-1"
    frozen_listing = result.snapshot.content["listing"]
    assert frozen_listing | {"attributions": []} == {
        "id": "discovered-listing-1",
        "content_sha256": hashlib.sha256(b"discovered-listing-1").hexdigest(),
        "title": "Senior Backend Engineer",
        "company": "Acme",
        "description": "Exact canonical listing content selected for this packet.",
        "attributions": [],
    }
    assert len(frozen_listing["attributions"]) == 1
    assert result.snapshot.content["manual_handoff"]["listing_id"] == packet.listing_id
    assert (
        result.snapshot.content["manual_handoff"]["source_url"]
        == "https://jobs.example/apply/1"
    )
    assert result.snapshot.content["cv_variant"]["sections"][0]["entries"][0]["body"] == (
        "Original."
    )
    assert result.snapshot.content["drafts"]["cover_letter"]["body"] == (
        "Original cover letter."
    )
    canonical = json.dumps(
        result.snapshot.content,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    assert result.snapshot.content_sha256 == hashlib.sha256(canonical.encode()).hexdigest()
    assert result.handoff.destination_url == "https://jobs.example/apply/1"
    assert "yourself" in result.handoff.instructions.lower()

    event = (
        db.query(CampaignEvent)
        .filter(
            CampaignEvent.workspace_id == packet.campaign_id,
            CampaignEvent.event_type == "packet_approved",
        )
        .one()
    )
    assert event.details == {
        "packet_id": packet.id,
        "snapshot_id": result.snapshot.id,
    }
    assert "Original cover letter." not in json.dumps(event.details)
    queue_event = (
        db.query(QueueAuditEvent)
        .filter(
            QueueAuditEvent.packet_id == packet.id,
            QueueAuditEvent.action == "packet_accepted",
        )
        .one()
    )
    assert queue_event.details == {
        "decision": "accepted",
        "snapshot_id": result.snapshot.id,
    }
    assert result.snapshot.content_sha256 not in json.dumps(
        [event.details, queue_event.details]
    )


def test_snapshot_survives_every_referenced_material_edit(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    approved = approve_packet(db, test_user.id, packet.id)
    original = approved.snapshot.model_dump()

    # Production CV variants and ToolRun results are themselves immutable. "Edit"
    # creates replacement versions and repoints the mutable packet/campaign
    # references; exercise that real lifecycle instead of mutating those rows.
    prior_variant = db.get(CvVariant, packet.cv_variant_id)
    replacement_variant = CvVariant(
        document_id=prior_variant.document_id,
        name="Retargeted",
        target_role="Changed role",
        sections=[{"id": "changed", "entries": [{"body": "REWRITTEN."}]}],
    )
    replacement_drafts = ToolRun(
        user_id=test_user.id,
        workspace_id=packet.campaign_id,
        tool_name="application-packet",
        label="Regenerated packet drafts",
        result_payload={"cover_letter": {"body": "REGENERATED."}},
    )
    db.add_all([replacement_variant, replacement_drafts])
    db.flush()
    campaign = db.get(Workspace, packet.campaign_id)
    replacement_listing = CampaignListing(
        workspace_id=campaign.id,
        title="Changed role",
        company="Acme",
        description="CHANGED LISTING.",
        source_url="https://jobs.example/changed",
        retrieved_at=datetime(2026, 7, 25, tzinfo=UTC),
    )
    db.add(replacement_listing)
    db.flush()
    packet.cv_variant_id = replacement_variant.id
    packet.drafts_run_id = replacement_drafts.id
    campaign.current_listing_id = replacement_listing.id
    packet.match_rationale = {"composite_score": 1, "signals": [], "matched_rules": []}
    db.commit()

    row = db.query(PacketApprovalSnapshot).filter_by(packet_id=packet.id).one()
    frozen = json.loads(row.content_json)
    assert frozen == original["content"]
    assert row.content_sha256 == original["content_sha256"]
    assert row.destination_url == "https://jobs.example/apply/1"
    assert all(
        marker not in row.content_json
        for marker in ("REWRITTEN.", "REGENERATED.", "CHANGED LISTING.")
    )


@pytest.mark.parametrize(
    "source_url",
    [
        "javascript:alert('no')",
        "https://exa mple.com/apply",
        "https://example.com:bad/apply",
        "https://user:secret@jobs.example/apply",
    ],
)
def test_handoff_refuses_an_unsafe_destination(db, test_user, source_url):
    packet = _approvable_packet(
        db,
        test_user.id,
        source_url=source_url,
    )

    result = approve_packet(db, test_user.id, packet.id)

    assert result.handoff.destination_url is None
    assert result.snapshot.destination_url is None
    assert (
        result.snapshot.content["manual_handoff"]["source_url"]
        == source_url
    )


def test_approval_blocks_when_packet_listing_attribution_expired(db, test_user):
    packet = _approvable_packet(db, test_user.id, source_url=None)

    preview = preview_packet_approval(db, test_user.id, packet.id)
    assert preview.content["manual_handoff"] is None
    assert preview.destination_url is None

    with pytest.raises(PacketNotApprovableError) as exc_info:
        approve_packet(db, test_user.id, packet.id)

    assert any(
        item["field"] == "listing_attribution"
        for item in exc_info.value.outstanding
    )
    assert db.query(PacketApprovalSnapshot).count() == 0


@pytest.mark.parametrize(
    ("unresolved", "gate_state", "error"),
    [
        (
            [{"field": "salary", "category": "salary", "question": "Desired salary?"}],
            "passed",
            PacketNotApprovableError,
        ),
        ([], "blocked", PacketGateBlockedError),
    ],
)
def test_approval_rechecks_independent_packet_gates(
    db, test_user, unresolved, gate_state, error
):
    packet = _approvable_packet(
        db,
        test_user.id,
        unresolved=unresolved,
        gate_state=gate_state,
    )

    with pytest.raises(error):
        approve_packet(db, test_user.id, packet.id)

    db.refresh(packet)
    assert packet.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_answering_final_stop_unlocks_snapshot_approval(db, test_user):
    packet = _approvable_packet(
        db,
        test_user.id,
        unresolved=[
            {"field": "salary", "category": "salary", "question": "Desired salary?"}
        ],
    )
    store_stop_answer(
        db,
        test_user.id,
        packet.id,
        field="salary",
        answer="Market rate",
    )

    result = approve_packet(db, test_user.id, packet.id)

    assert result.packet.decision == "accepted"
    assert result.snapshot.content["unresolved_questions"] == []
    assert result.snapshot.content["resolved_stop_answers"] == [
        {
            "field": "salary",
            "category": "salary",
            "answer": "Market rate",
        }
    ]

    with pytest.raises(StopAnswerError, match="already approved"):
        store_stop_answer(
            db,
            test_user.id,
            packet.id,
            field="salary",
            answer="Changed after approval",
        )
    row = db.query(PacketApprovalSnapshot).filter_by(packet_id=packet.id).one()
    assert "Changed after approval" not in row.content_json


def test_snapshot_listing_matches_packet_reference_not_mutable_campaign_copy(
    db, test_user
):
    packet = _approvable_packet(db, test_user.id)
    campaign = db.get(Workspace, packet.campaign_id)
    campaign_listing = campaign.listing
    campaign_listing.title = "Revised campaign-facing title"
    campaign_listing.description = "Revised campaign-facing description"
    campaign_listing.source_url = "https://jobs.example/wrong-mutable-copy"
    db.commit()
    assert campaign_listing.id != packet.listing_id
    assert campaign_listing.title != packet.listing.title

    result = approve_packet(db, test_user.id, packet.id)

    assert result.snapshot.listing_id == packet.listing_id
    assert result.snapshot.content["listing"]["id"] == packet.listing_id
    assert result.snapshot.content["listing"]["title"] == packet.listing.title
    assert result.snapshot.content["manual_handoff"]["listing_id"] == packet.listing_id
    assert (
        result.snapshot.content["manual_handoff"]["source_url"]
        == "https://jobs.example/apply/1"
    )


def test_snapshot_freezes_attributions_without_redirecting_pinned_handoff(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    source = DiscoverySource(
        source_key="approval-attribution-source",
        display_name="Approval attribution source",
        source_family="licensed",
        owner="Discovery Operations",
        allowed_behavior="feed",
        rate_limit_per_minute=10,
        attribution_rule="Show source and original link",
        retention_days=30,
    )
    db.add(source)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=packet.listing_id,
            source_id=source.id,
            source_listing_key="role-123",
            source_url="https://source.example/jobs/role-123",
            retrieved_at=datetime(2026, 7, 14, tzinfo=UTC),
        )
    )
    db.commit()

    result = approve_packet(db, test_user.id, packet.id)

    late_attribution = packet.listing.attributions[-1]
    assert result.snapshot.content["listing"]["attributions"][-1] == {
        "id": late_attribution.id,
        "source_id": source.id,
        "source_listing_key": "role-123",
        "source_url": "https://source.example/jobs/role-123",
        "retrieved_at": "2026-07-14T00:00:00+00:00",
    }
    pinned_attribution = next(
        row
        for row in packet.listing.attributions
        if row.id == packet.listing_attribution_id
    )
    assert result.snapshot.content["manual_handoff"] == {
        "listing_id": packet.listing_id,
        "attribution_id": pinned_attribution.id,
        "source_id": pinned_attribution.source_id,
        "source_listing_key": "discovered-listing-1",
        "source_url": "https://jobs.example/apply/1",
        "retrieved_at": "2026-07-13T00:00:00+00:00",
    }


def test_same_packet_and_same_normalized_role_are_both_duplicates(db, test_user):
    first = _approvable_packet(db, test_user.id, discovery_listing_id="listing-a")
    approve_packet(db, test_user.id, first.id)

    with pytest.raises(DuplicatePacketApprovalError, match="already been approved"):
        approve_packet(db, test_user.id, first.id)

    second = _approvable_packet(
        db,
        test_user.id,
        company="  ACME ",
        role=" senior   backend engineer ",
        discovery_listing_id="listing-b",
    )
    with pytest.raises(
        DuplicatePacketApprovalError,
        match="already approved an application",
    ):
        approve_packet(db, test_user.id, second.id)

    db.refresh(second)
    assert second.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 1


@pytest.mark.parametrize("dismiss", [skip_packet, reject_packet])
def test_dismissed_packet_must_be_reopened_before_approval(db, test_user, dismiss):
    packet = _approvable_packet(db, test_user.id)
    dismiss(db, test_user.id, packet.id)

    with pytest.raises(DuplicatePacketApprovalError, match="Only pending packets"):
        approve_packet(db, test_user.id, packet.id)

    reopened = edit_packet(db, test_user.id, packet.id)
    assert reopened.decision == "pending"
    approved = approve_packet(db, test_user.id, packet.id)
    assert approved.packet.decision == "accepted"


@pytest.mark.parametrize(
    ("reference", "field"),
    [
        ("listing_id", "listing"),
        ("cv_variant_id", "cv_variant"),
        ("listing_attribution_id", "listing_attribution"),
    ],
)
def test_approval_rechecks_required_live_references(
    db, test_user, reference, field
):
    packet = _approvable_packet(
        db,
        test_user.id,
        discovery_listing_id=f"missing-{field}-listing",
    )
    setattr(packet, reference, None)
    db.commit()

    with pytest.raises(PacketNotApprovableError) as exc_info:
        approve_packet(db, test_user.id, packet.id)

    assert any(item["field"] == field for item in exc_info.value.outstanding)
    db.refresh(packet)
    assert packet.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_packet_role_identity_comes_from_target_listing_not_mutable_campaign_labels(
    db, test_user
):
    first = _approvable_packet(
        db,
        test_user.id,
        discovery_listing_id="immutable-target-a",
    )
    first_campaign = db.get(Workspace, first.campaign_id)
    first_campaign.company = "Changed after packet preparation"
    first_campaign.role = "Unrelated changed role"
    db.commit()
    first_approval = approve_packet(db, test_user.id, first.id)
    expected_role_key = normalized_role_key(
        "Acme",
        "Senior Backend Engineer",
        fallback_campaign_id=first.campaign_id,
    )
    assert first_approval.snapshot.role_key == expected_role_key

    second = _approvable_packet(
        db,
        test_user.id,
        discovery_listing_id="immutable-target-b",
    )
    with pytest.raises(DuplicatePacketApprovalError, match="already approved"):
        approve_packet(db, test_user.id, second.id)


def test_prior_campaign_submission_for_same_role_blocks_approval(db, test_user):
    prior_campaign = Workspace(
        user_id=test_user.id,
        company="Acme",
        role="Senior Backend Engineer",
    )
    db.add(prior_campaign)
    db.flush()
    db.add(
        CampaignSubmissionSnapshot(
            workspace_id=prior_campaign.id,
            role_key=normalized_role_key(
                "Acme",
                "Senior Backend Engineer",
                fallback_campaign_id=prior_campaign.id,
            ),
            content_json="{}",
            content_sha256="x",
        )
    )
    db.commit()
    packet = _approvable_packet(db, test_user.id)

    with pytest.raises(DuplicatePacketApprovalError, match="reached submission"):
        approve_packet(db, test_user.id, packet.id)

    assert db.query(PacketApprovalSnapshot).count() == 0


def test_current_campaign_submission_for_same_role_blocks_late_approval(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    db.add(
        CampaignSubmissionSnapshot(
            workspace_id=packet.campaign_id,
            role_key=normalized_role_key(
                "Acme",
                "Senior Backend Engineer",
                fallback_campaign_id=packet.campaign_id,
            ),
            content_json="{}",
            content_sha256="x",
        )
    )
    db.commit()

    with pytest.raises(DuplicatePacketApprovalError, match="reached submission"):
        approve_packet(db, test_user.id, packet.id)

    db.refresh(packet)
    assert packet.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_submission_role_identity_survives_later_campaign_edits(db, test_user):
    submitted = Workspace(
        user_id=test_user.id,
        company="Acme",
        role="Senior Backend Engineer",
    )
    db.add(submitted)
    db.flush()
    snapshot = capture_submission_snapshot(db, submitted)
    db.commit()
    assert snapshot.role_key == normalized_role_key(
        "Acme",
        "Senior Backend Engineer",
        fallback_campaign_id=submitted.id,
    )

    submitted.company = "Changed Company"
    submitted.role = "Changed Role"
    db.commit()
    packet = _approvable_packet(db, test_user.id)

    with pytest.raises(DuplicatePacketApprovalError, match="reached submission"):
        approve_packet(db, test_user.id, packet.id)


def test_submission_role_identity_ignores_workspace_edits_before_capture(
    db, test_user
):
    submitted_packet = _approvable_packet(
        db,
        test_user.id,
        discovery_listing_id="submitted-canonical-target",
    )
    submitted = db.get(Workspace, submitted_packet.campaign_id)
    submitted.company = "Changed before submission"
    submitted.role = "Unrelated changed role"
    db.commit()

    snapshot = capture_submission_snapshot(db, submitted)
    db.commit()

    assert snapshot.role_key == normalized_role_key(
        "Acme",
        "Senior Backend Engineer",
        fallback_campaign_id=submitted.id,
    )
    later_packet = _approvable_packet(
        db,
        test_user.id,
        discovery_listing_id="later-canonical-target",
    )
    with pytest.raises(DuplicatePacketApprovalError, match="reached submission"):
        approve_packet(db, test_user.id, later_packet.id)


def test_canonical_listing_identity_distinguishes_partial_campaign_labels(
    db, test_user
):
    company_only_a = Workspace(user_id=test_user.id, company="Acme", role=None)
    company_only_b = Workspace(user_id=test_user.id, company="Acme", role=None)
    role_only_a = Workspace(user_id=test_user.id, company=None, role="Engineer")
    role_only_b = Workspace(user_id=test_user.id, company=None, role="Engineer")
    db.add_all([company_only_a, company_only_b, role_only_a, role_only_b])
    db.flush()
    listings = [
        CampaignListing(
            workspace_id=company_only_a.id,
            title="Backend Engineer",
            company="Acme",
            description="Backend",
            retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
        ),
        CampaignListing(
            workspace_id=company_only_b.id,
            title="Frontend Engineer",
            company="Acme",
            description="Frontend",
            retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
        ),
        CampaignListing(
            workspace_id=role_only_a.id,
            title="Engineer",
            company="Acme",
            description="Acme",
            retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
        ),
        CampaignListing(
            workspace_id=role_only_b.id,
            title="Engineer",
            company="Globex",
            description="Globex",
            retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
        ),
    ]
    db.add_all(listings)
    db.flush()
    for campaign, listing in zip(
        [company_only_a, company_only_b, role_only_a, role_only_b],
        listings,
        strict=True,
    ):
        campaign.current_listing_id = listing.id
    db.commit()

    keys = {
        application_role_key(company_only_a),
        application_role_key(company_only_b),
        application_role_key(role_only_a),
        application_role_key(role_only_b),
    }
    assert len(keys) == 4
    assert all(key.startswith("role:v1:") for key in keys)


def test_role_identity_collapses_unicode_equivalent_text(db, test_user):
    composed = Workspace(user_id=test_user.id, company="Café", role="Engineer")
    decomposed = Workspace(user_id=test_user.id, company="Cafe\u0301", role="Engineer")
    db.add_all([composed, decomposed])
    db.flush()

    assert application_role_key(composed) == application_role_key(decomposed)


def test_submission_snapshot_rejects_a_different_campaign_after_role_approval(
    db, test_user
):
    packet = _approvable_packet(db, test_user.id)
    approve_packet(db, test_user.id, packet.id)
    duplicate = Workspace(
        user_id=test_user.id,
        company=" ACME ",
        role=" senior backend engineer ",
    )
    db.add(duplicate)
    db.commit()

    with pytest.raises(DuplicateRoleSubmissionError, match="approved packet"):
        capture_submission_snapshot(db, duplicate)

    assert (
        db.query(CampaignSubmissionSnapshot)
        .filter_by(workspace_id=duplicate.id)
        .count()
        == 0
    )


def test_submission_snapshot_remains_valid_progression_for_approved_campaign(
    db, test_user
):
    packet = _approvable_packet(db, test_user.id)
    approve_packet(db, test_user.id, packet.id)
    campaign = db.get(Workspace, packet.campaign_id)

    captured = capture_submission_snapshot(db, campaign)
    db.commit()

    assert captured.workspace_id == packet.campaign_id


def test_different_owner_or_role_does_not_false_positive(db, test_user):
    other = User(
        email="other@example.com",
        hashed_password=hash_password("password123"),
    )
    db.add(other)
    db.commit()
    first = _approvable_packet(db, test_user.id, discovery_listing_id="listing-a")
    other_owner = _approvable_packet(db, other.id, discovery_listing_id="listing-b")
    other_role = _approvable_packet(
        db,
        test_user.id,
        role="Frontend Engineer",
        discovery_listing_id="listing-c",
    )

    approve_packet(db, test_user.id, first.id)
    approve_packet(db, other.id, other_owner.id)
    approve_packet(db, test_user.id, other_role.id)

    assert db.query(PacketApprovalSnapshot).count() == 3


def test_approval_is_owner_scoped(db, test_user):
    other = User(
        email="owner-of-packet@example.com",
        hashed_password=hash_password("password123"),
    )
    db.add(other)
    db.commit()
    packet = _approvable_packet(db, other.id)

    with pytest.raises(PacketNotFoundError):
        approve_packet(db, test_user.id, packet.id)


def test_snapshot_is_exported_and_erased_with_account(db, test_user):
    packet = _approvable_packet(db, test_user.id)
    approve_packet(db, test_user.id, packet.id)

    exported = export_career_data(db, test_user.id)
    snapshot = exported.packet_approval_snapshots.snapshots[0]
    assert snapshot.packet_id == packet.id
    assert snapshot.content["drafts"]["cover_letter"]["body"] == (
        "Original cover letter."
    )

    delete_all_user_data(db, test_user.id)
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_deleting_campaign_cascades_its_approval_snapshot(
    client, auth_headers, db, test_user
):
    packet = _approvable_packet(db, test_user.id)
    approve_packet(db, test_user.id, packet.id)

    response = client.delete(
        f"{PREFIX}/history/workspaces/{packet.campaign_id}",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert (
        db.query(PacketApprovalSnapshot)
        .filter_by(campaign_id=packet.campaign_id)
        .count()
        == 0
    )


@pytest.mark.parametrize(
    "schema",
    [PacketApprovalSnapshotResponse, PacketSubmissionHandoff],
)
@pytest.mark.parametrize(
    "destination_url",
    [
        "https://user:secret@jobs.example/apply",
        "https://exa mple.com/apply",
        "https://example.com:bad/apply",
    ],
)
def test_backend_handoff_contract_rejects_unsafe_destination_urls(
    schema, destination_url
):
    payload = {
        "destination_url": destination_url,
        "instructions": "Open it yourself.",
    }
    if schema is PacketApprovalSnapshotResponse:
        payload.update(
            {
                "id": "snapshot-1",
                "packet_id": "packet-1",
                "campaign_id": "campaign-1",
                "listing_id": "listing-1",
                "role_key": "acme|engineer",
                "content": {},
                "content_sha256": "a" * 64,
                "created_at": "2026-07-25T12:00:00Z",
            }
        )
        payload.pop("instructions")

    with pytest.raises(ValidationError):
        schema.model_validate(payload)


def test_accept_endpoint_returns_snapshot_and_manual_handoff(
    client, auth_headers, db, test_user
):
    packet = _approvable_packet(db, test_user.id)
    material_sha256 = client.get(
        f"{PREFIX}/packets/{packet.id}/approval-preview",
        headers=auth_headers,
    ).json()["material_sha256"]

    response = client.post(
        f"{PREFIX}/packets/{packet.id}/accept",
        json={"expected_material_sha256": material_sha256},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["packet"]["decision"] == "accepted"
    assert body["snapshot"]["packet_id"] == packet.id
    assert body["handoff"]["destination_url"] == "https://jobs.example/apply/1"


def test_approval_preview_dereferences_exact_materials_without_accepting(
    client, auth_headers, db, test_user
):
    packet = _approvable_packet(db, test_user.id)

    response = client.get(
        f"{PREFIX}/packets/{packet.id}/approval-preview",
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["content"]["listing"]["id"] == packet.listing_id
    assert body["content"]["cv_variant"]["id"] == packet.cv_variant_id
    assert body["content"]["drafts"]["cover_letter"]["body"] == (
        "Original cover letter."
    )
    assert body["destination_url"] == "https://jobs.example/apply/1"
    db.refresh(packet)
    assert packet.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_accept_rejects_materials_changed_after_preview(
    client, auth_headers, db, test_user
):
    packet = _approvable_packet(db, test_user.id)
    preview = client.get(
        f"{PREFIX}/packets/{packet.id}/approval-preview",
        headers=auth_headers,
    ).json()
    replacement = ToolRun(
        user_id=test_user.id,
        workspace_id=packet.campaign_id,
        tool_name="application-packet",
        result_payload={"cover_letter": {"body": "Changed after review."}},
    )
    db.add(replacement)
    db.flush()
    packet.drafts_run_id = replacement.id
    db.commit()

    response = client.post(
        f"{PREFIX}/packets/{packet.id}/accept",
        json={"expected_material_sha256": preview["material_sha256"]},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "changed after review" in response.json()["detail"].lower()
    db.refresh(packet)
    assert packet.decision == "pending"
    assert db.query(PacketApprovalSnapshot).count() == 0


def test_duplicate_endpoint_is_409(client, auth_headers, db, test_user):
    first = _approvable_packet(db, test_user.id, discovery_listing_id="listing-a")
    first_sha = client.get(
        f"{PREFIX}/packets/{first.id}/approval-preview",
        headers=auth_headers,
    ).json()["material_sha256"]
    assert (
        client.post(
            f"{PREFIX}/packets/{first.id}/accept",
            json={"expected_material_sha256": first_sha},
            headers=auth_headers,
        ).status_code
        == 200
    )
    second = _approvable_packet(db, test_user.id, discovery_listing_id="listing-b")
    second_sha = client.get(
        f"{PREFIX}/packets/{second.id}/approval-preview",
        headers=auth_headers,
    ).json()["material_sha256"]

    response = client.post(
        f"{PREFIX}/packets/{second.id}/accept",
        json={"expected_material_sha256": second_sha},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "already approved an application" in response.json()["detail"]


def test_no_submission_endpoint_or_service_mutator_exists():
    import app.services.packet_approval_snapshot as service
    import app.services.queue_review as queue_review
    from app.main import app
    from app.routers import packets

    routes = [*app.routes, *packets.router.routes]
    assert all("submit" not in getattr(route, "path", "").casefold() for route in routes)
    assert all("submit" not in (getattr(route, "name", "") or "").casefold() for route in routes)
    assert not any(
        name.startswith(("update", "edit", "modify"))
        for name in dir(service)
    )
    assert not hasattr(queue_review, "accept_packet")
