import hashlib
import json

from sqlalchemy.orm import Session

from app.models.campaign_snapshot import CampaignSubmissionSnapshot
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.workspace import Workspace
from app.services.application_role_identity import (
    application_role_key,
    lock_application_owner,
)
from app.services.campaign_tracking import record_event


class DuplicateRoleSubmissionError(Exception):
    """A different campaign already owns this role's immutable approval."""


def capture_submission_snapshot(db: Session, campaign: Workspace) -> CampaignSubmissionSnapshot:
    # Always establish the shared lock order here, even for non-router callers:
    # campaign first, then owner. Packet approval uses the same order, preventing
    # a campaign-FK/owner-row deadlock while closing the cross-table race.
    campaign = (
        db.query(Workspace)
        .filter(
            Workspace.id == campaign.id,
            Workspace.user_id == campaign.user_id,
        )
        .with_for_update()
        .one()
    )
    lock_application_owner(db, campaign.user_id)
    role_key = application_role_key(campaign)
    conflicting_approval = (
        db.query(PacketApprovalSnapshot.id)
        .filter(
            PacketApprovalSnapshot.user_id == campaign.user_id,
            PacketApprovalSnapshot.role_key == role_key,
            PacketApprovalSnapshot.campaign_id != campaign.id,
        )
        .first()
    )
    if conflicting_approval is not None:
        raise DuplicateRoleSubmissionError(
            "A different campaign already has an approved packet for this role."
        )

    listing = campaign.listing
    variant = campaign.selected_cv_variant
    cover = campaign.selected_cover_letter_run
    content = {
        "schema_version": "campaign-submission/v1",
        "role_key": role_key,
        "listing": (
            {
                "id": listing.id,
                "title": listing.title,
                "company": listing.company,
                "description": listing.description,
                "source_url": listing.source_url,
                "retrieved_at": listing.retrieved_at.isoformat(),
            }
            if listing
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
            if variant
            else None
        ),
        "cover_letter": (
            {
                "id": cover.id,
                "parent_run_id": cover.parent_run_id,
                "label": cover.label,
                "result_payload": cover.result_payload or {},
                "created_at": cover.created_at.isoformat(),
            }
            if cover
            else None
        ),
    }
    content_json = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    snapshot = CampaignSubmissionSnapshot(
        workspace_id=campaign.id,
        role_key=role_key,
        content_json=content_json,
        content_sha256=hashlib.sha256(content_json.encode()).hexdigest(),
    )
    db.add(snapshot)
    db.flush()
    record_event(db, campaign.id, "submission_snapshot_created", {"snapshot_id": snapshot.id})
    return snapshot


def snapshot_response(snapshot: CampaignSubmissionSnapshot) -> dict:
    return {
        "id": snapshot.id,
        "content": json.loads(snapshot.content_json),
        "content_sha256": snapshot.content_sha256,
        "created_at": snapshot.created_at,
    }
