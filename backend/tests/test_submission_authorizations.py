import json
from datetime import UTC
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from app.auth.security import create_access_token, hash_password
from app.models.submission_authorization import SubmissionAuthorizationGrant
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.schemas.submission_authorizations import VerifiedSourceAuthorization
from app.schemas.submission_sources import (
    SubmissionCompatibilityContract,
    SubmissionLegalTermsReview,
)
from app.services.discovery_sources import (
    operate_source_kill_switch,
    register_source,
    update_source,
)
from app.services.submission_authorizations import (
    SubmissionAuthorizationRefusal,
    UserSubmissionNotAuthorized,
    list_submission_authorizations,
    record_submission_authorization,
    require_active_submission_authorization,
    revoke_submission_authorization,
)
from app.services.submission_sources import (
    SourceSubmissionRefused,
    operate_submission_kill_switch,
    promote_submission_source,
    record_submission_contract,
    register_submission_governance,
    review_submission_legal_terms,
)

PREFIX = "/api/v1"
FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "submission_contracts"
    / "synthetic_ats_v1.json"
)


def _user(db, email: str, *, admin: bool = False) -> User:
    user = User(
        email=email,
        hashed_password=hash_password("password123"),
        full_name="Authorization Test User",
        is_admin=admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _promoted_source(db, actor: User, source_key: str = "synthetic-user-auth"):
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key=source_key,
            display_name="Synthetic User Authorization ATS",
            source_family="employer_ats",
            owner="Submission Operations",
            allowed_behavior="ats_integration",
            endpoint_url="https://synthetic-ats.invalid/applications",
            allowed_query_parameters=[],
            robots_policy="not_applicable",
            rate_limit_per_minute=10,
            attribution_rule="Show the synthetic source fixture",
            retention_days=30,
        ),
    )
    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="accepted"),
        actor=actor,
    )
    operate_source_kill_switch(db, source, tripped=False, actor=actor)
    governance = register_submission_governance(db, source)
    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="accepted"),
        actor=actor,
    )
    record_submission_contract(
        db,
        governance,
        SubmissionCompatibilityContract.model_validate(
            json.loads(FIXTURE_PATH.read_text())
        ),
        actor=actor,
    )
    promote_submission_source(db, governance, promoted=True, actor=actor)
    operate_submission_kill_switch(db, governance, tripped=False, actor=actor)
    return source


def _proof() -> VerifiedSourceAuthorization:
    return VerifiedSourceAuthorization(
        mechanism="oauth2_authorization_code",
        scope="submit_applications",
        user_consent_confirmed=True,
    )


def test_authorization_proof_has_no_credential_or_session_shape():
    proof = _proof()
    assert proof.model_dump() == {
        "mechanism": "oauth2_authorization_code",
        "scope": "submit_applications",
        "user_consent_confirmed": True,
    }

    for forbidden in (
        {"password": "nope"},
        {"session_cookie": "nope"},
        {"access_token": "nope"},
        {"refresh_token": "nope"},
    ):
        with pytest.raises(ValidationError):
            VerifiedSourceAuthorization.model_validate(
                {**proof.model_dump(), **forbidden}
            )

    assert set(SubmissionAuthorizationGrant.__table__.columns.keys()) == {
        "id",
        "user_id",
        "discovery_source_id",
        "mechanism",
        "scope",
        "granted_at",
    }


def test_grant_is_explicit_per_source_and_requires_the_source_gate(db, test_user):
    actor = _user(db, "authorization-admin@example.com", admin=True)
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key="not-promoted",
            display_name="Not Promoted",
            source_family="employer_ats",
            owner="Submission Operations",
            allowed_behavior="ats_integration",
            endpoint_url="https://synthetic-ats.invalid/applications",
            allowed_query_parameters=[],
            robots_policy="not_applicable",
            rate_limit_per_minute=10,
            attribution_rule="Show the synthetic source fixture",
            retention_days=30,
        ),
    )

    with pytest.raises(SourceSubmissionRefused):
        record_submission_authorization(
            db,
            user_id=test_user.id,
            source_key=source.source_key,
            authorization=_proof(),
        )

    promoted = _promoted_source(db, actor, "promoted-user-auth")
    grant = record_submission_authorization(
        db,
        user_id=test_user.id,
        source_key=promoted.source_key,
        authorization=_proof(),
    )

    assert grant.user_id == test_user.id
    assert grant.discovery_source_id == promoted.id
    assert grant.mechanism == "oauth2_authorization_code"
    assert grant.scope == "submit_applications"


def test_no_http_route_can_fabricate_a_grant(client, auth_headers):
    response = client.post(
        f"{PREFIX}/submission-authorizations",
        headers=auth_headers,
        json=_proof().model_dump(),
    )

    assert response.status_code == 405


def test_active_grants_are_visible_only_to_their_owner(client, db, test_user, auth_headers):
    actor = _user(db, "visibility-admin@example.com", admin=True)
    source = _promoted_source(db, actor)
    grant = record_submission_authorization(
        db,
        user_id=test_user.id,
        source_key=source.source_key,
        authorization=_proof(),
    )
    other = _user(db, "other-grant-owner@example.com")
    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}

    owner_response = client.get(
        f"{PREFIX}/submission-authorizations",
        headers=auth_headers,
    )
    other_response = client.get(
        f"{PREFIX}/submission-authorizations",
        headers=other_headers,
    )

    assert owner_response.status_code == 200
    assert owner_response.json() == {
        "items": [
            {
                "id": grant.id,
                "source_id": source.id,
                "source_key": source.source_key,
                "source_display_name": source.display_name,
                "source_family": "employer_ats",
                "mechanism": "oauth2_authorization_code",
                "scope": "submit_applications",
                "granted_at": grant.granted_at.replace(tzinfo=UTC)
                .isoformat()
                .replace("+00:00", "Z"),
            }
        ]
    }
    assert other_response.status_code == 200
    assert other_response.json() == {"items": []}


def test_revocation_halts_queued_and_in_flight_work_and_regrant_does_not_revive_it(
    db,
    test_user,
):
    actor = _user(db, "revocation-admin@example.com", admin=True)
    source = _promoted_source(db, actor)
    grant = record_submission_authorization(
        db,
        user_id=test_user.id,
        source_key=source.source_key,
        authorization=_proof(),
    )
    queued_grant_id = grant.id
    in_flight = require_active_submission_authorization(
        db,
        user_id=test_user.id,
        source_id=source.id,
        grant_id=grant.id,
    )
    assert in_flight.grant_id == grant.id

    OtherSession = sessionmaker(bind=db.get_bind(), autocommit=False, autoflush=False)
    other = OtherSession()
    try:
        assert revoke_submission_authorization(
            other,
            user_id=test_user.id,
            grant_id=grant.id,
        )

        for stale_grant_id in (queued_grant_id, in_flight.grant_id):
            with pytest.raises(UserSubmissionNotAuthorized) as refused:
                require_active_submission_authorization(
                    db,
                    user_id=test_user.id,
                    source_id=source.id,
                    grant_id=stale_grant_id,
                )
            assert (
                refused.value.reason
                == SubmissionAuthorizationRefusal.GRANT_NOT_ACTIVE
            )

        replacement = record_submission_authorization(
            other,
            user_id=test_user.id,
            source_key=source.source_key,
            authorization=_proof(),
        )
        assert replacement.id != queued_grant_id
        with pytest.raises(UserSubmissionNotAuthorized):
            require_active_submission_authorization(
                db,
                user_id=test_user.id,
                source_id=source.id,
                grant_id=queued_grant_id,
            )
        assert (
            require_active_submission_authorization(
                db,
                user_id=test_user.id,
                source_id=source.id,
                grant_id=replacement.id,
            ).grant_id
            == replacement.id
        )
    finally:
        other.close()


def test_revoke_endpoint_is_owner_scoped_and_removes_the_grant(
    client,
    db,
    test_user,
    auth_headers,
):
    actor = _user(db, "revoke-api-admin@example.com", admin=True)
    source = _promoted_source(db, actor)
    grant = record_submission_authorization(
        db,
        user_id=test_user.id,
        source_key=source.source_key,
        authorization=_proof(),
    )
    other = _user(db, "revoke-api-other@example.com")
    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}

    assert (
        client.delete(
            f"{PREFIX}/submission-authorizations/{grant.id}",
            headers=other_headers,
        ).status_code
        == 204
    )
    assert len(list_submission_authorizations(db, test_user.id)) == 1

    assert (
        client.delete(
            f"{PREFIX}/submission-authorizations/{grant.id}",
            headers=auth_headers,
        ).status_code
        == 204
    )
    assert list_submission_authorizations(db, test_user.id) == []


def test_grants_are_exported_and_account_deletion_removes_them(
    client,
    db,
    test_user,
    auth_headers,
):
    actor = _user(db, "lifecycle-admin@example.com", admin=True)
    source = _promoted_source(db, actor)
    grant = record_submission_authorization(
        db,
        user_id=test_user.id,
        source_key=source.source_key,
        authorization=_proof(),
    )

    exported = client.get(
        f"{PREFIX}/evidence-profile/export",
        headers=auth_headers,
    )

    assert exported.status_code == 200
    assert exported.json()["submission_authorizations"] == {
        "schema_version": "submission-authorizations-export/v1",
        "grant_count": 1,
        "grants": [
            {
                "id": grant.id,
                "source_id": source.id,
                "source_key": source.source_key,
                "source_display_name": source.display_name,
                "source_family": "employer_ats",
                "mechanism": "oauth2_authorization_code",
                "scope": "submit_applications",
                "granted_at": grant.granted_at.replace(tzinfo=UTC)
                .isoformat()
                .replace("+00:00", "Z"),
            }
        ],
    }

    deleted = client.post(
        f"{PREFIX}/auth/me/delete",
        headers=auth_headers,
        json={"confirmation": test_user.email},
    )

    assert deleted.status_code == 204
    assert db.query(SubmissionAuthorizationGrant).count() == 0
