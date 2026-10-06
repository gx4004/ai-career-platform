"""B14 item 13: concurrent adoption of one listing answers 201 once, then 200 with the same application."""

from __future__ import annotations

from sqlalchemy import insert

from app.models.workspace import Workspace
from app.services import discovery_adoption


def _adopt(client, headers, listing_id):
    return client.post(f"/api/v1/discovery/recommendations/{listing_id}/adopt", headers=headers)


def _competing_application(db, user_id: str, listing_id: str) -> None:
    """What the other, concurrent request wrote first."""
    db.execute(
        insert(Workspace).values(
            id="concurrent-winner",
            user_id=user_id,
            label="Platform Engineer — Acme",
            company="Acme",
            role="Platform Engineer",
            status="saved",
            discovery_listing_id=listing_id,
        )
    )


def test_a_request_that_loses_the_race_after_the_route_check_answers_200(
    client, auth_headers, db, discovery, test_user, monkeypatch
):
    listing = discovery.listing()
    real_visible = discovery_adoption.visible_listing

    def visible_then_lose_the_race(db_, user_id, listing_id, **kwargs):
        visible = real_visible(db_, user_id, listing_id, **kwargs)
        _competing_application(db_, user_id, listing_id)
        return visible

    monkeypatch.setattr(discovery_adoption, "visible_listing", visible_then_lose_the_race)

    response = _adopt(client, auth_headers, listing.id)

    assert response.status_code == 200
    assert response.json()["id"] == "concurrent-winner"
    assert db.query(Workspace).filter_by(discovery_listing_id=listing.id).count() == 1


def test_a_request_whose_insert_hits_the_unique_constraint_answers_200(
    client, auth_headers, db, discovery, test_user, monkeypatch
):
    """The other request commits between this one's existence check and its insert."""
    listing = discovery.listing()
    raced = {"done": False}
    real_begin_nested = db.begin_nested

    def winner_commits_first():
        if not raced["done"]:
            raced["done"] = True
            _competing_application(db, test_user.id, listing.id)
        return real_begin_nested()

    monkeypatch.setattr(db, "begin_nested", winner_commits_first)

    response = _adopt(client, auth_headers, listing.id)

    assert raced["done"]
    assert response.status_code == 200
    assert response.json()["id"] == "concurrent-winner"
    assert db.query(Workspace).filter_by(discovery_listing_id=listing.id).count() == 1


def test_the_first_adoption_is_still_201(client, auth_headers, discovery):
    listing = discovery.listing()

    first = _adopt(client, auth_headers, listing.id)
    again = _adopt(client, auth_headers, listing.id)

    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["id"] == again.json()["id"]
