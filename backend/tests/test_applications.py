"""Applications (#359): the board, preparing, answers, applying, tasks, export.

API-level: every behaviour goes through /api/v1/applications with the real
services, the real tool pipeline and a fake model response.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event

from app.auth.security import create_access_token, hash_password
from app.config import settings
from app.database import Base
from app.models.application_preferences import ApplicationPreferences
from app.models.application_snapshot import ApplicationSnapshot
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.campaign_task import CampaignTask
from app.models.cv_document import CvDocument, CvVariant
from app.models.tool_run import ToolRun
from app.models.user import User
from app.models.workspace import Workspace
from app.services.data_export import export_career_data
from app.services.discovery_recommendations import Match, VisibleListing
from app.services.tool_runs import delete_all_user_data
from tests.conftest import engine

PREFIX = "/api/v1/applications"

SECTIONS = [
    {
        "id": "sec-exp",
        "kind": "experience",
        "title": "Experience",
        "visible": True,
        "position": 0,
        "entries": [
            {
                "id": "ent-1",
                "position": 0,
                "heading": "Senior Backend Engineer",
                "subheading": "Northwind Labs",
                "bullets": ["Moved 14 services to FastAPI and PostgreSQL."],
                "body": "Led the platform team's move to FastAPI.",
            }
        ],
    }
]

DESCRIPTION = (
    "We are hiring a backend engineer to own Python and FastAPI services, "
    "PostgreSQL migrations and CI pipelines for our billing platform."
)

MODEL_OUTPUT = {
    "cover_letter": {
        "body": "I led a move of 14 services to FastAPI.",
        "support": "document",
        "evidence_item_ids": [],
    },
    "screening_answers": [
        {
            "question": "What is your notice period?",
            "answer": "Two weeks.",
            "support": "document",
            "evidence_item_ids": [],
        },
        {
            "question": "What are your salary expectations?",
            "answer": "A guessed figure",
            "support": "document",
            "evidence_item_ids": [],
        },
        {
            # Claims confirmed evidence that does not exist: never drafted.
            "question": "Which cloud platforms have you run in production?",
            "answer": "AWS and GCP",
            "support": "confirmed",
            "evidence_item_ids": ["made-up-evidence"],
        },
    ],
}


# ── Helpers (also used by the Autopilot tests) ──


def make_cv(db, user_id: str, *, name: str = "Platform roles") -> CvVariant:
    document = CvDocument(user_id=user_id, name=f"{name} CV", sections=SECTIONS)
    db.add(document)
    db.flush()
    variant = CvVariant(
        document_id=document.id, name=name, target_role="Backend Engineer", sections=SECTIONS
    )
    db.add(variant)
    db.commit()
    return variant


def make_application(
    db,
    user_id: str,
    *,
    company: str = "Acme",
    role: str = "Backend Engineer",
    apply_url: str | None = "https://jobs.lever.co/acme/123",
    status: str | None = "saved",
    cv: bool = False,
    drafts: bool = False,
) -> Workspace:
    workspace = Workspace(
        user_id=user_id, label=f"{role} — {company}", company=company, role=role, status=status
    )
    db.add(workspace)
    db.flush()
    listing = CampaignListing(
        workspace_id=workspace.id,
        title=role,
        company=company,
        description=DESCRIPTION,
        source_url=apply_url,
        apply_url=apply_url,
        retrieved_at=datetime(2026, 9, 1, tzinfo=UTC),
    )
    db.add(listing)
    db.flush()
    workspace.current_listing_id = listing.id
    if cv:
        workspace.selected_cv_variant_id = make_cv(db, user_id).id
    if drafts:
        run = ToolRun(
            user_id=user_id,
            workspace_id=workspace.id,
            tool_name="application-drafts",
            label="Drafts",
            result_payload={
                "cover_letter": {
                    "body": "Original cover letter.",
                    "support": "document",
                    "evidence_item_ids": [],
                },
                "screening_answers": [
                    {
                        "question": "What is your notice period?",
                        "answer": "Two weeks.",
                        "support": "document",
                        "evidence_item_ids": [],
                    }
                ],
            },
        )
        db.add(run)
        db.flush()
        workspace.drafts_run_id = run.id
    db.commit()
    db.refresh(workspace)
    return workspace


def other_user_headers(db) -> dict:
    other = User(email="intruder@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(other.id)}"}


@pytest.fixture
def fake_model(monkeypatch):
    calls: list[str] = []

    def install(output: dict = MODEL_OUTPUT):
        async def fake(system_prompt, user_prompt, **_kwargs):
            calls.append(user_prompt)
            return output

        monkeypatch.setattr("app.services.application_drafts.complete_structured", fake)
        return calls

    return install


@pytest.fixture
def no_cache(monkeypatch):
    monkeypatch.setattr(settings, "RESULT_CACHE_ENABLED", False)


def _prepare(client, headers, application_id):
    return client.post(f"{PREFIX}/{application_id}/prepare", headers=headers)


def _answer_all(client, headers, application_id):
    detail = client.get(f"{PREFIX}/{application_id}", headers=headers).json()
    answers = {q["key"]: f"My answer to {q['category']}" for q in detail["open_questions"]}
    return client.put(
        f"{PREFIX}/{application_id}/answers", json={"answers": answers}, headers=headers
    )


# ── Owner isolation ──


def test_another_owners_application_is_404_everywhere(client, db, test_user, monkeypatch):
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", True)
    monkeypatch.setattr(
        "app.routers.applications.start_autofill", lambda *a, **k: pytest.fail("browser opened")
    )
    workspace = make_application(db, test_user.id, cv=True, drafts=True)
    task = CampaignTask(workspace_id=workspace.id, title="Follow up")
    db.add(task)
    db.commit()
    headers = other_user_headers(db)
    base = f"{PREFIX}/{workspace.id}"
    for method, path, body in [
        ("get", base, None),
        ("patch", base, {"status": "withdrawn"}),
        ("post", f"{base}/prepare", None),
        ("put", f"{base}/answers", {"answers": {}}),
        ("post", f"{base}/applied", None),
        ("post", f"{base}/autofill", None),
        ("post", f"{base}/review", None),
        ("post", f"{base}/tasks", {"title": "Mine now"}),
        ("patch", f"{base}/tasks/{task.id}", {"completed": True}),
        ("delete", f"{base}/tasks/{task.id}", None),
        ("get", f"{base}/gap-classifications", None),
        ("delete", base, None),
    ]:
        kwargs = {"headers": headers} if body is None else {"headers": headers, "json": body}
        response = getattr(client, method)(path, **kwargs)
        assert response.status_code == 404, (method, path, response.text)
    assert client.get(PREFIX, headers=headers).json()["items"] == []
    db.refresh(workspace)
    assert workspace.status == "saved"
    assert workspace.applied_at is None
    assert db.query(CampaignTask).count() == 1


# ── Board ──


def test_board_lists_only_applications_with_card_fields(client, db, test_user, auth_headers):
    plain = Workspace(user_id=test_user.id, label="Resume Workspace")
    db.add(plain)
    workspace = make_application(db, test_user.id, drafts=True)
    workspace.match_score = 81
    workspace.deadline = datetime.now(UTC) + timedelta(days=9)
    db.add_all(
        [
            CampaignTask(workspace_id=workspace.id, title="Later", deadline=datetime.now(UTC) + timedelta(days=5)),
            CampaignTask(workspace_id=workspace.id, title="Undated"),
            CampaignTask(workspace_id=workspace.id, title="Soonest", deadline=datetime.now(UTC) + timedelta(days=1)),
            CampaignTask(
                workspace_id=workspace.id,
                title="Done",
                deadline=datetime.now(UTC),
                completed=True,
            ),
        ]
    )
    db.commit()

    body = client.get(PREFIX, headers=auth_headers).json()

    assert body["total"] == 1
    card = body["items"][0]
    assert card["id"] == workspace.id
    assert (card["title"], card["company"], card["status"]) == ("Backend Engineer", "Acme", "saved")
    assert card["match_score"] == 81
    assert card["prepared"] is True and card["ready"] is True
    assert card["open_question_count"] == 0
    assert card["next_task"]["title"] == "Soonest"
    assert "listing" not in card and "description" not in card


def test_board_never_reads_run_payloads_or_job_descriptions(client, db, test_user, auth_headers):
    for index in range(3):
        make_application(db, test_user.id, company=f"Company {index}", drafts=True)
    statements: list[str] = []

    def capture(_conn, _cursor, statement, *_args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    try:
        response = client.get(PREFIX, headers=auth_headers)
    finally:
        event.remove(engine, "before_cursor_execute", capture)

    assert response.status_code == 200 and response.json()["total"] == 3
    selects = [statement for statement in statements if statement.lstrip().startswith("SELECT")]
    assert not any("result_payload" in statement for statement in selects)
    assert not any("description" in statement for statement in selects)
    # Constant queries (user, applications, tasks, last events), never one per card.
    assert len(selects) <= 5


# ── Prepare ──


def test_prepare_drafts_through_the_pipeline_and_lists_open_questions(
    client, db, test_user, auth_headers, fake_model
):
    calls = fake_model()
    variant = make_cv(db, test_user.id)
    workspace = make_application(db, test_user.id, status=None)

    response = _prepare(client, auth_headers, workspace.id)

    assert response.status_code == 200, response.text
    detail = response.json()
    assert len(calls) == 1 and "FastAPI" in calls[0]
    # The owner's newest CV is chosen when none was.
    assert detail["selected_materials"]["cv_variant"]["id"] == variant.id
    assert detail["status"] == "saved"
    drafts = detail["drafts"]
    run = db.get(ToolRun, drafts["run_id"])
    assert run.tool_name == "application-drafts" and run.workspace_id == workspace.id
    assert drafts["cover_letter"]["body"] == "I led a move of 14 services to FastAPI."
    # Only the grounded, non-sensitive answer is drafted.
    assert [a["question"] for a in drafts["screening_answers"]] == ["What is your notice period?"]
    questions = {q["question"]: q for q in detail["open_questions"]}
    assert questions["What are your salary expectations?"]["category"] == "salary"
    # A hallucinated "confirmed" claim is downgraded, never drafted.
    assert questions["Which cloud platforms have you run in production?"]["category"] == "uncertain"
    assert "A guessed figure" not in str(run.result_payload)
    assert detail["prepared"] is True and detail["ready"] is False
    assert detail["open_question_count"] == 2
    assert "prepared" in [e["event_type"] for e in detail["events"]]


def test_prepare_needs_a_posting_and_a_cv(client, db, test_user, auth_headers, fake_model):
    calls = fake_model()
    workspace = make_application(db, test_user.id)
    response = _prepare(client, auth_headers, workspace.id)
    assert response.status_code == 409
    assert "CV" in response.json()["detail"]

    make_cv(db, test_user.id)
    workspace.current_listing_id = None
    db.commit()
    response = _prepare(client, auth_headers, workspace.id)
    assert response.status_code == 409
    assert "job posting" in response.json()["detail"]
    assert calls == []


def test_reprepare_creates_a_new_run_and_keeps_answers(
    client, db, test_user, auth_headers, fake_model, no_cache
):
    fake_model()
    workspace = make_application(db, test_user.id, cv=True)
    first = _prepare(client, auth_headers, workspace.id).json()
    _answer_all(client, auth_headers, workspace.id)

    second = _prepare(client, auth_headers, workspace.id).json()

    assert second["drafts"]["run_id"] != first["drafts"]["run_id"]
    assert all(q["answered"] for q in second["open_questions"])
    assert second["ready"] is True


# ── Answers ──


def test_answers_resolve_open_questions_and_unlock_applying(
    client, db, test_user, auth_headers, fake_model, monkeypatch
):
    fake_model()
    monkeypatch.setattr(settings, "AUTOPILOT_EXPERIMENT_ENABLED", True)
    monkeypatch.setattr(
        "app.routers.applications.start_autofill", lambda *a, **k: pytest.fail("browser opened")
    )
    workspace = make_application(db, test_user.id, cv=True)
    detail = _prepare(client, auth_headers, workspace.id).json()
    keys = [q["key"] for q in detail["open_questions"]]

    assert client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers).status_code == 409
    assert client.post(f"{PREFIX}/{workspace.id}/autofill", headers=auth_headers).status_code == 409

    unknown = client.put(
        f"{PREFIX}/{workspace.id}/answers", json={"answers": {"nope": "x"}}, headers=auth_headers
    )
    assert unknown.status_code == 422

    partial = client.put(
        f"{PREFIX}/{workspace.id}/answers",
        json={"answers": {keys[0]: "  90k EUR  ", keys[1]: "   "}},
        headers=auth_headers,
    ).json()
    assert partial["answers"] == {keys[0]: "90k EUR"}
    assert partial["open_question_count"] == 1 and partial["ready"] is False

    done = _answer_all(client, auth_headers, workspace.id).json()
    assert done["open_question_count"] == 0 and done["ready"] is True
    # The log records that answers were saved, never what they say.
    saved = [e for e in done["events"] if e["event_type"] == "answers_saved"]
    assert saved[-1]["details"] == {"answered_count": 2}
    assert client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers).status_code == 200


# ── Mark as applied ──


def test_mark_applied_freezes_one_snapshot_and_moves_the_card(
    client, db, test_user, auth_headers, fake_model
):
    fake_model()
    workspace = make_application(db, test_user.id, cv=True)
    _prepare(client, auth_headers, workspace.id)
    _answer_all(client, auth_headers, workspace.id)

    first = client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers)
    second = client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers)

    assert first.status_code == second.status_code == 200
    body = second.json()
    assert body["status"] == "applied" and body["applied_at"] is not None
    assert db.query(ApplicationSnapshot).count() == 1
    assert body["snapshot"]["id"] == first.json()["snapshot"]["id"]
    content = body["snapshot"]["content"]
    assert content["listing"]["apply_url"] == "https://jobs.lever.co/acme/123"
    assert content["cv_variant"]["sections"] == SECTIONS
    assert content["cover_letter"] == {
        "source": "prepared",
        "run_id": body["drafts"]["run_id"],
        "text": "I led a move of 14 services to FastAPI.",
    }
    assert {a["category"] for a in content["answers"]} == {"salary", "uncertain"}
    board = client.get(PREFIX, headers=auth_headers).json()["items"][0]
    assert board["status"] == "applied"

    # Later edits never change what was sent.
    variant = db.get(CvVariant, workspace.selected_cv_variant_id)
    variant.sections = []
    cover = ToolRun(
        user_id=test_user.id, tool_name="cover-letter", result_payload={"full_text": "New letter"}
    )
    db.add(cover)
    db.commit()
    client.patch(
        f"{PREFIX}/{workspace.id}", json={"cover_letter_run_id": cover.id}, headers=auth_headers
    )
    again = client.get(f"{PREFIX}/{workspace.id}", headers=auth_headers).json()
    assert again["snapshot"] == body["snapshot"]
    events = [e["event_type"] for e in again["events"]]
    assert events.count("applied") == 1


def test_apply_button_leaves_a_later_stage_alone(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id, status="interviewing")
    body = client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers).json()
    assert body["status"] == "interviewing"
    assert body["applied_at"] is not None and body["snapshot"] is not None


# ── Board moves ──


def test_moving_to_applied_on_the_board_is_mark_as_applied(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id, cv=True, drafts=True)

    moved = client.patch(
        f"{PREFIX}/{workspace.id}", json={"status": "applied"}, headers=auth_headers
    ).json()

    assert moved["status"] == "applied"
    assert moved["applied_at"] is not None
    assert moved["snapshot"]["content"]["cover_letter"]["text"] == "Original cover letter."
    events = [e["event_type"] for e in moved["events"]]
    assert events.count("applied") == 1 and events.count("status_changed") == 1


def test_any_move_is_allowed_including_back(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    endpoint = f"{PREFIX}/{workspace.id}"
    for status in ("applied", "offer", "rejected", "interviewing"):
        response = client.patch(endpoint, json={"status": status}, headers=auth_headers)
        assert response.status_code == 200 and response.json()["status"] == status
    assert db.query(ApplicationSnapshot).count() == 1

    back = client.patch(endpoint, json={"status": "saved"}, headers=auth_headers).json()
    # Back to saved undoes the mis-click: the application was not sent.
    assert back["status"] == "saved" and back["applied_at"] is None and back["snapshot"] is None
    assert db.query(ApplicationSnapshot).count() == 0
    reapplied = client.patch(endpoint, json={"status": "applied"}, headers=auth_headers).json()
    assert reapplied["snapshot"] is not None
    assert client.patch(endpoint, json={"status": None}, headers=auth_headers).status_code == 422
    assert client.patch(endpoint, json={"status": "accepted"}, headers=auth_headers).status_code == 422


def test_a_refused_move_saves_nothing(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    workspace.open_questions = [{"key": "q-1", "question": "Salary?", "category": "salary"}]
    db.commit()

    response = client.patch(
        f"{PREFIX}/{workspace.id}",
        json={"status": "applied", "notes": "Should not stick"},
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert "open questions" in response.json()["detail"]
    db.expire_all()
    assert db.get(Workspace, workspace.id).notes is None
    assert db.get(Workspace, workspace.id).status == "saved"


def test_patch_edits_fields_and_notes(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    deadline = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    body = client.patch(
        f"{PREFIX}/{workspace.id}",
        json={"company": " Globex ", "deadline": deadline, "notes": "Ask about on-call."},
        headers=auth_headers,
    ).json()
    assert body["company"] == "Globex" and body["notes"] == "Ask about on-call."
    assert "deadline_changed" in [e["event_type"] for e in body["events"]]
    naive = client.patch(
        f"{PREFIX}/{workspace.id}", json={"deadline": "2026-10-01T10:00:00"}, headers=auth_headers
    )
    assert naive.status_code == 422


def test_delete_removes_the_application_and_its_children(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    client.post(f"{PREFIX}/{workspace.id}/tasks", json={"title": "Call"}, headers=auth_headers)
    client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers)

    assert client.delete(f"{PREFIX}/{workspace.id}", headers=auth_headers).json() == {"deleted": 1}

    assert db.query(Workspace).count() == 0
    for model in (CampaignTask, ApplicationSnapshot, CampaignListing, CampaignEvent):
        assert db.query(model).count() == 0


# ── Bulk "prepare applications for me" ──


@pytest.fixture
def feed(monkeypatch, discovery):
    """A ranked feed of real, visible listings; counts how often it is ranked."""
    source = discovery.source("feed", provider="lever")
    rows = []
    for listing_id, title, location, remote, score in [
        ("l-1", "Backend Engineer", "Berlin", None, 90),
        ("l-2", "Python Developer", None, True, 85),
        ("l-3", "Backend Engineer", "Tokyo", None, 80),
        ("l-4", "Designer", "Berlin", None, 75),
        ("l-5", "Senior Backend Engineer", "Berlin", None, 60),
    ]:
        listing = discovery.listing(
            source,
            listing_id=listing_id,
            title=title,
            company=f"{listing_id} Inc",
            description=f"{title} at {listing_id}. Ship useful software with a small team.",
            location=location,
            remote=remote,
            apply_url=f"https://jobs.lever.co/{listing_id}/1",
        )
        rows.append((listing, score))
    state = {"ranked": 0}

    def ranked(_db, _user_id, **_kwargs):
        state["ranked"] += 1
        return [
            VisibleListing(listing, listing.attributions[0], Match(skills_fit=score))
            for listing, score in rows
        ]

    monkeypatch.setattr("app.services.applications.best_matches", ranked)
    monkeypatch.setattr(
        "app.services.discovery_adoption.visible_listing",
        lambda *a, **k: pytest.fail("adoption re-read a listing bulk prepare already ranked"),
    )
    return state


def _set_preferences(client, headers, **body):
    return client.put(f"{PREFIX}/preferences", json=body, headers=headers)


def test_bulk_prepare_needs_preferences_and_a_cv(client, db, test_user, auth_headers, feed):
    assert client.get(f"{PREFIX}/preferences", headers=auth_headers).json()["is_default"] is True
    result = client.post(f"{PREFIX}/prepare", headers=auth_headers).json()
    assert result["reason"] == "no_preferences" and result["prepared"] == []

    _set_preferences(client, auth_headers, keywords=["backend"])
    result = client.post(f"{PREFIX}/prepare", headers=auth_headers).json()
    assert result["reason"] == "no_cv"
    assert feed["ranked"] == 0 and db.query(Workspace).count() == 0


def test_bulk_prepare_filters_caps_ranks_once_and_is_idempotent(
    client, db, test_user, auth_headers, feed, fake_model
):
    fake_model()
    make_cv(db, test_user.id)
    prefs = _set_preferences(
        client,
        auth_headers,
        keywords=["backend", "python", "Backend"],
        locations=["Berlin"],
        remote=True,
        max_per_run=2,
    ).json()
    assert prefs["keywords"] == ["backend", "python"] and prefs["max_per_run_limit"] == 10

    first = client.post(f"{PREFIX}/prepare", headers=auth_headers).json()

    assert first["reason"] == "prepared"
    # l-3 is in Tokyo and l-4 is not a backend role; the cap stops before l-5.
    assert first["matched_count"] == 3
    assert [card["title"] for card in first["prepared"]] == ["Backend Engineer", "Python Developer"]
    assert feed["ranked"] == 1
    adopted = db.query(Workspace).filter(Workspace.discovery_listing_id == "l-1").one()
    assert adopted.match_score == 90 and adopted.drafts_run_id is not None
    assert adopted.listing.apply_url == "https://jobs.lever.co/l-1/1"

    # Withdraw one; re-running prepares only the next match, never a duplicate.
    client.patch(f"{PREFIX}/{adopted.id}", json={"status": "withdrawn"}, headers=auth_headers)
    second = client.post(f"{PREFIX}/prepare", headers=auth_headers).json()
    assert [card["title"] for card in second["prepared"]] == ["Senior Backend Engineer"]
    assert second["skipped_existing_count"] == 2
    assert db.query(Workspace).count() == 3
    assert db.get(Workspace, adopted.id).status == "withdrawn"


def test_bulk_prepare_prepares_a_saved_unprepared_adoption(
    client, db, test_user, auth_headers, feed, fake_model
):
    fake_model()
    make_cv(db, test_user.id)
    existing = make_application(db, test_user.id, company="l-1 Inc")
    existing.discovery_listing_id = "l-1"
    db.commit()
    _set_preferences(client, auth_headers, keywords=["backend"], max_per_run=1)

    result = client.post(f"{PREFIX}/prepare", headers=auth_headers).json()

    assert [card["id"] for card in result["prepared"]] == [existing.id]
    assert db.query(Workspace).count() == 1


def test_preferences_are_bounded(client, auth_headers):
    too_many = _set_preferences(client, auth_headers, keywords=["x"], max_per_run=11)
    assert too_many.status_code == 422
    unknown = _set_preferences(client, auth_headers, keywords=["x"], cost_ceiling_usd=5)
    assert unknown.status_code == 422


# ── Material selection ──


def test_material_selection_rejects_foreign_or_wrong_type_references(
    client, db, test_user, auth_headers
):
    workspace = make_application(db, test_user.id)
    interview = ToolRun(user_id=test_user.id, tool_name="interview", result_payload={})
    other = User(email="someone@example.com", hashed_password=hash_password("password123"))
    db.add_all([interview, other])
    db.commit()
    foreign_variant = make_cv(db, other.id)
    endpoint = f"{PREFIX}/{workspace.id}"

    assert client.patch(endpoint, json={"cv_variant_id": foreign_variant.id}, headers=auth_headers).status_code == 422
    assert client.patch(endpoint, json={"cover_letter_run_id": interview.id}, headers=auth_headers).status_code == 422
    ok = client.patch(endpoint, json={"interview_run_id": interview.id}, headers=auth_headers)
    assert ok.json()["selected_materials"]["interview"]["id"] == interview.id
    picker = ok.json()["available_materials"]
    assert [item["id"] for item in picker["interviews"]] == [interview.id]
    assert picker["cv_variants"] == []  # another owner's CV is never offered


def test_deleting_a_run_clears_it_from_applications(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id, drafts=True)
    cover = ToolRun(user_id=test_user.id, tool_name="cover-letter", result_payload={})
    db.add(cover)
    db.commit()
    client.patch(
        f"{PREFIX}/{workspace.id}", json={"cover_letter_run_id": cover.id}, headers=auth_headers
    )
    drafts_id = workspace.drafts_run_id

    client.delete(f"/api/v1/history/{cover.id}", headers=auth_headers)
    client.delete(f"/api/v1/history/{drafts_id}", headers=auth_headers)

    detail = client.get(f"{PREFIX}/{workspace.id}", headers=auth_headers).json()
    assert detail["selected_materials"]["cover_letter"] is None
    assert detail["drafts"] is None and detail["prepared"] is False
    # The application outlives its last run.
    assert db.get(Workspace, workspace.id) is not None


# ── Tasks ──


def test_tasks_create_complete_delete(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    tasks = f"{PREFIX}/{workspace.id}/tasks"
    due = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    created = client.post(tasks, json={"title": " Send portfolio ", "deadline": due}, headers=auth_headers)
    assert created.status_code == 201 and created.json()["title"] == "Send portfolio"
    task_id = created.json()["id"]
    assert client.get(PREFIX, headers=auth_headers).json()["items"][0]["next_task"]["title"] == (
        "Send portfolio"
    )

    done = client.patch(f"{tasks}/{task_id}", json={"completed": True}, headers=auth_headers)
    assert done.json()["completed"] is True
    assert client.get(PREFIX, headers=auth_headers).json()["items"][0]["next_task"] is None
    assert client.delete(f"{tasks}/{task_id}", headers=auth_headers).json() == {"deleted": 1}
    assert client.delete(f"{tasks}/{task_id}", headers=auth_headers).status_code == 404
    events = [e["event_type"] for e in client.get(f"{PREFIX}/{workspace.id}", headers=auth_headers).json()["events"]]
    assert ["task_created", "task_completed", "task_deleted"] == [
        e for e in events if e.startswith("task_")
    ]


# ── Export and account deletion ──


def test_export_includes_applications_and_deletion_removes_them(
    client, db, test_user, auth_headers
):
    workspace = make_application(db, test_user.id, drafts=True)
    workspace.notes = "Referral from Priya"
    workspace.open_questions = [{"key": "q-1", "question": "Salary?", "category": "salary"}]
    workspace.answers = {"q-1": "90k"}
    db.commit()
    client.post(f"{PREFIX}/{workspace.id}/tasks", json={"title": "Call"}, headers=auth_headers)
    client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers)
    _set_preferences(client, auth_headers, keywords=["backend"])

    exported = export_career_data(db, test_user.id).applications
    assert exported.application_count == 1
    item = exported.applications[0]
    assert item.notes == "Referral from Priya" and item.answers == {"q-1": "90k"}
    assert item.applied_at is not None and item.snapshot is not None
    assert item.drafts.result_payload["cover_letter"]["body"] == "Original cover letter."
    assert [task.title for task in item.tasks] == ["Call"]
    assert exported.preferences.keywords == ["backend"]
    assert "applied" in [event.event_type for event in item.events]

    delete_all_user_data(db, test_user.id)

    for model in (
        Workspace,
        CampaignTask,
        ApplicationSnapshot,
        CampaignEvent,
        CampaignListing,
        ApplicationPreferences,
    ):
        assert db.query(model).count() == 0, model


# ── Submission stays human ──


def test_no_endpoint_or_service_submits_an_application():
    from app.main import app
    from app.services import applications

    paths = [getattr(route, "path", "") for route in app.routes]
    names = [getattr(route, "name", "") or "" for route in app.routes]
    assert not any("submit" in value.casefold() for value in [*paths, *names])
    assert not any("submit" in name.casefold() for name in dir(applications))
    assert not any("submission" in table for table in Base.metadata.tables)
