import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter, resource_abuse_limits
from app.schemas.analytics import ImportOutcome, ImportSourceFamily
from app.schemas.tools import ImportedJobResponse, ImportJobUrlRequest
from app.services.analytics import safe_record_activation_event
from app.services.import_source import (
    get_import_outcome,
    map_source_family,
    reset_import_outcome,
)
from app.services.job_scraper import scrape_job_posting

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/import-url", response_model=ImportedJobResponse)
@limiter.limit("10/minute")
@resource_abuse_limits
async def import_job_url(
    request: Request,
    body: ImportJobUrlRequest,
    db: Session = Depends(get_db),
):
    # R10 import-concentration evidence (#136, D-059): map the URL to an
    # allowlisted source family *here*, then let the scraper run and record only
    # the family + outcome class. The raw URL is used solely for the local
    # mapping and is never handed to analytics.
    source_family = map_source_family(str(body.url))
    reset_import_outcome()
    try:
        result = await scrape_job_posting(str(body.url))
    except ValueError as e:
        _record_import_outcome(db, source_family, forced_outcome="failure")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        logger.error("Job import failed error_type=%s", type(exc).__name__)
        _record_import_outcome(db, source_family, forced_outcome="failure")
        raise HTTPException(
            status_code=502,
            detail="Could not fetch or parse the job posting. Please check the URL and try again.",
        )
    _record_import_outcome(db, source_family)
    return result


def _record_import_outcome(
    db: Session,
    source_family: ImportSourceFamily,
    *,
    forced_outcome: ImportOutcome | None = None,
) -> None:
    """Emit one allowlisted `r10_import_outcome` event (family + outcome only)."""
    outcome: ImportOutcome = forced_outcome or get_import_outcome() or "failure"
    safe_record_activation_event(
        db,
        event_name="r10_import_outcome",
        operational_dimension=source_family,
        operational_outcome=outcome,
    )
