import pytest

from app.auth.security import hash_password
from app.models.analytics_event import AnalyticsEvent
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.user import User
from app.schemas.data_export import CareerDataExport

PREFIX = "/api/v1/evidence-profile/items"
EXPORT = "/api/v1/evidence-profile/export"


@pytest.fixture
def second_user(db):
    user = User(email="second@example.com", hashed_password=hash_password("password123"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _payload(**overrides):
    payload = {
        "kind": "achievement",
        "content": {"statement": "Improved a synthetic process by 20%."},
        "provenance": "user-entered",
    }
    payload.update(overrides)
    return payload


def test_owner_can_crud_evidence_items(client, auth_headers, test_user, db):
    created = client.post(PREFIX, json=_payload(), headers=auth_headers)
    assert created.status_code == 201
    item = created.json()
    assert item["confirmation_state"] == "unconfirmed"

    listed = client.get(PREFIX, headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["items"] == [item]

    updated = client.patch(
        f"{PREFIX}/{item['id']}",
        json={"content": {"statement": "Improved a synthetic process by 25%."}},
        headers=auth_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["content"]["statement"].endswith("25%.")

    fetched = client.get(f"{PREFIX}/{item['id']}", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.json() == updated.json()

    deleted = client.delete(f"{PREFIX}/{item['id']}", headers=auth_headers)
    assert deleted.status_code == 204
    assert db.query(EvidenceItem).count() == 0


def test_items_are_owner_isolated(client, auth_headers, test_user, second_user, db):
    foreign = EvidenceItem(
        user_id=second_user.id,
        kind="skill",
        content={"name": "Synthetic skill"},
        provenance="user-entered",
        confirmation_state="unconfirmed",
    )
    db.add(foreign)
    db.commit()

    assert client.get(PREFIX, headers=auth_headers).json()["items"] == []
    assert client.get(f"{PREFIX}/{foreign.id}", headers=auth_headers).status_code == 404
    assert (
        client.patch(
            f"{PREFIX}/{foreign.id}", json={"kind": "project"}, headers=auth_headers
        ).status_code
        == 404
    )
    assert client.delete(f"{PREFIX}/{foreign.id}", headers=auth_headers).status_code == 404


def test_guests_have_no_profile_surface(client):
    assert client.get(PREFIX).status_code in (401, 403)
    assert client.post(PREFIX, json=_payload()).status_code in (401, 403)


def test_confirmation_requires_dedicated_explicit_user_action(client, auth_headers):
    direct = client.post(
        PREFIX,
        json=_payload(confirmation_state="confirmed"),
        headers=auth_headers,
    )
    assert direct.status_code == 422

    created = client.post(PREFIX, json=_payload(), headers=auth_headers).json()
    update = client.patch(
        f"{PREFIX}/{created['id']}",
        json={"confirmation_state": "confirmed"},
        headers=auth_headers,
    )
    assert update.status_code == 422

    confirmed = client.post(
        f"{PREFIX}/{created['id']}/confirmation",
        json={"action": "confirm"},
        headers=auth_headers,
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["confirmation_state"] == "confirmed"

    rejected = client.post(
        f"{PREFIX}/{created['id']}/confirmation",
        json={"action": "reject"},
        headers=auth_headers,
    )
    assert rejected.status_code == 200
    assert rejected.json()["confirmation_state"] == "rejected"


def test_editing_a_confirmed_item_resets_trust(client, auth_headers):
    created = client.post(PREFIX, json=_payload(), headers=auth_headers).json()
    client.post(
        f"{PREFIX}/{created['id']}/confirmation",
        json={"action": "confirm"},
        headers=auth_headers,
    )
    edited = client.patch(
        f"{PREFIX}/{created['id']}",
        json={"content": {"statement": "A materially different synthetic claim."}},
        headers=auth_headers,
    )
    assert edited.status_code == 200
    assert edited.json()["confirmation_state"] == "unconfirmed"


def test_all_typed_kinds_and_provenance_values_are_accepted(client, auth_headers):
    kinds = [
        "experience",
        "achievement",
        "skill",
        "education",
        "project",
        "certification",
        "preference",
        "interview-evidence",
    ]
    provenance = ["imported", "inferred", "user-entered"]
    for index, kind in enumerate(kinds):
        response = client.post(
            PREFIX,
            json=_payload(kind=kind, provenance=provenance[index % 3]),
            headers=auth_headers,
        )
        assert response.status_code == 201


def test_account_deletion_cascades_to_evidence_items(client, auth_headers, test_user, db):
    client.post(PREFIX, json=_payload(), headers=auth_headers)
    assert db.query(EvidenceItem).filter_by(user_id=test_user.id).count() == 1
    response = client.post(
        "/api/v1/auth/me/delete",
        json={"confirmation": test_user.email},
        headers=auth_headers,
    )
    assert response.status_code == 204
    assert db.query(EvidenceItem).filter_by(user_id=test_user.id).count() == 0


def test_account_deletion_reports_evidence_count_in_audit_log(
    client, auth_headers, test_user, db, monkeypatch
):
    captured = {}

    def fake_log(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("app.services.tool_runs.log_user_account_deleted", fake_log)

    client.post(PREFIX, json=_payload(), headers=auth_headers)
    client.post(PREFIX, json=_payload(), headers=auth_headers)

    response = client.post(
        "/api/v1/auth/me/delete",
        json={"confirmation": test_user.email},
        headers=auth_headers,
    )
    assert response.status_code == 204
    # The deletion cascade over profile rows happens inside the same transactional
    # erasure path and its count reaches the RODO/GDPR audit line (D-031, D-065).
    assert captured["evidence_items_deleted"] == 2
    assert captured["user_record_deleted"] is True


def test_export_returns_full_schema_valid_profile(client, auth_headers):
    created = client.post(PREFIX, json=_payload(), headers=auth_headers).json()
    client.post(
        f"{PREFIX}/{created['id']}/confirmation",
        json={"action": "confirm"},
        headers=auth_headers,
    )

    response = client.get(EXPORT, headers=auth_headers)
    assert response.status_code == 200

    # The documented published schema is the Pydantic model surfaced in OpenAPI;
    # the payload must validate against it, provenance + confirmation state included.
    export = CareerDataExport.model_validate(response.json())
    assert export.schema_version == "career-data-export/v1"
    assert export.item_count == 1
    item = export.items[0]
    assert item.id == created["id"]
    assert item.provenance == "user-entered"
    assert item.confirmation_state == "confirmed"


def test_export_includes_schema_valid_documents_and_immutable_variants(
    client, auth_headers, db, test_user
):
    document = CvDocument(user_id=test_user.id, name="Portable CV", sections=[])
    document.variants.append(CvVariant(name="Base", sections=[]))
    document.variants.append(CvVariant(name="Target role", target_role="Engineer", sections=[]))
    db.add(document)
    db.commit()
    exported = CareerDataExport.model_validate(client.get(EXPORT, headers=auth_headers).json())
    assert exported.cv_documents.document_count == 1
    assert [variant.name for variant in exported.cv_documents.documents[0].variants] == [
        "Base",
        "Target role",
    ]
    assert exported.cv_documents.documents[0].quality_model_runs == 0
    assert exported.cv_documents.documents[0].tailoring_model_runs == 0
    assert "proposal_token" not in exported.model_dump_json()


def test_export_is_owner_scoped(client, auth_headers, test_user, second_user, db):
    db.add(
        EvidenceItem(
            user_id=second_user.id,
            kind="skill",
            content={"name": "Synthetic skill"},
            provenance="user-entered",
            confirmation_state="confirmed",
        )
    )
    db.commit()

    export = CareerDataExport.model_validate(
        client.get(EXPORT, headers=auth_headers).json()
    )
    assert export.item_count == 0
    assert export.items == []


# --- R11 profile-adoption telemetry emitted from the service seam (#150) ---


def _profile_events(db):
    return (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name.like("profile_item_%"))
        .order_by(AnalyticsEvent.created_at.asc())
        .all()
    )


def test_profile_lifecycle_emits_allowlisted_events(client, auth_headers, db):
    """Creating, editing, confirming, rejecting, and deleting an item each emit
    exactly one allowlisted low-cardinality event from the shared write seam —
    carrying kind, provenance, and the confirmation transition, never content."""
    secret = "Led the migration at Acme Corp for MIT alumni."
    created = client.post(
        PREFIX,
        json=_payload(kind="experience", provenance="imported", content={"statement": secret}),
        headers=auth_headers,
    ).json()
    client.patch(
        f"{PREFIX}/{created['id']}",
        json={"content": {"statement": secret + " (revised)"}},
        headers=auth_headers,
    )
    client.post(
        f"{PREFIX}/{created['id']}/confirmation",
        json={"action": "confirm"},
        headers=auth_headers,
    )
    client.post(
        f"{PREFIX}/{created['id']}/confirmation",
        json={"action": "reject"},
        headers=auth_headers,
    )
    client.delete(f"{PREFIX}/{created['id']}", headers=auth_headers)

    events = _profile_events(db)
    names = [e.event_name for e in events]
    assert names == [
        "profile_item_created",
        "profile_item_updated",
        "profile_item_confirmed",
        "profile_item_rejected",
        "profile_item_deleted",
    ]

    created_ev, updated_ev, confirmed_ev, rejected_ev, deleted_ev = events
    assert (created_ev.evidence_kind, created_ev.evidence_provenance) == ("experience", "imported")
    assert created_ev.confirmation_transition == "unconfirmed"
    assert updated_ev.confirmation_transition == "unconfirmed"
    assert confirmed_ev.confirmation_transition == "confirmed"
    assert rejected_ev.confirmation_transition == "rejected"
    # Deletion has no resulting confirmation state, but still carries the kind.
    assert deleted_ev.confirmation_transition is None
    assert deleted_ev.evidence_kind == "experience"

    # No evidence text, employer, or institution name ever reaches the store.
    for event in events:
        for value in vars(event).values():
            assert secret not in str(value)
            assert "Acme" not in str(value)
            assert "MIT" not in str(value)
            assert created["id"] != str(value)


def test_export_requires_authentication(client):
    assert client.get(EXPORT).status_code in (401, 403)


def test_export_is_rate_limited_like_sensitive_endpoints(client, auth_headers):
    # Matches the 5/minute ceiling on POST /auth/me/delete: the sixth call in the
    # window is rejected before it can dump the profile again.
    statuses = [client.get(EXPORT, headers=auth_headers).status_code for _ in range(6)]
    assert statuses[:5] == [200, 200, 200, 200, 200]
    assert statuses[5] == 429
