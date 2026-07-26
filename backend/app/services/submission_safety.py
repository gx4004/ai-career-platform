from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models.discovery_source import DiscoverySource
from app.models.submission_authorization import SubmissionAuthorizationGrant
from app.models.submission_record import SubmissionDispatchClaim
from app.models.submission_safety import SubmissionSafetyControl, SubmissionSafetyPolicy
from app.models.user import User
from app.schemas.submission_safety import (
    AdminSubmissionSafetyResponse,
    OwnerSubmissionSafetyStatus,
    SubmissionIncidentRehearsalRequest,
    SubmissionSafetyBlockReason,
    SubmissionSafetyControlResponse,
    SubmissionSafetyPolicyConfig,
    SubmissionSafetyPolicyResponse,
    SubmissionSafetyStatus,
)
from app.services.analytics import safe_record_activation_event
from app.services.packet_gate import is_queue_paused


class SubmissionSafetyBlocked(RuntimeError):
    def __init__(self, reason: SubmissionSafetyBlockReason, status: SubmissionSafetyStatus):
        self.reason = reason
        self.status = status
        super().__init__(reason)


def _require_admin(actor: User) -> None:
    if not actor.is_admin:
        raise ValueError("Submission safety changes require an authenticated admin")


def _control(db: Session, *, for_update: bool = False) -> SubmissionSafetyControl | None:
    query = db.query(SubmissionSafetyControl).filter(SubmissionSafetyControl.id == "global")
    if for_update:
        query = query.with_for_update()
    return query.one_or_none()


def _ensure_control(db: Session, *, for_update: bool = False) -> SubmissionSafetyControl:
    control = _control(db, for_update=for_update)
    if control is None:
        control = SubmissionSafetyControl(id="global", global_kill_switch=True)
        db.add(control)
        db.flush()
    return control


def configure_submission_safety_policy(
    db: Session,
    *,
    source_id: str,
    config: SubmissionSafetyPolicyConfig,
    actor: User,
) -> SubmissionSafetyPolicyResponse:
    _require_admin(actor)
    if db.query(DiscoverySource.id).filter(DiscoverySource.id == source_id).one_or_none() is None:
        raise ValueError("A registered source is required")
    policy = (
        db.query(SubmissionSafetyPolicy)
        .filter(SubmissionSafetyPolicy.discovery_source_id == source_id)
        .with_for_update()
        .one_or_none()
    )
    now = datetime.now(UTC)
    if policy is None:
        policy = SubmissionSafetyPolicy(
            discovery_source_id=source_id,
            configured_by=actor.id,
            configured_at=now,
            **config.model_dump(),
        )
        db.add(policy)
    else:
        for name, value in config.model_dump().items():
            setattr(policy, name, value)
        policy.configured_by = actor.id
        policy.configured_at = now
        policy.updated_at = now
    db.commit()
    db.refresh(policy)
    return SubmissionSafetyPolicyResponse.model_validate(policy)


def record_submission_incident_rehearsal(
    db: Session,
    *,
    rehearsal: SubmissionIncidentRehearsalRequest,
    actor: User,
) -> SubmissionSafetyControlResponse:
    _require_admin(actor)
    control = _ensure_control(db, for_update=True)
    now = datetime.now(UTC)
    control.incident_playbook_version = rehearsal.playbook_version
    control.incident_rehearsed_at = now
    control.incident_rehearsed_by = actor.id
    control.updated_at = now
    db.commit()
    db.refresh(control)
    safe_record_activation_event(
        db,
        event_name="submission_incident_rehearsal",
        operational_outcome="rehearsal_recorded",
    )
    return SubmissionSafetyControlResponse.model_validate(control)


def operate_global_submission_kill_switch(
    db: Session,
    *,
    tripped: bool,
    actor: User,
) -> SubmissionSafetyControlResponse:
    _require_admin(actor)
    control = _ensure_control(db, for_update=True)
    if not tripped and control.incident_rehearsed_at is None:
        raise ValueError("A recorded incident rehearsal is required before clearing")
    changed = control.global_kill_switch is not tripped
    control.global_kill_switch = tripped
    if tripped and changed:
        # An incident trip consumes the prior recovery proof. Clearing again
        # requires a fresh rehearsal for this recovery epoch.
        control.incident_playbook_version = None
        control.incident_rehearsed_at = None
        control.incident_rehearsed_by = None
    control.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(control)
    if changed:
        safe_record_activation_event(
            db,
            event_name="submission_global_kill_switch",
            operational_outcome=("kill_switch_enabled" if tripped else "kill_switch_disabled"),
        )
    return SubmissionSafetyControlResponse.model_validate(control)


def submission_safety_control(db: Session) -> SubmissionSafetyControlResponse:
    control = _ensure_control(db)
    db.commit()
    db.refresh(control)
    return SubmissionSafetyControlResponse.model_validate(control)


def source_safety_policy(db: Session, source_id: str) -> SubmissionSafetyPolicyResponse | None:
    policy = (
        db.query(SubmissionSafetyPolicy)
        .filter(SubmissionSafetyPolicy.discovery_source_id == source_id)
        .one_or_none()
    )
    return SubmissionSafetyPolicyResponse.model_validate(policy) if policy else None


def admin_submission_safety(db: Session) -> AdminSubmissionSafetyResponse:
    control = _ensure_control(db)
    db.commit()
    policies = (
        db.query(SubmissionSafetyPolicy).order_by(SubmissionSafetyPolicy.discovery_source_id).all()
    )
    return AdminSubmissionSafetyResponse(
        control=SubmissionSafetyControlResponse.model_validate(control),
        policies=[SubmissionSafetyPolicyResponse.model_validate(item) for item in policies],
    )


class SubmissionSafetyEnvelope:
    """Authoritative #193 checkpoint used directly by the #191 engine."""

    def __init__(self, clock: Callable[[], datetime] | None = None):
        self._clock = clock or (lambda: datetime.now(UTC))

    def status(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: str,
        snapshot_id: str,
        lock: bool = False,
    ) -> SubmissionSafetyStatus:
        now = self._clock()
        if lock:
            # Shares the owner row lock with pause/resume so the last pre-adapter
            # check cannot race an owner kill-switch write.
            db.query(User.id).filter(User.id == user_id).with_for_update().one()
        control_query = db.query(SubmissionSafetyControl).filter(
            SubmissionSafetyControl.id == "global"
        )
        policy_query = db.query(SubmissionSafetyPolicy).filter(
            SubmissionSafetyPolicy.discovery_source_id == source_id
        )
        if lock:
            control_query = control_query.with_for_update()
            policy_query = policy_query.with_for_update()
        control = control_query.one_or_none()
        policy = policy_query.one_or_none()

        counts = self._counts(
            db,
            user_id=user_id,
            source_id=source_id,
            snapshot_id=snapshot_id,
            now=now,
        )
        reason: SubmissionSafetyBlockReason | None = None
        if is_queue_paused(db, user_id):
            reason = "user_paused"
        elif control is None or control.global_kill_switch:
            reason = "global_kill_switch"
        elif control.incident_rehearsed_at is None:
            reason = "incident_rehearsal_missing"
        elif policy is None:
            reason = "policy_missing"
        elif counts["user_rate_position"] > policy.user_rate_limit_per_minute:
            reason = "user_rate_limit"
        elif counts["user_daily_position"] > policy.user_daily_volume_limit:
            reason = "user_volume_limit"
        elif counts["source_rate_position"] > policy.source_rate_limit_per_minute:
            reason = "source_rate_limit"
        elif counts["source_daily_position"] > policy.source_daily_volume_limit:
            reason = "source_volume_limit"
        elif counts["user_hour_position"] >= policy.anomaly_user_attempts_per_hour:
            reason = "anomaly_detected"

        return SubmissionSafetyStatus(
            allowed=reason is None,
            reason=reason,
            user_rate_used=counts["user_rate"],
            user_rate_limit=policy.user_rate_limit_per_minute if policy else None,
            user_daily_used=counts["user_daily"],
            user_daily_limit=policy.user_daily_volume_limit if policy else None,
            source_rate_used=counts["source_rate"],
            source_rate_limit=policy.source_rate_limit_per_minute if policy else None,
            source_daily_used=counts["source_daily"],
            source_daily_limit=policy.source_daily_volume_limit if policy else None,
        )

    def require_healthy(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: str,
        snapshot_id: str,
    ) -> None:
        status = self.status(
            db,
            user_id=user_id,
            source_id=source_id,
            snapshot_id=snapshot_id,
            lock=True,
        )
        if status.reason == "anomaly_detected":
            source_family = (
                db.query(DiscoverySource.source_family)
                .filter(DiscoverySource.id == source_id)
                .scalar()
            )
            safe_record_activation_event(
                db,
                event_name="submission_safety_anomaly",
                operational_dimension=source_family,
                operational_outcome="anomaly_detected",
                level="error",
            )
        if not status.allowed:
            raise SubmissionSafetyBlocked(status.reason, status)

    @staticmethod
    def _counts(
        db: Session,
        *,
        user_id: str,
        source_id: str,
        snapshot_id: str,
        now: datetime,
    ) -> dict[str, int]:
        def count(*filters) -> int:
            return int(
                db.query(func.count(SubmissionDispatchClaim.idempotency_key))
                .filter(*filters)
                .scalar()
                or 0
            )

        minute = now - timedelta(minutes=1)
        hour = now - timedelta(hours=1)
        day = now - timedelta(hours=24)
        user_filter = SubmissionDispatchClaim.user_id == user_id
        source_filter = SubmissionDispatchClaim.discovery_source_id == source_id
        current = (
            db.query(SubmissionDispatchClaim)
            .filter(
                SubmissionDispatchClaim.packet_approval_snapshot_id == snapshot_id,
                source_filter,
            )
            .one_or_none()
        )

        def position(scope_filter, since: datetime) -> int:
            """Return this attempt's stable 1-based place within a limit window.

            A preflight without a claim is placed after all committed claims. Once
            the engine has durably claimed the attempt, created_at plus the primary
            key breaks concurrent ties so a limit of one admits exactly one worker
            instead of rejecting both.
            """

            if current is None:
                return count(scope_filter, SubmissionDispatchClaim.created_at >= since) + 1
            if not count(
                SubmissionDispatchClaim.idempotency_key == current.idempotency_key,
                SubmissionDispatchClaim.created_at >= since,
            ):
                return 0
            return (
                count(
                    scope_filter,
                    SubmissionDispatchClaim.created_at >= since,
                    or_(
                        SubmissionDispatchClaim.created_at < current.created_at,
                        and_(
                            SubmissionDispatchClaim.created_at == current.created_at,
                            SubmissionDispatchClaim.idempotency_key < current.idempotency_key,
                        ),
                    ),
                )
                + 1
            )

        return {
            "user_rate": count(user_filter, SubmissionDispatchClaim.created_at >= minute),
            "user_rate_position": position(user_filter, minute),
            "user_hour": count(user_filter, SubmissionDispatchClaim.created_at >= hour),
            "user_hour_position": position(user_filter, hour),
            "user_daily": count(user_filter, SubmissionDispatchClaim.created_at >= day),
            "user_daily_position": position(user_filter, day),
            "source_rate": count(source_filter, SubmissionDispatchClaim.created_at >= minute),
            "source_rate_position": position(source_filter, minute),
            "source_daily": count(source_filter, SubmissionDispatchClaim.created_at >= day),
            "source_daily_position": position(source_filter, day),
        }


def owner_submission_safety_status(
    db: Session,
    *,
    user_id: str,
    grant_id: str,
) -> OwnerSubmissionSafetyStatus | None:
    grant = (
        db.query(SubmissionAuthorizationGrant)
        .filter(
            SubmissionAuthorizationGrant.id == grant_id,
            SubmissionAuthorizationGrant.user_id == user_id,
        )
        .one_or_none()
    )
    if grant is None:
        return None
    status = SubmissionSafetyEnvelope().status(
        db,
        user_id=user_id,
        source_id=grant.discovery_source_id,
        snapshot_id=f"owner-preview:{grant.id}",
    )
    return OwnerSubmissionSafetyStatus(
        allowed=status.allowed,
        reason=status.reason,
        user_rate_used=status.user_rate_used,
        user_rate_limit=status.user_rate_limit,
        user_daily_used=status.user_daily_used,
        user_daily_limit=status.user_daily_limit,
    )
