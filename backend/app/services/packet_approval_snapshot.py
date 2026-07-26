"""Freeze an approved R15 packet and hand the owner to the official destination.

This module is deliberately R15-only: it persists the exact by-value content the
owner approved, prevents duplicate approvals, appends audit/timeline links, and
returns a manual handoff. It exposes no source integration or submission path.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.campaign_snapshot import CampaignSubmissionSnapshot
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.packet_stop_answer import PacketStopAnswer
from app.models.workspace import Workspace
from app.schemas.application_packets import (
    PacketApprovalPreview,
    PacketApprovalResult,
    PacketApprovalSnapshotResponse,
    PacketApprovalSnapshotsExport,
    PacketSubmissionHandoff,
    safe_https_destination,
)
from app.services.application_role_identity import (
    lock_application_owner,
    packet_application_role_key,
)
from app.services.campaign_tracking import record_event
from app.services.packet_approval import (
    answered_fields_for_packet,
    assert_packet_approvable,
    packet_item_with_true_unresolved,
)
from app.services.packet_gate import is_queue_eligible
from app.services.queue_audit import record_queue_audit_event
from app.services.queue_review import PacketGateBlockedError, PacketNotFoundError

APPROVAL_SCHEMA_VERSION = "packet-approval/v1"
HANDOFF_INSTRUCTIONS = (
    "Open the official listing and submit the approved application yourself. "
    "Career Workbench does not submit it on your behalf."
)

__all__ = [
    "DuplicatePacketApprovalError",
    "approve_packet",
    "preview_packet_approval",
    "delete_packet_approval_snapshots",
    "export_packet_approval_snapshots",
]


class DuplicatePacketApprovalError(Exception):
    """Approving would duplicate an immutable packet or an applied role."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class PacketApprovalChangedError(Exception):
    """The materials changed after the owner reviewed the preview."""


def _material_sha256(content: dict) -> str:
    review_content = {key: value for key, value in content.items() if key != "frozen_at"}
    canonical = json.dumps(
        review_content,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def preview_packet_approval(
    db: Session,
    user_id: str,
    packet_id: str,
) -> PacketApprovalPreview:
    """Return the exact current references by value without approving or mutating."""
    packet = (
        db.query(ApplicationPacket)
        .filter(
            ApplicationPacket.user_id == user_id,
            ApplicationPacket.id == packet_id,
        )
        .one_or_none()
    )
    if packet is None:
        raise PacketNotFoundError(packet_id)
    answered_fields = answered_fields_for_packet(db, user_id, packet_id)
    packet_item = packet_item_with_true_unresolved(packet, answered_fields)
    answers = (
        db.query(PacketStopAnswer)
        .filter(
            PacketStopAnswer.user_id == user_id,
            PacketStopAnswer.packet_id == packet_id,
        )
        .order_by(PacketStopAnswer.field.asc(), PacketStopAnswer.id.asc())
        .all()
    )
    attributions = _frozen_listing_attributions(packet)
    handoff = _manual_handoff(packet, attributions)
    content = _snapshot_content(
        packet,
        listing_attributions=attributions,
        manual_handoff=handoff,
        unresolved_questions=[
            item.model_dump(mode="json") for item in packet_item.unresolved_questions
        ],
        resolved_stop_answers=[
            {"field": row.field, "category": row.category, "answer": row.answer_text}
            for row in answers
        ],
        frozen_at=datetime.now(UTC),
    )
    return PacketApprovalPreview(
        content=content,
        destination_url=_destination_url(handoff),
        material_sha256=_material_sha256(content),
    )


def _destination_url(manual_handoff: dict | None) -> str | None:
    if manual_handoff is None or not manual_handoff.get("source_url"):
        return None
    destination = str(manual_handoff["source_url"]).strip()
    try:
        return safe_https_destination(destination)
    except ValueError:
        return None


def _frozen_listing_attributions(packet: ApplicationPacket) -> list[dict]:
    listing = packet.listing
    if listing is None:
        return []
    frozen: list[dict] = []
    for attribution in sorted(
        listing.attributions,
        key=lambda row: (row.retrieved_at, row.id),
    ):
        retrieved_at = attribution.retrieved_at
        if retrieved_at.tzinfo is None:
            retrieved_at = retrieved_at.replace(tzinfo=UTC)
        frozen.append({
            "id": attribution.id,
            "source_id": attribution.source_id,
            "source_listing_key": attribution.source_listing_key,
            "source_url": attribution.source_url,
            "retrieved_at": retrieved_at.isoformat(),
        }
        )
    return frozen


def _manual_handoff(packet: ApplicationPacket, attributions: list[dict]) -> dict | None:
    """Bind the outbound destination to the attribution pinned at preparation."""
    if packet.listing_attribution_id is None:
        return None
    primary = next(
        (
            attribution
            for attribution in attributions
            if attribution["id"] == packet.listing_attribution_id
        ),
        None,
    )
    if primary is None:
        return None
    return {
        "listing_id": packet.listing_id,
        "attribution_id": primary["id"],
        "source_id": primary["source_id"],
        "source_listing_key": primary["source_listing_key"],
        "source_url": primary["source_url"],
        "retrieved_at": primary["retrieved_at"],
    }


def _snapshot_content(
    packet: ApplicationPacket,
    *,
    listing_attributions: list[dict],
    manual_handoff: dict | None,
    unresolved_questions: list[dict],
    resolved_stop_answers: list[dict],
    frozen_at: datetime,
) -> dict:
    """Resolve and copy every owner-visible material at the approval boundary."""
    listing = packet.listing
    variant = packet.cv_variant
    drafts = packet.drafts_run
    return {
        "schema_version": APPROVAL_SCHEMA_VERSION,
        "packet_id": packet.id,
        "campaign_id": packet.campaign_id,
        "listing_id": packet.listing_id,
        "frozen_at": frozen_at.isoformat(),
        "match_rationale": packet.match_rationale,
        # This is the authoritative outstanding set, not the preparation-time JSON.
        "unresolved_questions": unresolved_questions,
        "resolved_stop_answers": resolved_stop_answers,
        "listing": (
            {
                "id": listing.id,
                "content_sha256": listing.content_sha256,
                "title": listing.title,
                "company": listing.company,
                "description": listing.description,
                "attributions": listing_attributions,
            }
            if listing is not None
            else None
        ),
        # Handoff provenance is one attribution of this exact packet listing.
        # Mutable campaign listing replacements never influence the destination.
        "manual_handoff": manual_handoff,
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
        "drafts": (drafts.result_payload or {}) if drafts is not None else None,
    }


def _snapshot_response(
    snapshot: PacketApprovalSnapshot,
) -> PacketApprovalSnapshotResponse:
    return PacketApprovalSnapshotResponse(
        id=snapshot.id,
        packet_id=snapshot.packet_id,
        campaign_id=snapshot.campaign_id,
        listing_id=snapshot.listing_id,
        role_key=snapshot.role_key,
        destination_url=snapshot.destination_url,
        content=json.loads(snapshot.content_json),
        content_sha256=snapshot.content_sha256,
        created_at=snapshot.created_at,
    )


def _require_not_duplicate(
    db: Session,
    *,
    user_id: str,
    packet: ApplicationPacket,
    role_key: str,
) -> None:
    same_packet = (
        db.query(PacketApprovalSnapshot.id)
        .filter(PacketApprovalSnapshot.packet_id == packet.id)
        .first()
    )
    if same_packet is not None or packet.decision == "accepted":
        raise DuplicatePacketApprovalError("This packet has already been approved.")
    if packet.decision != "pending":
        raise DuplicatePacketApprovalError(
            f"Only pending packets can be approved. This packet is {packet.decision}."
        )

    same_role = (
        db.query(PacketApprovalSnapshot.id)
        .filter(
            PacketApprovalSnapshot.user_id == user_id,
            PacketApprovalSnapshot.role_key == role_key,
        )
        .first()
    )
    if same_role is not None:
        raise DuplicatePacketApprovalError(
            "You have already approved an application for this role. "
            "Only one approved packet is allowed per role."
        )

    prior_campaign_submission = (
        db.query(CampaignSubmissionSnapshot.id)
        .join(Workspace, CampaignSubmissionSnapshot.workspace_id == Workspace.id)
        .filter(
            Workspace.user_id == user_id,
            CampaignSubmissionSnapshot.role_key == role_key,
        )
        .first()
    )
    if prior_campaign_submission is not None:
        raise DuplicatePacketApprovalError(
            "You already have a campaign for this role that reached submission. "
            "Approving this packet would duplicate that application."
        )


def _raise_structural_duplicate(
    db: Session,
    *,
    user_id: str,
    packet_id: str,
    role_key: str,
) -> None:
    """Translate a concurrent unique-constraint race into the bounded 409 contract."""
    same_packet = (
        db.query(PacketApprovalSnapshot.id)
        .filter(PacketApprovalSnapshot.packet_id == packet_id)
        .first()
    )
    if same_packet is not None:
        raise DuplicatePacketApprovalError("This packet has already been approved.")
    same_role = (
        db.query(PacketApprovalSnapshot.id)
        .filter(
            PacketApprovalSnapshot.user_id == user_id,
            PacketApprovalSnapshot.role_key == role_key,
        )
        .first()
    )
    if same_role is not None:
        raise DuplicatePacketApprovalError(
            "You have already approved an application for this role. "
            "Only one approved packet is allowed per role."
        )
    raise DuplicatePacketApprovalError(
        "This approval conflicts with an existing immutable packet."
    )


def approve_packet(
    db: Session,
    user_id: str,
    packet_id: str,
    *,
    expected_material_sha256: str,
) -> PacketApprovalResult:
    """Atomically guard, deduplicate, freeze, audit, and hand off one packet."""
    packet = (
        db.query(ApplicationPacket)
        .filter(
            ApplicationPacket.user_id == user_id,
            ApplicationPacket.id == packet_id,
        )
        .with_for_update()
        .one_or_none()
    )
    if packet is None:
        raise PacketNotFoundError(packet_id)
    if not is_queue_eligible(packet):
        raise PacketGateBlockedError(
            "This packet was blocked by the application quality reviewer "
            "and cannot be approved."
        )

    assert_packet_approvable(db, user_id, packet_id)
    (
        db.query(Workspace)
        .filter(
            Workspace.user_id == user_id,
            Workspace.id == packet.campaign_id,
        )
        .with_for_update()
        .one()
    )
    # Account erasure already removes packet rows before campaign and owner rows.
    # Individual campaign deletion follows this packet -> campaign order too.
    lock_application_owner(db, user_id)
    role_key = packet_application_role_key(packet)
    _require_not_duplicate(
        db,
        user_id=user_id,
        packet=packet,
        role_key=role_key,
    )

    answered_fields = answered_fields_for_packet(db, user_id, packet_id)
    resolved_stop_answers = [
        {
            "field": answer.field,
            "category": answer.category,
            "answer": answer.answer_text,
        }
        for answer in (
            db.query(PacketStopAnswer)
            .filter(
                PacketStopAnswer.user_id == user_id,
                PacketStopAnswer.packet_id == packet_id,
            )
            .order_by(PacketStopAnswer.field.asc(), PacketStopAnswer.id.asc())
            .all()
        )
    ]
    packet_item = packet_item_with_true_unresolved(packet, answered_fields)
    frozen_at = datetime.now(UTC)
    listing_attributions = _frozen_listing_attributions(packet)
    manual_handoff = _manual_handoff(packet, listing_attributions)
    content = _snapshot_content(
        packet,
        listing_attributions=listing_attributions,
        manual_handoff=manual_handoff,
        unresolved_questions=[
            item.model_dump(mode="json")
            for item in packet_item.unresolved_questions
        ],
        resolved_stop_answers=resolved_stop_answers,
        frozen_at=frozen_at,
    )
    if _material_sha256(content) != expected_material_sha256:
        raise PacketApprovalChangedError(
            "Packet materials changed after review. Review the refreshed packet before approving."
        )
    content_json = json.dumps(
        content,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    content_sha256 = hashlib.sha256(content_json.encode()).hexdigest()
    snapshot = PacketApprovalSnapshot(
        user_id=user_id,
        packet_id=packet.id,
        campaign_id=packet.campaign_id,
        listing_id=packet.listing_id,
        role_key=role_key,
        destination_url=_destination_url(manual_handoff),
        content_json=content_json,
        content_sha256=content_sha256,
        created_at=frozen_at,
    )

    try:
        packet.decision = "accepted"
        db.add(snapshot)
        db.flush()
        record_queue_audit_event(
            db,
            user_id=user_id,
            action="packet_accepted",
            packet_id=packet.id,
            details={
                "decision": "accepted",
                "snapshot_id": snapshot.id,
            },
            commit=False,
        )
        record_event(
            db,
            packet.campaign_id,
            "packet_approved",
            {
                "packet_id": packet.id,
                "snapshot_id": snapshot.id,
            },
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        _raise_structural_duplicate(
            db,
            user_id=user_id,
            packet_id=packet_id,
            role_key=role_key,
        )

    db.refresh(packet)
    db.refresh(snapshot)
    final_packet = packet_item_with_true_unresolved(
        packet,
        answered_fields_for_packet(db, user_id, packet_id),
    )
    return PacketApprovalResult(
        packet=final_packet,
        snapshot=_snapshot_response(snapshot),
        handoff=PacketSubmissionHandoff(
            destination_url=snapshot.destination_url,
            instructions=HANDOFF_INSTRUCTIONS,
        ),
    )


def export_packet_approval_snapshots(
    db: Session,
    user_id: str,
) -> PacketApprovalSnapshotsExport:
    rows = (
        db.query(PacketApprovalSnapshot)
        .filter(PacketApprovalSnapshot.user_id == user_id)
        .order_by(
            PacketApprovalSnapshot.created_at.asc(),
            PacketApprovalSnapshot.id.asc(),
        )
        .all()
    )
    return PacketApprovalSnapshotsExport(
        snapshots=[_snapshot_response(row) for row in rows]
    )


def delete_packet_approval_snapshots(
    db: Session,
    user_id: str,
) -> dict[str, int]:
    """Explicit account-erasure seam; campaign deletion cascades through its FK."""
    deleted = (
        db.query(PacketApprovalSnapshot)
        .filter(PacketApprovalSnapshot.user_id == user_id)
        .delete(synchronize_session=False)
    )
    return {"packet_approval_snapshots": deleted}
