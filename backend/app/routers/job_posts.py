import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, get_optional_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.tools import ImportedJobResponse, ImportJobTextRequest, ImportJobUrlRequest
from app.services.campaign_listings import attach_listing
from app.services.import_source import map_source_family
from app.services.job_scraper import GUEST_MAX_RESPONSE_BYTES, scrape_job_posting

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/import-url", response_model=ImportedJobResponse)
@limiter.limit("10/minute")
async def import_job_url(
    request: Request,
    body: ImportJobUrlRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    if body.campaign_id is not None:
        # Every refusal that does not depend on the page is decided before the fetch,
        # so it never costs an outbound request.
        _require_attachable(db, current_user, body.campaign_id)
    try:
        if current_user is None:
            result = await scrape_job_posting(
                str(body.url), max_response_bytes=GUEST_MAX_RESPONSE_BYTES
            )
        else:
            result = await scrape_job_posting(str(body.url))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        logger.error("Job import failed error_type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="Could not fetch or parse the job posting. Please check the URL and try again.",
        )
    if body.campaign_id is not None:
        # No tier produced a posting: hand back the paste prompt and leave the
        # campaign's current listing untouched.
        if not result.readable:
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
            apply_url=result.source_url or str(body.url),
            source_family=map_source_family(str(body.url)),
        )
        result.retrieved_at = listing.retrieved_at
    return result


def _require_attachable(db: Session, current_user: User | None, campaign_id: str) -> None:
    """The same refusals attach_listing makes, checked before any network fetch."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required to attach a listing")
    workspace = (
        db.query(Workspace)
        .filter(Workspace.id == campaign_id, Workspace.user_id == current_user.id)
        .first()
    )
    if workspace is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if workspace.applied_at is not None and workspace.listing is not None:
        raise HTTPException(
            status_code=409,
            detail="This application is already marked applied, so its job posting is kept.",
        )


@router.post("/import-text", response_model=ImportedJobResponse)
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
