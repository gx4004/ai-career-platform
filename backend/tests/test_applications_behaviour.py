"""Applications behaviour (B8): creating, deadlines, standing answers, replacing a listing.

Every test goes through /api/v1 with the real services and the real tool pipeline;
expected values come from the product contract (ADR 0009, spec.md, CONTEXT.md),
not from the code under test.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.main import app
from app.models.application_snapshot import ApplicationSnapshot
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from tests import test_applications as _base
from tests.test_applications import (
    DESCRIPTION,
    MODEL_OUTPUT,
    PREFIX,
    make_application,
    make_cv,
    other_user_headers,
)

# Fixtures shared with the application tests (re-bound, so no import-shadowing).
fake_model = _base.fake_model
no_cache = _base.no_cache

DETAILS_URL = f"{PREFIX}/details"
LISTING = (
    "We are hiring a Staff Rust Engineer to own the systems layer, memory-safe "
    "services and the build tooling for our storage platform."
)


def _job_match_workspace(db, user_id: str, *, score: int = 70):
    """What the Job Match tool leaves behind: a workspace named by the tool label."""
    label = f"Job Match ({score}%)"
    workspace = Workspace(user_id=user_id, label=label)
    db.add(workspace)
    db.flush()
    run = ToolRun(
        user_id=user_id,
        workspace_id=workspace.id,
        tool_name="job-match",
        label=label,
        result_payload={"match_score": score, "verdict": "borderline"},
    )
    db.add(run)
    db.commit()
    db.refresh(workspace)
    db.refresh(run)
    return workspace, run


def _detail(client, headers, application_id):
    response = client.get(f"{PREFIX}/{application_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _import_text(client, headers, workspace_id, *, title, company, description=LISTING):
    return client.post(
        "/api/v1/job-posts/import-text",
        headers=headers,
        json={
            "campaign_id": workspace_id,
            "job_title": title,
            "company_name": company,
            "job_description": description,
        },
    )


# ── applications-d04: create manually, from a listing, from a Job Match ──


def test_an_application_can_be_created_by_hand(client, db, test_user, auth_headers):
    response = client.post(
        PREFIX,
        json={"role": " Data Engineer ", "company": "Fjord Analytics"},
        headers=auth_headers,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["title"], body["company"], body["status"]) == (
        "Data Engineer",
        "Fjord Analytics",
        "saved",
    )
    assert body["listing"] is None
    board = client.get(PREFIX, headers=auth_headers).json()
    assert [card["id"] for card in board["items"]] == [body["id"]]
    assert "created" in [event["event_type"] for event in body["events"]]


def test_a_manual_application_with_a_posting_can_be_prepared(
    client, db, test_user, auth_headers, fake_model
):
    fake_model()
    make_cv(db, test_user.id)
    created = client.post(
        PREFIX,
        json={
            "role": "Data Engineer",
            "company": "Fjord Analytics",
            "description": DESCRIPTION,
            "source_url": "https://fjord.example/jobs/1",
            "deadline": "2026-12-01T12:00:00+00:00",
        },
        headers=auth_headers,
    ).json()

    assert created["listing"]["title"] == "Data Engineer"
    assert created["listing"]["source_url"] == "https://fjord.example/jobs/1"
    assert created["deadline"].startswith("2026-12-01T12:00:00")
    prepared = client.post(f"{PREFIX}/{created['id']}/prepare", headers=auth_headers)
    assert prepared.status_code == 200 and prepared.json()["prepared"] is True


def test_creating_needs_a_role_and_a_company_and_safe_links(client, auth_headers):
    for body in (
        {"role": "Engineer"},
        {"company": "Acme"},
        {"role": "   ", "company": "Acme"},
        {"role": "Engineer", "company": "Acme", "description": "too short"},
        {"role": "Engineer", "company": "Acme", "source_url": "javascript:alert(1)"},
        {"role": "Engineer", "company": "Acme", "status": "applied"},
    ):
        assert client.post(PREFIX, json=body, headers=auth_headers).status_code == 422, body
    assert client.post(PREFIX, json={"role": "E", "company": "A"}).status_code == 401


def test_a_job_match_can_be_tracked_in_one_step(client, db, test_user, auth_headers):
    workspace, run = _job_match_workspace(db, test_user.id, score=70)

    response = client.post(
        PREFIX,
        json={
            "history_id": run.id,
            "role": "Platform Engineer",
            "company": "Harbor Health",
            "description": DESCRIPTION,
        },
        headers=auth_headers,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    # The Job Match's own workspace becomes the application: one card, not two.
    assert body["id"] == workspace.id
    assert (body["title"], body["company"], body["match_score"]) == (
        "Platform Engineer",
        "Harbor Health",
        70,
    )
    assert body["label"] == "Platform Engineer — Harbor Health"
    assert len(client.get(PREFIX, headers=auth_headers).json()["items"]) == 1
    assert db.get(ToolRun, run.id).workspace_id == workspace.id

    again = client.post(
        PREFIX,
        json={"history_id": run.id, "role": "Other", "company": "Other"},
        headers=auth_headers,
    )
    assert again.status_code == 200 and again.json()["id"] == workspace.id
    assert again.json()["title"] == "Platform Engineer"


def test_a_job_match_without_a_workspace_gets_one(client, db, test_user, auth_headers):
    run = ToolRun(
        user_id=test_user.id,
        tool_name="job-match",
        label="Job Match (64%)",
        result_payload={"match_score": 64},
    )
    db.add(run)
    db.commit()

    response = client.post(
        PREFIX,
        json={"history_id": run.id, "role": "SRE", "company": "Delta"},
        headers=auth_headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["match_score"] == 64
    assert db.get(ToolRun, run.id).workspace_id == response.json()["id"]


def test_tracking_refuses_another_owners_or_a_non_job_match_run(
    client, db, test_user, auth_headers
):
    _, theirs = _job_match_workspace(db, test_user.id)
    intruder = other_user_headers(db)
    body = {"history_id": theirs.id, "role": "R", "company": "C"}
    assert client.post(PREFIX, json=body, headers=intruder).status_code == 404

    cover = ToolRun(user_id=test_user.id, tool_name="cover-letter", result_payload={})
    db.add(cover)
    db.commit()
    wrong = client.post(PREFIX, json={**body, "history_id": cover.id}, headers=auth_headers)
    assert wrong.status_code == 422


def test_attaching_a_posting_to_a_job_match_workspace_names_the_card_and_keeps_the_fit(
    client, db, test_user, auth_headers
):
    workspace, _run = _job_match_workspace(db, test_user.id, score=70)

    assert (
        _import_text(
            client, auth_headers, workspace.id, title="Platform Engineer", company="Harbor Health"
        ).status_code
        == 200
    )

    card = client.get(PREFIX, headers=auth_headers).json()["items"][0]
    assert (card["title"], card["company"]) == ("Platform Engineer", "Harbor Health")
    assert card["match_score"] == 70
    # The tool label must not stay as a "name the owner chose".
    assert card["label"] == "Platform Engineer — Harbor Health"


def test_a_name_the_owner_chose_survives_attaching_a_posting(client, db, test_user, auth_headers):
    workspace = Workspace(user_id=test_user.id, label="Dream job")
    db.add(workspace)
    db.commit()

    _import_text(client, auth_headers, workspace.id, title="Platform Engineer", company="Harbor")

    assert _detail(client, auth_headers, workspace.id)["label"] == "Dream job"


# ── applications-d05: the deadline is editable and drives Needs action ──


def test_a_deadline_can_be_set_changed_and_cleared(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    url = f"{PREFIX}/{workspace.id}"

    soon = (datetime.now(UTC) + timedelta(days=2)).replace(microsecond=0)
    set_ = client.patch(url, json={"deadline": soon.isoformat()}, headers=auth_headers)
    assert set_.status_code == 200
    assert datetime.fromisoformat(set_.json()["deadline"]) == soon

    today = client.get("/api/v1/today", headers=auth_headers).json()
    assert [(i["application_id"], i["reason"]) for i in today["needs_action"]] == [
        (workspace.id, "deadline")
    ]

    cleared = client.patch(url, json={"deadline": None}, headers=auth_headers)
    assert cleared.json()["deadline"] is None
    assert client.get("/api/v1/today", headers=auth_headers).json()["needs_action"] == []


# ── applications-d21: one timezone everywhere ──


def test_deadline_changed_events_and_task_times_are_utc(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    url = f"{PREFIX}/{workspace.id}"
    local = "2026-11-02T09:30:00+03:00"
    client.patch(url, json={"deadline": local}, headers=auth_headers)
    task = client.post(
        f"{url}/tasks", json={"title": "Call", "deadline": local}, headers=auth_headers
    ).json()

    detail = _detail(client, auth_headers, workspace.id)
    event = next(e for e in detail["events"] if e["event_type"] == "deadline_changed")
    assert event["details"]["to"] == "2026-11-02T06:30:00+00:00"
    expected = datetime(2026, 11, 2, 6, 30, tzinfo=UTC)
    for value in (task["deadline"], detail["tasks"][0]["deadline"]):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        assert parsed == expected
        assert parsed.utcoffset() == timedelta(0)
    created = datetime.fromisoformat(task["created_at"].replace("Z", "+00:00"))
    assert created.utcoffset() == timedelta(0)


# ── applications-d06: standing answers resolve open questions ──


def test_standing_answers_resolve_matching_open_questions_as_editable_answers(
    client, db, test_user, auth_headers, fake_model
):
    fake_model()
    make_cv(db, test_user.id)
    client.put(
        DETAILS_URL,
        json={"salary_expectation": "90k EUR", "work_authorization": "EU citizen"},
        headers=auth_headers,
    )
    workspace = make_application(db, test_user.id)

    detail = client.post(f"{PREFIX}/{workspace.id}/prepare", headers=auth_headers).json()

    by_question = {q["question"]: q for q in detail["open_questions"]}
    salary = by_question["What are your salary expectations?"]
    assert salary["answered"] is True
    assert detail["answers"][salary["key"]] == "90k EUR"
    # A question no standing answer covers stays open for the owner.
    cloud = by_question["Which cloud platforms have you run in production?"]
    assert cloud["answered"] is False
    assert detail["open_question_count"] == 1

    # The prefilled answer is a suggestion: the owner can still change it.
    edited = client.put(
        f"{PREFIX}/{workspace.id}/answers",
        json={"answers": {salary["key"]: "95k EUR"}},
        headers=auth_headers,
    ).json()
    assert edited["answers"][salary["key"]] == "95k EUR"


def test_a_standing_answer_never_overwrites_what_the_owner_typed(
    client, db, test_user, auth_headers, fake_model
):
    fake_model()
    make_cv(db, test_user.id)
    workspace = make_application(db, test_user.id)
    first = client.post(f"{PREFIX}/{workspace.id}/prepare", headers=auth_headers).json()
    salary_key = next(q["key"] for q in first["open_questions"] if q["category"] == "salary")
    client.put(
        f"{PREFIX}/{workspace.id}/answers",
        json={"answers": {salary_key: "Negotiable"}},
        headers=auth_headers,
    )
    client.put(DETAILS_URL, json={"salary_expectation": "90k EUR"}, headers=auth_headers)

    again = client.post(f"{PREFIX}/{workspace.id}/prepare", headers=auth_headers).json()

    assert again["answers"][salary_key] == "Negotiable"


def test_without_standing_answers_the_stop_questions_stay_open(
    client, db, test_user, auth_headers, fake_model
):
    fake_model()
    make_cv(db, test_user.id)
    workspace = make_application(db, test_user.id)

    detail = client.post(f"{PREFIX}/{workspace.id}/prepare", headers=auth_headers).json()

    assert detail["open_question_count"] == 2 and detail["answers"] == {}
    assert client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers).status_code == 409


@pytest.mark.parametrize(
    "category,question,expected",
    [
        ("salary", "What are your salary expectations?", "90k EUR"),
        ("salary", "What is your current salary expectation?", "90k EUR"),
        ("salary", "What is your current salary?", None),
        ("salary", "Please provide your salary history.", None),
        ("salary", "What was your previous compensation?", None),
        ("relocation", "Are you willing to relocate?", "Open to relocate"),
        ("eligibility", "Are you authorised to work in the UK?", "EU citizen"),
        ("work_authorization", "Do you have the right to work in Germany?", "EU citizen"),
        (
            "work_authorization",
            "What is your current work authorization or visa status?",
            "EU citizen",
        ),
        (
            "work_authorization",
            "Will you now or in the future require visa sponsorship?",
            "No sponsorship needed",
        ),
        ("work_authorization", "Do you have a valid visa to work in the UK?", None),
        (
            "work_authorization",
            "Are you authorized to work here and will you require sponsorship?",
            None,
        ),
        ("eligibility", "Are you legally authorized to work in the US?", "EU citizen"),
    ],
)
def test_a_standing_answer_only_resolves_a_stop_it_actually_answers(
    client, db, test_user, auth_headers, fake_model, category, question, expected
):
    fake_model(
        {
            **MODEL_OUTPUT,
            "screening_answers": [
                {
                    "question": question,
                    "answer": "guess",
                    "support": "document",
                    "evidence_item_ids": [],
                }
            ],
        }
    )
    make_cv(db, test_user.id)
    client.put(
        DETAILS_URL,
        json={
            "salary_expectation": "90k EUR",
            "work_authorization": "EU citizen",
            "visa_sponsorship": "No sponsorship needed",
            "relocation": "Open to relocate",
        },
        headers=auth_headers,
    )
    workspace = make_application(db, test_user.id)

    detail = client.post(f"{PREFIX}/{workspace.id}/prepare", headers=auth_headers).json()

    stop = next(q for q in detail["open_questions"] if q["question"] == question)
    assert stop["category"] == category
    if expected is None:
        assert stop["answered"] is False
        assert stop["key"] not in detail["answers"]
        assert detail["ready"] is False
    else:
        assert stop["answered"] is True
        assert detail["answers"][stop["key"]] == expected


def test_a_standing_answer_that_resolves_every_stop_lets_the_owner_apply(
    client, db, test_user, auth_headers, fake_model
):
    fake_model({**MODEL_OUTPUT, "screening_answers": MODEL_OUTPUT["screening_answers"][:2]})
    make_cv(db, test_user.id)
    client.put(DETAILS_URL, json={"salary_expectation": "90k EUR"}, headers=auth_headers)
    workspace = make_application(db, test_user.id)
    prepared = client.post(f"{PREFIX}/{workspace.id}/prepare", headers=auth_headers).json()
    assert prepared["open_question_count"] == 0 and prepared["ready"] is True

    applied = client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers).json()
    answers = applied["snapshot"]["content"]["answers"]
    assert [a["answer"] for a in answers] == ["90k EUR"]


# ── applications-d09: replacing the listing ──


def test_replacing_the_listing_refreshes_title_company_fit_and_drafts(
    client, db, test_user, auth_headers
):
    workspace = make_application(
        db, test_user.id, company="Harbor Health", role="Platform Engineer", drafts=True
    )
    workspace.match_score = 76
    workspace.open_questions = [{"key": "q-1", "question": "Salary?", "category": "salary"}]
    db.commit()

    response = _import_text(
        client, auth_headers, workspace.id, title="Staff Rust Engineer", company="Ferrous Inc"
    )
    assert response.status_code == 200, response.text

    detail = _detail(client, auth_headers, workspace.id)
    assert (detail["title"], detail["company"]) == ("Staff Rust Engineer", "Ferrous Inc")
    assert detail["label"] == "Staff Rust Engineer — Ferrous Inc"
    assert detail["listing"]["title"] == "Staff Rust Engineer"
    # Fit and drafts belonged to the old job: not carried over under the new title.
    assert detail["match_score"] is None
    assert detail["drafts"] is None and detail["prepared"] is False
    assert detail["open_questions"] == []
    # History is kept: the old run still exists.
    assert db.query(ToolRun).filter_by(workspace_id=workspace.id).count() == 1


def test_an_applied_application_keeps_its_posting(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id, company="Harbor Health")
    assert client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers).status_code == 200

    response = _import_text(
        client, auth_headers, workspace.id, title="Staff Rust Engineer", company="Ferrous Inc"
    )

    assert response.status_code == 409
    detail = _detail(client, auth_headers, workspace.id)
    assert detail["listing"]["company"] == "Harbor Health"
    assert db.query(CampaignListing).filter_by(workspace_id=workspace.id).count() == 1


def test_the_listing_replacement_is_a_timeline_event(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id, drafts=True)
    _import_text(
        client, auth_headers, workspace.id, title="Staff Rust Engineer", company="Ferrous Inc"
    )

    events = [
        e
        for e in _detail(client, auth_headers, workspace.id)["events"]
        if e["event_type"].startswith("listing")
    ]
    assert events[-1]["details"]["outcome"] == "replaced"
    assert events[-1]["details"]["drafts_cleared"] is True


def test_replacing_the_listing_drops_materials_chosen_for_the_old_job(
    client, db, test_user, auth_headers
):
    workspace = make_application(db, test_user.id, company="Harbor Health")
    letter = ToolRun(
        user_id=test_user.id, tool_name="cover-letter", result_payload={}, label="Harbor letter"
    )
    interview = ToolRun(user_id=test_user.id, tool_name="interview", result_payload={})
    db.add_all([letter, interview])
    db.flush()
    workspace.selected_cover_letter_run_id = letter.id
    workspace.selected_interview_run_id = interview.id
    workspace.discovery_listing_id = "11111111-1111-1111-1111-111111111111"
    db.commit()

    _import_text(
        client, auth_headers, workspace.id, title="Staff Rust Engineer", company="Ferrous Inc"
    )

    detail = _detail(client, auth_headers, workspace.id)
    assert detail["selected_materials"]["cover_letter"] is None
    assert detail["selected_materials"]["interview"] is None
    event = [e for e in detail["events"] if e["event_type"] == "listing_attached"][-1]
    assert event["details"]["materials_cleared"] is True
    db.refresh(workspace)
    assert workspace.discovery_listing_id is None
    # The runs themselves stay in history.
    assert db.get(ToolRun, letter.id) is not None


def test_the_created_date_is_when_tracking_started_not_when_the_match_ran(
    client, db, test_user, auth_headers
):
    workspace, run = _job_match_workspace(db, test_user.id)
    workspace.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    db.commit()

    tracked = client.post(
        PREFIX,
        json={"role": "Data Engineer", "company": "Fjord", "history_id": run.id},
        headers=auth_headers,
    )

    created = datetime.fromisoformat(tracked.json()["created_at"].replace("Z", "+00:00"))
    assert abs((datetime.now(UTC) - created).total_seconds()) < 60


def test_a_posting_attached_later_dates_the_tracking_from_the_attach(
    client, db, test_user, auth_headers
):
    workspace, _run = _job_match_workspace(db, test_user.id)
    workspace.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    db.commit()
    _import_text(client, auth_headers, workspace.id, title="Platform Engineer", company="Harbor")

    created = datetime.fromisoformat(
        _detail(client, auth_headers, workspace.id)["created_at"].replace("Z", "+00:00")
    )
    assert abs((datetime.now(UTC) - created).total_seconds()) < 60


# ── applications-d01: undoing "applied" keeps a trace of the frozen snapshot ──


def test_moving_back_to_saved_records_which_snapshot_was_discarded(
    client, db, test_user, auth_headers
):
    workspace = make_application(db, test_user.id)
    applied = client.post(f"{PREFIX}/{workspace.id}/applied", headers=auth_headers).json()
    snapshot = applied["snapshot"]

    undone = client.patch(
        f"{PREFIX}/{workspace.id}", json={"status": "saved"}, headers=auth_headers
    ).json()

    assert undone["snapshot"] is None and undone["applied_at"] is None
    event = next(e for e in undone["events"] if e["event_type"] == "applied_undone")
    assert event["details"]["snapshot_id"] == snapshot["id"]
    assert event["details"]["content_sha256"] == snapshot["content_sha256"]
    assert db.query(ApplicationSnapshot).count() == 0


# ── applications-d08: tasks ──


def test_a_blank_task_title_is_refused(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    url = f"{PREFIX}/{workspace.id}/tasks"
    for title in ("", "   ", "\t\n"):
        assert client.post(url, json={"title": title}, headers=auth_headers).status_code == 422
    assert _detail(client, auth_headers, workspace.id)["tasks"] == []


# ── applications-d18: timeline entries carry the task title ──


def test_task_events_name_the_task(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    url = f"{PREFIX}/{workspace.id}/tasks"
    task = client.post(url, json={"title": "Send portfolio"}, headers=auth_headers).json()
    client.patch(f"{url}/{task['id']}", json={"completed": True}, headers=auth_headers)
    client.delete(f"{url}/{task['id']}", headers=auth_headers)

    events = [
        e
        for e in _detail(client, auth_headers, workspace.id)["events"]
        if e["event_type"].startswith("task_")
    ]
    assert [e["details"]["title"] for e in events] == ["Send portfolio"] * 3


# ── applications-d10: "no evidence" is not "no keyword match" ──


def test_prepare_for_me_says_when_the_evidence_profile_is_empty(
    client, db, test_user, auth_headers
):
    make_cv(db, test_user.id)
    client.put(f"{PREFIX}/preferences", json={"keywords": ["backend"]}, headers=auth_headers)

    result = client.post(f"{PREFIX}/prepare", headers=auth_headers).json()

    assert result["reason"] == "no_evidence"
    assert result["prepared"] == []


# ── applications-d13: details are validated ──


@pytest.mark.parametrize(
    "field,value",
    [
        ("email", "not-an-email"),
        ("phone", "call me maybe"),
        ("phone", "12"),
        ("linkedin", "javascript:alert(1)"),
        ("website", "data:text/html,<script>1</script>"),
    ],
)
def test_application_details_reject_malformed_contact_values(client, auth_headers, field, value):
    response = client.put(DETAILS_URL, json={field: value}, headers=auth_headers)
    assert response.status_code == 422, (field, value)


@pytest.mark.parametrize(
    "phone", ["+44 20 7946 0958", "(415) 555-0132", "020 7946 0958 ext. 12", ""]
)
def test_application_details_accept_real_phone_formats(client, auth_headers, phone):
    response = client.put(DETAILS_URL, json={"phone": phone}, headers=auth_headers)
    assert response.status_code == 200, phone


# ── applications-d14: deleting an application removes its drafts and checks ──


def test_deleting_an_application_removes_its_drafts_and_review_runs_only(
    client, db, test_user, auth_headers
):
    workspace = make_application(db, test_user.id, drafts=True)
    review = ToolRun(
        user_id=test_user.id,
        workspace_id=workspace.id,
        tool_name="application-reviewer",
        result_payload={},
    )
    letter = ToolRun(
        user_id=test_user.id,
        workspace_id=workspace.id,
        tool_name="cover-letter",
        label="Cover letter",
        result_payload={},
    )
    db.add_all([review, letter])
    db.commit()
    letter_id = letter.id

    assert client.delete(f"{PREFIX}/{workspace.id}", headers=auth_headers).json() == {"deleted": 1}

    db.expire_all()
    remaining = {run.tool_name for run in db.query(ToolRun).all()}
    # The owner's own Cover Letter run is theirs; drafts and checks belonged to the card.
    assert remaining == {"cover-letter"}
    assert db.get(ToolRun, letter_id).workspace_id is None


# ── applications-d15: when the owner saved it ──


def test_the_detail_says_when_the_application_was_created(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)

    detail = _detail(client, auth_headers, workspace.id)

    created = datetime.fromisoformat(detail["created_at"])
    assert created.tzinfo is not None
    assert abs((datetime.now(UTC) - created).total_seconds()) < 60
    # The posting's retrieval date is a different fact and stays separate.
    assert detail["listing"]["retrieved_at"].startswith("2026-09-01")


# ── applications-d17: the activity history is never silently cut ──


def test_activity_beyond_the_detail_window_is_reachable(client, db, test_user, auth_headers):
    workspace = make_application(db, test_user.id)
    base = datetime(2026, 9, 1, tzinfo=UTC)
    for index in range(120):
        db.add(
            CampaignEvent(
                workspace_id=workspace.id,
                event_type="note",
                details={"n": index},
                created_at=base + timedelta(minutes=index),
            )
        )
    db.commit()

    detail = _detail(client, auth_headers, workspace.id)
    assert detail["events_total"] == 120
    assert len(detail["events"]) < 120

    shown = len(detail["events"])
    older = client.get(
        f"{PREFIX}/{workspace.id}/events",
        params={"offset": shown, "limit": 200},
        headers=auth_headers,
    ).json()
    assert older["total"] == 120
    assert [e["details"]["n"] for e in older["items"]][0] == 0
    combined = [e["details"]["n"] for e in older["items"]] + [
        e["details"]["n"] for e in detail["events"]
    ]
    assert combined == list(range(120))


# ── applications-d16: a double submit prepares once ──


async def test_a_second_prepare_while_one_is_running_is_refused(
    db, test_user, auth_headers, monkeypatch
):
    from app.database import get_db

    make_cv(db, test_user.id)
    workspace = make_application(db, test_user.id)
    release = asyncio.Event()
    started = asyncio.Event()
    calls: list[int] = []

    async def slow_model(system_prompt, user_prompt, **_kwargs):
        calls.append(1)
        started.set()
        await release.wait()
        return MODEL_OUTPUT

    monkeypatch.setattr("app.services.application_drafts.complete_structured", slow_model)
    monkeypatch.setattr("app.config.settings.RESULT_CACHE_ENABLED", False)

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            url = f"{PREFIX}/{workspace.id}/prepare"
            first = asyncio.create_task(http.post(url, headers=auth_headers))
            await asyncio.wait_for(started.wait(), 10)
            try:
                # Without a guard the second prepare waits for the model like the first.
                second = await asyncio.wait_for(http.post(url, headers=auth_headers), 5)
            finally:
                release.set()
            first_response = await first
    finally:
        app.dependency_overrides.clear()

    assert second.status_code == 409
    assert first_response.status_code == 200
    assert len(calls) == 1
    runs = db.query(ToolRun).filter_by(workspace_id=workspace.id, tool_name="application-drafts")
    assert runs.count() == 1


async def test_bulk_prepare_skips_an_application_already_being_prepared(db, test_user, monkeypatch):
    from app.services import applications as service

    make_cv(db, test_user.id)
    busy = make_application(db, test_user.id, company="Busy")
    free = make_application(db, test_user.id, company="Free")
    busy.discovery_listing_id = "l-busy"
    free.discovery_listing_id = "l-free"
    db.commit()

    class Rec:
        def __init__(self, listing_id):
            self.listing_id = listing_id
            self.listing = type(
                "L",
                (),
                {
                    "title": "Backend",
                    "company": "x",
                    "description": "backend " * 5,
                    "location": None,
                    "remote": False,
                },
            )()

    monkeypatch.setattr(service, "best_matches", lambda *a, **k: [Rec("l-busy"), Rec("l-free")])
    monkeypatch.setattr(service, "_passes_preferences", lambda *a, **k: True)
    service.save_preferences(
        db, test_user.id, service.ApplicationPreferencesBody(keywords=["backend"], max_per_run=5)
    )
    monkeypatch.setattr(service, "_owner_has_cv", lambda *a, **k: True)
    service._PREPARING.add(busy.id)

    async def compose(**_kwargs):
        return {"cover_letter": MODEL_OUTPUT["cover_letter"], "screening_answers": []}

    try:
        result = await service.prepare_for_me(db, test_user, compose_fn=compose)
    finally:
        service._PREPARING.discard(busy.id)

    assert [card.id for card in result.prepared] == [free.id]
    assert result.skipped_existing_count == 1


# ── applications-d20: error bodies always carry `detail` ──


def test_rate_limited_prepare_has_a_detail_message(client, db, test_user, auth_headers):
    statuses = []
    last = None
    for _ in range(6):
        last = client.post(f"{PREFIX}/prepare", headers=auth_headers)
        statuses.append(last.status_code)
    assert statuses[-1] == 429
    assert isinstance(last.json()["detail"], str) and last.json()["detail"]
