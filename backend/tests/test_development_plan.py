import pytest
from pydantic import ValidationError

from app.auth.security import create_access_token, hash_password
from app.models.development_item import DevelopmentItem
from app.models.gap_classification import GapClassification
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.development import (
    RESPONSE_FOR_GAP,
    DevelopmentItemCreate,
    DevelopmentItemUpdate,
)
from app.services.data_export import export_career_data
from app.services.development import (
    DevelopmentItemNotFoundError,
    GapClassificationNotFoundError,
    create_development_item,
    delete_development_item,
    delete_development_items,
    export_development_plan,
    list_development_items,
    update_development_item,
)
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1/development-plan"


def _classification(db, user_id, *, gap_kind="missing_skill", finding_id="f1", label="W"):
    workspace = Workspace(user_id=user_id, label=label)
    db.add(workspace)
    db.commit()
    row = GapClassification(
        user_id=user_id,
        workspace_id=workspace.id,
        finding_id=finding_id,
        source_category="missed_requirement",
        gap_kind=gap_kind,
        message="Requirement not addressed",
        locations=["Canonical listing:chars 0-4"],
        cited_trace=["listing_requirement:Rust", "classified:missing_skill"],
    )
    db.add(row)
    db.commit()
    return row


# --- service: creation snapshots the honest response and gap kind --------------


def test_create_snapshots_gap_kind_response_and_finding(db, test_user):
    classification = _classification(db, test_user.id, gap_kind="missing_skill", finding_id="find-1")
    item = create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    assert item.gap_kind == "missing_skill"
    assert item.response_kind == "learn_skill"
    assert item.source_finding_id == "find-1"
    assert item.state == "planned"
    assert item.timeline[0]["event"] == "created"


@pytest.mark.parametrize(
    "gap_kind,response_kind",
    list(RESPONSE_FOR_GAP.items()),
)
def test_create_maps_every_gap_kind_to_its_single_honest_response(
    db, test_user, gap_kind, response_kind
):
    classification = _classification(db, test_user.id, gap_kind=gap_kind, finding_id=gap_kind)
    item = create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    assert item.response_kind == response_kind
    # A substance gap is never mapped to rewording.
    if gap_kind != "presentation_weakness":
        assert item.response_kind != "reword"


def test_create_rejects_a_classification_the_user_does_not_own(db, test_user):
    other = User(email="dev-other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    theirs = _classification(db, other.id, finding_id="x")
    with pytest.raises(GapClassificationNotFoundError):
        create_development_item(
            db, test_user.id, DevelopmentItemCreate(gap_classification_id=theirs.id)
        )


# --- service: bounded state transitions record a timeline ---------------------


def test_state_transition_appends_timeline_and_updates_state(db, test_user):
    classification = _classification(db, test_user.id)
    item = create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    updated = update_development_item(
        db, item.id, test_user.id, DevelopmentItemUpdate(state="in_progress")
    )
    assert updated.state == "in_progress"
    transition = updated.timeline[-1]
    assert transition["event"] == "state_changed"
    assert transition["from_state"] == "planned"
    assert transition["to_state"] == "in_progress"


def test_update_can_clear_notes_with_null_but_leaves_omitted_fields(db, test_user):
    classification = _classification(db, test_user.id)
    item = create_development_item(
        db,
        test_user.id,
        DevelopmentItemCreate(gap_classification_id=classification.id, notes="draft note"),
    )
    updated = update_development_item(
        db, item.id, test_user.id, DevelopmentItemUpdate(notes=None)
    )
    assert updated.notes is None
    # State was not part of the update and must be unchanged.
    assert updated.state == "planned"


def test_update_with_no_fields_is_rejected():
    with pytest.raises(ValidationError):
        DevelopmentItemUpdate()


def test_create_rejects_unknown_fields_bounded_model():
    with pytest.raises(ValidationError):
        DevelopmentItemCreate(gap_classification_id="c1", priority="high")


# --- service: owner scope, survival, cascade, export --------------------------


def test_item_survives_and_keeps_its_snapshot_when_the_classification_is_removed(db, test_user):
    classification = _classification(db, test_user.id, gap_kind="uncaptured_evidence")
    item = create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    db.delete(classification)
    db.commit()
    survivor = db.query(DevelopmentItem).filter_by(id=item.id).one()
    assert survivor.gap_kind == "uncaptured_evidence"
    assert survivor.response_kind == "capture_evidence"


def test_delete_and_list_are_owner_scoped(db, test_user):
    classification = _classification(db, test_user.id)
    item = create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    with pytest.raises(DevelopmentItemNotFoundError):
        delete_development_item(db, item.id, "someone-else")
    delete_development_item(db, item.id, test_user.id)
    assert list_development_items(db, test_user.id) == []


def test_delete_development_items_removes_only_owner_rows(db, test_user):
    other = User(email="dev-owner@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    mine = _classification(db, test_user.id, finding_id="m")
    theirs = _classification(db, other.id, finding_id="t")
    create_development_item(db, test_user.id, DevelopmentItemCreate(gap_classification_id=mine.id))
    create_development_item(db, other.id, DevelopmentItemCreate(gap_classification_id=theirs.id))

    removed = delete_development_items(db, test_user.id)
    db.commit()
    assert removed == 1
    assert db.query(DevelopmentItem).filter_by(user_id=other.id).count() == 1


def test_account_deletion_cascades_development_items(db, test_user):
    classification = _classification(db, test_user.id)
    create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    assert db.query(DevelopmentItem).filter_by(user_id=test_user.id).count() == 1
    delete_all_user_data(db, test_user.id)
    assert db.query(DevelopmentItem).count() == 0


def test_export_includes_the_development_plan(db, test_user):
    classification = _classification(db, test_user.id, gap_kind="missing_skill")
    create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    plan = export_development_plan(db, test_user.id)
    assert plan.item_count == 1
    assert plan.items[0].response_kind == "learn_skill"

    full = export_career_data(db, test_user.id)
    assert full.development.item_count == 1


# --- endpoint integration -----------------------------------------------------


def test_endpoint_full_lifecycle(client, auth_headers, test_user, db):
    classification = _classification(db, test_user.id, gap_kind="evidence_not_yet_produced")

    created = client.post(
        PREFIX,
        headers=auth_headers,
        json={"gap_classification_id": classification.id, "target_date": "2026-09-01"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["response_kind"] == "produce_evidence"
    assert body["target_date"] == "2026-09-01"
    item_id = body["id"]

    listed = client.get(PREFIX, headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["schema_version"] == "development-plan/v1"
    assert len(listed.json()["items"]) == 1

    patched = client.patch(
        f"{PREFIX}/{item_id}", headers=auth_headers, json={"state": "completed"}
    )
    assert patched.status_code == 200
    assert patched.json()["state"] == "completed"

    deleted = client.delete(f"{PREFIX}/{item_id}", headers=auth_headers)
    assert deleted.status_code == 204
    assert client.get(PREFIX, headers=auth_headers).json()["items"] == []


def test_endpoint_create_with_unknown_classification_is_404(client, auth_headers):
    response = client.post(
        PREFIX, headers=auth_headers, json={"gap_classification_id": "does-not-exist"}
    )
    assert response.status_code == 404


def test_endpoint_is_owner_scoped(client, test_user, db):
    classification = _classification(db, test_user.id)
    item = create_development_item(
        db, test_user.id, DevelopmentItemCreate(gap_classification_id=classification.id)
    )
    other = User(email="dev-intruder@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    intruder = {"Authorization": f"Bearer {create_access_token(other.id)}"}

    # The intruder cannot see or mutate another owner's item.
    assert client.get(PREFIX, headers=intruder).json()["items"] == []
    assert client.patch(f"{PREFIX}/{item.id}", headers=intruder, json={"state": "completed"}).status_code == 404
    assert client.delete(f"{PREFIX}/{item.id}", headers=intruder).status_code == 404
