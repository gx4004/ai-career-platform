from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.cv_document import CvDocument
from app.models.user import User
from app.schemas.cv_documents import (
    CvArtifactEvidence,
    CvArtifactFormat,
    CvDocumentCreate,
    CvDocumentListResponse,
    CvDocumentResponse,
    CvDocumentsExport,
    CvDocumentUpdate,
    CvImportAccept,
    CvImportProposal,
    CvQualityRequest,
    CvQualityResponse,
    CvRenderModel,
    CvTailoringApply,
    CvTailoringEditProposal,
    CvTailoringProposal,
    CvTailoringRequest,
    CvTemplateId,
    CvVariantCreate,
    CvVariantResponse,
)
from app.schemas.evidence_profile import EvidenceItemCreate, EvidenceItemResponse
from app.services.cv_documents import (
    CvDocumentNotFoundError,
    DuplicateVariantNameError,
    InvalidEvidenceReferenceError,
    InvalidTailoringProposalError,
    accept_import,
    apply_tailoring,
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
from app.services.cv_quality import analyze_cv_quality, analyze_cv_quality_heuristic
from app.services.cv_rendering import build_render_model, render_docx, render_pdf, validate_artifact
from app.services.cv_tailoring import generate_cv_tailoring, proposal_token, verify_proposal_token
from app.services.cv_upload import CvUploadRejected, read_validated_cv_upload
from app.services.evidence_profile import create_evidence_item
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()
CV_QUALITY_MODEL_RUN_LIMIT = 10
CV_TAILORING_MODEL_RUN_LIMIT = 10

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


@router.get("/{document_id}/render", response_model=CvRenderModel)
def preview_render(
    document_id: str,
    template: CvTemplateId,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return build_render_model(get_document(db, document_id, current_user.id), template)
    except CvDocumentNotFoundError as error:
        _not_found(error)


def _safe_filename(name: str, template: str, extension: str) -> str:
    base = "".join(
        character if character.isascii() and (character.isalnum() or character in "-_") else "-"
        for character in name
    )
    base = "-".join(filter(None, base.split("-")))[:80] or "cv"
    return f"{base}-{template}.{extension}"


@router.get("/{document_id}/artifacts/{format}")
@limiter.limit("10/minute")
def export_artifact(
    request: Request,
    document_id: str,
    format: CvArtifactFormat,
    template: CvTemplateId,
    disposition: Literal["attachment", "inline"] = "attachment",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        document = get_document(db, document_id, current_user.id)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    model = build_render_model(document, template)
    artifact = render_pdf(model) if format == "pdf" else render_docx(model)
    media_type = (
        "application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return Response(
        content=artifact,
        media_type=media_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{_safe_filename(document.name, template, format)}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
            "X-CV-Canonical-Hash": model.canonical_hash,
        },
    )


@router.get("/{document_id}/artifacts/{format}/evidence", response_model=CvArtifactEvidence)
@limiter.limit("10/minute")
def artifact_evidence(
    request: Request,
    document_id: str,
    format: CvArtifactFormat,
    template: CvTemplateId,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        model = build_render_model(get_document(db, document_id, current_user.id), template)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    artifact = render_pdf(model) if format == "pdf" else render_docx(model)
    return validate_artifact(model, artifact, format)


@router.post("/{document_id}/quality", response_model=CvQualityResponse)
@limiter.limit("20/minute")
async def quality(
    request: Request,
    document_id: str,
    body: CvQualityRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        document = get_document(db, document_id, current_user.id)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    sections = document.sections
    text = "\n".join(
        str(entry.get("body", ""))
        for section in sections
        if section.get("visible", True)
        for entry in section.get("entries", [])
    )
    service = analyze_cv_quality_heuristic
    if body.use_model:
        quota_document = (
            db.query(CvDocument)
            .filter(CvDocument.id == document.id, CvDocument.user_id == current_user.id)
            .with_for_update()
            .one()
        )
        if quota_document.quality_model_runs >= CV_QUALITY_MODEL_RUN_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="This document has reached its model scoring limit. Deterministic checks remain available.",
            )
        # Consume before the provider pipeline so concurrent and failed attempts
        # remain bounded. PostgreSQL serializes this owner/document row lock.
        quota_document.quality_model_runs += 1
        db.commit()
        service = analyze_cv_quality
    result = await run_tool_pipeline(
        tool_name="cv-quality",
        service_fn=service,
        service_kwargs={"resume_text": text, "sections": sections, "selected_checks": body.checks},
        label_fn=lambda _: f"CV quality {'model' if body.use_model else 'check'} · {document.id}",
        resume_text=text,
        current_user=current_user,
        db=db,
        cache_extra_keys={
            "document_id": document.id,
            "updated_at": document.updated_at.isoformat(),
            "mode": "model" if body.use_model else "heuristic",
            "checks": ",".join(body.checks or []),
        },
    )
    if body.artifact_template is not None and body.artifact_format is not None:
        model = build_render_model(document, body.artifact_template)
        artifact = render_pdf(model) if body.artifact_format == "pdf" else render_docx(model)
        evidence = validate_artifact(model, artifact, body.artifact_format)
        statuses = {
            "text_layer": evidence.searchable_text,
            "links": evidence.links,
            "page_breaks": evidence.page_breaks,
            "re_importability": evidence.re_importability,
        }
        for check in result["ats_checks"]:
            if check["key"] in statuses:
                check["status"] = statuses[check["key"]]
                check["explanation"] = (
                    f"Validated against the generated {body.artifact_format.upper()} artifact."
                )
                check["remediation"] = "Regenerate after editing if this artifact validation fails."
    return CvQualityResponse(**result)


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
        cache_extra_keys={
            "document_id": document.id,
            "updated_at": document.updated_at.isoformat(),
            "target": body.job_title,
        },
    )
    result["remaining_regenerations"] = (
        CV_TAILORING_MODEL_RUN_LIMIT - quota_document.tailoring_model_runs
    )
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
            [change.model_dump() for change in body.changes],
        ):
            raise InvalidTailoringProposalError
        return apply_tailoring(db, get_document(db, document_id, current_user.id), body)
    except CvDocumentNotFoundError as error:
        _not_found(error)
    except (InvalidEvidenceReferenceError, InvalidTailoringProposalError) as error:
        raise HTTPException(
            status_code=422,
            detail="Unsupported or stale tailoring changes cannot be applied. Confirm evidence explicitly, then regenerate.",
        ) from error
    except DuplicateVariantNameError as error:
        raise HTTPException(status_code=409, detail="Variant name already exists") from error


@router.post(
    "/{document_id}/tailoring/edit-proposals",
    response_model=EvidenceItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def propose_tailoring_edit(
    document_id: str,
    body: CvTailoringEditProposal,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    changes = [change.model_dump() for change in body.changes]
    if not verify_proposal_token(
        body.proposal_token,
        str(body.request_id),
        document_id,
        current_user.id,
        body.job_title,
        changes,
    ):
        raise HTTPException(status_code=422, detail="Tailoring proposal is invalid or stale")
    document = get_document(db, document_id, current_user.id)
    change = next((item for item in body.changes if item.id == body.change_id), None)
    if (
        change is None
        or change.support == "unsupported"
        or body.edited_after in {change.before, change.after}
    ):
        raise HTTPException(
            status_code=422, detail="Only new edited wording requires evidence confirmation"
        )
    section = next((item for item in document.sections if item["id"] == change.section_id), None)
    if section is None or not any(
        entry["id"] == change.entry_id and entry["body"] == change.before
        for entry in section["entries"]
    ):
        raise HTTPException(status_code=422, detail="Tailoring proposal is invalid or stale")
    evidence_kind = {
        "experience": "experience",
        "achievements": "achievement",
        "skills": "skill",
        "education": "education",
        "projects": "project",
        "certifications": "certification",
        "interview-evidence": "interview-evidence",
        "summary": "achievement",
        "custom": "achievement",
    }[section["kind"]]
    return create_evidence_item(
        db,
        current_user.id,
        EvidenceItemCreate(
            kind=evidence_kind, content={"statement": body.edited_after}, provenance="user-entered"
        ),
    )


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
