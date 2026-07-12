from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.schemas.cv_documents import (
    CvDocumentCreate,
    CvDocumentListResponse,
    CvDocumentResponse,
    CvDocumentsExport,
    CvDocumentUpdate,
    CvImportAccept,
    CvImportProposal,
    CvVariantCreate,
    CvVariantResponse,
)
from app.services.cv_documents import (
    CvDocumentNotFoundError,
    DuplicateVariantNameError,
    InvalidEvidenceReferenceError,
    accept_import,
    create_document,
    create_variant,
    delete_document,
    export_documents,
    get_document,
    list_documents,
    restore_variant,
    update_document,
)
from app.services.cv_parser_process import CvParserProcessRejected, parse_cv_import_isolated
from app.services.cv_upload import CvUploadRejected, read_validated_cv_upload

router = APIRouter()

_INVALID_IMPORT = (
    "Use an unencrypted PDF, a valid DOCX without unsafe archive content, or UTF-8 plain text."
)
_IMPORT_LIMIT = "The uploaded file is larger than the 10 MB limit."
_IMPORT_ARCHIVE_LIMIT = "The DOCX expands beyond safe processing limits. Try a simpler document."
_IMPORT_TIMEOUT = "Import took too long. Try a smaller or simpler document."


def _not_found(error: Exception):
    raise HTTPException(status_code=404, detail="CV document not found") from error


def _invalid_evidence(error: Exception):
    raise HTTPException(
        status_code=422,
        detail="Every CV entry must reference a confirmed Evidence Profile item owned by you",
    ) from error


@router.post("/import/proposals", response_model=CvImportProposal)
@limiter.limit("20/minute")
async def propose_import(
    request: Request,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
):
    try:
        upload = await read_validated_cv_upload(file, allow_plain_text=True)
        return await parse_cv_import_isolated(upload.content, upload.filename, upload.extension)
    except CvUploadRejected as error:
        detail = {
            "size": _IMPORT_LIMIT,
            "archive_limit": _IMPORT_ARCHIVE_LIMIT,
        }.get(error.category, _INVALID_IMPORT)
        raise HTTPException(status_code=error.status_code, detail=detail) from error
    except CvParserProcessRejected as error:
        detail = _IMPORT_TIMEOUT if "timed out" in str(error) else _INVALID_IMPORT
        raise HTTPException(status_code=400, detail=detail) from error
    finally:
        await file.close()


@router.post(
    "/import/accept",
    response_model=CvDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def accept_reviewed_import(
    body: CvImportAccept,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return accept_import(db, current_user.id, body)


@router.get("/export", response_model=CvDocumentsExport)
@limiter.limit("5/minute")
def export_all(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return export_documents(db, current_user.id)


@router.get("", response_model=CvDocumentListResponse)
def list_all(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return CvDocumentListResponse(items=list_documents(db, current_user.id))


@router.post("", response_model=CvDocumentResponse, status_code=status.HTTP_201_CREATED)
def create(
    body: CvDocumentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return create_document(db, current_user.id, body)
    except InvalidEvidenceReferenceError as error:
        _invalid_evidence(error)


@router.get("/{document_id}", response_model=CvDocumentResponse)
def get_one(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_document(db, document_id, current_user.id)
    except CvDocumentNotFoundError as error:
        _not_found(error)


@router.patch("/{document_id}", response_model=CvDocumentResponse)
def update(
    document_id: str,
    body: CvDocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        document = get_document(db, document_id, current_user.id)
        sections = None if body.sections is None else [item.model_dump() for item in body.sections]
        return update_document(db, document, name=body.name, sections=sections)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    except InvalidEvidenceReferenceError as error:
        _invalid_evidence(error)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        delete_document(db, get_document(db, document_id, current_user.id))
    except CvDocumentNotFoundError as error:
        _not_found(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{document_id}/variants",
    response_model=CvVariantResponse,
    status_code=status.HTTP_201_CREATED,
)
def snapshot(
    document_id: str,
    body: CvVariantCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return create_variant(
            db,
            get_document(db, document_id, current_user.id),
            body.name,
            body.target_role,
        )
    except CvDocumentNotFoundError as error:
        _not_found(error)
    except DuplicateVariantNameError as error:
        raise HTTPException(status_code=409, detail="Variant name already exists") from error


@router.post("/{document_id}/variants/{variant_id}/restore", response_model=CvDocumentResponse)
def restore(
    document_id: str,
    variant_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return restore_variant(db, get_document(db, document_id, current_user.id), variant_id)
    except CvDocumentNotFoundError as error:
        _not_found(error)
