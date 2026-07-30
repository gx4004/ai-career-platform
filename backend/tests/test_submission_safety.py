from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.submission_authorization import SubmissionAuthorizationGrant
from app.models.submission_record import SubmissionDispatchClaim
from app.models.submission_safety import (
    SubmissionDispatchAttempt,
    SubmissionIncidentRehearsal,
    SubmissionSafetyPolicy,
)
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceCreate
from app.schemas.submission_safety import (
    SubmissionIncidentRehearsalRequest,
    SubmissionSafetyPolicyConfig,
)
from app.services.discovery_sources import register_source
from app.services.packet_gate import pause_preparation, resume_preparation
from app.services.submission_safety import (
    SubmissionSafetyBlocked,
    SubmissionSafetyEnvelope,
    configure_submission_safety_policy,
    operate_global_submission_kill_switch,
    record_submission_incident_rehearsal,
    source_safety_policy,
    submission_safety_control,
)
from app.services.submissions import delete_submission_records, export_submission_records

NOW = datetime(2026, 7, 26, 12, 0, tzinfo=UTC)


def _admin(db) -> User:
    actor = User(
        email="safety-admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Safety Admin",
        is_admin=True,
    )
    db.add(actor)
    db.commit()
    db.refresh(actor)
    return actor


def _source(db, key: str = "safety-source"):
    return register_source(
        db,
        DiscoverySourceCreate(
            source_key=key,
            display_name="Safety fixture",
            source_family="employer_ats",
            owner="Tests",
            allowed_behavior="ats_integration",
            endpoint_url="https://safety.invalid/applications",
            allowed_query_parameters=[],
            robots_policy="not_applicable",
            rate_limit_per_minute=20,
            attribution_rule="Fixture",
            retention_days=30,
        ),
    )


def _policy(**changes) -> SubmissionSafetyPolicyConfig:
    values = {
        "user_rate_limit_per_minute": 4,
        "user_daily_volume_limit": 20,
        "source_rate_limit_per_minute": 10,
        "source_daily_volume_limit": 100,
        "anomaly_user_attempts_per_hour": 8,
    }
    values.update(changes)
    return SubmissionSafetyPolicyConfig(**values)


def _rehearsal(version: str = "submission-v1") -> SubmissionIncidentRehearsalRequest:
    return SubmissionIncidentRehearsalRequest(
        playbook_version=version,
        evidence_reference=f"ops/rehearsals/{version}",
        roles_confirmed=True,
        rollback_rehearsed=True,
        communication_reviewed=True,
    )


def _ready(db, source, actor, **policy_changes) -> None:
    configure_submission_safety_policy(
        db,
        source_id=source.id,
        config=_policy(**policy_changes),
        actor=actor,
    )
    record_submission_incident_rehearsal(
        db,
        rehearsal=_rehearsal(),
        actor=actor,
    )
    operate_global_submission_kill_switch(db, tripped=False, actor=actor)


def _claim(db, *, user_id: str, source_id: str, number: int, created_at: datetime) -> None:
    claim = SubmissionDispatchClaim(
        idempotency_key=f"safety:{user_id}:{source_id}:{number}",
        user_id=user_id,
        packet_approval_snapshot_id=f"snapshot-{number}",
        discovery_source_id=source_id,
        authorization_grant_id="grant",
        snapshot_content_sha256="a" * 64,
        contract_version="fixture/v1",
        contract_sha256="b" * 64,
        submitted_fields_json="{}",
        submitted_fields_sha256="c" * 64,
        accepted_source_codes_json='["accepted"]',
        created_at=created_at,
    )
    db.add_all(
        [
            claim,
            SubmissionDispatchAttempt(
                user_id=user_id,
                discovery_source_id=source_id,
                idempotency_key=claim.idempotency_key,
                created_at=created_at,
            ),
        ]
    )
    db.commit()


def _status(gate, db, user_id, source_id, snapshot_id="new-snapshot"):
    return gate.status(
        db,
        user_id=user_id,
        source_id=source_id,
        snapshot_id=snapshot_id,
    )


def test_global_control_defaults_killed_and_requires_rehearsal_to_clear(db):
    actor = _admin(db)
    control = submission_safety_control(db)
    assert control.global_kill_switch is True
    assert control.incident_rehearsed_at is None

    with pytest.raises(ValueError, match="rehearsal"):
        operate_global_submission_kill_switch(db, tripped=False, actor=actor)

    rehearsed = record_submission_incident_rehearsal(
        db,
        rehearsal=_rehearsal(),
        actor=actor,
    )
    assert rehearsed.incident_rehearsed_at is not None
    assert (
        operate_global_submission_kill_switch(db, tripped=False, actor=actor).global_kill_switch
        is False
    )
    tripped = operate_global_submission_kill_switch(db, tripped=True, actor=actor)
    assert tripped.incident_rehearsed_at is None
    assert db.query(SubmissionIncidentRehearsal).count() == 1
    with pytest.raises(ValueError, match="rehearsal"):
        operate_global_submission_kill_switch(db, tripped=False, actor=actor)

    record_submission_incident_rehearsal(db, rehearsal=_rehearsal("submission-v2"), actor=actor)
    assert db.query(SubmissionIncidentRehearsal).count() == 2


def test_rehearsal_requires_explicit_complete_evidence():
    with pytest.raises(ValidationError):
        SubmissionIncidentRehearsalRequest(
            playbook_version="submission-v1",
            evidence_reference="ops/rehearsals/submission-v1",
            roles_confirmed=True,
            rollback_rehearsed=False,
            communication_reviewed=True,
        )


def test_policy_is_strict_bounded_and_admin_only(db, test_user):
    source = _source(db)
    with pytest.raises(ValidationError):
        _policy(anomaly_user_attempts_per_hour=21)
    with pytest.raises(ValueError, match="admin"):
        configure_submission_safety_policy(
            db, source_id=source.id, config=_policy(), actor=test_user
        )

    db.add(
        SubmissionSafetyPolicy(
            discovery_source_id=source.id,
            user_rate_limit_per_minute=4,
            user_daily_volume_limit=2,
            source_rate_limit_per_minute=10,
            source_daily_volume_limit=100,
            anomaly_user_attempts_per_hour=3,
            configured_by=test_user.id,
            configured_at=NOW,
            updated_at=NOW,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    configured = configure_submission_safety_policy(
        db, source_id=source.id, config=_policy(), actor=_admin(db)
    )
    assert configured.user_rate_limit_per_minute == 4
    assert source_safety_policy(db, source.id) == configured


def test_user_pause_and_global_kill_switch_block_immediately(db, test_user):
    actor = _admin(db)
    source = _source(db)
    _ready(db, source, actor)
    gate = SubmissionSafetyEnvelope(clock=lambda: NOW)
    assert _status(gate, db, test_user.id, source.id).allowed is True

    pause_preparation(db, test_user.id, now=NOW)
    assert _status(gate, db, test_user.id, source.id).reason == "user_paused"
    resume_preparation(db, test_user.id)

    operate_global_submission_kill_switch(db, tripped=True, actor=actor)
    assert _status(gate, db, test_user.id, source.id).reason == "global_kill_switch"


@pytest.mark.parametrize(
    ("policy_changes", "claims", "reason"),
    [
        ({"user_rate_limit_per_minute": 1}, [(0, 0)], "user_rate_limit"),
        ({"user_daily_volume_limit": 1}, [(0, 120)], "user_volume_limit"),
        ({"source_rate_limit_per_minute": 1}, [(0, 0)], "source_rate_limit"),
        ({"source_daily_volume_limit": 1}, [(0, 120)], "source_volume_limit"),
    ],
)
def test_rate_and_volume_limits_count_durable_claims(db, test_user, policy_changes, claims, reason):
    actor = _admin(db)
    source = _source(db)
    # Keep earlier checks above the tested boundary.
    changes = {
        "user_rate_limit_per_minute": 10,
        "user_daily_volume_limit": 100,
        "source_rate_limit_per_minute": 100,
        "source_daily_volume_limit": 1000,
        "anomaly_user_attempts_per_hour": 100,
        **policy_changes,
    }
    changes["anomaly_user_attempts_per_hour"] = min(
        changes["anomaly_user_attempts_per_hour"],
        changes["user_daily_volume_limit"],
    )
    _ready(db, source, actor, **changes)
    for number, age_seconds in claims:
        _claim(
            db,
            user_id=test_user.id,
            source_id=source.id,
            number=number,
            created_at=NOW - timedelta(seconds=age_seconds),
        )

    status = _status(SubmissionSafetyEnvelope(clock=lambda: NOW), db, test_user.id, source.id)
    assert status.reason == reason


def test_repeated_attempts_for_one_claim_each_consume_the_limit(db, test_user):
    actor = _admin(db)
    source = _source(db)
    _ready(
        db,
        source,
        actor,
        user_rate_limit_per_minute=10,
        source_rate_limit_per_minute=2,
    )
    _claim(
        db,
        user_id=test_user.id,
        source_id=source.id,
        number=1,
        created_at=NOW,
    )
    first_claim = (
        db.query(SubmissionDispatchClaim).filter_by(packet_approval_snapshot_id="snapshot-1").one()
    )
    db.add(
        SubmissionDispatchAttempt(
            user_id=test_user.id,
            discovery_source_id=source.id,
            idempotency_key=first_claim.idempotency_key,
            created_at=NOW,
        )
    )
    db.commit()
    gate = SubmissionSafetyEnvelope(clock=lambda: NOW)

    status = _status(gate, db, test_user.id, source.id, "snapshot-1")

    assert status.source_rate_used == 2
    assert status.reason == "source_rate_limit"
    exported = export_submission_records(db, test_user.id)
    assert exported.dispatch_attempt_count == 2
    assert {attempt.idempotency_key for attempt in exported.dispatch_attempts} == {
        first_claim.idempotency_key
    }
    delete_submission_records(db, test_user.id)
    db.commit()
    assert db.query(SubmissionDispatchAttempt).filter_by(user_id=test_user.id).count() == 0


def test_expired_attempt_reservation_fails_closed_before_outward_act(db, test_user):
    actor = _admin(db)
    source = _source(db)
    _ready(db, source, actor)
    _claim(db, user_id=test_user.id, source_id=source.id, number=1, created_at=NOW)
    attempt = db.query(SubmissionDispatchAttempt).one()

    status = SubmissionSafetyEnvelope(clock=lambda: NOW + timedelta(minutes=2)).status(
        db,
        user_id=test_user.id,
        source_id=source.id,
        snapshot_id="snapshot-1",
        attempt_reservation_id=attempt.id,
    )

    assert status.reason == "attempt_reservation_expired"


def test_owner_limits_are_scoped_to_the_configured_source(db, test_user):
    actor = _admin(db)
    source_a = _source(db, "safety-source-a")
    source_b = _source(db, "safety-source-b")
    _ready(db, source_a, actor, user_rate_limit_per_minute=1)
    configure_submission_safety_policy(
        db,
        source_id=source_b.id,
        config=_policy(user_rate_limit_per_minute=1),
        actor=actor,
    )
    _claim(db, user_id=test_user.id, source_id=source_a.id, number=1, created_at=NOW)

    status = _status(SubmissionSafetyEnvelope(clock=lambda: NOW), db, test_user.id, source_b.id)

    assert status.allowed is True
    assert status.user_rate_used == 0
    assert status.user_daily_used == 0


def test_anomaly_event_is_content_free_and_blocks_before_an_outward_act(db, test_user):
    actor = _admin(db)
    source = _source(db)
    _ready(
        db,
        source,
        actor,
        user_rate_limit_per_minute=10,
        anomaly_user_attempts_per_hour=3,
    )
    for number in range(2):
        _claim(
            db,
            user_id=test_user.id,
            source_id=source.id,
            number=number,
            created_at=NOW - timedelta(minutes=10 + number),
        )
    gate = SubmissionSafetyEnvelope(clock=lambda: NOW)

    with pytest.raises(SubmissionSafetyBlocked) as blocked:
        gate.require_healthy(
            db,
            user_id=test_user.id,
            source_id=source.id,
            snapshot_id="third-snapshot",
        )

    assert blocked.value.reason == "anomaly_detected"
    event = db.query(AnalyticsEvent).filter_by(event_name="submission_safety_anomaly").one()
    assert event.operational_dimension == "employer_ats"
    assert event.operational_outcome == "anomaly_detected"
    assert event.tool_id is None
    assert test_user.id not in repr(event.__dict__)


def test_admin_safety_endpoints_are_reachable_and_admin_scoped(db, client, auth_headers):
    actor = _admin(db)
    source = _source(db)
    admin_headers = {"Authorization": f"Bearer {create_access_token(actor.id)}"}

    assert client.get("/api/v1/admin/submission-safety", headers=auth_headers).status_code == 403
    initial = client.get("/api/v1/admin/submission-safety", headers=admin_headers)
    assert initial.status_code == 200
    assert initial.json()["control"]["global_kill_switch"] is True

    configured = client.put(
        f"/api/v1/admin/discovery-sources/{source.id}/submission-safety",
        headers=admin_headers,
        json=_policy().model_dump(),
    )
    assert configured.status_code == 200
    assert configured.json()["user_daily_volume_limit"] == 20
    rehearsed = client.post(
        "/api/v1/admin/submission-safety/rehearsal",
        headers=admin_headers,
        json=_rehearsal().model_dump(),
    )
    assert rehearsed.status_code == 200
    safety = client.get("/api/v1/admin/submission-safety", headers=admin_headers).json()
    assert safety["rehearsals"][0]["evidence_reference"] == "ops/rehearsals/submission-v1"
    cleared = client.post(
        "/api/v1/admin/submission-safety/global-kill-switch?tripped=false",
        headers=admin_headers,
    )
    assert cleared.status_code == 200
    assert cleared.json()["global_kill_switch"] is False


def test_owner_can_read_only_their_grants_clear_safety_state(db, client, test_user, auth_headers):
    source = _source(db)
    grant = SubmissionAuthorizationGrant(
        user_id=test_user.id,
        discovery_source_id=source.id,
        mechanism="oauth2_authorization_code",
        scope="submit_applications",
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)

    response = client.get(
        f"/api/v1/submission-authorizations/{grant.id}/safety",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["allowed"] is False
    assert response.json()["reason"] == "global_kill_switch"
    assert response.json()["user_rate_used"] == 0
    assert "source_rate_used" not in response.json()
    assert (
        client.get(
            "/api/v1/submission-authorizations/not-owned/safety",
            headers=auth_headers,
        ).status_code
        == 404
    )


def test_owner_status_does_not_reveal_another_owners_source_activity(
    db, client, test_user, auth_headers
):
    actor = _admin(db)
    source = _source(db)
    _ready(db, source, actor)
    other = User(email="other-owner@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    db.refresh(other)
    _claim(db, user_id=other.id, source_id=source.id, number=99, created_at=NOW)
    grant = SubmissionAuthorizationGrant(
        user_id=test_user.id,
        discovery_source_id=source.id,
        mechanism="oauth2_authorization_code",
        scope="submit_applications",
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)

    payload = client.get(
        f"/api/v1/submission-authorizations/{grant.id}/safety",
        headers=auth_headers,
    ).json()

    assert payload["user_rate_used"] == 0
    assert payload["user_daily_used"] == 0
    assert not any(name.startswith("source_") for name in payload)
