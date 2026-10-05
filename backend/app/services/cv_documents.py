import logging
from copy import deepcopy
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.user import User
from app.schemas.cv_documents import (
    CvDocumentCreate,
    CvDocumentResponse,
    CvDocumentsExport,
    CvHeader,
    CvImportAccept,
    CvSection,
    CvStyle,
    CvTailoringApply,
    CvVariantResponse,
)
from app.schemas.evidence_profile import EvidenceItemCreate
from app.services.applications import clear_selected_variants
from app.services.cv_tailoring import read_change_field, write_change_field
from app.services.evidence_profile import stage_evidence_proposal

logger = logging.getLogger(__name__)


class CvDocumentNotFoundError(Exception):
    pass


class InvalidEvidenceReferenceError(Exception):
    pass


class DuplicateVariantNameError(Exception):
    pass


class InvalidTailoringProposalError(Exception):
    pass


class CvDocumentConflictError(Exception):
    """The document was saved by someone else after the caller loaded it."""

    def __init__(self, current: CvDocument):
        super().__init__("CV document changed since it was loaded")
        self.current = current


def _query(db: Session, user_id: str):
    return (
        db.query(CvDocument)
        .options(selectinload(CvDocument.variants))
        .filter(CvDocument.user_id == user_id)
    )


_ENTRY_TEXT_LIMITS = {
    "id": 100, "body": 5_000, "heading": 200, "subheading": 200, "location": 200,
    "start_date": 40, "end_date": 40,
}


_ENTRY_OPTIONAL_TEXT = ("heading", "subheading", "location", "start_date", "end_date")


def _clamp_sections(sections: list[dict]) -> list[dict]:
    """Sections cut to the current field limits, for documents stored before a limit
    existed (or by a path that did not enforce it)."""
    clamped = []
    for section in sections[:50]:
        entries = []
        for entry in (section.get("entries") or [])[:200]:
            entry = dict(entry)
            for key, limit in _ENTRY_TEXT_LIMITS.items():
                if isinstance(entry.get(key), str):
                    entry[key] = entry[key][:limit].strip()
            for key in _ENTRY_OPTIONAL_TEXT:
                # Stored before blank values were refused: a blank optional value is unset.
                if key in entry and not (isinstance(entry[key], str) and entry[key]):
                    entry[key] = None
            if not entry.get("body"):
                # Stored before blank text was refused: show something instead of failing.
                entry["body"] = entry.get("heading") or "Untitled"
            bullets = [
                b.strip()
                for b in (entry.get("bullets") or [])
                if isinstance(b, str) and b.strip()
            ][:30]
            if sum(len(b) + 1 for b in bullets) > _ENTRY_TEXT_LIMITS["body"]:
                bullets = []  # the body text is kept; bullets that cannot fit are dropped
            entry["bullets"] = bullets
            entries.append(entry)
        clamped.append(
            {
                **section,
                "title": str(section.get("title", ""))[:120].strip() or "Section",
                "entries": entries,
            }
        )
    return clamped


def _variant_payload(variant: CvVariant) -> dict:
    return {
        "id": variant.id,
        "name": variant.name,
        "target_role": variant.target_role,
        "sections": _clamp_sections(variant.sections),
        "created_at": variant.created_at,
    }


def serialize_document(document: CvDocument) -> CvDocumentResponse:
    """The API view of a document. Stored content that no longer fits the limits is
    served clamped instead of failing, so one bad document never breaks the list,
    the editor, a mutation of it or the account export. Every endpoint that returns
    a document goes through here."""
    try:
        return CvDocumentResponse.model_validate(document)
    except ValidationError as error:
        # Ids and a count only: the error text would quote the user's CV content.
        logger.warning(
            "CV document %s exceeds the current field limits (%d errors); serving it clamped",
            document.id,
            error.error_count(),
        )
    return CvDocumentResponse.model_validate(
        {
            "id": document.id,
            "name": document.name[:120],
            "sections": _clamp_sections(document.sections),
            "style": document.style,
            "header": document.header,
            "created_at": document.created_at,
            "updated_at": document.updated_at,
            "tailoring_model_runs": document.tailoring_model_runs,
            "variants": [_variant_payload(variant) for variant in document.variants],
        }
    )


def serialize_variant(variant: CvVariant) -> CvVariantResponse:
    """A saved version, clamped the same way when its stored content is oversize."""
    try:
        return CvVariantResponse.model_validate(variant)
    except ValidationError:
        logger.warning("CV version %s exceeds the current field limits; serving it clamped", variant.id)
    return CvVariantResponse.model_validate(_variant_payload(variant))


def serialize_document_for_list(document: CvDocument) -> CvDocumentResponse:
    """Like ``serialize_document``, but a document that still cannot be read becomes
    an empty stub (id and name) so it stays visible and deletable in CV Studio."""
    try:
        return serialize_document(document)
    except ValueError as error:
        logger.error(
            "CV document %s could not be read (%s); listing it as an empty stub",
            document.id,
            type(error).__name__,
        )
    return CvDocumentResponse.model_validate(
        {
            "id": document.id,
            "name": (document.name or "CV")[:120],
            "sections": [],
            "style": None,
            "header": None,
            "created_at": document.created_at,
            "updated_at": document.updated_at,
            "tailoring_model_runs": document.tailoring_model_runs,
            "variants": [],
        }
    )


def list_documents(db: Session, user_id: str) -> list[CvDocument]:
    return _query(db, user_id).order_by(CvDocument.updated_at.desc()).all()


def get_document(db: Session, document_id: str, user_id: str) -> CvDocument:
    document = _query(db, user_id).filter(CvDocument.id == document_id).first()
    if document is None:
        raise CvDocumentNotFoundError
    return document


def _validate_evidence(
    db: Session, user_id: str, sections: list[dict], *, already_linked: set[str] | None = None
) -> None:
    """Every NEW evidence link must reference a confirmed, owned item.

    ``already_linked`` (ids the document already referenced before this save,
    e.g. unconfirmed claims ``accept_import`` staged, D-073's documented
    exception) is exempt — re-saving an entry the user hasn't touched must not
    retroactively fail just because its evidence is still awaiting
    confirmation. A genuinely new reference to unconfirmed evidence still
    fails.
    """
    ids = {
        entry["evidence_item_id"]
        for section in sections
        for entry in section["entries"]
        if entry["evidence_item_id"] is not None
    }
    new_ids = ids - (already_linked or set())
    if not new_ids:
        return
    confirmed = {
        item.id
        for item in db.query(EvidenceItem.id).filter(
            EvidenceItem.user_id == user_id,
            EvidenceItem.confirmation_state == "confirmed",
            EvidenceItem.id.in_(new_ids),
        )
    }
    if confirmed != new_ids:
        raise InvalidEvidenceReferenceError


# Section order and title for a CV started from Evidence: one section per kind.
_SEED_SECTIONS: tuple[tuple[str, str, str], ...] = (
    ("experience", "experience", "Experience"),
    ("education", "education", "Education"),
    ("project", "projects", "Projects"),
    ("achievement", "achievements", "Achievements"),
    ("skill", "skills", "Skills"),
    ("certification", "certifications", "Certifications"),
    ("interview-evidence", "interview-evidence", "Interview evidence"),
    ("preference", "custom", "Preferences"),
)
_BODY_KEYS = ("statement", "summary", "description", "text", "details")
_NAME_KEYS = ("name", "title", "skill", "label")
_ROLE_KEYS = {
    "experience": (("role", "title", "position", "job_title"), ("company", "employer", "organization", "organisation")),
    "education": (("degree", "program", "programme", "qualification"), ("school", "institution", "university")),
}
_START_KEYS = ("start_date", "start", "from", "begin", "started")
_END_KEYS = ("end_date", "end", "to", "until", "ended")


def _text(value, limit: int) -> str | None:
    """A readable one-line-or-paragraph string for a content value, never a repr."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        text = value.strip()
    elif isinstance(value, int | float):
        text = str(value)
    elif isinstance(value, list):
        text = "; ".join(filter(None, (_text(item, limit) for item in value)))
    else:
        return None
    return text[:limit] or None


def _first(content: dict, keys: tuple[str, ...], limit: int) -> str | None:
    for key in keys:
        text = _text(content.get(key), limit)
        if text:
            return text
    return None


def _bullets(value) -> list[str]:
    """Bullet points from a list, or from a text with one point per line."""
    lines = value if isinstance(value, list) else str(value or "").splitlines()
    bullets: list[str] = []
    used = 0
    for line in lines:
        text = _text(line, 1_000)
        if text and used + len(text) + 1 <= 5_000 and len(bullets) < 30:
            bullets.append(text)
            used += len(text) + 1
    return bullets


def _seed_entry(item: EvidenceItem, position: int) -> dict:
    """One CV entry from an Evidence fact: structured fields for roles and
    degrees, a readable body for everything else. Values are cut to the entry
    limits here so a long fact can never produce a CV that cannot be saved."""
    content = item.content if isinstance(item.content, dict) else {}
    entry: dict = {
        "id": f"entry-{item.id}",
        "evidence_item_id": item.id,
        "position": position,
    }
    roles = _ROLE_KEYS.get(item.kind)
    heading = subheading = None
    if roles:
        heading = _first(content, roles[0], 200)
        subheading = _first(content, roles[1], 200)
    if heading:
        entry["heading"] = heading
        if subheading:
            entry["subheading"] = subheading
        for field, keys in (("start_date", _START_KEYS), ("end_date", _END_KEYS)):
            date = _first(content, keys, 40)
            if date:
                entry[field] = date
    bullets = _bullets(content.get("highlights") or content.get("bullets"))
    body = _first(content, _BODY_KEYS, 5_000)
    if bullets and body and len(bullets) < 30 and len(body) + 1 + sum(len(b) + 1 for b in bullets) <= 5_000:
        # Bullets become the entry text, so a fact's own summary leads them
        # instead of being replaced.
        bullets.insert(0, body)
    if bullets:
        entry["bullets"] = bullets
    if body is None and not heading:
        body = _first(content, _NAME_KEYS, 5_000)
    if body is None and not heading:
        # Facts with other keys: their text values, labelled by nothing, in order.
        body = _text([v for v in content.values() if isinstance(v, str)], 5_000)
    # An experience with no description has nothing to say beyond its heading;
    # a body equal to the heading renders no second paragraph.
    entry["body"] = body or heading or "Untitled fact"
    return entry


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
    by_id = {item.id: item for item in items}
    ordered = [by_id[item_id] for item_id in dict.fromkeys(ids)]
    sections = []
    for kind, section_kind, title in _SEED_SECTIONS:
        group = [item for item in ordered if item.kind == kind]
        if not group:
            continue
        sections.append(
            {
                "id": f"seed-{kind}",
                "kind": section_kind,
                "title": title,
                "visible": True,
                "position": len(sections),
                "entries": [_seed_entry(item, position) for position, item in enumerate(group)],
            }
        )
    # The same validation a client-supplied section gets, before anything is stored.
    return [CvSection.model_validate(section).model_dump() for section in sections]


def _default_header(db: Session, user_id: str) -> dict:
    """A new CV's header starts with the account's name, so the paper never opens with
    the internal document name."""
    user = db.get(User, user_id)
    name = (user.full_name or "").strip()[:120] if user else ""
    return CvHeader(name=name or None).model_dump()


def create_document(db: Session, user_id: str, body: CvDocumentCreate) -> CvDocument:
    sections = [section.model_dump() for section in body.sections]
    if body.seed_evidence_item_ids:
        if sections:
            raise InvalidEvidenceReferenceError
        sections = _seed_sections(db, user_id, body.seed_evidence_item_ids)
    _validate_evidence(db, user_id, sections)
    header = body.header.model_dump() if body.header is not None else _default_header(db, user_id)
    document = CvDocument(
        user_id=user_id, name=body.name, sections=deepcopy(sections), header=header
    )
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
                stored_entry = {
                    "id": entry.id,
                    "evidence_item_id": None if item is None else item.id,
                    "body": entry.body,
                    "position": entry.position,
                }
                for field in ("heading", "subheading", "location", "start_date", "end_date"):
                    value = getattr(entry, field)
                    if value is not None:
                        stored_entry[field] = value
                if entry.bullets:
                    stored_entry["bullets"] = entry.bullets
                entries.append(stored_entry)
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
        header = body.header.model_dump()
        if header["name"] is None:
            header["name"] = _default_header(db, user_id)["name"]
        document = CvDocument(
            user_id=user_id,
            name=body.name,
            source_import_id=import_id,
            sections=deepcopy(sections),
            header=header,
        )
        document.variants.append(CvVariant(name="Base", sections=deepcopy(sections)))
        db.add(document)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _query(db, user_id).filter(CvDocument.source_import_id == import_id).first()
        if existing is not None:
            return existing
        raise
    except Exception:
        db.rollback()
        raise
    return get_document(db, document.id, user_id)


def update_document(
    db: Session,
    document: CvDocument,
    *,
    name=None,
    sections=None,
    style: CvStyle | None = None,
    header: CvHeader | None = None,
    expected_updated_at: datetime | None = None,
):
    if expected_updated_at is not None:
        # Lock the row, then compare: two saves cannot both pass the check.
        stored = (
            db.query(CvDocument)
            .filter(CvDocument.id == document.id)
            .with_for_update()
            .populate_existing()
            .one()
        )
        if _as_utc(stored.updated_at) != _as_utc(expected_updated_at):
            db.rollback()
            raise CvDocumentConflictError(get_document(db, document.id, document.user_id))
    if name is not None:
        document.name = name
    if header is not None:
        document.header = header.model_dump()
    if sections is not None:
        already_linked = {
            entry["evidence_item_id"]
            for section in document.sections
            for entry in section["entries"]
            if entry["evidence_item_id"] is not None
        }
        _validate_evidence(db, document.user_id, sections, already_linked=already_linked)
        document.sections = deepcopy(sections)
    if style is not None:
        document.style = style.model_dump()
    db.commit()
    return get_document(db, document.id, document.user_id)


def _as_utc(value: datetime) -> datetime:
    """Compare timestamps from a database that may drop the timezone."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


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


def apply_tailoring(db: Session, document: CvDocument, body: CvTailoringApply) -> CvVariant:
    request_id = str(body.request_id)
    existing = next((v for v in document.variants if v.tailoring_request_id == request_id), None)
    if existing is not None:
        return existing
    if any(v.name == body.variant_name for v in document.variants):
        raise DuplicateVariantNameError
    entries = {
        (section["id"], entry["id"]): entry
        for section in document.sections
        for entry in section["entries"]
    }
    if len({change.id for change in body.changes}) != len(body.changes):
        raise InvalidTailoringProposalError
    decisions = {decision.change_id: decision for decision in body.decisions}
    sections = deepcopy(document.sections)
    mutable = {
        (section["id"], entry["id"]): entry for section in sections for entry in section["entries"]
    }
    accepted_evidence: set[str] = set()
    for change in body.changes:
        decision = decisions.get(change.id)
        if decision is None or decision.action == "reject":
            continue
        key = (change.section_id, change.entry_id)
        current = entries.get(key)
        if current is None or read_change_field(current, change.field) != change.before:
            raise InvalidTailoringProposalError
        if change.support == "unsupported":
            raise InvalidTailoringProposalError
        accepted_evidence.update(change.evidence_item_ids)
        write_change_field(mutable[key], change.field, change.after)
    if accepted_evidence:
        _validate_evidence(
            db,
            document.user_id,
            [{"entries": [{"evidence_item_id": i} for i in accepted_evidence]}],
        )
    variant = CvVariant(
        document_id=document.id,
        name=body.variant_name,
        target_role=body.job_title,
        tailoring_request_id=request_id,
        sections=sections,
    )
    db.add(variant)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        refreshed = get_document(db, document.id, document.user_id)
        duplicate = next(
            (v for v in refreshed.variants if v.tailoring_request_id == request_id), None
        )
        if duplicate is not None:
            return duplicate
        raise
    db.refresh(variant)
    return variant


def _free_variant_name(document: CvDocument, base: str) -> str:
    """``base`` (fitted to 120 characters), numbered if a version already uses it."""
    taken = {variant.name for variant in document.variants}
    for number in range(1, len(taken) + 2):
        suffix = "" if number == 1 else f" ({number})"
        name = base[: 120 - len(suffix)] + suffix
        if name not in taken:
            return name
    raise AssertionError("unreachable: more candidates than taken names")


def restore_variant(db: Session, document: CvDocument, variant_id: str) -> CvDocument:
    variant = next((item for item in document.variants if item.id == variant_id), None)
    if variant is None:
        raise CvDocumentNotFoundError
    # Restoring overwrites the working CV, so keep it as a version first unless
    # an identical version already exists. Server-side so no client can skip it.
    if not any(item.sections == document.sections for item in document.variants):
        document.variants.append(
            CvVariant(
                name=_free_variant_name(document, f"Before restoring {variant.name}"),
                sections=deepcopy(document.sections),
            )
        )
    document.sections = deepcopy(variant.sections)
    db.commit()
    return get_document(db, document.id, document.user_id)


def get_variant(document: CvDocument, variant_id: str) -> CvVariant:
    variant = next((item for item in document.variants if item.id == variant_id), None)
    if variant is None:
        raise CvDocumentNotFoundError
    return variant


def update_variant(
    db: Session, document: CvDocument, variant_id: str, *, name=None, target_role=None
) -> CvVariant:
    variant = get_variant(document, variant_id)
    if name is not None and name != variant.name:
        if any(item.name == name for item in document.variants):
            raise DuplicateVariantNameError
        variant.name = name
    if target_role is not None:
        variant.target_role = target_role
    db.commit()
    db.refresh(variant)
    return variant


def delete_variant(db: Session, document: CvDocument, variant_id: str) -> None:
    variant = get_variant(document, variant_id)
    # Applications that picked this version fall back to "no CV selected".
    clear_selected_variants(db, document, [variant.id])
    document.variants.remove(variant)
    db.commit()


def delete_document(db: Session, document: CvDocument) -> None:
    clear_selected_variants(db, document)
    db.delete(document)
    db.commit()


def delete_documents(db: Session, user_id: str) -> int:
    documents = _query(db, user_id).all()
    count = len(documents)
    for document in documents:
        clear_selected_variants(db, document)
        db.delete(document)
    db.commit()
    return count


def export_documents(db: Session, user_id: str) -> CvDocumentsExport:
    documents = list_documents(db, user_id)
    result = CvDocumentsExport(
        exported_at=datetime.now(UTC),
        document_count=len(documents),
        documents=[serialize_document(document) for document in documents],
    )
    return result
