from fastapi import APIRouter

from app.schemas.telemetry import TelemetryAcceptedResponse, TelemetryEventRequest
from app.services.observability import log_frontend_telemetry

router = APIRouter()


@router.post("/events", response_model=TelemetryAcceptedResponse)
def ingest_event(body: TelemetryEventRequest):
    log_frontend_telemetry(body.model_dump(exclude_none=True))
    return TelemetryAcceptedResponse(accepted=True)
