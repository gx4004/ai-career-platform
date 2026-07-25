from datetime import UTC

import pytest
from pydantic import ValidationError

from app.auth.security import create_access_token, hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.services.analytics import record_activation_event
from app.services.discovery_sources import (
    IngestionRefusal,
    SourceIngestionRefused,
    register_source,
    require_ingestion_allowed,
    update_source,
)

PREFIX = "/api/v1"


@pytest.fixture
def admin_headers(db):
    admin = User(
        email="discovery-admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Discovery Admin",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def _source_body() -> DiscoverySourceCreate:
    return DiscoverySourceCreate(
        source_key="licensed-example",
        display_name="Licensed Example Feed",
        source_family="licensed",
        owner="Discovery Operations",
        allowed_behavior="feed",
        endpoint_url="https://fixture.example/jobs",
        allowed_query_parameters=["role", "location"],
        robots_policy="required",
        rate_limit_per_minute=12,
        attribution_rule="Show source name and original link",
        retention_days=30,
    )


def _reviewer(db) -> User:
    reviewer = User(
        email="legal-reviewer@example.com",
        hashed_password=hash_password("password123"),
        full_name="Legal Reviewer",
        is_admin=True,
    )
    db.add(reviewer)
    db.commit()
    db.refresh(reviewer)
    return reviewer


def test_ingestion_refuses_unregistered_pending_failed_and_killed_sources(db):
    reviewer = _reviewer(db)
    with pytest.raises(SourceIngestionRefused) as unregistered:
        require_ingestion_allowed(db, "missing", "feed")
    assert unregistered.value.reason == IngestionRefusal.UNREGISTERED

    source = register_source(db, _source_body())
    assert source.terms_status == "pending"
    assert source.kill_switch is True
    with pytest.raises(SourceIngestionRefused) as pending:
        require_ingestion_allowed(db, source.source_key, "feed")
    assert pending.value.reason == IngestionRefusal.TERMS_NOT_ACCEPTED

    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="failed"),
        actor=reviewer,
    )
    with pytest.raises(SourceIngestionRefused) as failed:
        require_ingestion_allowed(db, source.source_key, "feed")
    assert failed.value.reason == IngestionRefusal.TERMS_NOT_ACCEPTED

    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="accepted"),
        actor=reviewer,
    )
    assert source.terms_reviewed_by == reviewer.id
    assert source.terms_reviewed_at is not None
    with pytest.raises(SourceIngestionRefused) as killed:
        require_ingestion_allowed(db, source.source_key, "feed")
    assert killed.value.reason == IngestionRefusal.KILL_SWITCHED

    update_source(db, source, DiscoverySourceUpdate(kill_switch=False))
    authorization = require_ingestion_allowed(db, source.source_key, "feed")
    assert authorization.source_id == source.id
    assert authorization.rate_limit_per_minute == 12
    assert authorization.retention_days == 30
    assert authorization.endpoint_url == "https://fixture.example/jobs"
    assert authorization.allowed_query_parameters == ("role", "location")
    assert authorization.robots_policy == "required"
    with pytest.raises(SourceIngestionRefused) as wrong_behavior:
        require_ingestion_allowed(db, source.source_key, "api")
    assert wrong_behavior.value.reason == IngestionRefusal.BEHAVIOR_NOT_ALLOWED


def test_source_cannot_activate_before_accepted_terms_review(db):
    source = register_source(db, _source_body())
    with pytest.raises(ValueError, match="cannot activate"):
        update_source(db, source, DiscoverySourceUpdate(kill_switch=False))
    assert source.kill_switch is True
    with pytest.raises(ValueError, match="authenticated admin reviewer"):
        update_source(db, source, DiscoverySourceUpdate(terms_status="accepted"))


def test_registry_changes_emit_only_bounded_family_and_outcome(db):
    reviewer = _reviewer(db)
    source = register_source(db, _source_body())
    update_source(
        db,
        source,
        DiscoverySourceUpdate(terms_status="accepted"),
        actor=reviewer,
    )
    update_source(db, source, DiscoverySourceUpdate(kill_switch=False))

    events = (
        db.query(AnalyticsEvent)
        .filter_by(event_name="discovery_source_registry_changed")
        .order_by(AnalyticsEvent.created_at)
        .all()
    )
    assert [event.operational_dimension for event in events] == [
        "licensed",
        "licensed",
        "licensed",
    ]
    assert [event.operational_outcome for event in events] == [
        "registered",
        "terms_updated",
        "kill_switch_disabled",
    ]
    assert source.source_key not in str([event.__dict__ for event in events])
    assert source.display_name not in str([event.__dict__ for event in events])
    with pytest.raises(ValidationError):
        record_activation_event(
            db,
            event_name="discovery_source_registry_changed",
            operational_dimension="licensed",
            operational_outcome="registered",
            source_key=source.source_key,
        )


def test_admin_registry_view_is_read_only_and_complete(client, db, admin_headers, auth_headers):
    source = register_source(db, _source_body())
    endpoint = f"{PREFIX}/admin/discovery-sources"
    assert client.get(endpoint).status_code == 401
    assert client.get(endpoint, headers=auth_headers).status_code == 403

    response = client.get(endpoint, headers=admin_headers)
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item == {
        "id": source.id,
        "source_key": "licensed-example",
        "display_name": "Licensed Example Feed",
        "source_family": "licensed",
        "owner": "Discovery Operations",
        "terms_status": "pending",
        "terms_reviewed_at": None,
        "terms_reviewed_by": None,
        "allowed_behavior": "feed",
        "endpoint_url": "https://fixture.example/jobs",
        "allowed_query_parameters": ["role", "location"],
        "robots_policy": "required",
        "rate_limit_per_minute": 12,
        "attribution_rule": "Show source name and original link",
        "retention_days": 30,
        "kill_switch": True,
        "ingestion_allowed": False,
        "submission_governance": None,
        "created_at": source.created_at.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z"),
        "updated_at": source.updated_at.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z"),
    }
    assert client.post(endpoint, headers=admin_headers, json={}).status_code == 405
