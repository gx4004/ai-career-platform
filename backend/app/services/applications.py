"""Applications: one container per job the owner is going after.

An Application is the ``Workspace`` row once it targets a job (it has a status
or a job posting). It holds the posting, the chosen CV and cover letter, the
prepared drafts, the questions only the owner can answer, tasks, notes and an
activity log. Marking it applied is the single freeze point: it writes one
snapshot of exactly what was sent. Nothing here submits anything; the owner
always applies themselves.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, load_only

from app.models.application_preferences import ApplicationPreferences
from app.models.application_snapshot import ApplicationSnapshot
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.campaign_task import CampaignTask
from app.models.cv_document import CvDocument, CvVariant
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.applications import (
    ApplicationCard,
    ApplicationDetail,
    ApplicationDrafts,
    ApplicationList,
    ApplicationPreferencesBody,
    ApplicationPreferencesResponse,
    ApplicationStatus,
    ApplicationUpdate,
    AvailableMaterials,
    BulkPrepareResult,
    CvVariantReference,
    EventResponse,
    ListingResponse,
    NextTask,
    OpenQuestion,
    RunReference,
    SelectedMaterials,
    SnapshotResponse,
    TaskCreate,
)
from app.services.application_drafts import DRAFTS_TOOL_NAME, compose_application_drafts
from app.services.campaign_reviewer import cover_document_text
from app.services.discovery_adoption import adopt_recommendation
from app.services.discovery_recommendations import VisibleListing, best_matches
from app.services.quality_signals import keyword_present

SNAPSHOT_SCHEMA_VERSION = "application-snapshot/v1"
BOARD_LIMIT = 200
DETAIL_EVENT_LIMIT = 50

# A workspace is an Application once it has a stage or a job posting.
IS_APPLICATION = or_(Workspace.status.is_not(None), Workspace.current_listing_id.is_not(None))


class ApplicationNotFound(Exception):
    """No such application for this owner."""


class ApplicationConflict(Exception):
    """The application is not in a state that allows this action."""


class InvalidReference(Exception):
    """A material reference is not the owner's, or is the wrong kind."""


# ── Loading and derived state ──


def get_application(
    db: Session, user_id: str, application_id: str, *, for_update: bool = False
) -> Workspace:
    query = db.query(Workspace).filter(
        Workspace.id == application_id, Workspace.user_id == user_id
    )
    if for_update:
        query = query.with_for_update()
    workspace = query.one_or_none()
    if workspace is None:
        raise ApplicationNotFound(application_id)
    return workspace


def unanswered_questions(workspace: Workspace) -> list[dict]:
    answers = workspace.answers or {}
    return [
        question
        for question in workspace.open_questions or []
        if not str(answers.get(question.get("key"), "")).strip()
    ]


def is_ready(workspace: Workspace) -> bool:
    return (
        (workspace.status or "saved") == "saved"
        and workspace.drafts_run_id is not None
        and not unanswered_questions(workspace)
    )


def record_event(
    db: Session, workspace_id: str, event_type: str, details: dict, *, provenance: str = "user"
) -> None:
    stored = details if provenance == "user" else {**details, "provenance": provenance}
    db.add(CampaignEvent(workspace_id=workspace_id, event_type=event_type, details=stored))


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _card(
    workspace: Workspace,
    *,
    next_task: CampaignTask | None = None,
    last_event_at: datetime | None = None,
) -> ApplicationCard:
    listing = workspace.listing
    updated_at = _as_utc(workspace.updated_at)
    last_event_at = _as_utc(last_event_at)
    return ApplicationCard(
        id=workspace.id,
        label=workspace.label,
        title=workspace.role or (listing.title if listing else None),
        company=workspace.company or (listing.company if listing else None),
        status=workspace.status or ApplicationStatus.SAVED,
        deadline=_as_utc(workspace.deadline),
        applied_at=_as_utc(workspace.applied_at),
        match_score=workspace.match_score,
        prepared=workspace.drafts_run_id is not None,
        ready=is_ready(workspace),
        open_question_count=len(unanswered_questions(workspace)),
        next_task=(
            NextTask(title=next_task.title, deadline=_as_utc(next_task.deadline))
            if next_task
            else None
        ),
        last_activity_at=max(last_event_at, updated_at) if last_event_at else updated_at,
        is_pinned=bool(workspace.is_pinned),
        updated_at=updated_at,
    )


def _soonest(tasks: list[CampaignTask]) -> CampaignTask | None:
    open_tasks = [task for task in tasks if not task.completed]
    if not open_tasks:
        return None
    # Dated tasks first, soonest first; undated ones after, in the order added.
    return min(
        open_tasks,
        key=lambda task: (task.deadline is None, _as_utc(task.deadline) or datetime.min),
    )


# ── Board ──


def list_applications(db: Session, user_id: str) -> ApplicationList:
    """The board: small rows only, never run payloads or job descriptions."""
    workspaces = (
        db.query(Workspace)
        .options(
            load_only(
                Workspace.id,
                Workspace.label,
                Workspace.company,
                Workspace.role,
                Workspace.status,
                Workspace.deadline,
                Workspace.applied_at,
                Workspace.match_score,
                Workspace.drafts_run_id,
                Workspace.open_questions,
                Workspace.answers,
                Workspace.is_pinned,
                Workspace.updated_at,
                Workspace.current_listing_id,
            ),
            joinedload(Workspace.listing).load_only(CampaignListing.title, CampaignListing.company),
        )
        .filter(Workspace.user_id == user_id, IS_APPLICATION)
        .order_by(Workspace.is_pinned.desc(), Workspace.updated_at.desc())
        .limit(BOARD_LIMIT)
        .all()
    )
    ids = [workspace.id for workspace in workspaces]
    tasks_by_workspace: dict[str, list[CampaignTask]] = {}
    last_events: dict[str, datetime] = {}
    if ids:
        for task in (
            db.query(CampaignTask)
            .filter(CampaignTask.workspace_id.in_(ids), CampaignTask.completed.is_(False))
            .order_by(CampaignTask.created_at.asc())
        ):
            tasks_by_workspace.setdefault(task.workspace_id, []).append(task)
        last_events = dict(
            db.query(CampaignEvent.workspace_id, func.max(CampaignEvent.created_at))
            .filter(CampaignEvent.workspace_id.in_(ids))
            .group_by(CampaignEvent.workspace_id)
            .all()
        )
    items = [
        _card(
            workspace,
            next_task=_soonest(tasks_by_workspace.get(workspace.id, [])),
            last_event_at=last_events.get(workspace.id),
        )
        for workspace in workspaces
    ]
    return ApplicationList(items=items, total=len(items))


# ── Detail ──


def _listing_response(listing: CampaignListing | None) -> ListingResponse | None:
    if listing is None:
        return None
    return ListingResponse(
        title=listing.title,
        company=listing.company,
        description=listing.description,
        source_url=listing.source_url,
        apply_url=listing.apply_url,
        retrieved_at=_as_utc(listing.retrieved_at),
    )


def _available_materials(db: Session, user_id: str) -> AvailableMaterials:
    """Picker labels only: never CV sections or run payloads."""
    variants = (
        db.query(
            CvVariant.id,
            CvVariant.document_id,
            CvVariant.name,
            CvVariant.target_role,
            CvVariant.created_at,
            CvDocument.name.label("document_name"),
        )
        .join(CvDocument, CvVariant.document_id == CvDocument.id)
        .filter(CvDocument.user_id == user_id)
        .order_by(CvVariant.created_at.desc())
        .all()
    )
    runs = (
        db.query(
            ToolRun.id, ToolRun.tool_name, ToolRun.label, ToolRun.parent_run_id, ToolRun.created_at
        )
        .filter(ToolRun.user_id == user_id, ToolRun.tool_name.in_(("cover-letter", "interview")))
        .order_by(ToolRun.created_at.desc())
        .all()
    )

    def run_ref(row) -> RunReference:
        return RunReference(
            id=row.id,
            label=row.label,
            parent_run_id=row.parent_run_id,
            created_at=_as_utc(row.created_at),
        )

    return AvailableMaterials(
        cv_variants=[
            CvVariantReference(
                id=row.id,
                document_id=row.document_id,
                document_name=row.document_name,
                name=row.name,
                target_role=row.target_role,
                created_at=_as_utc(row.created_at),
            )
            for row in variants
        ],
        cover_letters=[run_ref(row) for row in runs if row.tool_name == "cover-letter"],
        interviews=[run_ref(row) for row in runs if row.tool_name == "interview"],
    )


def _drafts(workspace: Workspace) -> ApplicationDrafts | None:
    run = workspace.drafts_run
    if run is None:
        return None
    payload = run.result_payload or {}
    return ApplicationDrafts(
        run_id=run.id,
        created_at=_as_utc(run.created_at),
        cover_letter=payload.get("cover_letter"),
        screening_answers=payload.get("screening_answers") or [],
    )


def snapshot_response(snapshot: ApplicationSnapshot | None) -> SnapshotResponse | None:
    if snapshot is None:
        return None
    return SnapshotResponse(
        id=snapshot.id,
        content=json.loads(snapshot.content_json),
        content_sha256=snapshot.content_sha256,
        created_at=_as_utc(snapshot.created_at),
    )


def application_detail(db: Session, workspace: Workspace) -> ApplicationDetail:
    available = _available_materials(db, workspace.user_id)
    tasks = list(workspace.campaign_tasks)
    recent_events = (
        db.query(CampaignEvent)
        .filter(CampaignEvent.workspace_id == workspace.id)
        .order_by(CampaignEvent.created_at.desc(), CampaignEvent.id.desc())
        .limit(DETAIL_EVENT_LIMIT)
        .all()
    )
    answers = workspace.answers or {}

    def pick(items, value):
        return next((item for item in items if item.id == value), None)

    card = _card(
        workspace,
        next_task=_soonest(tasks),
        last_event_at=recent_events[0].created_at if recent_events else None,
    )
    return ApplicationDetail(
        **card.model_dump(),
        role=workspace.role,
        listing=_listing_response(workspace.listing),
        notes=workspace.notes,
        selected_materials=SelectedMaterials(
            cv_variant=pick(available.cv_variants, workspace.selected_cv_variant_id),
            cover_letter=pick(available.cover_letters, workspace.selected_cover_letter_run_id),
            interview=pick(available.interviews, workspace.selected_interview_run_id),
        ),
        available_materials=available,
        drafts=_drafts(workspace),
        open_questions=[
            OpenQuestion(
                key=question["key"],
                question=question["question"],
                category=question["category"],
                answered=bool(str(answers.get(question["key"], "")).strip()),
            )
            for question in workspace.open_questions or []
        ],
        answers={key: str(value) for key, value in answers.items()},
        tasks=tasks,
        events=[
            EventResponse(
                id=event.id,
                event_type=event.event_type,
                details=event.details,
                provenance=event.details.get("provenance", "user"),
                created_at=event.created_at,
            )
            for event in reversed(recent_events)
        ],
        snapshot=snapshot_response(workspace.snapshot),
    )


# ── Editing ──


def update_application(db: Session, workspace: Workspace, body: ApplicationUpdate) -> None:
    """Apply every field or none: a refused status move leaves nothing half-saved."""
    try:
        _apply_update(db, workspace, body)
    except (ApplicationConflict, InvalidReference):
        db.rollback()
        raise
    db.commit()
    db.refresh(workspace)


def _apply_update(db: Session, workspace: Workspace, body: ApplicationUpdate) -> None:
    fields = body.model_fields_set
    if "label" in fields:
        workspace.label = (body.label or "").strip() or None
    if "company" in fields:
        workspace.company = (body.company or "").strip() or None
    if "role" in fields:
        workspace.role = (body.role or "").strip() or None
    if "notes" in fields:
        workspace.notes = body.notes if body.notes and body.notes.strip() else None
    if "deadline" in fields and workspace.deadline != body.deadline:
        previous = workspace.deadline
        workspace.deadline = body.deadline
        record_event(
            db,
            workspace.id,
            "deadline_changed",
            {
                "from": previous.isoformat() if previous else None,
                "to": body.deadline.isoformat() if body.deadline else None,
            },
        )
    if "cv_variant_id" in fields:
        select_cv_variant(db, workspace, body.cv_variant_id)
    if "cover_letter_run_id" in fields:
        _select_run(db, workspace, "cover-letter", body.cover_letter_run_id)
    if "interview_run_id" in fields:
        _select_run(db, workspace, "interview", body.interview_run_id)
    if "status" in fields:
        set_status(db, workspace, body.status.value)
    workspace.updated_at = datetime.now(UTC)


def set_status(db: Session, workspace: Workspace, status: str) -> None:
    """Any stage may move to any other. Applied always goes through mark-as-applied."""
    if status == "applied":
        mark_applied(db, workspace, move=True)
        return
    current = workspace.status
    if status == current:
        return
    if status == "saved" and workspace.applied_at is not None:
        # Undo a mis-click: the application was not sent after all.
        if workspace.snapshot is not None:
            db.delete(workspace.snapshot)
        workspace.applied_at = None
        record_event(db, workspace.id, "applied_undone", {})
    workspace.status = status
    record_event(db, workspace.id, "status_changed", {"from": current, "to": status})


def mark_applied(db: Session, workspace: Workspace, *, move: bool = False) -> None:
    """Freeze what was sent and move the card to Applied. Idempotent.

    ``move`` is a board move to Applied, which always lands there; the Apply
    button leaves a later stage (interviewing, offer...) where it is.
    """
    if workspace.applied_at is None:
        if unanswered_questions(workspace):
            raise ApplicationConflict("Answer the open questions before marking this applied.")
        applied_at = datetime.now(UTC)
        content = application_content(workspace, applied_at=applied_at)
        content_json = json.dumps(
            content, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )
        snapshot = ApplicationSnapshot(
            workspace_id=workspace.id,
            content_json=content_json,
            content_sha256=hashlib.sha256(content_json.encode()).hexdigest(),
            created_at=applied_at,
        )
        db.add(snapshot)
        db.flush()
        workspace.applied_at = applied_at
        record_event(db, workspace.id, "applied", {"snapshot_id": snapshot.id})
    current = workspace.status
    if current != "applied" and (move or current in (None, "saved")):
        workspace.status = "applied"
        record_event(db, workspace.id, "status_changed", {"from": current, "to": "applied"})


def application_content(workspace: Workspace, *, applied_at: datetime | None = None) -> dict:
    """Everything the owner sends, by value: the posting, CV, cover letter, answers."""
    listing = workspace.listing
    variant = workspace.selected_cv_variant
    selected_cover = workspace.selected_cover_letter_run
    drafts = (workspace.drafts_run.result_payload or {}) if workspace.drafts_run else {}
    drafted_cover = drafts.get("cover_letter") or {}
    if selected_cover is not None:
        cover_letter = {
            "source": "selected",
            "run_id": selected_cover.id,
            "text": cover_document_text(selected_cover.result_payload or {}),
        }
    elif str(drafted_cover.get("body") or "").strip():
        cover_letter = {
            "source": "prepared",
            "run_id": workspace.drafts_run_id,
            "text": str(drafted_cover["body"]),
        }
    else:
        cover_letter = None
    answers = workspace.answers or {}
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "application_id": workspace.id,
        "applied_at": applied_at.isoformat() if applied_at else None,
        "listing": (
            {
                "title": listing.title,
                "company": listing.company,
                "description": listing.description,
                "source_url": listing.source_url,
                "apply_url": listing.apply_url,
                "retrieved_at": _as_utc(listing.retrieved_at).isoformat(),
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
        "cover_letter": cover_letter,
        "screening_answers": [
            {"question": item.get("question", ""), "answer": item.get("answer", "")}
            for item in drafts.get("screening_answers") or []
            if isinstance(item, dict)
        ],
        "answers": [
            {
                "key": question["key"],
                "question": question["question"],
                "category": question["category"],
                "answer": str(answers[question["key"]]),
            }
            for question in workspace.open_questions or []
            if str(answers.get(question["key"], "")).strip()
        ],
    }


def save_answers(db: Session, workspace: Workspace, answers: dict[str, str]) -> None:
    """Replace the owner's typed answers. Only current open questions can be answered."""
    if workspace.applied_at is not None:
        raise ApplicationConflict("This application is already marked applied.")
    keys = {question["key"] for question in workspace.open_questions or []}
    unknown = set(answers) - keys
    if unknown:
        raise InvalidReference("Unknown question")
    cleaned = {key: value.strip() for key, value in answers.items() if value.strip()}
    workspace.answers = cleaned
    # Record how many, never what: answers can be salary or visa details.
    record_event(db, workspace.id, "answers_saved", {"answered_count": len(cleaned)})
    workspace.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(workspace)


# ── Materials ──


def select_cv_variant(
    db: Session, workspace: Workspace, value: str | None, *, provenance: str = "user"
) -> None:
    if value is not None and (
        db.query(CvVariant.id)
        .join(CvDocument, CvVariant.document_id == CvDocument.id)
        .filter(CvVariant.id == value, CvDocument.user_id == workspace.user_id)
        .first()
        is None
    ):
        raise InvalidReference("Invalid cv_variant reference")
    if workspace.selected_cv_variant_id != value:
        workspace.selected_cv_variant_id = value
        _material_event(db, workspace.id, "cv_variant", value, provenance=provenance)


def _select_run(db: Session, workspace: Workspace, tool_name: str, value: str | None) -> None:
    if value is not None and (
        db.query(ToolRun.id)
        .filter(
            ToolRun.id == value,
            ToolRun.user_id == workspace.user_id,
            ToolRun.tool_name == tool_name,
        )
        .first()
        is None
    ):
        raise InvalidReference(f"Invalid {tool_name} reference")
    attribute = (
        "selected_cover_letter_run_id" if tool_name == "cover-letter" else "selected_interview_run_id"
    )
    if getattr(workspace, attribute) != value:
        setattr(workspace, attribute, value)
        _material_event(db, workspace.id, tool_name.replace("-", "_"), value)


def _material_event(
    db: Session, workspace_id: str, material_type: str, value: str | None, *, provenance="user"
) -> None:
    record_event(
        db,
        workspace_id,
        "material_selection_changed",
        {"material_type": material_type, "action": "selected" if value else "cleared"},
        provenance=provenance,
    )


def clear_selected_run(db: Session, user_id: str, run: ToolRun) -> None:
    """A deleted run stops being any application's cover letter, interview or drafts."""
    columns = {
        "selected_cover_letter_run_id": "cover_letter",
        "selected_interview_run_id": "interview",
        "drafts_run_id": "drafts",
    }
    workspaces = (
        db.query(Workspace)
        .filter(
            Workspace.user_id == user_id,
            or_(*(getattr(Workspace, column) == run.id for column in columns)),
        )
        .all()
    )
    for workspace in workspaces:
        for column, material_type in columns.items():
            if getattr(workspace, column) == run.id:
                setattr(workspace, column, None)
                _material_event(db, workspace.id, material_type, None, provenance="system")


def clear_selected_variants(db: Session, document: CvDocument) -> None:
    variant_ids = [variant.id for variant in document.variants]
    if not variant_ids:
        return
    workspaces = (
        db.query(Workspace)
        .filter(
            Workspace.user_id == document.user_id,
            Workspace.selected_cv_variant_id.in_(variant_ids),
        )
        .all()
    )
    for workspace in workspaces:
        workspace.selected_cv_variant_id = None
        _material_event(db, workspace.id, "cv_variant", None, provenance="system")


# ── Preparing ──


def cv_variant_text(sections: object) -> str:
    """A CV variant's visible sections as plain text, for grounding the drafts."""
    if not isinstance(sections, list):
        return ""
    lines: list[str] = []
    for section in sorted(
        (item for item in sections if isinstance(item, dict)),
        key=lambda item: item.get("position", 0),
    ):
        if section.get("visible", True) is False:
            continue
        title = section.get("title")
        if isinstance(title, str) and title.strip():
            lines.append(title.strip())
        for entry in section.get("entries") or []:
            if not isinstance(entry, dict):
                continue
            for key in ("heading", "subheading", "body"):
                value = entry.get(key)
                if isinstance(value, str) and value.strip():
                    lines.append(value.strip())
            lines.extend(
                bullet.strip()
                for bullet in entry.get("bullets") or []
                if isinstance(bullet, str) and bullet.strip()
            )
    return "\n".join(lines)


def _resolve_cv_variant(db: Session, workspace: Workspace) -> CvVariant | None:
    """The application's chosen CV, else the owner's newest one."""
    if workspace.selected_cv_variant is not None:
        return workspace.selected_cv_variant
    return (
        db.query(CvVariant)
        .join(CvDocument, CvVariant.document_id == CvDocument.id)
        .filter(CvDocument.user_id == workspace.user_id)
        .order_by(CvVariant.created_at.desc())
        .first()
    )


def _owner_has_cv(db: Session, user_id: str) -> bool:
    return (
        db.query(CvVariant.id)
        .join(CvDocument, CvVariant.document_id == CvDocument.id)
        .filter(CvDocument.user_id == user_id)
        .first()
        is not None
    )


ComposeFn = Callable[..., Awaitable[dict[str, Any]]]


async def prepare_application(
    db: Session, user: User, workspace: Workspace, *, compose_fn: ComposeFn | None = None
) -> None:
    """Draft a cover letter and screening answers through the shared pipeline.

    Each prepare creates a new drafts run; the application points at the newest.
    Questions only the owner may answer become open questions. Answers typed for a
    question that comes back keep applying, because keys are stable.
    """
    # Local import breaks the tool_runs <-> tool_pipeline import cycle.
    from app.services.tool_pipeline import run_tool_pipeline

    if workspace.applied_at is not None:
        raise ApplicationConflict("This application is already marked applied.")
    listing = workspace.listing
    if listing is None:
        raise ApplicationConflict("Add the job posting before preparing this application.")
    variant = _resolve_cv_variant(db, workspace)
    if variant is None:
        raise ApplicationConflict("Create a CV in CV Studio before preparing applications.")
    select_cv_variant(db, workspace, variant.id, provenance="system")

    cv_text = cv_variant_text(variant.sections)
    response = await run_tool_pipeline(
        tool_name=DRAFTS_TOOL_NAME,
        service_fn=compose_fn or compose_application_drafts,
        service_kwargs={
            "resume_text": cv_text,
            "job_description": listing.description,
            "listing_title": listing.title,
            "company": listing.company,
        },
        label_fn=lambda result: (
            result.get("summary", {}).get("headline") or f"Application drafts · {listing.title}"
        ),
        resume_text=cv_text,
        job_description=listing.description,
        workspace_id=workspace.id,
        current_user=user,
        db=db,
        cache_extra_keys={"listing": f"{listing.title}|{listing.company}"},
    )
    workspace.drafts_run_id = response.get("history_id")
    workspace.open_questions = list(response.get("open_questions") or [])
    if workspace.status is None:
        workspace.status = "saved"
    record_event(
        db,
        workspace.id,
        "prepared",
        {"open_question_count": len(workspace.open_questions)},
    )
    workspace.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(workspace)


def _passes_preferences(row: VisibleListing, prefs: ApplicationPreferences) -> bool:
    rec = row.listing
    text = f"{rec.title}\n{rec.company}\n{rec.description}"
    if not any(keyword_present(keyword, text) for keyword in prefs.keywords or []):
        return False
    if not prefs.locations and not prefs.remote:
        return True
    where = f"{rec.location or ''}\n{rec.title}\n{rec.description}"
    if prefs.remote and (rec.remote or keyword_present("remote", where)):
        return True
    return any(keyword_present(location, where) for location in prefs.locations or [])


async def prepare_for_me(
    db: Session,
    user: User,
    *,
    compose_fn: ComposeFn | None = None,
    now: datetime | None = None,
) -> BulkPrepareResult:
    """Adopt and prepare the best matching jobs, up to the owner's per-run cap.

    Ranks the feed once. A job the owner already has an application for is only
    prepared if it is still saved and unprepared; withdrawn, applied or already
    prepared applications are left alone, so re-running never duplicates.
    """
    prefs = _preferences_row(db, user.id)
    max_per_run = prefs.max_per_run if prefs else ApplicationPreferencesBody().max_per_run
    if prefs is None or not prefs.keywords:
        return BulkPrepareResult(reason="no_preferences", max_per_run=max_per_run)
    if not _owner_has_cv(db, user.id):
        return BulkPrepareResult(reason="no_cv", max_per_run=max_per_run)

    matches = [row for row in best_matches(db, user.id, now=now) if _passes_preferences(row, prefs)]
    existing = {
        workspace.discovery_listing_id: workspace
        for workspace in db.query(Workspace).filter(
            Workspace.user_id == user.id,
            Workspace.discovery_listing_id.in_([rec.listing_id for rec in matches]),
        )
    } if matches else {}

    prepared: list[Workspace] = []
    skipped = 0
    for rec in matches:
        if len(prepared) >= max_per_run:
            break
        workspace = existing.get(rec.listing_id)
        if workspace is not None and (
            workspace.drafts_run_id is not None
            or workspace.applied_at is not None
            or (workspace.status or "saved") != "saved"
        ):
            skipped += 1
            continue
        if workspace is None:
            workspace = adopt_recommendation(db, user.id, rec.listing_id, visible=rec)
        await prepare_application(db, user, workspace, compose_fn=compose_fn)
        prepared.append(workspace)
    return BulkPrepareResult(
        reason="prepared",
        prepared=[_card(workspace) for workspace in prepared],
        matched_count=len(matches),
        skipped_existing_count=skipped,
        max_per_run=max_per_run,
    )


# ── Preferences ──


def _preferences_row(db: Session, user_id: str) -> ApplicationPreferences | None:
    return (
        db.query(ApplicationPreferences)
        .filter(ApplicationPreferences.user_id == user_id)
        .one_or_none()
    )


def get_preferences(db: Session, user_id: str) -> ApplicationPreferencesResponse:
    row = _preferences_row(db, user_id)
    if row is None:
        return ApplicationPreferencesResponse(is_default=True)
    return ApplicationPreferencesResponse.model_validate(row)


def save_preferences(
    db: Session, user_id: str, body: ApplicationPreferencesBody
) -> ApplicationPreferencesResponse:
    row = _preferences_row(db, user_id)
    if row is None:
        row = ApplicationPreferences(user_id=user_id)
        db.add(row)
    row.keywords = body.keywords
    row.locations = body.locations
    row.remote = body.remote
    row.max_per_run = body.max_per_run
    db.commit()
    db.refresh(row)
    return ApplicationPreferencesResponse.model_validate(row)


# ── Tasks ──


def add_task(db: Session, workspace: Workspace, body: TaskCreate) -> CampaignTask:
    task = CampaignTask(workspace_id=workspace.id, title=body.title.strip(), deadline=body.deadline)
    db.add(task)
    db.flush()
    record_event(
        db, workspace.id, "task_created", {"task_id": task.id, "has_deadline": bool(task.deadline)}
    )
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, workspace: Workspace, task_id: str) -> CampaignTask:
    task = (
        db.query(CampaignTask)
        .filter(CampaignTask.id == task_id, CampaignTask.workspace_id == workspace.id)
        .one_or_none()
    )
    if task is None:
        raise ApplicationNotFound(task_id)
    return task


def set_task_completed(db: Session, task: CampaignTask, completed: bool) -> CampaignTask:
    if task.completed != completed:
        task.completed = completed
        record_event(
            db,
            task.workspace_id,
            "task_completed" if completed else "task_reopened",
            {"task_id": task.id},
        )
        db.commit()
        db.refresh(task)
    return task


def delete_task(db: Session, task: CampaignTask) -> None:
    record_event(db, task.workspace_id, "task_deleted", {"task_id": task.id})
    db.delete(task)
    db.commit()


# ── Deletion ──


def delete_application(db: Session, workspace: Workspace) -> None:
    """Delete one application and everything under it.

    PostgreSQL cascades these; deleting them here keeps SQLite, which does not
    enforce foreign keys, identical.
    """
    for model in (CampaignTask, ApplicationSnapshot, CampaignEvent):
        db.query(model).filter(model.workspace_id == workspace.id).delete(
            synchronize_session=False
        )
    db.expire(workspace, ["campaign_tasks", "snapshot", "campaign_events"])
    db.delete(workspace)
    db.commit()



def delete_application_data(db: Session, user_id: str) -> None:
    """Remove every application child row, for account erasure without FK cascades."""
    db.query(ApplicationPreferences).filter(ApplicationPreferences.user_id == user_id).delete(
        synchronize_session=False
    )
    workspace_ids = [row.id for row in db.query(Workspace.id).filter(Workspace.user_id == user_id)]
    if not workspace_ids:
        return
    for model in (CampaignTask, ApplicationSnapshot, CampaignEvent, CampaignListing):
        db.query(model).filter(model.workspace_id.in_(workspace_ids)).delete(
            synchronize_session=False
        )
