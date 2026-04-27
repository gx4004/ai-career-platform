from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter()


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    checks = {}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"
        return {
            "status": "degraded",
            "service": "ai-career-platform",
            "time": datetime.now(UTC).isoformat(),
            "checks": checks,
        }

    return {
        "status": "ok",
        "service": "ai-career-platform",
        "time": datetime.now(UTC).isoformat(),
        "checks": checks,
    }
