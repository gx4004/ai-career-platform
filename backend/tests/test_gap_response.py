import pytest

from app.auth.security import create_access_token, hash_password
from app.models.gap_classification import GapClassification
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.development import RESPONSE_FOR_GAP
from app.services.gap_response import map_gap_to_response

PREFIX = "/api/v1/history"

SUBSTANCE_KINDS = ["uncaptured_evidence", "evidence_not_yet_produced", "missing_skill"]


def _cls(gap_kind, *, trace=None, message="msg", id="c1"):
    return GapClassification(
        id=id,
        user_id="u",
        workspace_id="w",
        finding_id="f",
        source_category="x",
        gap_kind=gap_kind,
        message=message,
        locations=[],
        cited_trace=trace or [],
    )


# --- the D-110 mapping guarantees ---------------------------------------------


@pytest.mark.parametrize("gap_kind", SUBSTANCE_KINDS)
def test_substance_gaps_are_never_offered_rewording(gap_kind):
    offer = map_gap_to_response(_cls(gap_kind))
    assert offer.response_kind != "reword"
    assert offer.action_path != "reviewer_reword"


def test_presentation_maps_to_the_reviewer_reword_path_only():
    offer = map_gap_to_response(_cls("presentation_weakness"))
    assert offer.response_kind == "reword"
    assert offer.action_path == "reviewer_reword"
    assert offer.capture_proposal is None
    assert offer.sources == []


@pytest.mark.parametrize("gap_kind,response_kind", list(RESPONSE_FOR_GAP.items()))
def test_every_gap_kind_maps_to_its_single_honest_response(gap_kind, response_kind):
    assert map_gap_to_response(_cls(gap_kind)).response_kind == response_kind


def test_barrier_raises_if_a_substance_kind_is_ever_mapped_to_reword(monkeypatch):
    # Defensive D-110 guard: even a future edit to the mapping cannot route a
    # substance gap to a rewrite without this blowing up loudly.
    from app.services import gap_response

    monkeypatch.setitem(gap_response.RESPONSE_FOR_GAP, "missing_skill", "reword")
    with pytest.raises(ValueError):
        map_gap_to_response(_cls("missing_skill"))


# --- capture proposals flow through R11, never written here -------------------


def test_uncaptured_offer_is_an_inferred_unconfirmed_r11_proposal_body():
    offer = map_gap_to_response(
        _cls("uncaptured_evidence", trace=["claim:Led migration at Acme", "result:unsupported"])
    )
    assert offer.action_path == "evidence_profile_create"
    assert offer.capture_proposal is not None
    # It is a create-body (provenance inferred) the user submits to R11 — #200
    # writes nothing itself.
    assert offer.capture_proposal.provenance == "inferred"
    assert offer.capture_proposal.content == {"statement": "Led migration at Acme"}


def test_capture_seed_falls_back_to_requirement_then_message():
    from_requirement = map_gap_to_response(
        _cls("uncaptured_evidence", trace=["listing_requirement:Kubernetes"])
    )
    assert from_requirement.capture_proposal.content == {"statement": "Kubernetes"}

    from_message = map_gap_to_response(
        _cls("uncaptured_evidence", trace=["result:x"], message="Address the requirement")
    )
    assert from_message.capture_proposal.content == {"statement": "Address the requirement"}


# --- recommendations disclose sourcing, fabricate nothing (D-111) -------------


@pytest.mark.parametrize("gap_kind", ["evidence_not_yet_produced", "missing_skill"])
def test_recommendations_disclose_no_commercial_relationship_and_no_fabricated_sources(gap_kind):
    offer = map_gap_to_response(_cls(gap_kind))
    assert offer.commercial_relationship == "none"
    assert offer.sources == []
    assert offer.action_path == "advisory"
    assert offer.capture_proposal is None


def test_mapping_is_pure_and_needs_no_session():
    # The signature takes only a classification — it structurally cannot write to
    # the Evidence Profile (no db, no user_id).
    offer = map_gap_to_response(_cls("missing_skill"))
    assert offer.response_kind == "learn_skill"


# --- endpoint -----------------------------------------------------------------


def _persist_classification(db, user_id, *, gap_kind="missing_skill", finding_id="f1"):
    workspace = Workspace(user_id=user_id, label="W")
    db.add(workspace)
    db.commit()
    row = GapClassification(
        user_id=user_id,
        workspace_id=workspace.id,
        finding_id=finding_id,
        source_category="missed_requirement",
        gap_kind=gap_kind,
        message="Requirement not addressed",
        locations=[],
        cited_trace=["listing_requirement:Rust", "classified:missing_skill"],
    )
    db.add(row)
    db.commit()
    return row


def test_endpoint_returns_the_honest_offer(client, auth_headers, test_user, db):
    row = _persist_classification(db, test_user.id, gap_kind="missing_skill")
    response = client.get(
        f"{PREFIX}/workspaces/{row.workspace_id}/gap-classifications/{row.id}/response",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["response_kind"] == "learn_skill"
    assert body["action_path"] == "advisory"
    assert body["commercial_relationship"] == "none"


def test_endpoint_unknown_classification_is_404(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="W")
    db.add(workspace)
    db.commit()
    response = client.get(
        f"{PREFIX}/workspaces/{workspace.id}/gap-classifications/nope/response",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_endpoint_is_owner_scoped(client, test_user, db):
    row = _persist_classification(db, test_user.id)
    other = User(email="gr-intruder@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    intruder = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    response = client.get(
        f"{PREFIX}/workspaces/{row.workspace_id}/gap-classifications/{row.id}/response",
        headers=intruder,
    )
    assert response.status_code == 404
