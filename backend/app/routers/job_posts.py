import logging
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, get_optional_current_user
from app.database import get_db
from app.feature_gates import require_r13_enabled
from app.limiter import limiter, resource_abuse_limits
from app.models.user import User
from app.schemas.analytics import ImportOutcome, ImportSourceFamily
from app.schemas.tools import ImportedJobResponse, ImportJobTextRequest, ImportJobUrlRequest
from app.services.analytics import safe_record_activation_event
from app.services.campaign_listings import attach_listing
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
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    if body.campaign_id is not None:
        # Standalone URL parsing predates R13, but attaching its result mutates
        # campaign state and must remain absent while that outcome is dark.
        require_r13_enabled()
    # R10 import-concentration evidence (#136, D-059): map the URL to an
    # allowlisted source family *here*, then let the scraper run and record only
    # the family + outcome class. The raw URL is used solely for the local
    # mapping and is never handed to analytics.
    source_family = map_source_family(str(body.url))
    reset_import_outcome()
    import_started = perf_counter()
    try:
        result = await scrape_job_posting(str(body.url))
    except ValueError as e:
        _record_import_outcome(
            db,
            source_family,
            duration_ms=max(0, int((perf_counter() - import_started) * 1000)),
            forced_outcome="failure",
        )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        logger.error("Job import failed error_type=%s", type(exc).__name__)
        _record_import_outcome(
            db,
            source_family,
            duration_ms=max(0, int((perf_counter() - import_started) * 1000)),
            forced_outcome="failure",
        )
        raise HTTPException(
            status_code=502,
            detail="Could not fetch or parse the job posting. Please check the URL and try again.",
        )
    import_outcome: ImportOutcome = get_import_outcome() or "failure"
    _record_import_outcome(
        db,
        source_family,
        duration_ms=max(0, int((perf_counter() - import_started) * 1000)),
        forced_outcome=import_outcome,
    )
    if body.campaign_id is not None:
        if current_user is None:
            raise HTTPException(
                status_code=401, detail="Authentication required to attach a listing"
            )
        if import_outcome == "failure":
            return result
        if result.job_title is None or result.company_name is None:
            raise HTTPException(
                status_code=422,
                detail="Could not extract a complete listing. Please paste the listing instead.",
            )
        listing = attach_listing(
            db,
            user_id=current_user.id,
            campaign_id=body.campaign_id,
            title=result.job_title,
            company=result.company_name,
            description=result.job_description,
            source_url=result.source_url or str(body.url),
            source_family=source_family,
        )
        result.retrieved_at = listing.retrieved_at
    return result


@router.post(
    "/import-text",
    response_model=ImportedJobResponse,
    dependencies=[Depends(require_r13_enabled)],
)
@limiter.limit("10/minute")
def import_job_text(
    request: Request,
    body: ImportJobTextRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = attach_listing(
        db,
        user_id=current_user.id,
        campaign_id=body.campaign_id,
        title=body.job_title,
        company=body.company_name,
        description=body.job_description,
        source_url=None,
        source_family="paste",
    )
    return ImportedJobResponse(
        job_title=listing.title,
        company_name=listing.company,
        job_description=listing.description,
        source_url=None,
        retrieved_at=listing.retrieved_at,
    )


def _record_import_outcome(
    db: Session,
    source_family: ImportSourceFamily,
    *,
    duration_ms: int,
    forced_outcome: ImportOutcome | None = None,
) -> None:
    """Emit one bounded import family/outcome/duration event."""
    outcome: ImportOutcome = forced_outcome or get_import_outcome() or "failure"
    safe_record_activation_event(
        db,
        event_name="r10_import_outcome",
        operational_dimension=source_family,
        operational_outcome=outcome,
        duration_ms=duration_ms,
    )
