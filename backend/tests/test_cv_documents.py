import pytest

from app.auth.security import hash_password
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.routers.cv_documents import CV_TAILORING_MODEL_RUN_LIMIT
from app.services.cv_tailoring import proposal_token
from app.services.tool_runs import persist_tool_run

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


def _with_response_defaults(sections):
    """Structured-entry fields (#322) always round-trip in a response even when
    the request omitted them — mirror that shape for exact-equality assertions.
    """
    return [
        {
            **section,
            "entries": [
                {
                    "heading": None,
                    "subheading": None,
                    "location": None,
                    "start_date": None,
                    "end_date": None,
                    "bullets": [],
                    **entry,
                }
                for entry in section["entries"]
            ],
        }
        for section in sections
    ]


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
    assert edited.json()["sections"] == _with_response_defaults(edited_sections)

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
    assert restored.json()["sections"] == _with_response_defaults(edited_sections)

    base_restored = client.post(
        f"{PREFIX}/{created['id']}/variants/{base_id}/restore",
        headers=auth_headers,
    )
    assert base_restored.status_code == 200
    assert base_restored.json()["sections"] == _with_response_defaults([_section(confirmed_evidence.id)])

    fetched = client.get(f"{PREFIX}/{created['id']}", headers=auth_headers).json()
    snapshots = {variant["id"]: variant for variant in fetched["variants"]}
    assert snapshots[snapshot_id]["sections"] == _with_response_defaults(edited_sections)
    assert snapshots[base_id]["sections"] == _with_response_defaults([_section(confirmed_evidence.id)])


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


def test_quality_endpoint_is_authenticated_and_owner_isolated(
    client, auth_headers, db, second_user
):
    foreign = CvDocument(user_id=second_user.id, name="Private quality", sections=[])
    db.add(foreign)
    db.commit()
    assert client.post(f"{PREFIX}/{foreign.id}/quality").status_code == 401
    assert client.post(f"{PREFIX}/{foreign.id}/quality", headers=auth_headers).status_code == 404


def _fake_llm(monkeypatch, module: str, result: dict | Exception):
    """Replace the provider call inside one CV service module."""

    async def complete(*_args, **_kwargs):
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(f"app.services.{module}.complete_structured", complete)


def _tailoring_change(evidence_id: str) -> dict:
    return {
        "id": "change-one",
        "section_id": "section-achievements",
        "entry_id": "entry-one",
        "before": "Improved a synthetic process by 20%.",
        "after": "Improved a synthetic platform process by 20%.",
        "job_requirement": "Improve platform reliability",
        "evidence_item_ids": [evidence_id],
        "support": "confirmed",
    }


def _run_and_workspace_counts(db, user_id: str) -> tuple[int, int]:
    db.expire_all()
    return (
        db.query(ToolRun).filter(ToolRun.user_id == user_id).count(),
        db.query(Workspace).filter(Workspace.user_id == user_id).count(),
    )


def test_quality_checks_never_create_runs_or_campaigns(
    client, auth_headers, db, test_user, confirmed_evidence
):
    """Autosave re-runs the check constantly; it must not fill the Campaigns board."""
    document = client.post(
        PREFIX,
        json={"name": "Autosaved", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    url = f"{PREFIX}/{document['id']}/quality"

    responses = [client.post(url, headers=auth_headers) for _ in range(3)]

    assert [response.status_code for response in responses] == [200, 200, 200]
    assert _run_and_workspace_counts(db, test_user.id) == (0, 0)
    assert client.get("/api/v1/history/workspaces", headers=auth_headers).json()["items"] == []




def test_tailoring_returns_reviewable_provenance_without_creating_campaigns(
    client, auth_headers, db, test_user, confirmed_evidence, monkeypatch
):
    _fake_llm(monkeypatch, "cv_tailoring", {"changes": [_tailoring_change(confirmed_evidence.id)]})
    document = client.post(
        PREFIX,
        json={"name": "Tailor", "sections": [_section(confirmed_evidence.id)]},
        headers=auth_headers,
    ).json()
    payload = {
        "job_title": "Platform Engineer",
        "job_description": "Improve platform reliability across distributed services.",
    }

    first = client.post(f"{PREFIX}/{document['id']}/tailoring", json=payload, headers=auth_headers)
    second = client.post(f"{PREFIX}/{document['id']}/tailoring", json=payload, headers=auth_headers)

    assert first.status_code == 200 and second.status_code == 200
    proposal = second.json()
    assert proposal["changes"][0]["evidence_item_ids"] == [confirmed_evidence.id]
    assert proposal["remaining_regenerations"] == CV_TAILORING_MODEL_RUN_LIMIT - 2
    assert proposal["locked_actions"] == []
    assert _run_and_workspace_counts(db, test_user.id) == (0, 0)

    applied = client.post(
        f"{PREFIX}/{document['id']}/tailoring/apply",
        json={
            "request_id": proposal["request_id"],
            "proposal_token": proposal["proposal_token"],
            "variant_name": "Platform",
            "job_title": "Platform Engineer",
            "changes": proposal["changes"],
            "decisions": [{"change_id": "change-one", "action": "accept"}],
        },
        headers=auth_headers,
    )
    assert applied.status_code == 201


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
    # Tailoring review is accept/reject only: there is no free-text "edit" action.
    edit_decision = _signed(
        document["id"],
        test_user.id,
        {
            "request_id": "d5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
            "variant_name": "Invented edit",
            "job_title": "Platform Engineer",
            "changes": [change],
            "decisions": [{"change_id": "change-one", "action": "edit"}],
        },
    )
    assert (
        client.post(
            f"{PREFIX}/{document['id']}/tailoring/apply", json=edit_decision, headers=auth_headers
        ).status_code
        == 422
    )
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


def test_tailoring_change_can_target_a_specific_bullet(
    client, auth_headers, test_user, confirmed_evidence
):
    """A structured entry with bullets renders its bullets, not its body — a
    change must be able to target one bullet by index and have it actually
    apply, instead of silently rewriting the unrendered body (#322).
    """
    document = client.post(
        PREFIX,
        json={
            "name": "Bulleted",
            "sections": [
                {
                    "id": "section-experience",
                    "kind": "experience",
                    "title": "Experience",
                    "visible": True,
                    "position": 0,
                    "entries": [
                        {
                            "id": "entry-one",
                            "evidence_item_id": None,
                            "body": "Senior Engineer",
                            "position": 0,
                            "heading": "Senior Engineer",
                            "bullets": [
                                "Improved a synthetic process by 20%.",
                                "Led a synthetic migration.",
                            ],
                        }
                    ],
                }
            ],
        },
        headers=auth_headers,
    ).json()
    change = {
        "id": "change-one",
        "section_id": "section-experience",
        "entry_id": "entry-one",
        "field": "bullets[0]",
        "before": "Improved a synthetic process by 20%.",
        "after": "Improved platform delivery by 20%.",
        "job_requirement": "Platform delivery",
        "evidence_item_ids": [confirmed_evidence.id],
        "support": "confirmed",
    }
    payload = _signed(
        document["id"],
        test_user.id,
        {
            "request_id": "e5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2",
            "variant_name": "Bullet tailored",
            "job_title": "Platform Engineer",
            "changes": [change],
            "decisions": [{"change_id": "change-one", "action": "accept"}],
        },
    )
    response = client.post(
        f"{PREFIX}/{document['id']}/tailoring/apply", json=payload, headers=auth_headers
    )
    assert response.status_code == 201
    entry = response.json()["sections"][0]["entries"][0]
    assert entry["bullets"] == ["Improved platform delivery by 20%.", "Led a synthetic migration."]
    assert entry["body"] == "Senior Engineer"


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
    # `user-entered` is the owner typing it themselves right now, so a manual
    # create lands confirmed with no extra confirm click (Phase 1b, #321).
    assert proposed_item["confirmation_state"] == "confirmed"

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


def test_history_still_lists_runs_saved_by_earlier_quality_and_tailoring_checks(
    client, auth_headers, db, test_user
):
    """Rows written before #362 stay in users' history; every view must render them."""
    legacy = [
        persist_tool_run(
            db,
            current_user=test_user,
            tool_name=tool_name,
            label=f"{tool_name} · legacy",
            result=result,
        )
        for tool_name, result in (
            ("cv-quality", {"schema_version": "cv-quality/v1", "dimensions": [], "ats_checks": []}),
            ("cv-tailoring", {"schema_version": "cv-tailoring/v1", "changes": []}),
        )
    ]

    listing = client.get("/api/v1/history", headers=auth_headers)
    campaigns = client.get("/api/v1/history/workspaces", headers=auth_headers)
    details = [client.get(f"/api/v1/history/{run.id}", headers=auth_headers) for run in legacy]

    assert listing.status_code == 200
    assert {item["tool_name"] for item in listing.json()["items"]} == {"cv-quality", "cv-tailoring"}
    assert campaigns.status_code == 200
    assert [detail.status_code for detail in details] == [200, 200]
