# Deliberately NOT `from __future__ import annotations`. Routes here are wrapped
# by slowapi's @limiter.limit, whose wrapper is defined inside slowapi's own
# module — so the wrapped function's __globals__ are slowapi's, not ours. With
# string annotations FastAPI cannot resolve a schema name against those globals,
# silently reclassifies the request body as a query parameter, and OpenAPI
# generation then fails for the whole app (#285). Real annotation objects
# sidestep the lookup entirely. Covered by tests/test_openapi_schema.py.
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.security import get_current_admin
from app.database import get_db
from app.limiter import limiter
from app.models.discovery_source import DiscoverySource
from app.models.tool_run import ToolRun
from app.models.user import User
from app.schemas.admin import (
    AdminRunDetailResponse,
    AdminRunItem,
    AdminRunListResponse,
    AdminSetAdminRequest,
    AdminSourceHealthResponse,
    AdminStatsResponse,
    AdminUserDetailResponse,
    AdminUserItem,
    AdminUserListResponse,
)
from app.schemas.ats_ingestion import ATSIngestionRefreshResponse
from app.schemas.discovery_personalization import AdminRecommendationReportList
from app.schemas.discovery_sources import (
    DiscoverySourceListResponse,
    DiscoverySourceResponse,
)
from app.services.ats_ingestion import run_ats_ingestion_off_loop
from app.services.discovery_personalization import list_admin_reports
from app.services.discovery_sources import operate_source_kill_switch
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
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only per-source-family operational health (#177, D-053).

    Registry posture plus listings-store volume and staleness, aggregated per
    source family. No listing content, full URL, source key/name, or user
    identifier is reachable.
    """
    return aggregate_source_health(db)


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
    the kill switch can never bypass the per-source terms gate (D-084).
    """
    source = db.query(DiscoverySource).filter(DiscoverySource.id == source_id).first()
    if source is None:
        raise HTTPException(status_code=404, detail="Discovery source not found")
    try:
        operate_source_kill_switch(db, source, tripped=tripped, actor=admin)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return source


@router.post("/discovery-sources/refresh", response_model=ATSIngestionRefreshResponse)
@limiter.limit(_ADMIN_RATE)
async def refresh_ats_sources(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Run employer-ATS ingestion now, on demand (#323).

    Admin-gated exactly like every other endpoint here. Reuses the same
    per-source governance and isolation as the scheduled run: one source's
    failure never fails this request, it is reported per source instead. Runs
    off the event loop (`run_ats_ingestion_off_loop`) so this request's
    potentially multi-minute ingestion pass never blocks every other request
    on this process.
    """
    summary = await run_ats_ingestion_off_loop(db)
    return ATSIngestionRefreshResponse(
        outcomes=summary.outcomes,
        failures=summary.failures,
    )


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

    return AdminRunListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


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
