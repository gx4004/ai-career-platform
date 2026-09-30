"""Dashboard "today" (#418): best matches to add, and applications needing action.

Through GET /api/v1/today with the real Discovery visibility rule and the real
Applications board.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.workspace import Workspace

TODAY = "/api/v1/today"
K8S = "Run our Kubernetes platform and improve developer tooling for every team."


def _adopt(client, headers, listing_id):
    response = client.post(f"/api/v1/discovery/recommendations/{listing_id}/adopt", headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _today(client, headers):
    response = client.get(TODAY, headers=headers)
    assert response.status_code == 200
    return response.json()


def _set(db, application_id, **fields):
    workspace = db.get(Workspace, application_id)
    for name, value in fields.items():
        setattr(workspace, name, value)
    db.commit()


def test_today_requires_auth(client):
    assert client.get(TODAY).status_code == 401


def test_without_boards_it_asks_for_a_board_and_lists_nothing(client, auth_headers):
    body = _today(client, auth_headers)

    assert body["has_sources"] is False
    assert body["best_matches"] == [] and body["needs_action"] == []


def test_without_confirmed_evidence_it_asks_for_evidence_instead_of_matches(
    client, auth_headers, discovery
):
    discovery.listing(description=K8S)

    body = _today(client, auth_headers)

    assert body["has_sources"] is True and body["has_evidence"] is False
    assert body["best_matches"] == []


def test_best_matches_are_the_top_five_by_skills_fit_skipping_hidden_and_applied(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(title="Accountant", description="Close the books every month.")
    for index in range(6):
        discovery.listing(title=f"Platform {index}", description=f"{K8S} Team {index}.")
    applied = discovery.listing(title="Already Added", description=K8S + " Added.")
    hidden = discovery.listing(title="Hidden", description=K8S + " Hidden.")
    _adopt(client, auth_headers, applied.id)
    client.post(
        "/api/v1/discovery/dismissals", json={"listing_id": hidden.id}, headers=auth_headers
    )

    body = _today(client, auth_headers)

    titles = [item["title"] for item in body["best_matches"]]
    assert len(titles) == 5
    assert all(title.startswith("Platform") for title in titles)
    first = body["best_matches"][0]
    # Skills fit keeps its sample: matched and missing skills come with it.
    assert first["skills_fit"] > 0 and "Kubernetes" in first["matched_skills"]
    assert "apply_url" in first and first["source_name"] == "Greenhouse"


def test_needs_action_lists_interviews_upcoming_deadlines_and_no_reply_prompts(
    client, auth_headers, db, discovery
):
    now = datetime.now(UTC)
    ids = {}
    for name in ("interview", "soon", "later", "past", "stale", "fresh", "offer"):
        listing = discovery.listing(title=name.title(), description=f"Hiring for the {name} role on our team.")
        ids[name] = _adopt(client, auth_headers, listing.id)
    _set(db, ids["interview"], status="interviewing")
    _set(db, ids["soon"], deadline=now + timedelta(days=3))
    _set(db, ids["later"], deadline=now + timedelta(days=30))
    _set(db, ids["past"], deadline=now - timedelta(days=2))
    _set(db, ids["stale"], status="applied", applied_at=now - timedelta(days=22))
    _set(db, ids["fresh"], status="applied", applied_at=now - timedelta(days=5))
    _set(db, ids["offer"], status="offer")

    items = _today(client, auth_headers)["needs_action"]

    assert [(item["title"], item["reason"]) for item in items] == [
        ("Interview", "interview"),
        ("Soon", "deadline"),
        ("Stale", "no_reply"),
    ]
    assert items[0]["application_id"] == ids["interview"]
    assert items[1]["deadline"] is not None
    # The prompt shows how long it has been, so the count is never hidden.
    assert items[2]["days_since_applied"] == 22


def test_needs_action_is_owner_scoped_and_never_changes_status(
    client, auth_headers, db, discovery
):
    listing = discovery.listing()
    application_id = _adopt(client, auth_headers, listing.id)
    _set(db, application_id, status="applied", applied_at=datetime.now(UTC) - timedelta(days=30))
    other = discovery.user_headers("other@example.com")

    assert _today(client, other)["needs_action"] == []
    _today(client, auth_headers)
    assert db.get(Workspace, application_id).status == "applied"
