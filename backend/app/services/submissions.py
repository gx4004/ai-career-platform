"""Dark, source-adapter-neutral R16 submission engine (#191).

There is intentionally no router, scheduler, credential store, or real adapter.
Every caller must supply the source-specific adapter and the authoritative safety
envelope checkpoint; #193 owns the production envelope implementation.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from typing import Protocol

from pydantic import AnyHttpUrl, EmailStr, TypeAdapter, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.application_packet import ApplicationPacket
from app.models.discovery_source import DiscoverySource
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.submission_authorization import SubmissionAuthorizationGrant
from app.models.submission_record import SubmissionDispatchClaim, SubmissionRecord
from app.models.submission_safety import SubmissionDispatchAttempt
from app.models.submission_source import SubmissionSourceGovernance
from app.models.submission_stop_event import SubmissionStopEvent
from app.schemas.application_packets import (
    PacketApprovalSnapshotContent,
    PacketSubmissionHandoff,
    PacketSubmissionStopNotice,
)
from app.schemas.submission_sources import SubmissionCompatibilityContract
from app.schemas.submissions import (
    SubmissionDispatchAttemptResponse,
    SubmissionDispatchClaimResponse,
    SubmissionRecordResponse,
    SubmissionRecordsExport,
    SubmissionStopEventResponse,
    SubmissionStoppedResponse,
    SubmissionStopReason,
)
from app.services.submission_authorizations import (
    require_active_submission_authorization,
)
from app.services.submission_sources import (
    SourceSubmissionAuthorization,
    require_submission_allowed,
)


class PacketSubmissionRefusal(StrEnum):
    SNAPSHOT_NOT_APPROVED = "snapshot_not_approved"
    SNAPSHOT_INTEGRITY_FAILED = "snapshot_integrity_failed"
    UNRESOLVED_QUESTIONS = "unresolved_questions"
    UNSUPPORTED_CLAIMS = "unsupported_claims"
    CONTRACT_MISMATCH = "contract_mismatch"
    ADAPTER_SOURCE_MISMATCH = "adapter_source_mismatch"


class PacketSubmissionRefused(RuntimeError):
    def __init__(self, reason: PacketSubmissionRefusal):
        self.reason = reason
        super().__init__(reason.value)


@dataclass(frozen=True)
class SubmissionAdapterRequest:
    source_key: str
    contract_version: str
    idempotency_key: str
    snapshot_content_sha256: str
    fields: dict[str, object]


@dataclass(frozen=True)
class SubmissionAdapterReceipt:
    source_confirmation_id: str
    source_code: str


@dataclass(frozen=True)
class SubmissionAdapterStop:
    """A source observation made before any application was committed."""

    reason: SubmissionStopReason
    source_code: str | None = None


class SubmissionAdapter(Protocol):
    """A source adapter whose submit operation honors the supplied key.

    Implementations MUST send ``request.idempotency_key`` through the source's
    reviewed native idempotency mechanism and return the same logical result for
    that key after a timeout or process restart. Adapters without that source
    capability cannot implement this protocol.
    """

    source_key: str

    def submit_idempotently(
        self, request: SubmissionAdapterRequest
    ) -> SubmissionAdapterReceipt | SubmissionAdapterStop: ...


class SubmissionEnvelopeGate(Protocol):
    def require_healthy(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: str,
        snapshot_id: str,
        serialize: bool = False,
        attempt_reserved: bool = False,
    ) -> None: ...

    def record_attempt(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: str,
        idempotency_key: str,
    ) -> str | None: ...


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _idempotency_key(snapshot_id: str, source_id: str) -> str:
    return f"submission:v1:{_sha256(_canonical([snapshot_id, source_id]))}"


def _contract_sha256(contract: SubmissionCompatibilityContract) -> str:
    return _sha256(_canonical(contract.model_dump(mode="json")))


STOP_HANDOFF_INSTRUCTIONS = (
    "Automation stopped without completing an application. Open the official "
    "destination and submit the approved packet yourself."
)

STOP_EXPLANATIONS: dict[SubmissionStopReason, str] = {
    "challenge": "The source requested a challenge such as a CAPTCHA, so automation stopped.",
    "authentication_required": "The source requested authentication, so automation stopped.",
    "uncertainty": "The source did not provide a certain completion result, so automation stopped.",
    "compatibility_mismatch": "The source no longer matched its reviewed submission contract, so automation stopped.",
    "source_validation_rejected": "The source rejected one or more submitted fields, so automation stopped.",
}


def _approved_snapshot(
    db: Session,
    *,
    user_id: str,
    snapshot_id: str,
    for_update: bool = False,
) -> tuple[PacketApprovalSnapshot, dict]:
    snapshot_query = db.query(PacketApprovalSnapshot).filter(
        PacketApprovalSnapshot.id == snapshot_id,
        PacketApprovalSnapshot.user_id == user_id,
    )
    snapshot = snapshot_query.one_or_none()
    if snapshot is None:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_NOT_APPROVED)
    packet_query = db.query(ApplicationPacket).filter(
        ApplicationPacket.id == snapshot.packet_id,
        ApplicationPacket.user_id == user_id,
    )
    if for_update:
        packet_query = packet_query.with_for_update()
    packet = packet_query.one_or_none()
    # Campaign deletion owns packet -> workspace -> snapshot order. Lock the
    # packet first, then refresh+lock the snapshot to preserve that order.
    if for_update:
        snapshot = snapshot_query.populate_existing().with_for_update().one_or_none()
    if (
        snapshot is None
        or packet is None
        or packet.decision != "accepted"
        or packet.gate_state != "passed"
    ):
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_NOT_APPROVED)
    if _sha256(snapshot.content_json) != snapshot.content_sha256:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED)
    try:
        raw = json.loads(snapshot.content_json)
        content = PacketApprovalSnapshotContent.model_validate(raw)
    except (json.JSONDecodeError, ValidationError, TypeError) as error:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED) from error
    if (
        content.packet_id != snapshot.packet_id
        or content.campaign_id != snapshot.campaign_id
        or content.listing_id != snapshot.listing_id
        or packet.campaign_id != snapshot.campaign_id
    ):
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED)
    if content.unresolved_questions:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.UNRESOLVED_QUESTIONS)
    # The immutable row is created only after the server-side R15 reviewer gate
    # passes. Re-check the frozen authoritative set so later mutable packet state
    # cannot weaken this boundary.
    if content.unsupported_claims:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.UNSUPPORTED_CLAIMS)
    return snapshot, raw


def _require_frozen_handoff(
    snapshot: PacketApprovalSnapshot,
    content: dict,
    *,
    source_id: str,
) -> None:
    """Bind the outward act and any later handoff to one frozen source."""
    handoff = content.get("manual_handoff")
    if (
        snapshot.destination_url is None
        or not isinstance(handoff, dict)
        or handoff.get("source_id") != source_id
        or handoff.get("source_url") != snapshot.destination_url
    ):
        raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)


def _resolve_path(content: dict, path: str) -> object | None:
    value: object = content
    for segment in path.split("."):
        if not isinstance(value, dict) or segment not in value:
            return None
        value = value[segment]
    if value is None or isinstance(value, (dict, list)):
        raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
    return value


def _contract_fields(
    content: dict,
    contract: SubmissionCompatibilityContract,
) -> dict[str, object]:
    values: dict[str, object] = {}
    for field in contract.fields:
        value = _resolve_path(content, field.packet_field)
        if value is None:
            if field.required:
                raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
            continue
        field_format = next(
            item.kind for item in contract.formats if item.source_field == field.source_field
        )
        if not _matches_format(value, field_format):
            raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
        values[field.source_field] = value
    return values


def _matches_format(value: object, kind: str) -> bool:
    if kind == "utf8_text":
        return isinstance(value, str)
    if kind == "email":
        try:
            TypeAdapter(EmailStr).validate_python(value)
        except ValidationError:
            return False
        return True
    if kind == "phone_e164":
        return isinstance(value, str) and re.fullmatch(r"\+[1-9]\d{7,14}", value) is not None
    if kind == "iso_date":
        if not isinstance(value, str):
            return False
        try:
            date.fromisoformat(value)
        except ValueError:
            return False
        return True
    if kind == "https_url":
        try:
            parsed = TypeAdapter(AnyHttpUrl).validate_python(value)
        except ValidationError:
            return False
        return parsed.scheme == "https" and not parsed.username and not parsed.password
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "decimal":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "enum":
        return isinstance(value, str)
    # Binary artifact transport is not implemented by #191. Fail closed rather
    # than treating a path or URL string as submitted PDF/DOCX bytes.
    return False


def _ensure_dispatch_claim(
    db: Session,
    *,
    key: str,
    user_id: str,
    snapshot_id: str,
    source_id: str,
    grant_id: str,
    snapshot_content_sha256: str,
    contract_version: str,
    contract_sha256: str,
    fields_json: str,
    fields_sha256: str,
    accepted_source_codes_json: str,
) -> SubmissionDispatchClaim:
    claim = db.query(SubmissionDispatchClaim).filter_by(idempotency_key=key).one_or_none()
    if claim is None:
        db.add(
            SubmissionDispatchClaim(
                idempotency_key=key,
                user_id=user_id,
                packet_approval_snapshot_id=snapshot_id,
                discovery_source_id=source_id,
                authorization_grant_id=grant_id,
                snapshot_content_sha256=snapshot_content_sha256,
                contract_version=contract_version,
                contract_sha256=contract_sha256,
                submitted_fields_json=fields_json,
                submitted_fields_sha256=fields_sha256,
                accepted_source_codes_json=accepted_source_codes_json,
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    claim = db.query(SubmissionDispatchClaim).filter_by(idempotency_key=key).one_or_none()
    if claim is None:
        db.rollback()
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_NOT_APPROVED)
    if (
        claim.user_id != user_id
        or claim.packet_approval_snapshot_id != snapshot_id
        or claim.discovery_source_id != source_id
        or claim.authorization_grant_id != grant_id
        or claim.snapshot_content_sha256 != snapshot_content_sha256
    ):
        db.rollback()
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED)
    return claim


def _lock_dispatch_claim(
    db: Session,
    *,
    key: str,
    user_id: str,
    snapshot_id: str,
    source_id: str,
    grant_id: str,
    snapshot_content_sha256: str,
) -> SubmissionDispatchClaim:
    claim = (
        db.query(SubmissionDispatchClaim)
        .filter(SubmissionDispatchClaim.idempotency_key == key)
        .with_for_update()
        .one_or_none()
    )
    if claim is None:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_NOT_APPROVED)
    if (
        claim.user_id != user_id
        or claim.packet_approval_snapshot_id != snapshot_id
        or claim.discovery_source_id != source_id
        or claim.authorization_grant_id != grant_id
        or claim.snapshot_content_sha256 != snapshot_content_sha256
    ):
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED)
    return claim


def _validated_claim_request(
    claim: SubmissionDispatchClaim,
) -> tuple[dict[str, object], set[str]]:
    if _sha256(claim.submitted_fields_json) != claim.submitted_fields_sha256:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED)
    try:
        fields = json.loads(claim.submitted_fields_json)
        accepted_codes = json.loads(claim.accepted_source_codes_json)
    except (json.JSONDecodeError, TypeError) as error:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED) from error
    if (
        not isinstance(fields, dict)
        or _canonical(fields) != claim.submitted_fields_json
        or not isinstance(accepted_codes, list)
        or not accepted_codes
        or any(not isinstance(code, str) for code in accepted_codes)
        or _canonical(sorted(set(accepted_codes))) != claim.accepted_source_codes_json
    ):
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED)
    return fields, set(accepted_codes)


def _lock_and_recheck_mutable_gates(
    db: Session,
    *,
    user_id: str,
    source_id: str,
    source_key: str,
    grant_id: str,
):
    # Match governance-writer order: governance -> discovery source -> grant.
    db.query(SubmissionSourceGovernance).filter(
        SubmissionSourceGovernance.discovery_source_id == source_id
    ).with_for_update().one_or_none()
    db.query(DiscoverySource).filter(
        DiscoverySource.id == source_id
    ).with_for_update().one_or_none()
    db.query(SubmissionAuthorizationGrant).filter(
        SubmissionAuthorizationGrant.id == grant_id
    ).with_for_update().one_or_none()
    source = require_submission_allowed(db, source_key)
    if source.discovery_source_id != source_id:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
    require_active_submission_authorization(
        db,
        user_id=user_id,
        source_id=source_id,
        grant_id=grant_id,
    )
    return source


def _response(record: SubmissionRecord) -> SubmissionRecordResponse:
    return SubmissionRecordResponse(
        id=record.id,
        packet_approval_snapshot_id=record.packet_approval_snapshot_id,
        discovery_source_id=record.discovery_source_id,
        authorization_grant_id=record.authorization_grant_id,
        idempotency_key=record.idempotency_key,
        snapshot_content_sha256=record.snapshot_content_sha256,
        contract_version=record.contract_version,
        contract_sha256=record.contract_sha256,
        submitted_fields=json.loads(record.submitted_fields_json),
        submitted_fields_sha256=record.submitted_fields_sha256,
        source_confirmation_id=record.source_confirmation_id,
        submitted_at=record.submitted_at,
    )


def _stop_event_response(event: SubmissionStopEvent) -> SubmissionStopEventResponse:
    return SubmissionStopEventResponse.model_validate(event)


def _stopped_response(
    event: SubmissionStopEvent,
    snapshot: PacketApprovalSnapshot,
) -> SubmissionStoppedResponse:
    return SubmissionStoppedResponse(
        stop_event_id=event.id,
        packet_id=snapshot.packet_id,
        packet_approval_snapshot_id=snapshot.id,
        discovery_source_id=event.discovery_source_id,
        reason=event.reason,
        explanation=STOP_EXPLANATIONS[event.reason],
        handoff=PacketSubmissionHandoff(
            destination_url=snapshot.destination_url,
            instructions=STOP_HANDOFF_INSTRUCTIONS,
        ),
    )


def _existing_stop(
    db: Session,
    *,
    user_id: str,
    snapshot_id: str,
    source_key: str,
) -> tuple[SubmissionStopEvent, PacketApprovalSnapshot] | None:
    row = (
        db.query(SubmissionStopEvent, PacketApprovalSnapshot)
        .join(
            PacketApprovalSnapshot,
            PacketApprovalSnapshot.id == SubmissionStopEvent.packet_approval_snapshot_id,
        )
        .join(
            DiscoverySource,
            DiscoverySource.id == SubmissionStopEvent.discovery_source_id,
        )
        .filter(
            SubmissionStopEvent.user_id == user_id,
            SubmissionStopEvent.packet_approval_snapshot_id == snapshot_id,
            DiscoverySource.source_key == source_key,
        )
        .one_or_none()
    )
    return row


def _bounded_source_code(source_code: str | None) -> str | None:
    if source_code is None or re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", source_code) is None:
        return None
    return source_code


def _stop_and_return(
    db: Session,
    *,
    snapshot: PacketApprovalSnapshot,
    source_id: str,
    grant_id: str,
    idempotency_key: str,
    contract_version: str,
    contract_sha256: str,
    reason: SubmissionStopReason,
    source_code: str | None = None,
    require_absent_claim: bool = False,
) -> SubmissionStoppedResponse:
    # Every caller already owns the packet -> snapshot locks established by
    # _approved_snapshot(for_update=True). Acquire only the later claim lock
    # here; reacquiring packet after snapshot/claim would obscure the global
    # deletion order and make future call sites capable of inverting it.
    locked_snapshot = snapshot
    locked_claim = (
        db.query(SubmissionDispatchClaim)
        .filter(SubmissionDispatchClaim.idempotency_key == idempotency_key)
        .with_for_update()
        .one_or_none()
    )
    if require_absent_claim and locked_claim is not None:
        # The earlier unlocked observation became stale: another worker may
        # already have made an ambiguous outward act. Preserve its frozen claim
        # and never turn this worker's preflight mismatch into a manual retry.
        db.rollback()
        raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
    existing = (
        db.query(SubmissionStopEvent)
        .filter(
            SubmissionStopEvent.packet_approval_snapshot_id == snapshot.id,
            SubmissionStopEvent.discovery_source_id == source_id,
        )
        .one_or_none()
    )
    if existing is not None:
        db.commit()
        return _stopped_response(existing, locked_snapshot)
    event = SubmissionStopEvent(
        user_id=snapshot.user_id,
        packet_approval_snapshot_id=snapshot.id,
        discovery_source_id=source_id,
        authorization_grant_id=grant_id,
        idempotency_key=idempotency_key,
        contract_version=contract_version,
        contract_sha256=contract_sha256,
        reason=reason,
        source_code=_bounded_source_code(source_code),
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        event = (
            db.query(SubmissionStopEvent)
            .filter(
                SubmissionStopEvent.packet_approval_snapshot_id == snapshot.id,
                SubmissionStopEvent.discovery_source_id == source_id,
            )
            .one()
        )
    else:
        db.refresh(event)
    return _stopped_response(event, locked_snapshot)


@dataclass(frozen=True)
class _LockedDispatchReady:
    snapshot: PacketApprovalSnapshot
    source: SourceSubmissionAuthorization
    claim: SubmissionDispatchClaim
    fields: dict[str, object]
    accepted_codes: set[str]


def _lock_and_validate_dispatch(
    db: Session,
    *,
    user_id: str,
    snapshot_id: str,
    expected_snapshot_sha256: str,
    source_id: str,
    source_key: str,
    grant_id: str,
    idempotency_key: str,
    envelope_gate: SubmissionEnvelopeGate,
    attempt_reserved: bool,
) -> _LockedDispatchReady | SubmissionRecordResponse | SubmissionStoppedResponse:
    """Acquire the complete final lock chain and revalidate every mutable gate."""

    locked_snapshot, content = _approved_snapshot(
        db,
        user_id=user_id,
        snapshot_id=snapshot_id,
        for_update=True,
    )
    if locked_snapshot.content_sha256 != expected_snapshot_sha256:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED)
    _require_frozen_handoff(locked_snapshot, content, source_id=source_id)
    claim = _lock_dispatch_claim(
        db,
        key=idempotency_key,
        user_id=user_id,
        snapshot_id=snapshot_id,
        source_id=source_id,
        grant_id=grant_id,
        snapshot_content_sha256=expected_snapshot_sha256,
    )
    terminal_stop = (
        db.query(SubmissionStopEvent)
        .filter(
            SubmissionStopEvent.packet_approval_snapshot_id == snapshot_id,
            SubmissionStopEvent.discovery_source_id == source_id,
        )
        .one_or_none()
    )
    if terminal_stop is not None:
        db.commit()
        return _stopped_response(terminal_stop, locked_snapshot)
    existing = (
        db.query(SubmissionRecord)
        .filter(
            SubmissionRecord.user_id == user_id,
            SubmissionRecord.packet_approval_snapshot_id == snapshot_id,
            SubmissionRecord.discovery_source_id == source_id,
        )
        .one_or_none()
    )
    if existing is not None:
        db.commit()
        return _response(existing)
    source = _lock_and_recheck_mutable_gates(
        db,
        user_id=user_id,
        source_id=claim.discovery_source_id,
        source_key=source_key,
        grant_id=claim.authorization_grant_id,
    )
    envelope_gate.require_healthy(
        db,
        user_id=user_id,
        source_id=source.discovery_source_id,
        snapshot_id=snapshot_id,
        serialize=True,
        attempt_reserved=attempt_reserved,
    )
    current_fields_json = _canonical(_contract_fields(content, source.contract))
    current_codes_json = _canonical(
        sorted(
            item.source_code
            for item in source.contract.error_semantics
            if item.meaning == "accepted" and item.handling == "confirm_success"
        )
    )
    if (
        source.contract.version != claim.contract_version
        or _contract_sha256(source.contract) != claim.contract_sha256
        or current_fields_json != claim.submitted_fields_json
        or current_codes_json != claim.accepted_source_codes_json
    ):
        raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
    fields, accepted_codes = _validated_claim_request(claim)
    return _LockedDispatchReady(
        snapshot=locked_snapshot,
        source=source,
        claim=claim,
        fields=fields,
        accepted_codes=accepted_codes,
    )


def submit_approved_snapshot(
    db: Session,
    *,
    user_id: str,
    snapshot_id: str,
    source_key: str,
    grant_id: str,
    envelope_gate: SubmissionEnvelopeGate,
    adapter: SubmissionAdapter,
) -> SubmissionRecordResponse | SubmissionStoppedResponse:
    """Submit once after independently checking all four R16 gates."""
    prior_stop = _existing_stop(
        db,
        user_id=user_id,
        snapshot_id=snapshot_id,
        source_key=source_key,
    )
    if prior_stop is not None:
        event, stopped_snapshot = prior_stop
        return _stopped_response(event, stopped_snapshot)
    snapshot, content = _approved_snapshot(db, user_id=user_id, snapshot_id=snapshot_id)
    source = require_submission_allowed(db, source_key)
    _require_frozen_handoff(
        snapshot,
        content,
        source_id=source.discovery_source_id,
    )
    if adapter.source_key != source.source_key:
        raise PacketSubmissionRefused(PacketSubmissionRefusal.ADAPTER_SOURCE_MISMATCH)
    require_active_submission_authorization(
        db,
        user_id=user_id,
        source_id=source.discovery_source_id,
        grant_id=grant_id,
    )
    envelope_gate.require_healthy(
        db,
        user_id=user_id,
        source_id=source.discovery_source_id,
        snapshot_id=snapshot.id,
    )
    key = _idempotency_key(snapshot.id, source.discovery_source_id)
    prior_claim = (
        db.query(SubmissionDispatchClaim)
        .filter(SubmissionDispatchClaim.idempotency_key == key)
        .one_or_none()
    )
    if prior_claim is None:
        claim_contract_version = source.contract.version
        claim_contract_sha256 = _contract_sha256(source.contract)
        try:
            initial_fields = _contract_fields(content, source.contract)
        except PacketSubmissionRefused as error:
            if error.reason != PacketSubmissionRefusal.CONTRACT_MISMATCH:
                raise
            # With no durable claim there cannot have been an earlier outward
            # act. This is therefore a proven pre-commit compatibility stop,
            # safe for an official manual handoff and #195 breakage evidence.
            locked_snapshot, _ = _approved_snapshot(
                db,
                user_id=user_id,
                snapshot_id=snapshot_id,
                for_update=True,
            )
            return _stop_and_return(
                db,
                snapshot=locked_snapshot,
                source_id=source.discovery_source_id,
                grant_id=grant_id,
                idempotency_key=key,
                contract_version=claim_contract_version,
                contract_sha256=claim_contract_sha256,
                reason="compatibility_mismatch",
                source_code="packet_contract_mismatch",
                require_absent_claim=True,
            )
        initial_fields_json = _canonical(initial_fields)
        initial_fields_sha256 = _sha256(initial_fields_json)
        accepted_codes_json = _canonical(
            sorted(
                item.source_code
                for item in source.contract.error_semantics
                if item.meaning == "accepted" and item.handling == "confirm_success"
            )
        )
    else:
        # An ambiguous prior act must retry the exact frozen request, regardless
        # of later compatibility-contract edits.
        initial_fields_json = prior_claim.submitted_fields_json
        initial_fields_sha256 = prior_claim.submitted_fields_sha256
        accepted_codes_json = prior_claim.accepted_source_codes_json
        claim_contract_version = prior_claim.contract_version
        claim_contract_sha256 = prior_claim.contract_sha256
    claim = _ensure_dispatch_claim(
        db,
        key=key,
        user_id=user_id,
        snapshot_id=snapshot.id,
        source_id=source.discovery_source_id,
        grant_id=grant_id,
        snapshot_content_sha256=snapshot.content_sha256,
        contract_version=claim_contract_version,
        contract_sha256=claim_contract_sha256,
        fields_json=initial_fields_json,
        fields_sha256=initial_fields_sha256,
        accepted_source_codes_json=accepted_codes_json,
    )
    try:
        ready = _lock_and_validate_dispatch(
            db,
            user_id=user_id,
            snapshot_id=snapshot_id,
            expected_snapshot_sha256=snapshot.content_sha256,
            source_id=source.discovery_source_id,
            source_key=source_key,
            grant_id=grant_id,
            idempotency_key=key,
            envelope_gate=envelope_gate,
            attempt_reserved=False,
        )
        if not isinstance(ready, _LockedDispatchReady):
            return ready

        # Commit the conservative reservation before crossing the process/network
        # boundary. A crash after the source receives bytes can no longer erase
        # the rate/anomaly evidence. The commit releases all locks, so the entire
        # chain is acquired and checked again below before any outward call.
        envelope_gate.record_attempt(
            db,
            user_id=user_id,
            source_id=source.discovery_source_id,
            idempotency_key=key,
        )
        ready = _lock_and_validate_dispatch(
            db,
            user_id=user_id,
            snapshot_id=snapshot_id,
            expected_snapshot_sha256=snapshot.content_sha256,
            source_id=source.discovery_source_id,
            source_key=source_key,
            grant_id=grant_id,
            idempotency_key=key,
            envelope_gate=envelope_gate,
            attempt_reserved=True,
        )
        if not isinstance(ready, _LockedDispatchReady):
            return ready
        locked_snapshot = ready.snapshot
        source = ready.source
        claim = ready.claim
        fields = ready.fields
        accepted_codes = ready.accepted_codes
        fields_json = claim.submitted_fields_json
        adapter_result = adapter.submit_idempotently(
            SubmissionAdapterRequest(
                source_key=source.source_key,
                contract_version=claim.contract_version,
                idempotency_key=key,
                snapshot_content_sha256=claim.snapshot_content_sha256,
                fields=fields,
            )
        )
        if isinstance(adapter_result, SubmissionAdapterStop):
            reason = (
                adapter_result.reason
                if adapter_result.reason in STOP_EXPLANATIONS
                else "compatibility_mismatch"
            )
            return _stop_and_return(
                db,
                snapshot=locked_snapshot,
                source_id=source.discovery_source_id,
                grant_id=claim.authorization_grant_id,
                idempotency_key=key,
                contract_version=claim.contract_version,
                contract_sha256=claim.contract_sha256,
                reason=reason,
                source_code=adapter_result.source_code,
            )
        receipt = adapter_result
        semantic = next(
            (
                item
                for item in source.contract.error_semantics
                if item.source_code == receipt.source_code
            ),
            None,
        )
        if semantic is None:
            raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
        if receipt.source_code not in accepted_codes:
            # A receipt is a post-invocation observation, not proof that the
            # adapter stopped before commit. Preserve the frozen claim for
            # source-native idempotent reconciliation and never offer a manual
            # handoff that could create a duplicate outward application.
            raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
        if not receipt.source_confirmation_id or len(receipt.source_confirmation_id) > 200:
            raise PacketSubmissionRefused(PacketSubmissionRefusal.CONTRACT_MISMATCH)
    except Exception:
        # A committed claim may already be shared by another worker that made an
        # ambiguous outward act. Never infer global non-invocation from this
        # caller's local control flow; preserve the frozen retry bytes.
        db.rollback()
        raise
    record = SubmissionRecord(
        user_id=user_id,
        packet_approval_snapshot_id=snapshot.id,
        discovery_source_id=source.discovery_source_id,
        authorization_grant_id=claim.authorization_grant_id,
        idempotency_key=key,
        snapshot_content_sha256=claim.snapshot_content_sha256,
        contract_version=claim.contract_version,
        contract_sha256=claim.contract_sha256,
        submitted_fields_json=fields_json,
        submitted_fields_sha256=claim.submitted_fields_sha256,
        source_confirmation_id=receipt.source_confirmation_id,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = (
            db.query(SubmissionRecord)
            .filter(
                SubmissionRecord.packet_approval_snapshot_id == snapshot.id,
                SubmissionRecord.discovery_source_id == source.discovery_source_id,
            )
            .one()
        )
        return _response(winner)
    db.refresh(record)
    return _response(record)


def export_submission_records(db: Session, user_id: str) -> SubmissionRecordsExport:
    rows = (
        db.query(SubmissionRecord)
        .filter(SubmissionRecord.user_id == user_id)
        .order_by(SubmissionRecord.submitted_at.asc(), SubmissionRecord.id.asc())
        .all()
    )
    claims = (
        db.query(SubmissionDispatchClaim)
        .filter(SubmissionDispatchClaim.user_id == user_id)
        .order_by(
            SubmissionDispatchClaim.created_at.asc(),
            SubmissionDispatchClaim.idempotency_key.asc(),
        )
        .all()
    )
    stops = (
        db.query(SubmissionStopEvent)
        .filter(SubmissionStopEvent.user_id == user_id)
        .order_by(SubmissionStopEvent.created_at.asc(), SubmissionStopEvent.id.asc())
        .all()
    )
    attempts = (
        db.query(SubmissionDispatchAttempt)
        .filter(SubmissionDispatchAttempt.user_id == user_id)
        .order_by(
            SubmissionDispatchAttempt.created_at.asc(),
            SubmissionDispatchAttempt.id.asc(),
        )
        .all()
    )
    return SubmissionRecordsExport(
        record_count=len(rows),
        records=[_response(row) for row in rows],
        dispatch_claim_count=len(claims),
        dispatch_claims=[
            SubmissionDispatchClaimResponse(
                idempotency_key=claim.idempotency_key,
                packet_approval_snapshot_id=claim.packet_approval_snapshot_id,
                discovery_source_id=claim.discovery_source_id,
                authorization_grant_id=claim.authorization_grant_id,
                snapshot_content_sha256=claim.snapshot_content_sha256,
                contract_version=claim.contract_version,
                contract_sha256=claim.contract_sha256,
                submitted_fields=json.loads(claim.submitted_fields_json),
                submitted_fields_sha256=claim.submitted_fields_sha256,
                created_at=claim.created_at,
            )
            for claim in claims
        ],
        dispatch_attempt_count=len(attempts),
        dispatch_attempts=[
            SubmissionDispatchAttemptResponse.model_validate(attempt) for attempt in attempts
        ],
        stop_count=len(stops),
        stops=[_stop_event_response(event) for event in stops],
    )


def list_contract_breakage_signals(
    db: Session,
    source_id: str,
) -> list[SubmissionStopEvent]:
    """Stable, content-free input seam for #195 compatibility monitoring."""
    return (
        db.query(SubmissionStopEvent)
        .filter(SubmissionStopEvent.discovery_source_id == source_id)
        .order_by(SubmissionStopEvent.created_at.asc(), SubmissionStopEvent.id.asc())
        .all()
    )


def stop_notices_by_packet(
    db: Session,
    user_id: str,
) -> dict[str, PacketSubmissionStopNotice]:
    rows = (
        db.query(SubmissionStopEvent, PacketApprovalSnapshot)
        .join(
            PacketApprovalSnapshot,
            PacketApprovalSnapshot.id == SubmissionStopEvent.packet_approval_snapshot_id,
        )
        .filter(SubmissionStopEvent.user_id == user_id)
        .all()
    )
    return {
        snapshot.packet_id: PacketSubmissionStopNotice(
            stop_event_id=event.id,
            reason=event.reason,
            explanation=STOP_EXPLANATIONS[event.reason],
            destination_url=snapshot.destination_url,
            instructions=STOP_HANDOFF_INSTRUCTIONS,
            stopped_at=event.created_at,
        )
        for event, snapshot in rows
    }


def delete_submission_records(db: Session, user_id: str) -> int:
    # Match submission and campaign deletion order before deleting any shared
    # row: packet -> approval snapshot -> dispatch claim. Deterministic ordering
    # also prevents two broad erasure operations from taking these locks apart.
    (
        db.query(ApplicationPacket)
        .filter(ApplicationPacket.user_id == user_id)
        .order_by(ApplicationPacket.id.asc())
        .with_for_update()
        .all()
    )
    (
        db.query(PacketApprovalSnapshot)
        .filter(PacketApprovalSnapshot.user_id == user_id)
        .order_by(PacketApprovalSnapshot.id.asc())
        .with_for_update()
        .all()
    )
    (
        db.query(SubmissionDispatchClaim)
        .filter(SubmissionDispatchClaim.user_id == user_id)
        .order_by(SubmissionDispatchClaim.idempotency_key.asc())
        .with_for_update()
        .all()
    )
    (
        db.query(SubmissionStopEvent)
        .filter(SubmissionStopEvent.user_id == user_id)
        .order_by(SubmissionStopEvent.id.asc())
        .with_for_update()
        .all()
    )
    (
        db.query(SubmissionDispatchAttempt)
        .filter(SubmissionDispatchAttempt.user_id == user_id)
        .order_by(SubmissionDispatchAttempt.id.asc())
        .with_for_update()
        .all()
    )
    deleted = (
        db.query(SubmissionRecord)
        .filter(SubmissionRecord.user_id == user_id)
        .delete(synchronize_session=False)
    )
    db.query(SubmissionDispatchAttempt).filter(SubmissionDispatchAttempt.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(SubmissionDispatchClaim).filter(SubmissionDispatchClaim.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(SubmissionStopEvent).filter(SubmissionStopEvent.user_id == user_id).delete(
        synchronize_session=False
    )
    return deleted
