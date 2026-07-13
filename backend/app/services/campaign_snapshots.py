import hashlib
import json

from sqlalchemy.orm import Session

from app.models.campaign_snapshot import CampaignSubmissionSnapshot
from app.models.workspace import Workspace
from app.services.campaign_tracking import record_event


def capture_submission_snapshot(db: Session, campaign: Workspace) -> CampaignSubmissionSnapshot:
    listing = campaign.listing
    variant = campaign.selected_cv_variant
    cover = campaign.selected_cover_letter_run
    content = {
        "schema_version": "campaign-submission/v1",
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
