"""Approval freeze, duplicate prevention, and submission handoff (R15 #185).

This is the R15 finale, built ON TOP of the #183 accept transition. Approving a
packet:

1. **Freezes an immutable, by-value snapshot** of the resolved materials (D-096). A
   packet is a reference-only composition (D-093) that always reflects its CV
   variant / drafts / listing *as they are now*; approval is the one moment where
   copying is correct, so the commitment survives later edits to those materials.
2. **Prevents duplicates** (D-098) on two axes — a previously approved packet for the
   same role, and an existing campaign that already reached submission for the same
   role — each refused with HTTP 409 and a clear explanation.
3. **Hands off to the official destination** (ADR 0009). The product never submits;
   there is no submission endpoint. The result surfaces only the listing's source URL
   for the owner to open and submit themselves.
4. **Links a campaign-timeline event** (append-only ``packet_approved``), carrying
   only ids and the content hash — never material content.

Accept remains guarded by ``assert_packet_approvable``: a packet with any unresolved
question is never approvable, re-enforced here at approval time.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.campaign_snapshot import CampaignSubmissionSnapshot
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.workspace import Workspace
from app.schemas.application_packets import (
    ApplicationPacketItem,
    PacketApprovalResult,
    PacketApprovalSnapshotResponse,
    PacketApprovalSnapshotsExport,
    PacketSubmissionHandoff,
)
from app.services.campaign_tracking import record_event
from app.services.packet_approval import assert_packet_approvable
from app.services.queue_review import PacketNotFoundError, accept_packet

APPROVAL_SCHEMA_VERSION = "packet-approval/v1"

HANDOFF_INSTRUCTIONS = (
    "Open the official listing to submit your application yourself. This product never "
    "submits on your behalf."
)

__all__ = [
    "DuplicatePacketApprovalError",
    "approve_packet",
    "export_packet_approval_snapshots",
    "delete_packet_approval_snapshots",
]


class DuplicatePacketApprovalError(Exception):
    """Raised when approving would duplicate an application for the same role (D-098).

    Carries a clear, owner-facing ``message`` the endpoint returns with HTTP 409.
    """

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


# ── Role identity used for duplicate detection (low-cardinality, never content) ──


def _normalize(text: str | None) -> str:
    return " ".join((text or "").split()).casefold()


def _role_key(campaign: Workspace) -> str:
    """A stable ``company|role`` identity for one campaign's target role (D-098).

    Prefers the campaign's own company/role (set at adoption), then its canonical
    listing's company/title. Falls back to the campaign id when nothing identifies a
    role, so two role-less campaigns never collide into a false duplicate.
    """
    company = _normalize(campaign.company)
    role = _normalize(campaign.role)
    if not company and not role and campaign.listing is not None:
        company = _normalize(campaign.listing.company)
        role = _normalize(campaign.listing.title)
    key = f"{company}|{role}"
    if key == "|":
        return f"campaign:{campaign.id}"
    return key


def _destination_url(campaign: Workspace) -> str | None:
    """The official destination the owner opens themselves (ADR 0009)."""
    if campaign.listing is not None:
        return campaign.listing.source_url
    return None


# ── By-value freeze (D-096): survives later edits to referenced materials ──


def _freeze_content(db: Session, packet: ApplicationPacket, campaign: Workspace) -> dict:
    """Resolve the packet's references to their content *now* and copy them by value.

    Everything the owner is committing to is captured here so the snapshot is
    self-contained: editing the CV variant, regenerating the drafts, or refreshing the
    listing afterwards cannot change what was approved.
    """
    listing = campaign.listing
    variant = packet.cv_variant
    drafts_run = packet.drafts_run
    return {
        "schema_version": APPROVAL_SCHEMA_VERSION,
        "packet_id": packet.id,
        "campaign_id": packet.campaign_id,
        "listing_id": packet.listing_id,
        "frozen_at": datetime.now(UTC).isoformat(),
        "match_rationale": packet.match_rationale,
        # Empty at approval (the guard forbids approving with any unresolved question),
        # captured for the record.
        "unresolved_questions": packet.unresolved_questions or [],
        "listing": (
            {
                "title": listing.title,
                "company": listing.company,
                "description": listing.description,
                "source_url": listing.source_url,
                "retrieved_at": listing.retrieved_at.isoformat(),
            }
            if listing is not None
            else None
        ),
        "cv_variant": (
            {
                "id": variant.id,
                "document_id": variant.document_id,
                "name": variant.name,
                "target_role": variant.target_role,
                "sections": variant.sections,
            }
            if variant is not None
            else None
        ),
        "drafts": (drafts_run.result_payload or {}) if drafts_run is not None else None,
    }


# ── Duplicate prevention on both axes (D-098) ──


def _assert_no_duplicate(
    db: Session, user_id: str, packet: ApplicationPacket, role_key: str
) -> None:
    # Axis 1 — a previously approved packet for the same role.
    prior_packet = (
        db.query(PacketApprovalSnapshot)
        .filter(
            PacketApprovalSnapshot.user_id == user_id,
            PacketApprovalSnapshot.role_key == role_key,
            PacketApprovalSnapshot.packet_id != packet.id,
        )
        .first()
    )
    if prior_packet is not None:
        raise DuplicatePacketApprovalError(
            "You have already approved an application for this role. Only one approved "
            "packet is allowed per role."
        )

    # Axis 2 — an existing campaign that already reached submission for the same role.
    existing_campaign = (
        db.query(CampaignSubmissionSnapshot)
        .join(Workspace, CampaignSubmissionSnapshot.workspace_id == Workspace.id)
        .filter(Workspace.user_id == user_id, Workspace.id != packet.campaign_id)
        .all()
    )
    for submission in existing_campaign:
        if _role_key(submission.workspace) == role_key:
            raise DuplicatePacketApprovalError(
                "You already have a campaign for this role that reached submission. "
                "Approving this packet would duplicate that application."
            )


# ── Approval orchestration ──


def _snapshot_response(row: PacketApprovalSnapshot) -> PacketApprovalSnapshotResponse:
    return PacketApprovalSnapshotResponse(
        id=row.id,
        packet_id=row.packet_id,
        campaign_id=row.campaign_id,
        listing_id=row.listing_id,
        role_key=row.role_key,
        destination_url=row.destination_url,
        content=json.loads(row.content_json),
        content_sha256=row.content_sha256,
        created_at=row.created_at,
    )


def approve_packet(db: Session, user_id: str, packet_id: str) -> PacketApprovalResult:
    """Approve a packet: guard, dedupe, freeze, link timeline, hand off (R15 #185).

    Order matters: duplicates and an existing frozen approval are refused *before* any
    transition, and the approval predicate is re-enforced by :func:`accept_packet`, so
    a non-approvable or duplicate packet never mutates state.
    """
    packet = (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user_id, ApplicationPacket.id == packet_id)
        .one_or_none()
    )
    if packet is None:
        raise PacketNotFoundError(packet_id)

    # Terminal, once-only: a packet already frozen cannot be re-approved.
    already = (
        db.query(PacketApprovalSnapshot)
        .filter(PacketApprovalSnapshot.packet_id == packet_id)
        .first()
    )
    if already is not None:
        raise DuplicatePacketApprovalError("This packet has already been approved.")

    campaign = (
        db.query(Workspace).filter(Workspace.id == packet.campaign_id).one()
    )
    role_key = _role_key(campaign)
    _assert_no_duplicate(db, user_id, packet, role_key)

    # Guarded status transition + ``packet_accepted`` audit event (#183). Re-enforces
    # ``assert_packet_approvable`` — an unresolved question here raises before the freeze.
    assert_packet_approvable(db, user_id, packet_id)
    packet_item: ApplicationPacketItem = accept_packet(db, user_id, packet_id)

    # Freeze the immutable, by-value snapshot (D-096).
    content = _freeze_content(db, packet, campaign)
    content_json = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    destination_url = _destination_url(campaign)
    snapshot = PacketApprovalSnapshot(
        user_id=user_id,
        packet_id=packet.id,
        campaign_id=packet.campaign_id,
        listing_id=packet.listing_id,
        role_key=role_key,
        destination_url=destination_url,
        content_json=content_json,
        content_sha256=hashlib.sha256(content_json.encode()).hexdigest(),
    )
    db.add(snapshot)
    db.flush()

    # Append-only campaign-timeline link (D-096): ids + hash only, never content.
    record_event(
        db,
        packet.campaign_id,
        "packet_approved",
        {
            "packet_id": packet.id,
            "snapshot_id": snapshot.id,
            "content_sha256": snapshot.content_sha256,
        },
    )
    db.commit()
    db.refresh(snapshot)

    return PacketApprovalResult(
        packet=packet_item,
        snapshot=_snapshot_response(snapshot),
        handoff=PacketSubmissionHandoff(
            destination_url=destination_url,
            instructions=HANDOFF_INSTRUCTIONS,
        ),
    )


# ── Export + deletion cascade (D-099) ──


def export_packet_approval_snapshots(db: Session, user_id: str) -> PacketApprovalSnapshotsExport:
    """The owner's own frozen approval snapshots, machine-readable (D-099 export)."""
    rows = (
        db.query(PacketApprovalSnapshot)
        .filter(PacketApprovalSnapshot.user_id == user_id)
        .order_by(PacketApprovalSnapshot.created_at.asc(), PacketApprovalSnapshot.id)
        .all()
    )
    return PacketApprovalSnapshotsExport(snapshots=[_snapshot_response(row) for row in rows])


def delete_packet_approval_snapshots(db: Session, user_id: str) -> dict[str, int]:
    """Owner-scoped hard delete for the account-deletion cascade (D-099).

    This is the ONLY deletion path — there is no update or single-row delete for an
    approval snapshot, preserving its immutability (D-096).
    """
    deleted = (
        db.query(PacketApprovalSnapshot)
        .filter(PacketApprovalSnapshot.user_id == user_id)
        .delete(synchronize_session=False)
    )
    return {"packet_approval_snapshots": deleted}
