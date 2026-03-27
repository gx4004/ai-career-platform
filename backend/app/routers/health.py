from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-career-platform",
        "time": datetime.now(timezone.utc).isoformat(),
    }
