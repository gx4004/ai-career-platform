"""R11 reviewable resume-import proposals (#146).

Proposals are derived from resume parsing and presented for review — never
written to the profile automatically. These tests assert the trust boundary:
guests can never reach the endpoint (D-064), generating proposals persists
nothing (so a discarded proposal leaves no server-side trace), and accepting a
proposal goes through the normal item-create path as `unconfirmed` /`imported`
(D-062).
"""

import pytest

from app.models.evidence_item import EvidenceItem
from app.schemas.evidence_profile import EvidenceImportProposalsResponse

PROPOSE = "/api/v1/evidence-profile/import/proposals"
ITEMS = "/api/v1/evidence-profile/items"

# A synthetic resume long enough to satisfy the 50-char minimum (R8 fixture rule:
# hand-authored synthetic content only, never real user data).
RESUME_TEXT = (
    "Jordan Lee\nSoftware Engineer at Synthetic Corp (2021-2024)\n"
    "Shipped a payments service; cut latency 30%.\nB.S. Computer Science, Example University.\n"
    "Skills: Python, FastAPI. Certified Kubernetes Administrator."
)

# What the (mocked) LLM returns: a mix of valid proposals and junk the service
# must drop (unknown kind, empty content, non-object item).
LLM_RESULT = {
    "proposals": [
        {"kind": "experience", "content": {"role": "Software Engineer", "employer": "Synthetic Corp"}},
        {"kind": "achievement", "content": {"statement": "Cut latency 30%"}},
        {"kind": "skill", "content": {"name": "FastAPI"}},
        {"kind": "not-a-kind", "content": {"name": "dropped"}},
        {"kind": "skill", "content": {}},
        "garbage-non-object",
    ]
}


@pytest.fixture
def mock_proposals(monkeypatch):
    async def fake_complete(*args, **kwargs):
        return LLM_RESULT

    monkeypatch.setattr(
        "app.services.evidence_import.complete_structured", fake_complete
    )


def test_guest_cannot_request_proposals(client):
    """D-064: guest uploads never trigger proposals or profile writes."""
    assert client.post(PROPOSE, json={"resume_text": RESUME_TEXT}).status_code in (401, 403)


def test_proposals_are_derived_and_never_persisted(client, auth_headers, db, mock_proposals):
    response = client.post(PROPOSE, json={"resume_text": RESUME_TEXT}, headers=auth_headers)
    assert response.status_code == 200

    parsed = EvidenceImportProposalsResponse.model_validate(response.json())
    kinds = [p.kind for p in parsed.proposals]
    # Only the three well-formed proposals survive normalization; junk is dropped.
    assert kinds == ["experience", "achievement", "skill"]
    # Resume-derived proposals are always `imported`; the model cannot propose
    # confirmed items or any other provenance.
    assert all(p.provenance == "imported" for p in parsed.proposals)
    assert all(p.content for p in parsed.proposals)

    # Generating proposals writes nothing: a discarded/never-accepted proposal
    # leaves no server-side trace of its content.
    assert db.query(EvidenceItem).count() == 0


def test_accepting_a_proposal_stores_unconfirmed_imported_item(
    client, auth_headers, db, mock_proposals
):
    proposals = client.post(
        PROPOSE, json={"resume_text": RESUME_TEXT}, headers=auth_headers
    ).json()["proposals"]
    chosen = proposals[0]

    # Accepting reuses the existing item-create path — no parallel write path.
    created = client.post(
        ITEMS,
        json={"kind": chosen["kind"], "content": chosen["content"], "provenance": "imported"},
        headers=auth_headers,
    )
    assert created.status_code == 201
    item = created.json()
    assert item["confirmation_state"] == "unconfirmed"
    assert item["provenance"] == "imported"
    assert item["content"] == chosen["content"]

    # Exactly one item persisted — only the accepted proposal, nothing else.
    assert db.query(EvidenceItem).count() == 1


def test_skipping_the_review_writes_nothing(client, auth_headers, db, mock_proposals):
    """The review flow is skippable; skipping changes nothing in the profile."""
    client.post(PROPOSE, json={"resume_text": RESUME_TEXT}, headers=auth_headers)
    # The user reviews nothing and navigates away — no accept call is made.
    assert db.query(EvidenceItem).count() == 0
    assert client.get(ITEMS, headers=auth_headers).json()["items"] == []


def test_llm_failure_degrades_to_no_proposals(client, auth_headers, monkeypatch):
    async def boom(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr("app.services.evidence_import.complete_structured", boom)

    response = client.post(PROPOSE, json={"resume_text": RESUME_TEXT}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["proposals"] == []


def test_too_short_resume_is_rejected(client, auth_headers, mock_proposals):
    assert client.post(PROPOSE, json={"resume_text": "short"}, headers=auth_headers).status_code == 422
