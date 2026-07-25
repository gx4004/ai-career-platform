import json
from datetime import UTC
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.discovery_source import DiscoverySource
from app.models.submission_source import SubmissionSourceGovernance
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.schemas.submission_sources import (
    SubmissionCompatibilityContract,
    SubmissionLegalTermsReview,
)
from app.services.analytics import record_activation_event
from app.services.discovery_sources import (
    operate_source_kill_switch,
    register_source,
    update_source,
)
from app.services.submission_sources import (
    SourceSubmissionRefused,
    SubmissionRefusal,
    operate_submission_kill_switch,
    promote_submission_source,
    record_submission_contract,
    register_submission_governance,
    require_submission_allowed,
    review_submission_legal_terms,
)

PREFIX = "/api/v1"
FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "submission_contracts"
    / "synthetic_ats_v1.json"
)


def _admin(db, email: str = "submission-reviewer@example.com") -> User:
    actor = User(
        email=email,
        hashed_password=hash_password("password123"),
        full_name="Submission Reviewer",
        is_admin=True,
    )
    db.add(actor)
    db.commit()
    db.refresh(actor)
    return actor


def _source_body(source_key: str = "synthetic-submission-ats") -> DiscoverySourceCreate:
    return DiscoverySourceCreate(
        source_key=source_key,
        display_name="Synthetic Submission ATS",
        source_family="employer_ats",
        owner="Submission Operations",
        allowed_behavior="ats_integration",
        endpoint_url="https://synthetic-ats.invalid/applications",
        allowed_query_parameters=[],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Show the synthetic source fixture",
        retention_days=30,
    )


def _contract() -> SubmissionCompatibilityContract:
    return SubmissionCompatibilityContract.model_validate(
        json.loads(FIXTURE_PATH.read_text())
    )


def _accepted_discovery_source(
    db,
    actor: User,
    source_key: str = "synthetic-submission-ats",
) -> DiscoverySource:
    source = register_source(db, _source_body(source_key))
    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="accepted"),
        actor=actor,
    )
    operate_source_kill_switch(db, source, tripped=False, actor=actor)
    return source


def _authorized_source(
    db,
    actor: User,
    source_key: str = "synthetic-submission-ats",
):
    source = _accepted_discovery_source(db, actor, source_key)
    governance = register_submission_governance(db, source)
    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="accepted"),
        actor=actor,
    )
    record_submission_contract(db, governance, _contract(), actor=actor)
    promote_submission_source(db, governance, promoted=True, actor=actor)
    operate_submission_kill_switch(db, governance, tripped=False, actor=actor)
    return source, governance


def test_local_contract_fixture_encodes_fields_formats_and_error_semantics():
    contract = _contract()

    assert contract.version == "synthetic-ats/v1"
    assert {field.source_field for field in contract.fields} == {
        "candidate_name",
        "candidate_email",
        "resume",
    }
    assert {item.kind for item in contract.formats} == {
        "utf8_text",
        "email",
        "pdf",
    }
    assert {item.meaning for item in contract.error_semantics} >= {
        "accepted",
        "validation_error",
        "challenge",
        "transient_failure",
    }


def test_contract_rejects_missing_formats_duplicate_fields_and_unknown_content():
    raw = json.loads(FIXTURE_PATH.read_text())
    raw["formats"] = raw["formats"][:-1]
    with pytest.raises(ValidationError, match="format"):
        SubmissionCompatibilityContract.model_validate(raw)

    raw = json.loads(FIXTURE_PATH.read_text())
    raw["fields"].append(raw["fields"][0])
    with pytest.raises(ValidationError, match="unique"):
        SubmissionCompatibilityContract.model_validate(raw)

    raw = json.loads(FIXTURE_PATH.read_text())
    raw["secret"] = "must not become unbounded contract metadata"
    with pytest.raises(ValidationError):
        SubmissionCompatibilityContract.model_validate(raw)

    raw = json.loads(FIXTURE_PATH.read_text())
    raw["error_semantics"][2]["handling"] = "retry_with_source_idempotency"
    with pytest.raises(ValidationError, match="Challenges must stop"):
        SubmissionCompatibilityContract.model_validate(raw)

    raw = json.loads(FIXTURE_PATH.read_text())
    raw["error_semantics"] = raw["error_semantics"][1:]
    with pytest.raises(ValidationError, match="accepted responses"):
        SubmissionCompatibilityContract.model_validate(raw)


def test_governance_starts_unpromoted_and_killed(db):
    source = register_source(db, _source_body())

    governance = register_submission_governance(db, source)

    assert governance.discovery_source_id == source.id
    assert governance.legal_terms_status == "pending"
    assert governance.contract_status == "missing"
    assert governance.promoted is False
    assert governance.kill_switch is True
    assert governance.submission_allowed is False


def test_promotion_requires_discovery_terms_legal_approval_and_contract(db):
    actor = _admin(db)
    source = register_source(db, _source_body())
    governance = register_submission_governance(db, source)

    with pytest.raises(ValueError, match="discovery terms"):
        promote_submission_source(db, governance, promoted=True, actor=actor)

    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="accepted"),
        actor=actor,
    )
    with pytest.raises(ValueError, match="legal/terms approval"):
        promote_submission_source(db, governance, promoted=True, actor=actor)

    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="accepted"),
        actor=actor,
    )
    with pytest.raises(ValueError, match="compatibility contract"):
        promote_submission_source(db, governance, promoted=True, actor=actor)

    record_submission_contract(db, governance, _contract(), actor=actor)
    promoted = promote_submission_source(
        db,
        governance,
        promoted=True,
        actor=actor,
    )

    assert promoted.promoted is True
    assert promoted.promoted_at is not None
    assert promoted.promoted_by == actor.id
    # Promotion documents support. It does not silently activate the integration.
    assert promoted.kill_switch is True
    assert promoted.submission_allowed is False


def test_submission_refuses_unregistered_non_promoted_terms_failed_and_killed(db):
    actor = _admin(db)
    with pytest.raises(SourceSubmissionRefused) as unregistered:
        require_submission_allowed(db, "missing")
    assert unregistered.value.reason == SubmissionRefusal.UNREGISTERED

    source = _accepted_discovery_source(db, actor)
    with pytest.raises(SourceSubmissionRefused) as not_promoted:
        require_submission_allowed(db, source.source_key)
    assert not_promoted.value.reason == SubmissionRefusal.NOT_PROMOTED

    source, governance = _authorized_source(
        db,
        _admin(db, "submission-reviewer-2@example.com"),
        "synthetic-submission-ats-2",
    )
    authorization = require_submission_allowed(db, source.source_key)
    assert authorization.discovery_source_id == source.id
    assert authorization.contract.version == "synthetic-ats/v1"

    operate_submission_kill_switch(db, governance, tripped=True, actor=actor)
    with pytest.raises(SourceSubmissionRefused) as submission_killed:
        require_submission_allowed(db, source.source_key)
    assert submission_killed.value.reason == SubmissionRefusal.KILL_SWITCHED

    operate_submission_kill_switch(db, governance, tripped=False, actor=actor)
    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="failed"),
        actor=actor,
    )
    with pytest.raises(SourceSubmissionRefused) as terms_failed:
        require_submission_allowed(db, source.source_key)
    assert terms_failed.value.reason == SubmissionRefusal.TERMS_NOT_ACCEPTED


def test_clearing_submission_kill_switch_requires_every_source_gate(db):
    actor = _admin(db)
    source = _accepted_discovery_source(db, actor)
    governance = register_submission_governance(db, source)

    with pytest.raises(ValueError, match="promoted"):
        operate_submission_kill_switch(
            db,
            governance,
            tripped=False,
            actor=actor,
        )
    assert governance.kill_switch is True


def test_failed_legal_review_demotes_and_kills_an_authorized_source(db):
    actor = _admin(db)
    source, governance = _authorized_source(db, actor)

    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="failed"),
        actor=actor,
    )

    assert governance.promoted is False
    assert governance.kill_switch is True
    assert governance.submission_allowed is False
    with pytest.raises(SourceSubmissionRefused) as refused:
        require_submission_allowed(db, source.source_key)
    assert refused.value.reason == SubmissionRefusal.NOT_PROMOTED


def test_demotion_retrips_kill_switch_and_repromotion_does_not_activate(db):
    actor = _admin(db)
    source, governance = _authorized_source(db, actor)

    promote_submission_source(db, governance, promoted=False, actor=actor)
    assert governance.promoted is False
    assert governance.kill_switch is True

    promote_submission_source(db, governance, promoted=True, actor=actor)
    assert governance.promoted is True
    assert governance.kill_switch is True
    with pytest.raises(SourceSubmissionRefused) as refused:
        require_submission_allowed(db, source.source_key)
    assert refused.value.reason == SubmissionRefusal.KILL_SWITCHED


def test_stale_session_cannot_turn_emergency_kill_or_demotion_into_a_noop(db):
    actor = _admin(db)
    source = _accepted_discovery_source(db, actor)
    governance = register_submission_governance(db, source)
    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="accepted"),
        actor=actor,
    )
    record_submission_contract(db, governance, _contract(), actor=actor)

    OtherSession = sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)
    other = OtherSession()
    try:
        other_governance = other.get(SubmissionSourceGovernance, governance.id)
        promote_submission_source(
            other,
            other_governance,
            promoted=True,
            actor=actor,
        )
        operate_submission_kill_switch(
            other,
            other_governance,
            tripped=False,
            actor=actor,
        )

        # This session still remembers the pre-promotion, killed row. Emergency
        # actions must reload authoritative state before deciding they are no-ops.
        promote_submission_source(db, governance, promoted=False, actor=actor)
        assert governance.promoted is False
        assert governance.kill_switch is True

        promote_submission_source(db, governance, promoted=True, actor=actor)
        operate_submission_kill_switch(
            other,
            other_governance,
            tripped=False,
            actor=actor,
        )
        operate_submission_kill_switch(db, governance, tripped=True, actor=actor)
        db.expire_all()
        assert governance.kill_switch is True
    finally:
        other.close()


def test_stale_pre_promotion_legal_failure_still_demotes_atomically(db):
    actor = _admin(db)
    source = _accepted_discovery_source(db, actor)
    governance = register_submission_governance(db, source)
    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="accepted"),
        actor=actor,
    )
    record_submission_contract(db, governance, _contract(), actor=actor)

    OtherSession = sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)
    other = OtherSession()
    try:
        other_governance = other.get(SubmissionSourceGovernance, governance.id)
        promote_submission_source(
            other,
            other_governance,
            promoted=True,
            actor=actor,
        )
        operate_submission_kill_switch(
            other,
            other_governance,
            tripped=False,
            actor=actor,
        )

        review_submission_legal_terms(
            db,
            governance,
            SubmissionLegalTermsReview(status="failed"),
            actor=actor,
        )
        assert governance.legal_terms_status == "failed"
        assert governance.promoted is False
        assert governance.kill_switch is True
    finally:
        other.close()


def test_submission_governance_changes_require_an_admin(db, test_user):
    source = register_source(db, _source_body())
    governance = register_submission_governance(db, source)

    with pytest.raises(ValueError, match="authenticated admin"):
        review_submission_legal_terms(
            db,
            governance,
            SubmissionLegalTermsReview(status="accepted"),
            actor=test_user,
        )
    with pytest.raises(ValueError, match="authenticated admin"):
        record_submission_contract(db, governance, _contract(), actor=test_user)
    with pytest.raises(ValueError, match="authenticated admin"):
        promote_submission_source(
            db,
            governance,
            promoted=True,
            actor=test_user,
        )
    with pytest.raises(ValueError, match="authenticated admin"):
        operate_submission_kill_switch(
            db,
            governance,
            tripped=False,
            actor=test_user,
        )


def test_promotion_and_kill_events_are_content_free_and_allowlisted(db):
    actor = _admin(db)
    source, governance = _authorized_source(db, actor)
    operate_submission_kill_switch(db, governance, tripped=True, actor=actor)
    promote_submission_source(db, governance, promoted=False, actor=actor)

    events = (
        db.query(AnalyticsEvent)
        .filter(
            AnalyticsEvent.event_name.in_(
                (
                    "submission_source_promotion_changed",
                    "submission_source_kill_switch",
                )
            )
        )
        .order_by(AnalyticsEvent.created_at)
        .all()
    )
    assert [event.event_name for event in events] == [
        "submission_source_promotion_changed",
        "submission_source_kill_switch",
        "submission_source_kill_switch",
        "submission_source_promotion_changed",
    ]
    assert [event.operational_outcome for event in events] == [
        "promoted",
        "kill_switch_disabled",
        "kill_switch_enabled",
        "demoted",
    ]
    assert {event.operational_dimension for event in events} == {"employer_ats"}
    serialized = str([event.__dict__ for event in events])
    assert source.source_key not in serialized
    assert source.display_name not in serialized
    assert actor.id not in serialized

    with pytest.raises(ValidationError):
        record_activation_event(
            db,
            event_name="submission_source_promotion_changed",
            operational_dimension="employer_ats",
            operational_outcome="promoted",
            source_key=source.source_key,
        )
    with pytest.raises(ValidationError, match="matching outcome"):
        record_activation_event(
            db,
            event_name="submission_source_promotion_changed",
            operational_dimension="employer_ats",
            operational_outcome="kill_switch_enabled",
        )
    with pytest.raises(ValidationError, match="only for submission-source"):
        record_activation_event(
            db,
            event_name="r10_import_outcome",
            operational_dimension="employer_ats",
            operational_outcome="promoted",
        )


def test_admin_registry_exposes_dark_submission_governance_read_only(client, db):
    actor = _admin(db)
    source = _accepted_discovery_source(db, actor)
    governance = register_submission_governance(db, source)
    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="accepted"),
        actor=actor,
    )
    record_submission_contract(db, governance, _contract(), actor=actor)
    headers = {"Authorization": f"Bearer {create_access_token(actor.id)}"}

    response = client.get(f"{PREFIX}/admin/discovery-sources", headers=headers)

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["submission_governance"] == {
        "id": governance.id,
        "legal_terms_status": "accepted",
        "legal_terms_reviewed_at": governance.legal_terms_reviewed_at.replace(
            tzinfo=governance.legal_terms_reviewed_at.tzinfo or UTC
        )
        .isoformat()
        .replace("+00:00", "Z"),
        "legal_terms_reviewed_by": actor.id,
        "contract_status": "verified",
        "contract_version": "synthetic-ats/v1",
        "contract_fields": [
            {
                "source_field": "candidate_name",
                "packet_field": "candidate.full_name",
                "required": True,
            },
            {
                "source_field": "candidate_email",
                "packet_field": "candidate.email",
                "required": True,
            },
            {
                "source_field": "resume",
                "packet_field": "documents.resume",
                "required": True,
            },
        ],
        "contract_formats": [
            {"source_field": "candidate_name", "kind": "utf8_text"},
            {"source_field": "candidate_email", "kind": "email"},
            {"source_field": "resume", "kind": "pdf"},
        ],
        "contract_error_semantics": [
            {
                "source_code": "accepted",
                "meaning": "accepted",
                "handling": "confirm_success",
            },
            {
                "source_code": "invalid_field",
                "meaning": "validation_error",
                "handling": "stop_and_return",
            },
            {
                "source_code": "challenge_required",
                "meaning": "challenge",
                "handling": "stop_and_return",
            },
            {
                "source_code": "temporarily_unavailable",
                "meaning": "transient_failure",
                "handling": "retry_with_source_idempotency",
            },
        ],
        "contract_reviewed_at": governance.contract_reviewed_at.replace(
            tzinfo=governance.contract_reviewed_at.tzinfo or UTC
        )
        .isoformat()
        .replace("+00:00", "Z"),
        "contract_reviewed_by": actor.id,
        "promoted": False,
        "promoted_at": None,
        "promoted_by": None,
        "kill_switch": True,
        "submission_allowed": False,
        "created_at": governance.created_at.replace(
            tzinfo=governance.created_at.tzinfo or UTC
        )
        .isoformat()
        .replace("+00:00", "Z"),
        "updated_at": governance.updated_at.replace(
            tzinfo=governance.updated_at.tzinfo or UTC
        )
        .isoformat()
        .replace("+00:00", "Z"),
    }
