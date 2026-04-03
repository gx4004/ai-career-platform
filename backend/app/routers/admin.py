from __future__ import annotations

from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.security import get_current_admin
from app.database import get_db
from app.models.tool_run import ToolRun
from app.models.user import User
from app.schemas.admin import (
    AdminRunDetailResponse,
    AdminRunItem,
    AdminRunListResponse,
    AdminSetAdminRequest,
    AdminStatsResponse,
    AdminUserDetailResponse,
    AdminUserItem,
    AdminUserListResponse,
)

router = APIRouter()


# ── Users ──

@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        query = query.filter(User.email.ilike(f"%{q}%"))

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

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
        items.append(AdminUserItem(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_admin=getattr(user, "is_admin", False),
            created_at=user.created_at.isoformat() if user.created_at else None,
            run_count=run_counts.get(user.id, 0),
        ))

    return AdminUserListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
def get_user(
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
def set_admin(
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
def list_runs(
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
    runs = query.order_by(ToolRun.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

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
def get_run(
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
def get_stats(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    total_users = db.query(func.count(User.id)).scalar() or 0
    total_runs = db.query(func.count(ToolRun.id)).scalar() or 0
    runs_today = (
        db.query(func.count(ToolRun.id))
        .filter(ToolRun.created_at >= today_start)
        .scalar() or 0
    )
    active_users_7d = (
        db.query(func.count(func.distinct(ToolRun.user_id)))
        .filter(ToolRun.created_at >= week_ago)
        .scalar() or 0
    )

    tool_counts = (
        db.query(ToolRun.tool_name, func.count(ToolRun.id))
        .group_by(ToolRun.tool_name)
        .all()
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
def admin_health(
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
