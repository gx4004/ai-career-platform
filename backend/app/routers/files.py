from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.tools import ParsedCvResponse
from app.services.cv_parser import parse_cv

router = APIRouter()


@router.post("/parse-cv", response_model=ParsedCvResponse)
async def parse_cv_endpoint(file: UploadFile):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: .{ext}. Use .pdf or .docx",
        )

    content = await file.read()
    return parse_cv(content, file.filename, ext)
