from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.schemas.telemetry import TelemetryAcceptedResponse, TelemetryEventRequest
from app.services.observability import log_frontend_telemetry

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/events", response_model=TelemetryAcceptedResponse)
@limiter.limit("60/minute")
def ingest_event(request: Request, body: TelemetryEventRequest):
    log_frontend_telemetry(body.model_dump(exclude_none=True))
    return TelemetryAcceptedResponse(accepted=True)
