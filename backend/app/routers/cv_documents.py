from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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
    CvVariantCreate,
    CvVariantResponse,
)
from app.services.cv_documents import (
    CvDocumentNotFoundError,
    DuplicateVariantNameError,
    InvalidEvidenceReferenceError,
    create_document,
    create_variant,
    delete_document,
    export_documents,
    get_document,
    list_documents,
    restore_variant,
    update_document,
)

router = APIRouter()


def _not_found(error: Exception):
    raise HTTPException(status_code=404, detail="CV document not found") from error


def _invalid_evidence(error: Exception):
    raise HTTPException(
        status_code=422,
        detail="Every CV entry must reference a confirmed Evidence Profile item owned by you",
    ) from error


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
