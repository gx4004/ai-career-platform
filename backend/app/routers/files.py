from fastapi import APIRouter, HTTPException, Request, UploadFile
from app.limiter import limiter

from app.schemas.tools import ParsedCvResponse
from app.services.cv_parser import parse_cv

router = APIRouter()

MAX_CV_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/parse-cv", response_model=ParsedCvResponse)
@limiter.limit("20/minute")
async def parse_cv_endpoint(request: Request, file: UploadFile):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: .{ext}. Use .pdf or .docx",
        )

    content = await file.read()
    if len(content) > MAX_CV_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_CV_SIZE // (1024 * 1024)} MB",
        )
    return parse_cv(content, file.filename, ext)
