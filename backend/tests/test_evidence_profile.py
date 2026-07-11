import pytest

from app.auth.security import hash_password
from app.models.evidence_item import EvidenceItem
from app.models.user import User

PREFIX = "/api/v1/evidence-profile/items"


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
