"""B14 item 11: control characters never reach an Evidence item, and old ones never break a CV."""

from __future__ import annotations

import pytest

from app.models.evidence_item import EvidenceItem

ITEMS = "/api/v1/evidence-profile/items"


@pytest.mark.parametrize("bad", ["Led\x00 a team", "Bell\x07 ring", "Escape\x1b[31m red", "Delete\x7f me"])
def test_creating_an_item_with_a_control_character_is_refused(client, auth_headers, bad):
    response = client.post(
        ITEMS,
        json={"kind": "achievement", "content": {"statement": bad}, "provenance": "user-entered"},
        headers=auth_headers,
    )

    assert response.status_code == 422
    assert "control" in response.text.lower()


def test_editing_an_item_to_add_a_nul_is_refused(client, auth_headers):
    created = client.post(
        ITEMS,
        json={"kind": "skill", "content": {"name": "Python"}, "provenance": "user-entered"},
        headers=auth_headers,
    ).json()

    response = client.patch(f"{ITEMS}/{created['id']}", json={"content": {"name": "Py\x00thon"}}, headers=auth_headers)

    assert response.status_code == 422


def test_tabs_and_line_breaks_are_still_fine(client, auth_headers):
    response = client.post(
        ITEMS,
        json={
            "kind": "experience",
            "content": {"role": "Engineer", "highlights": "Built A\nBuilt B\r\nCol\tumn"},
            "provenance": "user-entered",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["content"]["highlights"] == "Built A\nBuilt B\nCol\tumn"


def test_seeding_a_cv_from_an_old_item_that_holds_a_nul_succeeds_without_it(client, auth_headers, db, test_user):
    legacy = EvidenceItem(
        user_id=test_user.id,
        kind="achievement",
        content={"statement": "Cut costs\x00 by 20%\x07"},
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    db.add(legacy)
    db.commit()

    response = client.post(
        "/api/v1/cv-documents",
        json={"name": "Seeded", "seed_evidence_item_ids": [legacy.id]},
        headers=auth_headers,
    )

    assert response.status_code == 201, response.text
    bodies = [entry["body"] for section in response.json()["sections"] for entry in section["entries"]]
    assert bodies == ["Cut costs by 20%"]
