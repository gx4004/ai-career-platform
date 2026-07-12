import pytest

from app.auth.security import hash_password
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.tool_run import ToolRun
from app.models.user import User
from app.routers.cv_documents import CV_QUALITY_MODEL_RUN_LIMIT

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


def test_owner_can_score_quality_and_rerun_one_named_ats_check(
    client, auth_headers, confirmed_evidence
):
    sections = [
        _section(confirmed_evidence.id),
        {
            "id": "section-skills",
            "kind": "skills",
            "title": "Skills",
            "visible": True,
            "position": 1,
            "entries": [
                {
                    "id": "skill-one",
                    "evidence_item_id": confirmed_evidence.id,
                    "body": "Python, PostgreSQL, accessibility",
                    "position": 0,
                }
            ],
        },
    ]
    document = client.post(
        PREFIX, json={"name": "Quality fixture", "sections": sections}, headers=auth_headers
    ).json()

    response = client.post(
        f"{PREFIX}/{document['id']}/quality",
        json={"use_model": False, "checks": ["section_structure"]},
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert {dimension["key"] for dimension in payload["dimensions"]} == {
        "impact",
        "clarity",
        "completeness",
        "structure",
    }
    assert all(dimension["reasons"] for dimension in payload["dimensions"])
    assert [check["key"] for check in payload["ats_checks"]] == ["section_structure"]
    assert payload["ats_checks"][0]["remediation"]
    assert payload["advisory_note"].startswith("Quality scores are directional")


def test_quality_endpoint_is_authenticated_and_owner_isolated(
    client, auth_headers, db, second_user
):
    foreign = CvDocument(user_id=second_user.id, name="Private quality", sections=[])
    db.add(foreign)
    db.commit()
    assert (
        client.post(f"{PREFIX}/{foreign.id}/quality", json={"use_model": False}).status_code == 401
    )
    assert (
        client.post(
            f"{PREFIX}/{foreign.id}/quality", json={"use_model": False}, headers=auth_headers
        ).status_code
        == 404
    )


def test_model_quality_uses_shared_pipeline_and_enforces_document_quota(
    client, auth_headers, db, test_user, confirmed_evidence, monkeypatch
):
    document = client.post(
        PREFIX,
        json={"name": "Bounded", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    for index in range(CV_QUALITY_MODEL_RUN_LIMIT):
        db.add(
            ToolRun(
                user_id=test_user.id,
                tool_name="cv-quality",
                label=f"CV quality model · {document['id']}",
                result_payload={"index": index},
            )
        )
    db.commit()
    response = client.post(
        f"{PREFIX}/{document['id']}/quality", json={"use_model": True}, headers=auth_headers
    )
    assert response.status_code == 429
    assert "Deterministic checks remain available" in response.json()["detail"]


def test_model_quality_delegates_to_shared_pipeline(
    client, auth_headers, confirmed_evidence, monkeypatch
):
    document = client.post(
        PREFIX,
        json={"name": "Pipeline seam", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    captured = {}

    async def pipeline(**kwargs):
        captured.update(kwargs)
        return {
            "schema_version": "cv-quality/v1",
            "dimensions": [
                {
                    "key": "impact",
                    "label": "Evidence of impact",
                    "score": 60,
                    "reasons": ["Synthetic reason."],
                    "remediation": "Synthetic fix.",
                }
            ],
            "ats_checks": [],
            "scoring_mode": "blended",
            "advisory_note": "Directional guidance only.",
            "history_id": "run-one",
            "access_mode": "authenticated",
            "saved": True,
            "locked_actions": [],
        }

    monkeypatch.setattr("app.routers.cv_documents.run_tool_pipeline", pipeline)
    response = client.post(
        f"{PREFIX}/{document['id']}/quality", json={"use_model": True}, headers=auth_headers
    )
    assert response.status_code == 200
    assert captured["tool_name"] == "cv-quality"
    assert captured["current_user"].id
    assert captured["service_fn"].__name__ == "analyze_cv_quality"
