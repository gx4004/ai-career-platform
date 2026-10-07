import logging
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.auth.security import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.cv_document import CvDocument
from app.models.user import User
from app.schemas.cv_documents import (
    CvConflictResponse,
    CvDocumentCreate,
    CvDocumentListResponse,
    CvDocumentResponse,
    CvDocumentsExport,
    CvDocumentUpdate,
    CvFitResult,
    CvImportAccept,
    CvImportProposal,
    CvLength,
    CvLengthAdvice,
    CvPreviewPage,
    CvPreviewRequest,
    CvPreviewResponse,
    CvPreviewSection,
    CvPreviewWarning,
    CvQualityResponse,
    CvStyle,
    CvStyleCatalog,
    CvTailoringApply,
    CvTailoringProposal,
    CvTailoringRequest,
    CvTemplateThumbnail,
    CvTemplateThumbnailsResponse,
    CvVariantCreate,
    CvVariantResponse,
    CvVariantUpdate,
)
from app.services.cv_documents import (
    CvDocumentConflictError,
    CvDocumentNotFoundError,
    DuplicateVariantNameError,
    InvalidEvidenceReferenceError,
    InvalidTailoringProposalError,
    accept_import,
    apply_tailoring,
    create_document,
    create_variant,
    delete_document,
    delete_documents,
    delete_variant,
    export_documents,
    get_document,
    get_variant,
    list_documents,
    restore_variant,
    serialize_document,
    serialize_document_for_list,
    serialize_variant,
    update_document,
    update_variant,
)
from app.services.cv_fit import render_pdf_fitted, with_fit_option
from app.services.cv_fonts import FONT_FAMILIES, FONTS_DIR, TYPEFACES
from app.services.cv_html import available_template_ids
from app.services.cv_parser_process import CvParserProcessRejected, parse_cv_import_isolated
from app.services.cv_preview import MAX_PREVIEW_WIDTH, MIN_PREVIEW_WIDTH, render_preview
from app.services.cv_quality import analyze_cv_quality
from app.services.cv_rendering import (
    build_render_model,
    render_docx,
    render_txt,
    style_catalog,
    validate_artifact,
)
from app.services.cv_tailoring import (
    generate_cv_tailoring,
    proposal_token,
    verify_proposal_token,
)
from app.services.cv_thumbnails import render_thumbnails
from app.services.cv_upload import CvUploadRejected, read_validated_cv_upload
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()
logger = logging.getLogger(__name__)
CV_TAILORING_MODEL_RUN_LIMIT = 10

def _document_style(document: CvDocument) -> CvStyle:
    """The saved style, or the defaults the preview shows for an unstyled CV."""
    return CvStyle(**(document.style or {}))


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
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    replay = (
        db.query(CvDocument.id)
        .filter(
            CvDocument.user_id == current_user.id,
            CvDocument.source_import_id == str(body.import_id),
        )
        .first()
        is not None
    )
    document = accept_import(db, current_user.id, body)
    if replay:
        response.status_code = status.HTTP_200_OK
    return serialize_document(document)


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
    # One unreadable document must not take the whole list (and CV Studio) down.
    return CvDocumentListResponse(
        items=[serialize_document_for_list(d) for d in list_documents(db, current_user.id)]
    )


@router.post("", response_model=CvDocumentResponse, status_code=status.HTTP_201_CREATED)
def create(
    body: CvDocumentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return serialize_document(create_document(db, current_user.id, body))
    except InvalidEvidenceReferenceError as error:
        _invalid_evidence(error)


@router.get("/style-catalog", response_model=CvStyleCatalog)
def get_style_catalog(current_user: User = Depends(get_current_user)):
    return style_catalog()


# Strict allowlist of the bundled OFL TTFs — never an arbitrary filesystem path.
_ALLOWED_FONT_FILES: dict[str, Path] = {
    filename: FONTS_DIR / family.dir_name / filename
    for family in FONT_FAMILIES.values()
    for filename in (family.regular_file, family.bold_file)
} | {
    face.path.name: face.path for typeface in TYPEFACES.values() for face in typeface.faces
}


@router.get("/fonts/{filename}")
def cv_font_file(filename: str):
    """Serve a bundled CV template font so the live preview can use the exact
    rendered face instead of a different file pulled from Google Fonts.
    Static, non-sensitive, and safe to cache publicly for a long time.
    """
    path = _ALLOWED_FONT_FILES.get(filename)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="Unknown font file")
    return FileResponse(
        path,
        media_type="font/ttf",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{document_id}", response_model=CvDocumentResponse)
def get_one(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return serialize_document(get_document(db, document_id, current_user.id))
    except CvDocumentNotFoundError as error:
        _not_found(error)


def _safe_filename(name: str, template: str, extension: str) -> str:
    base = "".join(
        character if character.isascii() and (character.isalnum() or character in "-_") else "-"
        for character in name
    )
    base = "-".join(filter(None, base.split("-")))[:80] or "cv"
    return f"{base}-{template}.{extension}"


def _renderable(
    db: Session, document_id: str, user_id: str, variant_id: str | None
) -> tuple[CvDocument, CvStyle, SimpleNamespace]:
    """The document, its saved style and what to render: the working CV, or one of its
    saved versions (a tailored version is sent as it is, without restoring it first)."""
    try:
        document = get_document(db, document_id, user_id)
        variant = None if variant_id is None else get_variant(document, variant_id)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    source = SimpleNamespace(
        name=document.name,
        header=document.header,
        sections=document.sections if variant is None else variant.sections,
        variant_name=None if variant is None else variant.name,
    )
    return document, _document_style(document), source


def _export(
    request: Request, document_id: str, format: str, variant_id: str | None, user: User, db: Session
) -> Response:
    """Export the saved CV in its saved style (the same bytes "View exact PDF" shows)."""
    document, style, source = _renderable(db, document_id, user.id, variant_id)
    model = build_render_model(source, style.template_id, style)
    fit_headers: dict[str, str] = {}
    if format == "pdf":
        # Fit to one page (T9) is part of the PDF only; the same search the preview ran.
        artifact, fit = render_pdf_fitted(with_fit_option(model, style.fit_one_page))
        if fit is not None:
            fit_headers = {
                "X-CV-Fit": "fits" if fit.fits else f"runs-to-{fit.pages}-pages",
                "X-CV-Fit-Scale": f"{fit.scale:g}",
                "X-CV-Pages": str(fit.pages),
            }
    else:
        artifact = {"docx": render_docx, "txt": render_txt}[format](model)
    media_type = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt": "text/plain; charset=utf-8",
    }[format]
    # A version's name is in the file name, so versions made for different jobs stay apart.
    label = document.name if source.variant_name is None else f"{document.name} {source.variant_name}"
    filename = _safe_filename(label, model.template_id, format)
    return Response(
        content=artifact,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
            **fit_headers,
        },
    )


# One route per format so a PDF preview and a DOCX download never share a rate limit.
@router.get("/{document_id}/artifacts/pdf")
@limiter.limit("10/minute")
def export_pdf(
    request: Request,
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _export(request, document_id, "pdf", None, current_user, db)


@router.get("/{document_id}/artifacts/docx")
@limiter.limit("10/minute")
def export_docx(
    request: Request,
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _export(request, document_id, "docx", None, current_user, db)


@router.get("/{document_id}/variants/{variant_id}/artifacts/pdf")
@limiter.limit("10/minute")
def export_variant_pdf(
    request: Request,
    document_id: str,
    variant_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _export(request, document_id, "pdf", variant_id, current_user, db)


@router.get("/{document_id}/variants/{variant_id}/artifacts/docx")
@limiter.limit("10/minute")
def export_variant_docx(
    request: Request,
    document_id: str,
    variant_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _export(request, document_id, "docx", variant_id, current_user, db)


@router.get("/{document_id}/artifacts/txt")
@limiter.limit("10/minute")
def export_txt(
    request: Request,
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _export(request, document_id, "txt", None, current_user, db)


@router.get("/{document_id}/variants/{variant_id}/artifacts/txt")
@limiter.limit("10/minute")
def export_variant_txt(
    request: Request,
    document_id: str,
    variant_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _export(request, document_id, "txt", variant_id, current_user, db)


@router.post("/{document_id}/preview", response_model=CvPreviewResponse)
@limiter.limit("60/minute")
async def preview(
    request: Request,
    response: Response,
    document_id: str,
    body: CvPreviewRequest,
    width: int | None = Query(default=None, ge=MIN_PREVIEW_WIDTH, le=MAX_PREVIEW_WIDTH),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Page images and section rectangles of the unsaved draft. Stores nothing.

    ``width``: the pixel width the client shows a page at (CSS width times pixel ratio), so a phone
    gets small pages; without it, pages are 110 dpi."""
    document, saved_style, _ = _renderable(db, document_id, current_user.id, None)
    draft = _draft_source(document, body)
    style = body.style if body.style is not None else saved_style
    model = with_fit_option(build_render_model(draft, style.template_id, style), style.fit_one_page)
    # Chromium, PyMuPDF and WebP encoding block; keep them off the event loop.
    result = await run_in_threadpool(lambda: render_preview(model, width=width))
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    warnings = []
    if result.unsupported_characters:
        shown = " ".join(result.unsupported_characters)
        warnings.append(
            CvPreviewWarning(
                code="unsupported_characters",
                message=f"These characters cannot be drawn in the chosen typeface: {shown}",
                characters=result.unsupported_characters,
            )
        )
    return CvPreviewResponse(
        pages=[CvPreviewPage(url=p.data_url, width=p.width, height=p.height) for p in result.pages],
        page_count=result.page_count,
        sections=[CvPreviewSection(**vars(s)) for s in result.sections],
        warnings=warnings,
        truncated=result.truncated,
        fit=None if result.fit is None else CvFitResult(**result.fit.as_dict()),
        length=CvLength(
            pages=result.page_count,
            last_page_fill=result.last_page_fill,
            advice=None if result.advice is None else CvLengthAdvice(**vars(result.advice)),
        ),
    )


def _draft_source(document: CvDocument, body: CvPreviewRequest | None) -> SimpleNamespace:
    """The unsaved draft as plain data (fields left out come from the saved CV), so nothing
    a render reads can be written back to the ORM row."""
    body = body or CvPreviewRequest()
    return SimpleNamespace(
        name=body.name if body.name is not None else document.name,
        header=body.header.model_dump() if body.header is not None else document.header,
        sections=(
            [section.model_dump() for section in body.sections]
            if body.sections is not None
            else document.sections
        ),
    )


@router.post("/{document_id}/template-thumbnails", response_model=CvTemplateThumbnailsResponse)
@limiter.limit("20/minute")
async def template_thumbnails(
    request: Request,
    response: Response,
    document_id: str,
    body: CvPreviewRequest | None = None,
    templates: str | None = Query(default=None, max_length=400),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Page 1 of the unsaved draft in every available template (or only ``templates``, a comma list,
    so a client can ask for the first group before the rest), for the Design panel's
    gallery. The draft's own colour, typeface, spacing and page size; the sample CV while it
    has no entries. Stores nothing."""
    wanted = None
    if templates is not None:
        wanted = [template.strip() for template in templates.split(",") if template.strip()]
        unknown = [template for template in wanted if template not in available_template_ids()]
        if not wanted or unknown:
            raise HTTPException(status_code=422, detail="Unknown template in templates.")
    document, saved_style, _ = _renderable(db, document_id, current_user.id, None)
    style = body.style if body is not None and body.style is not None else saved_style
    # Prints one template at a time; Chromium, PyMuPDF and WebP block, so off the event loop.
    result = await run_in_threadpool(
        lambda: render_thumbnails(_draft_source(document, body), style, template_ids=wanted)
    )
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return CvTemplateThumbnailsResponse(
        thumbnails=[
            CvTemplateThumbnail(
                template_id=t.template_id,
                url=t.data_url,
                width=t.width,
                height=t.height,
                pages=t.pages,
                error=t.error,
            )
            for t in result.thumbnails
        ],
        sample=result.sample,
    )


@router.post("/{document_id}/quality", response_model=CvQualityResponse)
@limiter.limit("20/minute")
async def quality(
    request: Request,
    document_id: str,
    variant_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # A deterministic document check, not one of the six tools: it bypasses
    # run_tool_pipeline() so autosave-driven checks never write ToolRuns (#362).
    _, style, source = _renderable(db, document_id, current_user.id, variant_id)
    model = with_fit_option(build_render_model(source, style.template_id, style), style.fit_one_page)
    # Chromium and fitz work blocks; keep it off the event loop.
    evidence = await run_in_threadpool(lambda: validate_artifact(model, render_pdf_fitted(model)[0]))
    result = analyze_cv_quality(source.sections, style, evidence)
    return CvQualityResponse(**result)


@router.patch(
    "/{document_id}",
    response_model=CvDocumentResponse,
    responses={409: {"model": CvConflictResponse}},
)
def update(
    document_id: str,
    body: CvDocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        document = get_document(db, document_id, current_user.id)
        sections = None if body.sections is None else [item.model_dump() for item in body.sections]
        return serialize_document(
            update_document(
                db,
                document,
                name=body.name,
                sections=sections,
                style=body.style,
                header=body.header,
                expected_updated_at=body.expected_updated_at,
            )
        )
    except CvDocumentNotFoundError as error:
        _not_found(error)
    except InvalidEvidenceReferenceError as error:
        _invalid_evidence(error)
    except CvDocumentConflictError as error:
        # Another window saved first: hand back its version so nothing is lost silently.
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "This CV was changed in another tab or window. Review the latest version.",
                "current": jsonable_encoder(serialize_document(error.current)),
            },
        )


@router.post("/{document_id}/tailoring", response_model=CvTailoringProposal)
@limiter.limit("20/minute")
async def tailor(
    request: Request,
    document_id: str,
    body: CvTailoringRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        document = get_document(db, document_id, current_user.id)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    quota_document = (
        db.query(CvDocument)
        .filter(CvDocument.id == document.id, CvDocument.user_id == current_user.id)
        .with_for_update()
        .one()
    )
    if quota_document.tailoring_model_runs >= CV_TAILORING_MODEL_RUN_LIMIT:
        raise HTTPException(
            status_code=429, detail="This document has reached its tailoring limit."
        )
    quota_document.tailoring_model_runs += 1
    run_number = quota_document.tailoring_model_runs
    # Counting a run is not an edit: keep the version stamp an open editor saves against.
    flag_modified(quota_document, "updated_at")
    db.commit()
    text = "\n".join(str(e["body"]) for s in document.sections for e in s["entries"])
    result = await run_tool_pipeline(
        tool_name="cv-tailoring",
        service_fn=generate_cv_tailoring,
        service_kwargs={
            "resume_text": text,
            "sections": document.sections,
            "job_description": body.job_description,
            "job_title": body.job_title,
        },
        label_fn=lambda _: f"CV tailoring · {document.id}",
        resume_text=text,
        job_description=body.job_description,
        current_user=current_user,
        db=db,
        # The proposal token carries everything apply needs; a ToolRun would
        # only open a new Workspace (campaign) per tailoring run (#362).
        persist_run=False,
        cache_extra_keys={
            "document_id": document.id,
            "updated_at": document.updated_at.isoformat(),
            "target": body.job_title,
            # Each counted run is its own model call: "Suggest again" with the same
            # job must not replay a cached proposal while spending a run.
            "run": str(run_number),
        },
    )
    result["remaining_regenerations"] = CV_TAILORING_MODEL_RUN_LIMIT - run_number
    result["request_id"] = uuid4()
    result["proposal_token"] = proposal_token(
        str(result["request_id"]), document.id, current_user.id, body.job_title, result["changes"]
    )
    return CvTailoringProposal(**result)


@router.post(
    "/{document_id}/tailoring/apply",
    response_model=CvVariantResponse,
    status_code=status.HTTP_201_CREATED,
)
def apply_tailoring_review(
    document_id: str,
    body: CvTailoringApply,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        if not verify_proposal_token(
            body.proposal_token,
            str(body.request_id),
            document_id,
            current_user.id,
            body.job_title,
            [change.model_dump(exclude_defaults=True) for change in body.changes],
        ):
            raise InvalidTailoringProposalError
        document = get_document(db, document_id, current_user.id)
        replay = any(v.tailoring_request_id == str(body.request_id) for v in document.variants)
        variant = apply_tailoring(db, document, body)
        if replay:
            response.status_code = status.HTTP_200_OK
        return serialize_variant(variant)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    except (InvalidEvidenceReferenceError, InvalidTailoringProposalError) as error:
        raise HTTPException(
            status_code=422,
            detail="Unsupported or stale tailoring changes cannot be applied. Confirm evidence explicitly, then regenerate.",
        ) from error
    except DuplicateVariantNameError as error:
        raise HTTPException(status_code=409, detail="Variant name already exists") from error


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


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_documents(db, current_user.id)
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
        return serialize_variant(
            create_variant(
                db,
                get_document(db, document_id, current_user.id),
                body.name,
                body.target_role,
            )
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
        return serialize_document(
            restore_variant(db, get_document(db, document_id, current_user.id), variant_id)
        )
    except CvDocumentNotFoundError as error:
        _not_found(error)


@router.patch("/{document_id}/variants/{variant_id}", response_model=CvVariantResponse)
def rename_variant(
    document_id: str,
    variant_id: str,
    body: CvVariantUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return serialize_variant(
            update_variant(
                db,
                get_document(db, document_id, current_user.id),
                variant_id,
                name=body.name,
                target_role=body.target_role,
            )
        )
    except CvDocumentNotFoundError as error:
        _not_found(error)
    except DuplicateVariantNameError as error:
        raise HTTPException(status_code=409, detail="Variant name already exists") from error


@router.delete("/{document_id}/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_variant(
    document_id: str,
    variant_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        delete_variant(db, get_document(db, document_id, current_user.id), variant_id)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
