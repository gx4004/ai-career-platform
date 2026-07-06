import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile

from app.limiter import limiter
from app.schemas.tools import ParsedCvResponse
from app.services.cv_parser_process import CvParserProcessRejected, parse_cv_isolated
from app.services.cv_upload import (
    GENERIC_INVALID_FILE_DETAIL,
    CvUploadRejected,
    read_validated_cv_upload,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/parse-cv", response_model=ParsedCvResponse)
@limiter.limit("20/minute")
async def parse_cv_endpoint(request: Request, file: UploadFile):
    try:
        upload = await read_validated_cv_upload(file)
        return await parse_cv_isolated(
            upload.content,
            upload.filename,
            upload.extension,
        )
    except (CvUploadRejected, CvParserProcessRejected) as exc:
        if isinstance(exc, CvParserProcessRejected):
            raise HTTPException(
                status_code=400,
                detail=GENERIC_INVALID_FILE_DETAIL,
            ) from exc
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except Exception as exc:
        logger.warning("CV upload rejected after an unexpected parser failure")
        raise HTTPException(
            status_code=400,
            detail=GENERIC_INVALID_FILE_DETAIL,
        ) from exc
    finally:
        await file.close()
