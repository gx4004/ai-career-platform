import json
from pathlib import Path

from app.auth.security import create_access_token, hash_password
from app.models.campaign_listing import CampaignListing
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.gap_classification import GapClassification
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.services.evidence_injection import EvidencePayload
from app.services.gap_classifier import (
    GAP_EVIDENCE_NOT_YET_PRODUCED,
    GAP_MISSING_SKILL,
    GAP_PRESENTATION_WEAKNESS,
    GAP_UNCAPTURED_EVIDENCE,
    classify_findings,
    delete_gap_classifications,
    list_gap_classifications,
    persist_gap_classifications,
)
from app.services.tool_runs import delete_all_user_data

PREFIX = "/api/v1/history"
FIXTURE = json.loads((Path(__file__).parent / "fixtures/application_reviewer.json").read_text())


def _finding(category, trace, *, id="finding-1", message="msg", locations=None):
    return {
        "id": id,
        "category": category,
        "severity": "medium",
        "message": message,
        "locations": locations or [],
        "trace": list(trace),
    }


def _kind(finding, payload=None):
    result = classify_findings([finding], payload)
    assert len(result) == 1, f"expected {finding['category']} to classify to exactly one kind"
    return result[0]


# --- D-041: each of the four kinds has a triggering fixture + a near-miss ------


def test_presentation_categories_classify_as_presentation_weakness():
    for category, trace in (
        ("generic_language", ["matched_phrase:team player"]),
        ("repetition", ["repeated_text:the same sentence twice"]),
        ("document_defect", ["placeholder:[company]"]),
        ("contradiction", ["comparison:years_of_experience", "result:conflict"]),
    ):
        classified = _kind(_finding(category, trace))
        assert classified["gap_kind"] == GAP_PRESENTATION_WEAKNESS
        assert "classified:presentation_weakness" in classified["cited_trace"]


def test_presentation_near_miss_a_substance_finding_is_never_presentation():
    # D-110: a substance gap must never be routed to rewording, so it must never
    # be labeled presentation_weakness.
    classified = _kind(_finding("missed_requirement", ["listing_requirement:Python"]))
    assert classified["gap_kind"] != GAP_PRESENTATION_WEAKNESS


def test_unsupported_claim_classifies_as_uncaptured_evidence():
    classified = _kind(_finding("unsupported_claim", ["claim:Nimbus Labs", "result:unsupported"]))
    assert classified["gap_kind"] == GAP_UNCAPTURED_EVIDENCE


def test_missed_requirement_present_in_profile_is_uncaptured_evidence():
    payload = EvidencePayload(
        locked_facts=[
            {
                "evidence_item_id": "e1",
                "kind": "skill",
                "content": {"statement": "Expert operating Kubernetes clusters in production"},
            }
        ],
        gaps=[],
    )
    classified = _kind(_finding("missed_requirement", ["listing_requirement:Kubernetes"]), payload)
    assert classified["gap_kind"] == GAP_UNCAPTURED_EVIDENCE
    assert "profile_lookup:Kubernetes:related_item_present" in classified["cited_trace"]


def test_uncaptured_near_miss_absent_from_profile_is_not_uncaptured():
    classified = _kind(_finding("missed_requirement", ["listing_requirement:Kubernetes"]), None)
    assert classified["gap_kind"] != GAP_UNCAPTURED_EVIDENCE


def test_missed_requirement_known_skill_absent_is_missing_skill():
    classified = _kind(_finding("missed_requirement", ["listing_requirement:Python"]), None)
    assert classified["gap_kind"] == GAP_MISSING_SKILL
    assert any(item.startswith("skill_lexicon:matched:") for item in classified["cited_trace"])


def test_missing_skill_near_miss_when_profile_covers_it():
    payload = EvidencePayload(
        locked_facts=[
            {"evidence_item_id": "e1", "kind": "skill", "content": {"statement": "5 years of Python"}}
        ],
        gaps=[],
    )
    classified = _kind(_finding("missed_requirement", ["listing_requirement:Python"]), payload)
    assert classified["gap_kind"] == GAP_UNCAPTURED_EVIDENCE


def test_missed_requirement_non_skill_absent_is_evidence_not_yet_produced():
    classified = _kind(
        _finding("missed_requirement", ["listing_requirement:regulatory reporting"]), None
    )
    assert classified["gap_kind"] == GAP_EVIDENCE_NOT_YET_PRODUCED
    assert "skill_lexicon:no_match" in classified["cited_trace"]


def test_evidence_not_yet_produced_near_miss_a_known_skill_is_missing_skill():
    classified = _kind(_finding("missed_requirement", ["listing_requirement:Docker"]), None)
    assert classified["gap_kind"] == GAP_MISSING_SKILL


# --- honesty / explainability guarantees --------------------------------------


def test_unrecognized_category_is_left_unclassified():
    # Never fabricate a classification the reviewer never grounded.
    assert classify_findings([_finding("brand_new_category", ["x:y"])], None) == []


def test_missed_requirement_without_a_keyword_trace_is_evidence_not_yet_produced():
    # Defensive: a missed_requirement whose trace lacks a listing_requirement entry
    # must still classify deterministically without crashing.
    classified = _kind(_finding("missed_requirement", ["result:not_found"]), None)
    assert classified["gap_kind"] == GAP_EVIDENCE_NOT_YET_PRODUCED


def test_cited_trace_preserves_the_reviewer_trace_as_a_prefix():
    finding = _finding("missed_requirement", ["listing_requirement:Python", "result:not_found"])
    classified = _kind(finding, None)
    assert classified["cited_trace"][:2] == ["listing_requirement:Python", "result:not_found"]


def test_classify_findings_preserves_order_and_carries_finding_metadata():
    findings = [
        _finding(
            "generic_language",
            ["matched_phrase:team player"],
            id="a",
            message="A",
            locations=["CV:chars 0-5"],
        ),
        _finding("missed_requirement", ["listing_requirement:Python"], id="b", message="B"),
    ]
    result = classify_findings(findings, None)
    assert [item["finding_id"] for item in result] == ["a", "b"]
    assert result[0]["message"] == "A"
    assert result[0]["locations"] == ["CV:chars 0-5"]
    assert result[0]["source_category"] == "generic_language"


# --- persistence: idempotent reconcile, ordering, owner scope, cascade --------


def _persist_two_kinds(db, user_id, workspace_id):
    classifications = classify_findings(
        [
            _finding("generic_language", ["matched_phrase:team player"], id="pres"),
            _finding("missed_requirement", ["listing_requirement:Python"], id="skill"),
        ],
        None,
    )
    return persist_gap_classifications(db, user_id, workspace_id, classifications)


def _workspace(db, user_id, label="W"):
    workspace = Workspace(user_id=user_id, label=label)
    db.add(workspace)
    db.commit()
    return workspace


def test_persist_is_idempotent_and_reconciles_stale_rows(db, test_user):
    workspace = _workspace(db, test_user.id)

    first = _persist_two_kinds(db, test_user.id, workspace.id)
    assert len(first) == 2
    ids = {row.id for row in first}

    again = _persist_two_kinds(db, test_user.id, workspace.id)
    assert {row.id for row in again} == ids
    assert db.query(GapClassification).filter_by(workspace_id=workspace.id).count() == 2

    reduced = persist_gap_classifications(
        db,
        test_user.id,
        workspace.id,
        classify_findings(
            [_finding("generic_language", ["matched_phrase:team player"], id="pres")], None
        ),
    )
    assert len(reduced) == 1
    assert db.query(GapClassification).filter_by(workspace_id=workspace.id).count() == 1


def test_list_is_ordered_by_kind_then_finding_id(db, test_user):
    workspace = _workspace(db, test_user.id)
    _persist_two_kinds(db, test_user.id, workspace.id)
    rows = list_gap_classifications(db, test_user.id, workspace.id)
    keys = [(row.gap_kind, row.finding_id) for row in rows]
    assert keys == sorted(keys)


def test_delete_gap_classifications_removes_only_the_owner_rows(db, test_user):
    other = User(email="other-gap@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    mine = _workspace(db, test_user.id, "Mine")
    theirs = _workspace(db, other.id, "Theirs")
    _persist_two_kinds(db, test_user.id, mine.id)
    _persist_two_kinds(db, other.id, theirs.id)

    removed = delete_gap_classifications(db, test_user.id)
    db.commit()
    assert removed == 2
    assert db.query(GapClassification).filter_by(user_id=test_user.id).count() == 0
    assert db.query(GapClassification).filter_by(user_id=other.id).count() == 2


def test_account_deletion_cascades_gap_classifications(db, test_user):
    workspace = _workspace(db, test_user.id)
    _persist_two_kinds(db, test_user.id, workspace.id)
    assert db.query(GapClassification).filter_by(user_id=test_user.id).count() == 2
    delete_all_user_data(db, test_user.id)
    assert db.query(GapClassification).count() == 0


# --- endpoint integration -----------------------------------------------------


def _build_campaign(db, user_id, case):
    workspace = Workspace(user_id=user_id, label="Review")
    document = CvDocument(user_id=user_id, name="CV", sections=[])
    evidence = EvidenceItem(
        user_id=user_id,
        kind="experience",
        content=case["confirmed"][0]["content"],
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    cover = ToolRun(
        user_id=user_id,
        tool_name="cover-letter",
        result_payload={"full_text": case["cover"]},
    )
    db.add_all([workspace, document, evidence, cover])
    db.flush()
    variant = CvVariant(
        document_id=document.id,
        name="Selected",
        sections=[
            {
                "id": "summary",
                "kind": "summary",
                "title": "Summary",
                "visible": True,
                "position": 0,
                "entries": [
                    {"id": "one", "evidence_item_id": evidence.id, "body": case["cv"], "position": 0}
                ],
            }
        ],
    )
    listing = CampaignListing(
        workspace_id=workspace.id, title="Engineer", company="Example", description=case["listing"]
    )
    db.add_all([variant, listing])
    db.flush()
    workspace.current_listing_id = listing.id
    workspace.selected_cv_variant_id = variant.id
    workspace.selected_cover_letter_run_id = cover.id
    db.commit()
    return workspace


def test_classify_endpoint_persists_and_lists_honest_gap_kinds(client, auth_headers, test_user, db):
    workspace = _build_campaign(db, test_user.id, FIXTURE["trigger"])

    response = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/gap-classifications", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "gap-classification/v1"
    kinds = {item["gap_kind"] for item in body["classifications"]}
    # The trigger materials contain a presentation defect, an unsupported claim,
    # and an unmet known-skill requirement (Kubernetes).
    assert {GAP_PRESENTATION_WEAKNESS, GAP_UNCAPTURED_EVIDENCE, GAP_MISSING_SKILL} <= kinds
    assert all(item["cited_trace"] for item in body["classifications"])
    assert all(
        any(marker.startswith("classified:") for marker in item["cited_trace"])
        for item in body["classifications"]
    )

    finding_ids = {item["finding_id"] for item in body["classifications"]}
    persisted = client.get(
        f"{PREFIX}/workspaces/{workspace.id}/gap-classifications", headers=auth_headers
    )
    assert persisted.status_code == 200
    assert {item["finding_id"] for item in persisted.json()["classifications"]} == finding_ids

    # Re-running is idempotent: identical materials produce the same finding ids
    # and no duplicate rows.
    again = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/gap-classifications", headers=auth_headers
    )
    assert {item["finding_id"] for item in again.json()["classifications"]} == finding_ids
    assert db.query(GapClassification).filter_by(workspace_id=workspace.id).count() == len(
        finding_ids
    )


def test_classify_endpoint_requires_a_listing(client, auth_headers, test_user, db):
    workspace = _workspace(db, test_user.id)
    response = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/gap-classifications", headers=auth_headers
    )
    assert response.status_code == 409


def test_classify_endpoint_is_owner_scoped(client, test_user, db):
    workspace = _build_campaign(db, test_user.id, FIXTURE["trigger"])
    other = User(email="intruder-gap@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    intruder_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}

    response = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/gap-classifications", headers=intruder_headers
    )
    assert response.status_code == 404
    get_response = client.get(
        f"{PREFIX}/workspaces/{workspace.id}/gap-classifications", headers=intruder_headers
    )
    assert get_response.status_code == 404
