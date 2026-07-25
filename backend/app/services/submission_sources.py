from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy.orm import Session, joinedload

from app.models.discovery_source import DiscoverySource
from app.models.submission_source import SubmissionSourceGovernance
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceFamily
from app.schemas.submission_sources import (
    SubmissionCompatibilityContract,
    SubmissionLegalTermsReview,
)
from app.services.analytics import safe_record_activation_event


class SubmissionRefusal(StrEnum):
    UNREGISTERED = "unregistered"
    TERMS_NOT_ACCEPTED = "terms_not_accepted"
    DISCOVERY_KILL_SWITCHED = "discovery_kill_switched"
    NOT_PROMOTED = "not_promoted"
    LEGAL_TERMS_NOT_ACCEPTED = "legal_terms_not_accepted"
    CONTRACT_NOT_VERIFIED = "contract_not_verified"
    KILL_SWITCHED = "kill_switched"


class SourceSubmissionRefused(RuntimeError):
    def __init__(self, reason: SubmissionRefusal):
        self.reason = reason
        super().__init__(reason.value)


@dataclass(frozen=True)
class SourceSubmissionAuthorization:
    discovery_source_id: str
    source_key: str
    source_family: DiscoverySourceFamily
    contract: SubmissionCompatibilityContract


def _require_admin(actor: User) -> None:
    if not actor.is_admin:
        raise ValueError("Submission governance changes require an authenticated admin")


def register_submission_governance(
    db: Session,
    source: DiscoverySource,
) -> SubmissionSourceGovernance:
    """Extend an R14 source dark: pending, unpromoted, and killed."""
    governance = SubmissionSourceGovernance(discovery_source_id=source.id)
    db.add(governance)
    db.commit()
    db.refresh(governance)
    return governance


def review_submission_legal_terms(
    db: Session,
    governance: SubmissionSourceGovernance,
    body: SubmissionLegalTermsReview,
    *,
    actor: User,
) -> SubmissionSourceGovernance:
    _require_admin(actor)
    governance = _governance_for_update(db, governance.id)
    was_promoted = governance.promoted
    kill_was_clear = not governance.kill_switch
    if body.status == "pending":
        governance.legal_terms_reviewed_at = None
        governance.legal_terms_reviewed_by = None
    else:
        governance.legal_terms_reviewed_at = datetime.now(UTC)
        governance.legal_terms_reviewed_by = actor.id
    governance.legal_terms_status = body.status
    if body.status != "accepted" and was_promoted:
        governance.promoted = False
        governance.promoted_at = None
        governance.promoted_by = None
        governance.kill_switch = True
    db.commit()
    db.refresh(governance)
    # Emit only after the complete governance transition is durable. Analytics
    # is best-effort and must never roll back or partially commit source policy.
    if body.status != "accepted" and was_promoted:
        if kill_was_clear:
            _record_governance_event(
                db,
                governance,
                event_name="submission_source_kill_switch",
                outcome="kill_switch_enabled",
            )
        _record_governance_event(
            db,
            governance,
            event_name="submission_source_promotion_changed",
            outcome="demoted",
        )
    return governance


def record_submission_contract(
    db: Session,
    governance: SubmissionSourceGovernance,
    contract: SubmissionCompatibilityContract,
    *,
    actor: User,
) -> SubmissionSourceGovernance:
    _require_admin(actor)
    governance = _governance_for_update(db, governance.id)
    governance.contract_status = "verified"
    governance.contract_version = contract.version
    governance.contract_fields = [item.model_dump() for item in contract.fields]
    governance.contract_formats = [item.model_dump() for item in contract.formats]
    governance.contract_error_semantics = [
        item.model_dump() for item in contract.error_semantics
    ]
    governance.contract_reviewed_at = datetime.now(UTC)
    governance.contract_reviewed_by = actor.id
    db.commit()
    db.refresh(governance)
    return governance


def promote_submission_source(
    db: Session,
    governance: SubmissionSourceGovernance,
    *,
    promoted: bool,
    actor: User,
) -> SubmissionSourceGovernance:
    _require_admin(actor)
    governance = _governance_for_update(db, governance.id)
    source = _source_for_update(db, governance.discovery_source_id)
    if promoted:
        if source.terms_status != "accepted":
            raise ValueError("Accepted discovery terms are required before promotion")
        if governance.legal_terms_status != "accepted":
            raise ValueError("Accepted submission legal/terms approval is required")
        if governance.contract_status != "verified":
            raise ValueError("A verified compatibility contract is required")
        if governance.promoted:
            return governance
        governance.promoted = True
        governance.promoted_at = datetime.now(UTC)
        governance.promoted_by = actor.id
        outcome = "promoted"
    else:
        if not governance.promoted:
            return governance
        kill_was_clear = not governance.kill_switch
        governance.promoted = False
        governance.promoted_at = None
        governance.promoted_by = None
        governance.kill_switch = True
        outcome = "demoted"
    db.commit()
    db.refresh(governance)
    if not promoted and kill_was_clear:
        _record_governance_event(
            db,
            governance,
            event_name="submission_source_kill_switch",
            outcome="kill_switch_enabled",
        )
    _record_governance_event(
        db,
        governance,
        event_name="submission_source_promotion_changed",
        outcome=outcome,
    )
    return governance


def operate_submission_kill_switch(
    db: Session,
    governance: SubmissionSourceGovernance,
    *,
    tripped: bool,
    actor: User,
) -> SubmissionSourceGovernance:
    """Trip immediately; clear only when the complete source gate is already valid."""
    _require_admin(actor)
    governance = _governance_for_update(db, governance.id)
    source = _source_for_update(db, governance.discovery_source_id)
    if not tripped:
        if not governance.promoted:
            raise ValueError("A submission source must be promoted before clearing its kill switch")
        if governance.legal_terms_status != "accepted":
            raise ValueError("Accepted submission legal/terms approval is required")
        if governance.contract_status != "verified":
            raise ValueError("A verified compatibility contract is required")
        if source.terms_status != "accepted":
            raise ValueError("Accepted discovery terms are required")
        if source.kill_switch:
            raise ValueError("The discovery source kill switch must be clear")
    if governance.kill_switch is tripped:
        return governance
    governance.kill_switch = tripped
    db.commit()
    db.refresh(governance)
    _record_governance_event(
        db,
        governance,
        event_name="submission_source_kill_switch",
        outcome="kill_switch_enabled" if tripped else "kill_switch_disabled",
    )
    return governance


def require_submission_allowed(
    db: Session,
    source_key: str,
) -> SourceSubmissionAuthorization:
    """Evaluate the entire #189 source gate before any future outward act."""
    source = (
        db.query(DiscoverySource)
        .options(joinedload(DiscoverySource.submission_governance))
        .populate_existing()
        .filter(DiscoverySource.source_key == source_key)
        .first()
    )
    if source is None:
        raise SourceSubmissionRefused(SubmissionRefusal.UNREGISTERED)
    if source.terms_status != "accepted":
        raise SourceSubmissionRefused(SubmissionRefusal.TERMS_NOT_ACCEPTED)
    if source.kill_switch:
        raise SourceSubmissionRefused(SubmissionRefusal.DISCOVERY_KILL_SWITCHED)
    governance = source.submission_governance
    if governance is None or not governance.promoted:
        raise SourceSubmissionRefused(SubmissionRefusal.NOT_PROMOTED)
    if governance.legal_terms_status != "accepted":
        raise SourceSubmissionRefused(SubmissionRefusal.LEGAL_TERMS_NOT_ACCEPTED)
    if governance.contract_status != "verified":
        raise SourceSubmissionRefused(SubmissionRefusal.CONTRACT_NOT_VERIFIED)
    if governance.kill_switch:
        raise SourceSubmissionRefused(SubmissionRefusal.KILL_SWITCHED)
    try:
        contract = SubmissionCompatibilityContract(
            version=governance.contract_version,
            fields=governance.contract_fields,
            formats=governance.contract_formats,
            error_semantics=governance.contract_error_semantics,
        )
    except (TypeError, ValueError) as error:
        raise SourceSubmissionRefused(SubmissionRefusal.CONTRACT_NOT_VERIFIED) from error
    return SourceSubmissionAuthorization(
        discovery_source_id=source.id,
        source_key=source.source_key,
        source_family=source.source_family,
        contract=contract,
    )


def _governance_for_update(
    db: Session,
    governance_id: str,
) -> SubmissionSourceGovernance:
    """Reload and lock policy so emergency actions never trust cached ORM state."""
    return (
        db.query(SubmissionSourceGovernance)
        .populate_existing()
        .filter(SubmissionSourceGovernance.id == governance_id)
        .with_for_update()
        .one()
    )


def _source_for_update(
    db: Session,
    source_id: str,
) -> DiscoverySource:
    return (
        db.query(DiscoverySource)
        .populate_existing()
        .filter(DiscoverySource.id == source_id)
        .with_for_update()
        .one()
    )


def _record_governance_event(
    db: Session,
    governance: SubmissionSourceGovernance,
    *,
    event_name: str,
    outcome: str,
) -> None:
    safe_record_activation_event(
        db,
        event_name=event_name,
        operational_dimension=governance.discovery_source.source_family,
        operational_outcome=outcome,
    )
