from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import database
from app.config import settings
from app.database import get_db

router = APIRouter()

_SERVICE = "ai-career-platform"


def _body(status: str, checks: dict[str, str] | None = None) -> dict:
    body = {"status": status, "service": _SERVICE, "time": datetime.now(UTC).isoformat()}
    if checks is not None:
        body["checks"] = checks
    return body


def _pool_saturated() -> bool:
    """True when every pooled and overflow connection is checked out.

    Read from the pool's counters, so it answers immediately instead of queueing
    for a connection the way a probe query would.
    """
    pool = database.engine.pool
    try:
        return pool.checkedout() >= pool.size() + settings.DB_MAX_OVERFLOW
    except (AttributeError, TypeError):
        return False  # pool without counters (e.g. a single-connection test pool)


@router.get("/health/live")
def liveness():
    """Process liveness: no database, no pool. Safe for restart-style probes."""
    return _body("ok")


@router.get("/health/ready")
def readiness(db: Session = Depends(get_db)):
    """Readiness: pool headroom first (fails fast), then a database round trip."""
    if _pool_saturated():
        return JSONResponse(
            status_code=503,
            content=_body("degraded", {"database": "skipped", "pool": "saturated"}),
        )
    checks = {"pool": "ok"}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"
        return JSONResponse(status_code=503, content=_body("degraded", checks))
    return _body("ok", checks)


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    checks = {}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"
        return JSONResponse(status_code=503, content=_body("degraded", checks))

    return _body("ok", checks)
