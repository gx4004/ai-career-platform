from copy import deepcopy
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.schemas.cv_documents import CvDocumentCreate, CvDocumentsExport, CvImportAccept
from app.schemas.evidence_profile import EvidenceItemCreate
from app.services.evidence_profile import (
    record_evidence_proposal_created,
    stage_evidence_proposal,
)


class CvDocumentNotFoundError(Exception):
    pass


class InvalidEvidenceReferenceError(Exception):
    pass


class DuplicateVariantNameError(Exception):
    pass


def _query(db: Session, user_id: str):
    return (
        db.query(CvDocument)
        .options(selectinload(CvDocument.variants))
        .filter(CvDocument.user_id == user_id)
    )


def list_documents(db: Session, user_id: str) -> list[CvDocument]:
    return _query(db, user_id).order_by(CvDocument.updated_at.desc()).all()


def get_document(db: Session, document_id: str, user_id: str) -> CvDocument:
    document = _query(db, user_id).filter(CvDocument.id == document_id).first()
    if document is None:
        raise CvDocumentNotFoundError
    return document


def _validate_evidence(db: Session, user_id: str, sections: list[dict]) -> None:
    ids = {
        entry["evidence_item_id"]
        for section in sections
        for entry in section["entries"]
        if entry["evidence_item_id"] is not None
    }
    if not ids:
        return
    confirmed = {
        item.id
        for item in db.query(EvidenceItem.id).filter(
            EvidenceItem.user_id == user_id,
            EvidenceItem.confirmation_state == "confirmed",
            EvidenceItem.id.in_(ids),
        )
    }
    if confirmed != ids:
        raise InvalidEvidenceReferenceError


def _seed_sections(db: Session, user_id: str, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    items = (
        db.query(EvidenceItem)
        .filter(
            EvidenceItem.user_id == user_id,
            EvidenceItem.confirmation_state == "confirmed",
            EvidenceItem.id.in_(ids),
        )
        .all()
    )
    if {item.id for item in items} != set(ids):
        raise InvalidEvidenceReferenceError
    sections = []
    for position, item in enumerate(items):
        body = str(item.content.get("statement") or item.content.get("name") or item.content)
        sections.append(
            {
                "id": f"seed-{item.id}",
                "kind": _section_kind(item.kind),
                "title": item.kind.replace("-", " ").title(),
                "visible": True,
                "position": position,
                "entries": [
                    {
                        "id": f"entry-{item.id}",
                        "evidence_item_id": item.id,
                        "body": body,
                        "position": 0,
                    }
                ],
            }
        )
    return sections


def _section_kind(kind: str) -> str:
    return {
        "achievement": "achievements",
        "skill": "skills",
        "project": "projects",
        "certification": "certifications",
        "preference": "custom",
    }.get(kind, kind)


def create_document(db: Session, user_id: str, body: CvDocumentCreate) -> CvDocument:
    sections = [section.model_dump() for section in body.sections]
    if body.seed_evidence_item_ids:
        if sections:
            raise InvalidEvidenceReferenceError
        sections = _seed_sections(db, user_id, body.seed_evidence_item_ids)
    _validate_evidence(db, user_id, sections)
    document = CvDocument(user_id=user_id, name=body.name, sections=deepcopy(sections))
    document.variants.append(CvVariant(name="Base", sections=deepcopy(sections)))
    db.add(document)
    db.commit()
    return get_document(db, document.id, user_id)


def accept_import(db: Session, user_id: str, body: CvImportAccept) -> CvDocument:
    """Atomically persist a reviewed import and its unconfirmed R11 claims."""
    import_id = str(body.import_id)
    existing = _query(db, user_id).filter(CvDocument.source_import_id == import_id).first()
    if existing is not None:
        return existing
    sections = []
    staged_items = []
    try:
        for section in body.sections:
            entries = []
            for entry in section.entries:
                item = None
                if entry.claim is not None:
                    item = stage_evidence_proposal(
                        db,
                        user_id,
                        EvidenceItemCreate(
                            kind=entry.claim.kind,
                            content=entry.claim.content,
                            provenance="imported",
                        ),
                    )
                    staged_items.append(item)
                entries.append(
                    {
                        "id": entry.id,
                        "evidence_item_id": None if item is None else item.id,
                        "body": entry.body,
                        "position": entry.position,
                    }
                )
            sections.append(
                {
                    "id": section.id,
                    "kind": section.kind,
                    "title": section.title,
                    "visible": section.visible,
                    "position": section.position,
                    "entries": entries,
                }
            )
        document = CvDocument(
            user_id=user_id,
            name=body.name,
            source_import_id=import_id,
            sections=deepcopy(sections),
        )
        document.variants.append(CvVariant(name="Base", sections=deepcopy(sections)))
        db.add(document)
        db.commit()
        for item in staged_items:
            record_evidence_proposal_created(db, item)
    except IntegrityError:
        db.rollback()
        existing = _query(db, user_id).filter(
            CvDocument.source_import_id == import_id
        ).first()
        if existing is not None:
            return existing
        raise
    except Exception:
        db.rollback()
        raise
    return get_document(db, document.id, user_id)


def update_document(db: Session, document: CvDocument, *, name=None, sections=None):
    if name is not None:
        document.name = name
    if sections is not None:
        _validate_evidence(db, document.user_id, sections)
        document.sections = deepcopy(sections)
    db.commit()
    return get_document(db, document.id, document.user_id)


def create_variant(
    db: Session, document: CvDocument, name: str, target_role: str | None
) -> CvVariant:
    if any(variant.name == name for variant in document.variants):
        raise DuplicateVariantNameError
    variant = CvVariant(
        document_id=document.id,
        name=name,
        target_role=target_role,
        sections=deepcopy(document.sections),
    )
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return variant


def restore_variant(db: Session, document: CvDocument, variant_id: str) -> CvDocument:
    variant = next((item for item in document.variants if item.id == variant_id), None)
    if variant is None:
        raise CvDocumentNotFoundError
    document.sections = deepcopy(variant.sections)
    db.commit()
    return get_document(db, document.id, document.user_id)


def delete_document(db: Session, document: CvDocument) -> None:
    db.delete(document)
    db.commit()


def export_documents(db: Session, user_id: str) -> CvDocumentsExport:
    documents = list_documents(db, user_id)
    return CvDocumentsExport(
        exported_at=datetime.now(UTC), document_count=len(documents), documents=documents
    )
