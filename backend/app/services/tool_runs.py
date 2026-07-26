from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.campaign_snapshot import CampaignSubmissionSnapshot
from app.models.campaign_tracking import CampaignContact, CampaignNote, CampaignTask
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.history import CampaignListingResponse, WorkspaceSummary
from app.services.application_packets import delete_application_packets
from app.services.development import delete_development_items
from app.services.discovery_personalization import delete_personalization
from app.services.gap_classifier import delete_gap_classifications
from app.services.observability import log_user_account_deleted
from app.services.packet_approval import delete_packet_stop_answers
from app.services.packet_approval_snapshot import delete_packet_approval_snapshots
from app.services.packet_gate import delete_queue_pause_state
from app.services.premium_outputs import attach_premium_outputs
from app.services.queue_audit import delete_queue_audit_events
from app.services.queue_rules import delete_queue_rules
from app.services.submission_authorizations import delete_submission_authorizations
from app.services.submissions import delete_submission_records
from app.services.workspaces import resolve_workspace, touch_workspace

logger = logging.getLogger(__name__)

GUEST_LOCKED_ACTIONS = ["save", "favorite", "continue", "history"]


def delete_all_user_data(db: Session, user_id: str) -> None:
    """Delete all tool runs, workspaces, and the user record. RODO/GDPR right to erasure.

    Counts what is deleted before committing so the audit log line carries
    enough detail to reconstruct the request without persisting the user's
    actual content.
    """
    # Explicit deletion preserves the existing transactional erasure behavior in
    # environments where database FK cascades are not enabled (including tests).
    # PostgreSQL also enforces ON DELETE CASCADE as a second line of defense.
    cv_document_ids = [
        row.id for row in db.query(CvDocument.id).filter(CvDocument.user_id == user_id)
    ]
    cv_variants_deleted = 0
    if cv_document_ids:
        cv_variants_deleted = (
            db.query(CvVariant)
            .filter(CvVariant.document_id.in_(cv_document_ids))
            .delete(synchronize_session=False)
        )
    cv_documents_deleted = db.query(CvDocument).filter(CvDocument.user_id == user_id).delete()
    # Discovery personalization (hidden sources, dismissals, error reports) is
    # owner-scoped user data and joins the erasure cascade (D-090, R14 #175).
    delete_personalization(db, user_id)
    # Application Approval Queue rules, caps, and cost ceiling are owner-scoped user
    # data and join the erasure cascade (D-099, R15 #180).
    delete_queue_rules(db, user_id)
    # The append-only queue audit log is owner-scoped user data; this cascade is
    # its ONLY deletion path, preserving the append-only guarantee (D-098/D-099,
    # R15 #186).
    delete_queue_audit_events(db, user_id)
    # Submission lifecycle deletion first locks packet -> snapshot -> claim in
    # dispatch-compatible order, then removes records and claims before their
    # referenced snapshots (also preserving SQLite behavior; D-107).
    delete_submission_records(db, user_id)
    # Approval snapshots are immutable by-value records (D-096/D-099). Account
    # erasure explicitly removes them before their packet/campaign foreign keys,
    # including in SQLite tests where FK cascades are disabled. Deleting an
    # individual campaign is their other bounded removal path.
    delete_packet_approval_snapshots(db, user_id)
    # Stop answers are owner-scoped sensitive content the user typed (D-099, R15 #182).
    # Deleted before their packets so the FK to application_packets is removed first.
    delete_packet_stop_answers(db, user_id)
    # R16 source-specific grants are revocable owner-scoped records and contain no
    # provider credentials. Explicit deletion preserves lifecycle behavior when FK
    # cascades are disabled in SQLite tests (D-101/D-107, R16 #190).
    delete_submission_authorizations(db, user_id)
    # A user's own queue-pause state is owner-scoped data (unlike the pipeline-wide
    # regression halt, which is operational state and stays out of this cascade).
    delete_queue_pause_state(db, user_id)
    # Prepared application packets are owner-scoped sensitive content (they encode
    # application intent) and join the erasure cascade (D-099, R15 #181). Deleted
    # before campaigns so their FK to workspaces is removed first.
    delete_application_packets(db, user_id)
    # R17 development items are the user's own owner-scoped development plan and
    # join the erasure cascade (D-114). Deleted before their gap classifications so
    # the SET NULL FK is resolved first.
    development_items_deleted = delete_development_items(db, user_id)
    # R17 gap classifications label the user's own reviewer findings and are
    # owner-scoped sensitive career data; they join the erasure cascade (D-114).
    delete_gap_classifications(db, user_id)
    evidence_deleted = db.query(EvidenceItem).filter(EvidenceItem.user_id == user_id).delete()
    runs_deleted = db.query(ToolRun).filter(ToolRun.user_id == user_id).delete()
    workspace_ids = [row.id for row in db.query(Workspace.id).filter(Workspace.user_id == user_id)]
    if workspace_ids:
        for model in (CampaignTask, CampaignNote, CampaignContact, CampaignSubmissionSnapshot):
            db.query(model).filter(model.workspace_id.in_(workspace_ids)).delete(
                synchronize_session=False
            )
        db.query(CampaignListing).filter(CampaignListing.workspace_id.in_(workspace_ids)).delete(
            synchronize_session=False
        )
        db.query(CampaignEvent).filter(CampaignEvent.workspace_id.in_(workspace_ids)).delete(
            synchronize_session=False
        )
    workspaces_deleted = db.query(Workspace).filter(Workspace.user_id == user_id).delete()
    users_deleted = db.query(User).filter(User.id == user_id).delete()
    db.commit()
    log_user_account_deleted(
        user_id=user_id,
        runs_deleted=runs_deleted,
        workspaces_deleted=workspaces_deleted,
        evidence_items_deleted=evidence_deleted,
        cv_documents_deleted=cv_documents_deleted,
        cv_variants_deleted=cv_variants_deleted,
        development_items_deleted=development_items_deleted,
        user_record_deleted=bool(users_deleted),
    )


DEFAULT_NEXT_STEP_TOOL = {
    "resume": "job-match",
    "job-match": "cover-letter",
    "cover-letter": "interview",
    "interview": "career",
    "career": "portfolio",
    "portfolio": "resume",
}


def build_tool_response(
    result: dict[str, Any],
    *,
    tool_name: str,
    history_id: str | None,
    access_mode: str,
) -> dict[str, Any]:
    enriched = attach_premium_outputs(tool_name, result)
    return {
        **enriched,
        "history_id": history_id,
        "access_mode": access_mode,
        "saved": history_id is not None,
        "locked_actions": [] if history_id else GUEST_LOCKED_ACTIONS,
    }


def persist_tool_run(
    db: Session,
    *,
    current_user: User | None,
    tool_name: str,
    label: str,
    result: dict[str, Any],
    linked_context_ids: list[str] | None = None,
    workspace_id: str | None = None,
    parent_run_id: str | None = None,
    feedback_text: str | None = None,
) -> ToolRun | None:
    if current_user is None:
        return None

    linked_ids = _unique_strings(linked_context_ids)
    workspace = resolve_workspace(
        db,
        current_user=current_user,
        tool_name=tool_name,
        label=label,
        workspace_id=workspace_id,
        linked_history_ids=linked_ids,
    )
    touch_workspace(workspace)
    run = ToolRun(
        user_id=current_user.id,
        workspace_id=workspace.id,
        tool_name=tool_name,
        label=label,
        parent_run_id=parent_run_id,
        feedback_text=feedback_text,
        result_payload=attach_workspace_meta(
            tool_name,
            result,
            linked_context_ids=linked_ids,
        ),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def attach_workspace_meta(
    tool_name: str,
    payload: dict[str, Any],
    *,
    linked_context_ids: list[str] | None = None,
) -> dict[str, Any]:
    return {
        **payload,
        "_workspace_meta": derive_saved_run_metadata(
            tool_name,
            payload,
            linked_context_ids=linked_context_ids,
        ),
    }


def derive_saved_run_metadata(
    tool_name: str,
    payload: dict[str, Any] | None,
    *,
    linked_context_ids: list[str] | None = None,
) -> dict[str, Any]:
    source = payload or {}
    summary = source.get("summary") if isinstance(source.get("summary"), dict) else {}
    workspace_meta = (
        source.get("_workspace_meta") if isinstance(source.get("_workspace_meta"), dict) else {}
    )
    linked_ids = linked_context_ids or _string_list(workspace_meta.get("linked_context_ids"))

    return {
        "summary_headline": _string(summary.get("headline")),
        "primary_recommendation_title": _primary_recommendation_title(tool_name, source),
        "schema_version": _string(source.get("schema_version")),
        "linked_context_ids": linked_ids,
        "next_step_tool": _string(workspace_meta.get("next_step_tool"))
        or DEFAULT_NEXT_STEP_TOOL.get(tool_name),
    }


def extract_linked_context_ids(*history_ids: str | None) -> list[str]:
    return _unique_strings(history_ids)


def build_workspace_summary(
    workspace: Workspace | None,
    runs: list[ToolRun] | None = None,
) -> WorkspaceSummary | None:
    if workspace is None:
        return None

    ordered_runs = sorted(
        runs or list(workspace.tool_runs),
        key=lambda run: run.created_at,
        reverse=True,
    )
    last_run = ordered_runs[0] if ordered_runs else None
    return WorkspaceSummary(
        id=workspace.id,
        label=workspace.label,
        is_pinned=workspace.is_pinned,
        company=workspace.company,
        role=workspace.role,
        status=workspace.status,
        deadline=_as_utc(workspace.deadline),
        listing=(
            CampaignListingResponse(
                title=workspace.listing.title,
                company=workspace.listing.company,
                description=workspace.listing.description,
                source_url=workspace.listing.source_url,
                retrieved_at=_as_utc(workspace.listing.retrieved_at),
            )
            if workspace.listing is not None
            else None
        ),
        linked_run_ids=[run.id for run in ordered_runs],
        last_active_tool=last_run.tool_name if last_run else None,
        last_active_result_id=last_run.id if last_run else None,
        updated_at=workspace.updated_at.isoformat(),
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _unique_strings(values: Any) -> list[str]:
    if values is None:
        return []
    linked_ids: list[str] = []
    for history_id in values:
        if history_id and history_id not in linked_ids:
            linked_ids.append(history_id)
    return linked_ids


def _primary_recommendation_title(tool_name: str, payload: dict[str, Any]) -> str | None:
    if tool_name == "resume":
        role_fit = payload.get("role_fit")
        if isinstance(role_fit, dict):
            return _string(role_fit.get("target_role_label"))
        return _first_string(
            _string_list(payload.get("strengths")),
            _string_list(payload.get("top_actions")),
        )

    if tool_name == "job-match":
        return _string(payload.get("recruiter_summary")) or _string(payload.get("verdict"))

    if tool_name == "cover-letter":
        return _string(payload.get("tone_used")) or "Targeted cover letter"

    if tool_name == "interview":
        focus_areas = payload.get("focus_areas")
        if isinstance(focus_areas, list) and focus_areas:
            first = focus_areas[0]
            if isinstance(first, dict):
                return _string(first.get("title")) or _string(first.get("focus_area"))
        return "Interview practice deck"

    if tool_name == "career":
        direction = payload.get("recommended_direction")
        if isinstance(direction, dict):
            return _string(direction.get("role_title"))
        return None

    if tool_name == "portfolio":
        return _string(payload.get("recommended_start_project")) or _string(
            payload.get("target_role")
        )

    return None


def _string(value: Any) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _first_string(*candidates: list[str]) -> str | None:
    for items in candidates:
        if items:
            return items[0]
    return None
