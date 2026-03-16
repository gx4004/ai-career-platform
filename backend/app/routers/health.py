from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-career-platform",
        "environment": settings.ENVIRONMENT,
        "time": datetime.now(timezone.utc).isoformat(),
    }
