from fastapi import APIRouter, HTTPException

from app.schemas.tools import ImportedJobResponse, ImportJobUrlRequest
from app.services.job_scraper import scrape_job_posting

router = APIRouter()


@router.post("/import-url", response_model=ImportedJobResponse)
async def import_job_url(body: ImportJobUrlRequest):
    try:
        result = await scrape_job_posting(body.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result
