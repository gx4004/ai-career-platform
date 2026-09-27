"""R11 resume import stores suggestions for review (#146, #372).

Resume parsing only suggests evidence: every extracted fact lands `unconfirmed`
with `imported` provenance, so the profile's suggestion list is the one place
the owner reviews it. Guests never reach the endpoint (D-064).
"""

import pytest

from app.models.evidence_item import EvidenceItem

IMPORT = "/api/v1/evidence-profile/import"
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


def test_guest_cannot_import(client, db):
    """D-064: guest uploads never write to a profile."""
    assert client.post(IMPORT, json={"resume_text": RESUME_TEXT}).status_code in (401, 403)
    assert db.query(EvidenceItem).count() == 0


def test_import_stores_every_well_formed_fact_as_an_imported_suggestion(
    client, auth_headers, mock_proposals
):
    response = client.post(IMPORT, json={"resume_text": RESUME_TEXT}, headers=auth_headers)
    assert response.status_code == 201

    listed = client.get(ITEMS, headers=auth_headers).json()["items"]
    assert listed == response.json()["items"]
    # Only the three well-formed proposals survive normalization; junk is dropped.
    assert [item["kind"] for item in listed] == ["experience", "achievement", "skill"]
    # Nothing is trusted until the owner saves it.
    assert {(item["provenance"], item["confirmation_state"]) for item in listed} == {
        ("imported", "unconfirmed")
    }


def test_llm_failure_degrades_to_no_suggestions(client, auth_headers, db, monkeypatch):
    async def boom(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr("app.services.evidence_import.complete_structured", boom)

    response = client.post(IMPORT, json={"resume_text": RESUME_TEXT}, headers=auth_headers)
    assert response.status_code == 201
    assert response.json()["items"] == []
    assert db.query(EvidenceItem).count() == 0


def test_too_short_resume_is_rejected(client, auth_headers, mock_proposals):
    assert client.post(IMPORT, json={"resume_text": "short"}, headers=auth_headers).status_code == 422
