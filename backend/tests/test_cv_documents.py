import pytest

from app.auth.security import hash_password
from app.limiter import limiter
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.user import User
from app.routers.cv_documents import CV_QUALITY_MODEL_RUN_LIMIT, CV_TAILORING_MODEL_RUN_LIMIT
from app.schemas.analytics import ActivationEventCreate
from app.services.cv_tailoring import proposal_token

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


def _signed(document_id, user_id, payload):
    payload["proposal_token"] = proposal_token(
        payload["request_id"], document_id, user_id, payload["job_title"], payload["changes"]
    )
    return payload


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


def test_account_deletion_audit_counts_documents_and_variants_explicitly(
    client, auth_headers, db, test_user, confirmed_evidence, monkeypatch
):
    captured = {}
    monkeypatch.setattr(
        "app.services.tool_runs.log_user_account_deleted",
        lambda **fields: captured.update(fields),
    )
    document = client.post(
        PREFIX,
        json={"name": "Audited", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    client.post(
        f"{PREFIX}/{document['id']}/variants",
        json={"name": "Second snapshot"},
        headers=auth_headers,
    )
    response = client.post(
        "/api/v1/auth/me/delete",
        json={"confirmation": test_user.email},
        headers=auth_headers,
    )
    assert response.status_code == 204
    assert captured["cv_documents_deleted"] == 1
    assert captured["cv_variants_deleted"] == 2


def test_owner_can_delete_all_documents_without_deleting_another_owners(
    client, auth_headers, db, second_user, confirmed_evidence
):
    client.post(
        PREFIX, json={"name": "One", "sections": [_section(confirmed_evidence.id)]}, headers=auth_headers
    )
    client.post(
        PREFIX, json={"name": "Two", "sections": [_section(confirmed_evidence.id)]}, headers=auth_headers
    )
    foreign = CvDocument(user_id=second_user.id, name="Foreign", sections=[])
    foreign.variants.append(CvVariant(name="Base", sections=[]))
    db.add(foreign)
    db.commit()
    response = client.delete(PREFIX, headers=auth_headers)
    assert response.status_code == 204
    assert db.query(CvDocument).filter(CvDocument.user_id == second_user.id).count() == 1
    assert client.get(PREFIX, headers=auth_headers).json() == {"items": []}


def test_owner_can_immediately_delete_one_document_and_its_variants(
    client, auth_headers, db, confirmed_evidence
):
    keep = client.post(
        PREFIX, json={"name": "Keep", "sections": [_section(confirmed_evidence.id)]}, headers=auth_headers
    ).json()
    remove = client.post(
        PREFIX, json={"name": "Remove", "sections": [_section(confirmed_evidence.id)]}, headers=auth_headers
    ).json()
    client.post(
        f"{PREFIX}/{remove['id']}/variants", json={"name": "Remove snapshot"}, headers=auth_headers
    )
    variant_ids = [variant.id for variant in db.query(CvVariant).filter_by(document_id=remove["id"])]
    assert client.delete(f"{PREFIX}/{remove['id']}", headers=auth_headers).status_code == 204
    assert client.get(f"{PREFIX}/{remove['id']}", headers=auth_headers).status_code == 404
    assert client.get(f"{PREFIX}/{keep['id']}", headers=auth_headers).status_code == 200
    assert db.query(CvVariant).filter(CvVariant.id.in_(variant_ids)).count() == 0


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
    stored = db.query(CvDocument).filter(CvDocument.id == document["id"]).one()
    stored.quality_model_runs = CV_QUALITY_MODEL_RUN_LIMIT
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
    assert response.json()["remaining_model_runs"] == CV_QUALITY_MODEL_RUN_LIMIT - 1


def test_model_quality_enforces_the_shared_account_cost_limit_across_documents(
    client, auth_headers, confirmed_evidence, monkeypatch
):
    """The per-document quota is a separate, unrelated cap. CV Studio's model
    calls must also count against the same shared per-account/per-source LLM
    cost budget every other tool enforces, or a user can bypass it entirely by
    spreading calls across many documents.
    """
    monkeypatch.setattr("app.limiter.settings.MODEL_COST_LIMIT", "1/minute")
    limiter._storage.reset()

    async def pipeline(**_):
        return {
            "schema_version": "cv-quality/v1",
            "dimensions": [],
            "ats_checks": [],
            "scoring_mode": "blended",
            "advisory_note": "Directional guidance only.",
            "history_id": "run-one",
            "access_mode": "authenticated",
            "saved": True,
            "locked_actions": [],
        }

    monkeypatch.setattr("app.routers.cv_documents.run_tool_pipeline", pipeline)
    first_document = client.post(
        PREFIX,
        json={"name": "First", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    second_document = client.post(
        PREFIX,
        json={"name": "Second", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()

    first = client.post(
        f"{PREFIX}/{first_document['id']}/quality", json={"use_model": True}, headers=auth_headers
    )
    second = client.post(
        f"{PREFIX}/{second_document['id']}/quality", json={"use_model": True}, headers=auth_headers
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_tailoring_enforces_the_shared_account_cost_limit_across_documents(
    client, auth_headers, confirmed_evidence, monkeypatch
):
    monkeypatch.setattr("app.limiter.settings.MODEL_COST_LIMIT", "1/minute")
    limiter._storage.reset()

    async def pipeline(**_):
        return {
            "schema_version": "cv-tailoring/v1",
            "changes": [],
            "request_id": "req-one",
            "job_title": "Engineer",
        }

    monkeypatch.setattr("app.routers.cv_documents.run_tool_pipeline", pipeline)
    first_document = client.post(
        PREFIX,
        json={"name": "First", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    second_document = client.post(
        PREFIX,
        json={"name": "Second", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    payload = {"job_description": "We need a synthetic engineer.", "job_title": "Engineer"}

    first = client.post(
        f"{PREFIX}/{first_document['id']}/tailoring", json=payload, headers=auth_headers
    )
    second = client.post(
        f"{PREFIX}/{second_document['id']}/tailoring", json=payload, headers=auth_headers
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_studio_telemetry_allowlist_rejects_content_and_stable_identifiers():
    assert ActivationEventCreate(event_name="studio_document_deleted").event_name == "studio_document_deleted"
    for field in ("cv_content", "job_description", "document_id", "run_id", "title"):
        with pytest.raises(Exception):
            ActivationEventCreate(event_name="studio_document_deleted", **{field: "private"})


def test_failed_pipeline_still_consumes_document_model_allowance(
    client, auth_headers, db, confirmed_evidence, monkeypatch
):
    document = client.post(
        PREFIX,
        json={"name": "Failed attempt", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()

    async def fail(**_):
        raise RuntimeError("synthetic pipeline failure")

    monkeypatch.setattr("app.routers.cv_documents.run_tool_pipeline", fail)
    with pytest.raises(RuntimeError, match="synthetic pipeline failure"):
        client.post(
            f"{PREFIX}/{document['id']}/quality",
            json={"use_model": True},
            headers=auth_headers,
        )
    db.expire_all()
    stored = db.query(CvDocument).filter(CvDocument.id == document["id"]).one()
    assert stored.quality_model_runs == 1


def test_tailoring_uses_shared_pipeline_and_returns_reviewable_provenance(
    client, auth_headers, confirmed_evidence, monkeypatch
):
    document = client.post(
        PREFIX,
        json={"name": "Tailor", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    captured = {}

    async def pipeline(**kwargs):
        captured.update(kwargs)
        return {
            "schema_version": "cv-tailoring/v1",
            "job_title": "Platform Engineer",
            "changes": [
                {
                    "id": "change-one",
                    "section_id": "section-achievements",
                    "entry_id": "entry-one",
                    "before": "Improved a synthetic process by 20%.",
                    "after": "Improved a synthetic platform process by 20%.",
                    "job_requirement": "Improve platform reliability",
                    "evidence_item_ids": [confirmed_evidence.id],
                    "support": "confirmed",
                }
            ],
            "history_id": "run",
            "access_mode": "authenticated",
            "saved": True,
            "locked_actions": [],
        }

    monkeypatch.setattr("app.routers.cv_documents.run_tool_pipeline", pipeline)
    response = client.post(
        f"{PREFIX}/{document['id']}/tailoring",
        json={
            "job_title": "Platform Engineer",
            "job_description": "Improve platform reliability across distributed services.",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert captured["tool_name"] == "cv-tailoring"
    assert captured["service_fn"].__name__ == "generate_cv_tailoring"
    assert response.json()["changes"][0]["evidence_item_ids"] == [confirmed_evidence.id]
    assert response.json()["remaining_regenerations"] == CV_TAILORING_MODEL_RUN_LIMIT - 1


def test_review_rejects_without_mutating_and_accept_creates_immutable_variant(
    client, auth_headers, test_user, confirmed_evidence
):
    document = client.post(
        PREFIX,
        json={"name": "Review", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    change = {
        "id": "change-one",
        "section_id": "section-achievements",
        "entry_id": "entry-one",
        "before": "Improved a synthetic process by 20%.",
        "after": "Improved platform delivery by 20%.",
        "job_requirement": "Platform delivery",
        "evidence_item_ids": [confirmed_evidence.id],
        "support": "confirmed",
    }
    invented_edit = _signed(
        document["id"],
        test_user.id,
        {
            "request_id": "d5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
            "variant_name": "Invented edit",
            "job_title": "Platform Engineer",
            "changes": [change],
            "decisions": [
                {
                    "change_id": "change-one",
                    "action": "edit",
                    "edited_after": "Managed a newly invented team of 90.",
                }
            ],
        },
    )
    assert (
        client.post(
            f"{PREFIX}/{document['id']}/tailoring/apply", json=invented_edit, headers=auth_headers
        ).status_code
        == 422
    )
    edit_proposal = client.post(
        f"{PREFIX}/{document['id']}/tailoring/edit-proposals",
        json={
            key: invented_edit[key]
            for key in ("request_id", "job_title", "proposal_token", "changes")
        }
        | {"change_id": "change-one", "edited_after": "Managed a newly invented team of 90."},
        headers=auth_headers,
    )
    assert edit_proposal.status_code == 201
    assert edit_proposal.json()["confirmation_state"] == "unconfirmed"
    payload = _signed(
        document["id"],
        test_user.id,
        {
            "request_id": "a5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
            "variant_name": "Platform tailored",
            "job_title": "Platform Engineer",
            "changes": [change],
            "decisions": [{"change_id": "change-one", "action": "accept"}],
        },
    )
    response = client.post(
        f"{PREFIX}/{document['id']}/tailoring/apply", json=payload, headers=auth_headers
    )
    assert response.status_code == 201
    assert (
        response.json()["sections"][0]["entries"][0]["body"] == "Improved platform delivery by 20%."
    )
    current = client.get(f"{PREFIX}/{document['id']}", headers=auth_headers).json()
    assert current["sections"] == document["sections"]
    assert (
        client.post(
            f"{PREFIX}/{document['id']}/tailoring/apply", json=payload, headers=auth_headers
        ).json()["id"]
        == response.json()["id"]
    )


def test_unsupported_tailoring_change_is_blocked_until_evidence_is_confirmed(
    client, auth_headers, test_user, confirmed_evidence
):
    document = client.post(
        PREFIX,
        json={"name": "Blocked", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    blocked = {
        "request_id": "b5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
        "variant_name": "Blocked",
        "job_title": "Lead",
        "changes": [
            {
                "id": "invented",
                "section_id": "section-achievements",
                "entry_id": "entry-one",
                "before": "Improved a synthetic process by 20%.",
                "after": "Managed 50 people.",
                "job_requirement": "People leadership",
                "evidence_item_ids": [],
                "support": "unsupported",
            }
        ],
        "decisions": [{"change_id": "invented", "action": "accept"}],
    }
    response = client.post(
        f"{PREFIX}/{document['id']}/tailoring/apply",
        json=_signed(document["id"], test_user.id, blocked),
        headers=auth_headers,
    )
    assert response.status_code == 422
    assert "Confirm evidence explicitly" in response.json()["detail"]

    proposal = client.post(
        "/api/v1/evidence-profile/items",
        json={
            "kind": "achievement",
            "content": {"statement": "Managed a synthetic team of 50."},
            "provenance": "user-entered",
        },
        headers=auth_headers,
    )
    assert proposal.status_code == 201
    proposed_item = proposal.json()
    assert proposed_item["confirmation_state"] == "unconfirmed"
    confirmation = client.post(
        f"/api/v1/evidence-profile/items/{proposed_item['id']}/confirmation",
        json={"action": "confirm"},
        headers=auth_headers,
    )
    assert confirmation.status_code == 200
    assert confirmation.json()["confirmation_state"] == "confirmed"

    supported = _signed(
        document["id"],
        test_user.id,
        {
            "request_id": "c5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
            "variant_name": "Confirmed leadership",
            "job_title": "Lead",
            "changes": [
                {
                    "id": "supported",
                    "section_id": "section-achievements",
                    "entry_id": "entry-one",
                    "before": "Improved a synthetic process by 20%.",
                    "after": "Managed a synthetic team of 50.",
                    "job_requirement": "People leadership",
                    "evidence_item_ids": [proposed_item["id"]],
                    "support": "confirmed",
                }
            ],
            "decisions": [{"change_id": "supported", "action": "accept"}],
        },
    )
    accepted = client.post(
        f"{PREFIX}/{document['id']}/tailoring/apply", json=supported, headers=auth_headers
    )
    assert accepted.status_code == 201
    assert accepted.json()["sections"][0]["entries"][0]["body"] == "Managed a synthetic team of 50."


@pytest.mark.parametrize(
    ("section_kind", "evidence_kind"),
    [
        ("experience", "experience"),
        ("achievements", "achievement"),
        ("skills", "skill"),
        ("education", "education"),
        ("projects", "project"),
        ("certifications", "certification"),
    ],
)
def test_custom_tailoring_edits_stage_the_typed_r11_evidence_kind(
    client, auth_headers, test_user, confirmed_evidence, section_kind, evidence_kind
):
    section = _section(confirmed_evidence.id)
    section["kind"] = section_kind
    document = client.post(
        PREFIX, json={"name": section_kind, "sections": [section]}, headers=auth_headers
    ).json()
    change = {
        "id": "typed-edit",
        "section_id": "section-achievements",
        "entry_id": "entry-one",
        "before": "Improved a synthetic process by 20%.",
        "after": "Improved a synthetic platform process by 20%.",
        "job_requirement": "Relevant evidence",
        "evidence_item_ids": [confirmed_evidence.id],
        "support": "confirmed",
    }
    request = _signed(
        document["id"],
        test_user.id,
        {
            "request_id": "f5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
            "variant_name": "unused",
            "job_title": "Target",
            "changes": [change],
            "decisions": [],
        },
    )
    response = client.post(
        f"{PREFIX}/{document['id']}/tailoring/edit-proposals",
        json={key: request[key] for key in ("request_id", "job_title", "proposal_token", "changes")}
        | {"change_id": "typed-edit", "edited_after": "New user-authored wording."},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["kind"] == evidence_kind
    assert response.json()["confirmation_state"] == "unconfirmed"
