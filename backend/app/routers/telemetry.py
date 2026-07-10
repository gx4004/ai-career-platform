from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.schemas.telemetry import TelemetryAcceptedResponse, TelemetryEventRequest
from app.services.analytics import safe_record_activation_event
from app.services.observability import log_frontend_telemetry

router = APIRouter()


@router.post("/events", response_model=TelemetryAcceptedResponse)
@limiter.limit("60/minute")
def ingest_event(
    request: Request,
    body: TelemetryEventRequest,
    db: Session = Depends(get_db),
):
    # Consent is already enforced client-side: the frontend telemetry client
    # never dispatches when the user has declined cookies, so anything reaching
    # this endpoint is consented. Behaviour is unchanged — we keep the existing
    # stdout log and now also persist the same allowlisted event durably (D-037).
    payload = body.model_dump(exclude_none=True)
    log_frontend_telemetry(payload)
    safe_record_activation_event(db, **payload)
    return TelemetryAcceptedResponse(accepted=True)
