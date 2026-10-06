"""B14 item 15: the two advisory offers about the documents name CV Studio as their next step."""

from __future__ import annotations

from tests.test_b7_evidence_integrity import APPS, _gap, _workspace


def _offer(client, headers, db, user_id, **gap):
    workspace = _workspace(db, user_id)
    row = _gap(db, user_id, workspace, **gap)
    response = client.get(f"{APPS}/{workspace.id}/gap-classifications/{row.id}/response", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_add_this_to_your_cv_points_at_cv_studio(client, auth_headers, test_user, db):
    body = _offer(
        client,
        auth_headers,
        db,
        test_user.id,
        gap_kind="uncaptured_evidence",
        trace=[
            "listing_requirement:PostgreSQL",
            "result:not_found_in_selected_materials",
            "profile_lookup:PostgreSQL:demonstrated_in:achievement",
            "classified:uncaptured_evidence",
        ],
        message="The job asks for PostgreSQL, but your CV and cover letter don't mention it.",
    )

    assert body["headline"] == "Add this to your CV"
    assert body["sources"] == [{"label": "CV Studio: PostgreSQL", "url": None, "route": "/cv-studio"}]


def test_add_the_content_first_points_at_cv_studio(client, auth_headers, test_user, db):
    body = _offer(
        client,
        auth_headers,
        db,
        test_user.id,
        gap_kind="presentation_weakness",
        category="document_defect",
        trace=["visible_characters:0", "minimum:80", "classified:presentation_weakness"],
        message="Your CV looks almost empty.",
    )

    assert body["headline"] == "Add the content first"
    assert [source["route"] for source in body["sources"]] == ["/cv-studio"]
    assert body["sources"][0]["label"].startswith("CV Studio")
