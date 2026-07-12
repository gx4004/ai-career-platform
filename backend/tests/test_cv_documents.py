import pytest

from app.auth.security import hash_password
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.user import User

PREFIX = "/api/v1/cv-documents"


@pytest.fixture
def second_user(db):
    user = User(email="cv-other@example.com", hashed_password=hash_password("password123"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def confirmed_evidence(db, test_user):
    item = EvidenceItem(
        user_id=test_user.id,
        kind="achievement",
        content={"statement": "Improved a synthetic process by 20%."},
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _section(evidence_id: str, *, body: str = "Improved a synthetic process by 20%."):
    return {
        "id": "section-achievements",
        "kind": "achievements",
        "title": "Achievements",
        "visible": True,
        "position": 0,
        "entries": [
            {
                "id": "entry-one",
                "evidence_item_id": evidence_id,
                "body": body,
                "position": 0,
            }
        ],
    }


def test_owner_can_create_edit_snapshot_and_restore_without_mutating_variants(
    client, auth_headers, confirmed_evidence
):
    created_response = client.post(
        PREFIX,
        json={"name": "Primary CV", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    )
    assert created_response.status_code == 201
    created = created_response.json()
    assert created["variants"][0]["name"] == "Base"
    base_id = created["variants"][0]["id"]

    edited_sections = [_section(confirmed_evidence.id, body="A reviewed editorial phrasing.")]
    edited = client.patch(
        f"{PREFIX}/{created['id']}",
        json={"sections": edited_sections},
        headers=auth_headers,
    )
    assert edited.status_code == 200
    assert edited.json()["sections"] == edited_sections

    snapshot = client.post(
        f"{PREFIX}/{created['id']}/variants",
        json={"name": "Platform role", "target_role": "Platform Engineer"},
        headers=auth_headers,
    )
    assert snapshot.status_code == 201
    snapshot_id = snapshot.json()["id"]
    assert snapshot.json()["target_role"] == "Platform Engineer"

    client.patch(
        f"{PREFIX}/{created['id']}",
        json={"sections": [_section(confirmed_evidence.id, body="Later draft.")]},
        headers=auth_headers,
    )
    restored = client.post(
        f"{PREFIX}/{created['id']}/variants/{snapshot_id}/restore",
        headers=auth_headers,
    )
    assert restored.status_code == 200
    assert restored.json()["sections"] == edited_sections

    base_restored = client.post(
        f"{PREFIX}/{created['id']}/variants/{base_id}/restore",
        headers=auth_headers,
    )
    assert base_restored.status_code == 200
    assert base_restored.json()["sections"] == [_section(confirmed_evidence.id)]

    fetched = client.get(f"{PREFIX}/{created['id']}", headers=auth_headers).json()
    snapshots = {variant["id"]: variant for variant in fetched["variants"]}
    assert snapshots[snapshot_id]["sections"] == edited_sections
    assert snapshots[base_id]["sections"] == [_section(confirmed_evidence.id)]


def test_documents_are_authenticated_owner_only(
    client, auth_headers, db, second_user, confirmed_evidence
):
    assert client.get(PREFIX).status_code in (401, 403)
    foreign = CvDocument(user_id=second_user.id, name="Private", sections=[])
    db.add(foreign)
    db.commit()
    db.refresh(foreign)
    assert client.get(f"{PREFIX}/{foreign.id}", headers=auth_headers).status_code == 404
    assert (
        client.patch(
            f"{PREFIX}/{foreign.id}", json={"name": "Nope"}, headers=auth_headers
        ).status_code
        == 404
    )


def test_document_entries_require_confirmed_owner_evidence(
    client, auth_headers, db, test_user, second_user
):
    unconfirmed = EvidenceItem(
        user_id=test_user.id,
        kind="skill",
        content={"name": "Synthetic skill"},
        provenance="user-entered",
        confirmation_state="unconfirmed",
    )
    foreign = EvidenceItem(
        user_id=second_user.id,
        kind="skill",
        content={"name": "Foreign skill"},
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    db.add_all([unconfirmed, foreign])
    db.commit()

    for item in (unconfirmed, foreign):
        response = client.post(
            PREFIX,
            json={"name": "Invalid", "sections": [_section(item.id)]},
            headers=auth_headers,
        )
        assert response.status_code == 422


def test_account_deletion_cascades_documents_and_variants(
    client, auth_headers, db, test_user, confirmed_evidence
):
    document = client.post(
        PREFIX,
        json={"name": "Delete me", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    client.post(
        f"{PREFIX}/{document['id']}/variants",
        json={"name": "Snapshot"},
        headers=auth_headers,
    )
    response = client.post(
        "/api/v1/auth/me/delete",
        json={"confirmation": test_user.email},
        headers=auth_headers,
    )
    assert response.status_code == 204
    assert db.query(CvDocument).count() == 0
    assert db.query(CvVariant).count() == 0


def test_export_is_owner_scoped_and_contains_recoverable_snapshots(
    client, auth_headers, confirmed_evidence
):
    document = client.post(
        PREFIX,
        json={"name": "Portable", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    exported = client.get(f"{PREFIX}/export", headers=auth_headers)
    assert exported.status_code == 200
    payload = exported.json()
    assert payload["schema_version"] == "cv-documents-export/v1"
    assert payload["document_count"] == 1
    assert payload["documents"][0]["id"] == document["id"]
    assert payload["documents"][0]["variants"][0]["name"] == "Base"
