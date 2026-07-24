# Deliberately NOT `from __future__ import annotations`. Routes here are wrapped
# by slowapi's @limiter.limit, whose wrapper is defined inside slowapi's own
# module — so the wrapped function's __globals__ are slowapi's, not ours. With
# string annotations FastAPI cannot resolve a schema name against those globals,
# silently reclassifies the request body as a query parameter, and OpenAPI
# generation then fails for the whole app (#285). Real annotation objects
# sidestep the lookup entirely. Covered by tests/test_openapi_schema.py.
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.security import get_current_admin
from app.database import get_db
from app.evals.report_reader import ALL_TOOLS, REPORTS_DIR, latest_reports_by_tool
from app.limiter import limiter
from app.models.discovery_source import DiscoverySource
from app.models.tool_run import ToolRun
from app.models.user import User
from app.schemas.admin import (
    AdminActivationResponse,
    AdminDevelopmentLoopResponse,
    AdminEvalRunsResponse,
    AdminPacketGateResponse,
    AdminProfileAdoptionResponse,
    AdminRunDetailResponse,
    AdminRunItem,
    AdminRunListResponse,
    AdminScorecardResponse,
    AdminSetAdminRequest,
    AdminSourceHealthResponse,
    AdminStatsResponse,
    AdminUserDetailResponse,
    AdminUserItem,
    AdminUserListResponse,
    EvalRunItem,
)
from app.schemas.discovery_personalization import AdminRecommendationReportList
from app.schemas.discovery_sources import (
    DiscoverySourceListResponse,
    DiscoverySourceResponse,
)
from app.services.analytics import (
    ACTIVATION_DEFAULT_WINDOW_DAYS,
    aggregate_activation_metrics,
    aggregate_development_loop,
    aggregate_profile_adoption,
)
from app.services.discovery_personalization import list_admin_reports
from app.services.discovery_sources import operate_source_kill_switch
from app.services.packet_gate import aggregate_packet_gate
from app.services.scorecard import compute_scorecard
from app.services.source_health import aggregate_source_health

router = APIRouter()

# Admin endpoints are token-gated, but layering a per-IP cap is cheap defense
# against credential theft + scripted enumeration. Keep it generous so a real
# operator clicking through the panel never trips it.
_ADMIN_RATE = "60/minute"


# ── Discovery source governance (R14, issue #171) ──


@router.get("/discovery-sources", response_model=DiscoverySourceListResponse)
@limiter.limit(_ADMIN_RATE)
def list_discovery_sources(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only governance registry; source activation is never changed here."""
    items = db.query(DiscoverySource).order_by(DiscoverySource.display_name).all()
    return DiscoverySourceListResponse(items=items)


@router.get("/discovery-reports", response_model=AdminRecommendationReportList)
@limiter.limit(_ADMIN_RATE)
def list_discovery_reports(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Recommendation error reports for review (R14, #175).

    Read-only. Each row carries the product listing snapshot, the closed-set
    reason category, and the reporter's own reason text — never the reporter's
    identity or any Evidence Profile content (D-090).
    """
    return list_admin_reports(db)


# ── Per-source health & kill switch (R14, issue #177) ──


@router.get("/source-health", response_model=AdminSourceHealthResponse)
@limiter.limit(_ADMIN_RATE)
def get_source_health(
    request: Request,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only per-source-family operational health (#177, D-053).

    Admin-gated exactly like every other endpoint here (``get_current_admin``).
    Extends the existing first-party operational path with source-family
    aggregate dimensions only: registry posture, listings-store volume and
    staleness, and windowed fetch/ingest/dedup/expiry outcomes. No listing
    content, full URL, source key/name, or user identifier is reachable. The
    date window defaults to a rolling two weeks; naive bounds are treated as UTC
    so comparison against the timezone-aware ``created_at`` column is well
    defined on Postgres.
    """
    now = datetime.now(UTC)
    window_end = end or now
    window_start = start or (window_end - timedelta(days=ACTIVATION_DEFAULT_WINDOW_DAYS))
    if window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=UTC)
    if window_end.tzinfo is None:
        window_end = window_end.replace(tzinfo=UTC)

    return aggregate_source_health(
        db,
        window_start=window_start,
        window_end=window_end,
    )


@router.post(
    "/discovery-sources/{source_id}/kill-switch",
    response_model=DiscoverySourceResponse,
)
@limiter.limit(_ADMIN_RATE)
def operate_kill_switch(
    request: Request,
    source_id: str,
    # ``tripped`` is a bool query param rather than a JSON body. This began as a
    # workaround for the stringized-annotation bug described at the top of this
    # module, which is now fixed (#285) — a body model would resolve fine here
    # today. Kept as a query param only to avoid changing a shipped admin API
    # contract for no user-visible gain; it is no longer a constraint.
    tripped: bool = Query(...),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Operator kill-switch trip/clear — immediate, no deploy or restart (#177).

    Flips the persisted ``kill_switch`` column that every fetch/ingest read path
    re-reads on the next request, so a trip halts the source at once and a clear
    re-enables it. Clearing is refused unless the terms review is accepted, so
    the kill switch can never bypass the per-source terms gate (D-084). The
    action is recorded as a bounded operational event (source family + trip/clear
    outcome only).
    """
    source = db.query(DiscoverySource).filter(DiscoverySource.id == source_id).first()
    if source is None:
        raise HTTPException(status_code=404, detail="Discovery source not found")
    try:
        operate_source_kill_switch(db, source, tripped=tripped, actor=admin)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return source


# ── Users ──


@router.get("/users", response_model=AdminUserListResponse)
@limiter.limit(_ADMIN_RATE)
def list_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None, max_length=100),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        query = query.filter(User.email.ilike(f"%{q}%"))

    total = query.count()
    users = (
        query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    )

    user_ids = [u.id for u in users]
    run_counts: dict[str, int] = {}
    if user_ids:
        run_counts = dict(
            db.query(ToolRun.user_id, func.count(ToolRun.id))
            .filter(ToolRun.user_id.in_(user_ids))
            .group_by(ToolRun.user_id)
            .all()
        )

    items = []
    for user in users:
        items.append(
            AdminUserItem(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                is_active=user.is_active,
                is_admin=getattr(user, "is_admin", False),
                created_at=user.created_at.isoformat() if user.created_at else None,
                run_count=run_counts.get(user.id, 0),
            )
        )

    return AdminUserListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
@limiter.limit(_ADMIN_RATE)
def get_user(
    request: Request,
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    run_count = db.query(func.count(ToolRun.id)).filter(ToolRun.user_id == user.id).scalar() or 0
    recent_runs = (
        db.query(ToolRun)
        .filter(ToolRun.user_id == user.id)
        .order_by(ToolRun.created_at.desc())
        .limit(10)
        .all()
    )

    return AdminUserDetailResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_admin=getattr(user, "is_admin", False),
        created_at=user.created_at.isoformat() if user.created_at else None,
        run_count=run_count,
        recent_runs=[
            AdminRunItem(
                id=r.id,
                user_id=r.user_id,
                user_email=user.email,
                tool_name=r.tool_name,
                label=r.label,
                created_at=r.created_at.isoformat() if r.created_at else None,
                has_parent=r.parent_run_id is not None,
            )
            for r in recent_runs
        ],
    )


@router.patch("/users/{user_id}/admin", status_code=200)
@limiter.limit(_ADMIN_RATE)
def set_admin(
    request: Request,
    user_id: str,
    body: AdminSetAdminRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own admin status")

    user.is_admin = body.is_admin
    db.commit()
    return {"ok": True, "is_admin": user.is_admin}


# ── Runs ──


@router.get("/runs", response_model=AdminRunListResponse)
@limiter.limit(_ADMIN_RATE)
def list_runs(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    tool: str | None = None,
    user_id: str | None = None,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(ToolRun)
    if tool:
        query = query.filter(ToolRun.tool_name == tool)
    if user_id:
        query = query.filter(ToolRun.user_id == user_id)

    total = query.count()
    runs = (
        query.order_by(ToolRun.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Batch fetch user emails
    user_ids = list({r.user_id for r in runs})
    users_map = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        users_map = {u.id: u.email for u in users}

    items = [
        AdminRunItem(
            id=r.id,
            user_id=r.user_id,
            user_email=users_map.get(r.user_id),
            tool_name=r.tool_name,
            label=r.label,
            created_at=r.created_at.isoformat() if r.created_at else None,
            has_parent=r.parent_run_id is not None,
        )
        for r in runs
    ]

    return AdminRunListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/runs/{run_id}", response_model=AdminRunDetailResponse)
@limiter.limit(_ADMIN_RATE)
def get_run(
    request: Request,
    run_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    run = db.query(ToolRun).filter(ToolRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    user = db.query(User).filter(User.id == run.user_id).first()

    return AdminRunDetailResponse(
        id=run.id,
        user_id=run.user_id,
        user_email=user.email if user else None,
        tool_name=run.tool_name,
        label=run.label,
        created_at=run.created_at.isoformat() if run.created_at else None,
        has_parent=run.parent_run_id is not None,
        result_payload=run.result_payload or {},
        feedback_text=run.feedback_text,
        workspace_id=run.workspace_id,
    )


# ── Stats ──


@router.get("/stats", response_model=AdminStatsResponse)
@limiter.limit(_ADMIN_RATE)
def get_stats(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    total_users = db.query(func.count(User.id)).scalar() or 0
    total_runs = db.query(func.count(ToolRun.id)).scalar() or 0
    runs_today = (
        db.query(func.count(ToolRun.id)).filter(ToolRun.created_at >= today_start).scalar() or 0
    )
    active_users_7d = (
        db.query(func.count(func.distinct(ToolRun.user_id)))
        .filter(ToolRun.created_at >= week_ago)
        .scalar()
        or 0
    )

    tool_counts = (
        db.query(ToolRun.tool_name, func.count(ToolRun.id)).group_by(ToolRun.tool_name).all()
    )
    runs_by_tool = {name: count for name, count in tool_counts}

    return AdminStatsResponse(
        total_users=total_users,
        total_runs=total_runs,
        runs_today=runs_today,
        active_users_7d=active_users_7d,
        runs_by_tool=runs_by_tool,
    )


# ── Activation dashboard (R6, issue #108) ──


@router.get("/activation", response_model=AdminActivationResponse)
@limiter.limit(_ADMIN_RATE)
def get_activation(
    request: Request,
    # Inlined to mirror `AccessMode` (app/schemas/telemetry.py) — FastAPI cannot
    # resolve the aliased Literal as a query-param forward ref under
    # `from __future__ import annotations`.
    access_mode: Literal["authenticated", "guest_demo"] | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only activation funnel / failure / cost aggregate (D-039).

    Admin-gated exactly like every other endpoint here (`get_current_admin`).
    Filterable by access mode (guest vs. authenticated) and by a date window
    that defaults to a rolling two weeks. Naive window bounds are treated as
    UTC so comparison against the timezone-aware `created_at` column is well
    defined on Postgres.
    """
    now = datetime.now(UTC)
    window_end = end or now
    window_start = start or (window_end - timedelta(days=ACTIVATION_DEFAULT_WINDOW_DAYS))
    if window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=UTC)
    if window_end.tzinfo is None:
        window_end = window_end.replace(tzinfo=UTC)

    return aggregate_activation_metrics(
        db,
        window_start=window_start,
        window_end=window_end,
        access_mode=access_mode,
    )


# ── Profile adoption view (R11, issue #150) ──


@router.get("/profile-adoption", response_model=AdminProfileAdoptionResponse)
@limiter.limit(_ADMIN_RATE)
def get_profile_adoption(
    request: Request,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only Evidence Profile adoption/trust aggregate (#150, D-067).

    Admin-gated exactly like every other endpoint here (``get_current_admin``).
    Answers "is the profile being adopted and trusted?" from allowlisted
    low-cardinality profile events only — created counts by kind and provenance
    class, and confirm/reject trust decisions — over a date window that defaults
    to a rolling two weeks. No evidence content is reachable from this view.
    Naive window bounds are treated as UTC so comparison against the
    timezone-aware ``created_at`` column is well defined on Postgres.
    """
    now = datetime.now(UTC)
    window_end = end or now
    window_start = start or (window_end - timedelta(days=ACTIVATION_DEFAULT_WINDOW_DAYS))
    if window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=UTC)
    if window_end.tzinfo is None:
        window_end = window_end.replace(tzinfo=UTC)

    return aggregate_profile_adoption(
        db,
        window_start=window_start,
        window_end=window_end,
    )


# ── Development-loop adoption view (R17, issue #202) ──


@router.get("/development-loop", response_model=AdminDevelopmentLoopResponse)
@limiter.limit(_ADMIN_RATE)
def get_development_loop(
    request: Request,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Aggregate-only R17 adoption view over content-free lifecycle events.

    No gap message, note, recommendation content, stable item identifier, or
    user identifier is stored by the event model, so none is reachable here
    (D-114). Naive bounds are interpreted as UTC, matching sibling admin views.
    """
    now = datetime.now(UTC)
    window_end = end or now
    window_start = start or (
        window_end - timedelta(days=ACTIVATION_DEFAULT_WINDOW_DAYS)
    )
    if window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=UTC)
    if window_end.tzinfo is None:
        window_end = window_end.replace(tzinfo=UTC)
    if window_start > window_end:
        raise HTTPException(
            status_code=422,
            detail="start must be before or equal to end",
        )

    return aggregate_development_loop(
        db,
        window_start=window_start,
        window_end=window_end,
    )


# ── Packet-queue trust-chain gate (R15, issue #184) ──


@router.get("/packet-gate", response_model=AdminPacketGateResponse)
@limiter.limit(_ADMIN_RATE)
def get_packet_gate(
    request: Request,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only trust-chain gate state (#184, D-097).

    Admin-gated exactly like every other endpoint here (``get_current_admin``).
    Surfaces the current pipeline-halt posture plus windowed counts of the
    allowlisted gate events (running / passed / blocked, and halt / clear). No
    packet content, listing text/id, run id, finding text, or user identifier is
    reachable. The window defaults to a rolling two weeks; naive bounds are
    treated as UTC so comparison against the timezone-aware ``created_at`` column
    is well defined on Postgres.
    """
    now = datetime.now(UTC)
    window_end = end or now
    window_start = start or (window_end - timedelta(days=ACTIVATION_DEFAULT_WINDOW_DAYS))
    if window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=UTC)
    if window_end.tzinfo is None:
        window_end = window_end.replace(tzinfo=UTC)

    return aggregate_packet_gate(
        db,
        window_start=window_start,
        window_end=window_end,
    )


# ── Scaling-trigger scorecard (R10, issue #136) ──


@router.get("/scorecard", response_model=AdminScorecardResponse)
@limiter.limit(_ADMIN_RATE)
def get_scorecard(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only R10 operational scaling-trigger scorecard (#136, D-052/D-053).

    Admin-gated exactly like every other endpoint here (``get_current_admin``).
    For each of the six predeclared triggers it reports the threshold,
    observation window, minimum sample, current evidence, freshness, trigger
    state, owner, rollback, and exit criteria, plus the deferred response ticket
    a fired trigger authorises *review* of. It never changes any response
    configuration — a crossed threshold only sets ``review_required``.
    """
    return compute_scorecard(db)


# ── Eval Runs (R8, issue #124) ──


def get_reports_dir() -> Path:
    """Directory the R8 eval reports are read from.

    A FastAPI dependency so tests can point the endpoint at a fixture directory
    of fake reports via ``app.dependency_overrides`` without touching the real
    ``app/evals/reports/`` tree.
    """
    return REPORTS_DIR


@router.get("/eval-runs", response_model=AdminEvalRunsResponse)
@limiter.limit(_ADMIN_RATE)
def get_eval_runs(
    request: Request,
    admin: User = Depends(get_current_admin),
    reports_dir: Path = Depends(get_reports_dir),
):
    """Read-only latest R8 eval report per tool, read from disk (D-045).

    Surfaces the newest versioned JSON report file per tool from
    ``app/evals/reports/`` beside the activation dashboard's per-tool
    latency/cost view, so quality/latency/cost are visible together on one page
    (parent spec #118). Reports are dev-tooling artifacts on disk and are never
    read from the ``analytics_events`` table (D-045).

    Admin-gated exactly like every other endpoint here (``get_current_admin``).
    Every tool (all six, canonical tool-order) is returned; a tool with no
    report yet carries ``has_report=False`` so the UI shows an explicit
    "no eval run yet" state rather than an error or blank.
    """
    latest = latest_reports_by_tool(reports_dir)
    items: list[EvalRunItem] = []
    for tool_id in ALL_TOOLS:
        data = latest.get(tool_id)
        if data is None:
            items.append(EvalRunItem(tool_id=tool_id, has_report=False))
            continue
        items.append(
            EvalRunItem(
                tool_id=tool_id,
                has_report=True,
                report_schema_version=data.get("report_schema_version"),
                prompt_version=data.get("prompt_version"),
                judge_prompt_version=data.get("judge_prompt_version"),
                generated_at=data.get("generated_at"),
                mode=data.get("mode"),
                fixtures_evaluated=data.get("fixtures_evaluated"),
                calibration_miss_rate=data.get("calibration_miss_rate"),
                fabrication_candidate_count=data.get("fabrication_candidate_count"),
                usefulness_score=data.get("usefulness_score"),
            )
        )
    return AdminEvalRunsResponse(tools=items)


# ── Health ──


@router.get("/health")
@limiter.limit(_ADMIN_RATE)
def admin_health(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    db_ok = False
    try:
        db.execute(sa.text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    from app.config import settings
    from app.services.result_cache import _cache

    return {
        "database": "ok" if db_ok else "error",
        "llm_provider": settings.LLM_PROVIDER,
        "llm_model": settings.LLM_MODEL,
        "cache_enabled": settings.RESULT_CACHE_ENABLED,
        "cache_entries": len(_cache),
        "environment": settings.ENVIRONMENT,
    }
