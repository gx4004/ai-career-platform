import logging

from fastapi import APIRouter, HTTPException, Request

from app.limiter import limiter
from app.schemas.tools import ImportedJobResponse, ImportJobUrlRequest
from app.services.job_scraper import scrape_job_posting

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/import-url", response_model=ImportedJobResponse)
@limiter.limit("10/minute")
async def import_job_url(request: Request, body: ImportJobUrlRequest):
    try:
        result = await scrape_job_posting(str(body.url))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Job import failed for URL: %s", body.url)
        raise HTTPException(
            status_code=502,
            detail="Could not fetch or parse the job posting. Please check the URL and try again.",
        )
    return result
