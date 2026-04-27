from fastapi import APIRouter, HTTPException, Request, UploadFile
from app.limiter import limiter

from app.schemas.tools import ParsedCvResponse
from app.services.cv_parser import parse_cv

router = APIRouter()

MAX_CV_SIZE = 10 * 1024 * 1024  # 10 MB

# Magic bytes — extension can be spoofed; the parser will fail loudly on
# arbitrary bytes, but rejecting at the boundary gives a clean 400 instead of
# burning CPU in PyMuPDF/python-docx and emitting noisy stack traces.
_PDF_MAGIC = b"%PDF-"
_DOCX_MAGIC = b"PK\x03\x04"  # docx is a zip; this is the zip local-file header


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

    expected_magic = _PDF_MAGIC if ext == "pdf" else _DOCX_MAGIC
    if not content.startswith(expected_magic):
        raise HTTPException(
            status_code=400,
            detail=f"File does not appear to be a valid .{ext} (content does not match expected format).",
        )

    return parse_cv(content, file.filename, ext)
