"""B18: backend findings from visual sign-off round 2 (2026-10-07).

The application checks say which documents were chosen, so a check that needs a document
nobody chose is "not checked", never a vacuous pass; and the local (fake) resume reader keeps
its roles and bullets for layouts real CVs use.
"""

from __future__ import annotations

import pytest

from app.services.campaign_reviewer import review_campaign_materials
from app.services.fake_llm import _front_phrase, _parse_resume
from app.services.result_cache import clear_cache

PREFIX = "/api/v1/applications"

JOB = """Senior Backend Engineer at Northwind Labs
We need Python, FastAPI, PostgreSQL and AWS experience, plus mentoring and CI/CD."""

CV = (
    "Backend engineer. Built REST endpoints in Python handling 2 million events a day for 3 teams. "
    "Mentored 2 engineers on FastAPI services."
)
COVER = (
    "Dear hiring team, I build backend services in Python and would like to bring that to "
    "Northwind Labs, where billing reliability matters to every customer."
)


@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_cache()
    yield
    clear_cache()


# --- BT-1 / BT-7: the review names the documents it read -----------------------------------------


@pytest.mark.asyncio
async def test_review_says_which_documents_were_chosen():
    both = await review_campaign_materials(resume_text=CV, job_description=JOB, cover_text=COVER)
    assert both["documents"] == {"cv": True, "cover_letter": True}

    cv_only = await review_campaign_materials(resume_text=CV, job_description=JOB, cover_text="")
    assert cv_only["documents"] == {"cv": True, "cover_letter": False}


@pytest.mark.asyncio
async def test_checks_with_no_cv_speak_only_of_the_cover_letter():
    review = await review_campaign_materials(resume_text="", job_description=JOB, cover_text=COVER, has_cv=False)
    assert review["documents"] == {"cv": False, "cover_letter": True}
    findings = review["findings"]
    assert not any("cv looks almost empty" in finding["message"].lower() for finding in findings)
    missed = [finding for finding in findings if finding["category"] == "missed_requirement"]
    assert missed
    for finding in missed:
        assert "your cover letter doesn't mention it" in finding["message"], finding
        assert not any(location.startswith("CV") for location in finding["locations"]), finding


@pytest.mark.asyncio
async def test_a_chosen_but_empty_cv_is_still_reported_almost_empty():
    review = await review_campaign_materials(resume_text="", job_description=JOB, cover_text=COVER, has_cv=True)
    assert review["documents"]["cv"] is True
    assert any("cv looks almost empty" in finding["message"].lower() for finding in review["findings"])


def _application(db, user, *, cv_body: str | None, cover_text: str | None):
    from app.models.campaign_listing import CampaignListing
    from app.models.cv_document import CvDocument, CvVariant
    from app.models.tool_run import ToolRun
    from app.models.workspace import Workspace

    workspace = Workspace(user_id=user.id, label="Review")
    db.add(workspace)
    db.flush()
    if cv_body is not None:
        document = CvDocument(user_id=user.id, name="CV", sections=[])
        db.add(document)
        db.flush()
        entries = [{"id": "one", "evidence_item_id": None, "body": cv_body, "position": 0}] if cv_body else []
        variant = CvVariant(
            document_id=document.id,
            name="Selected",
            sections=[{"id": "s", "kind": "summary", "title": "Summary", "visible": True, "position": 0, "entries": entries}],
        )
        db.add(variant)
        db.flush()
        workspace.selected_cv_variant_id = variant.id
    if cover_text is not None:
        cover = ToolRun(user_id=user.id, tool_name="cover-letter", result_payload={"full_text": cover_text})
        db.add(cover)
        db.flush()
        workspace.selected_cover_letter_run_id = cover.id
    listing = CampaignListing(workspace_id=workspace.id, title="Engineer", company="Northwind Labs", description=JOB)
    db.add(listing)
    db.flush()
    workspace.current_listing_id = listing.id
    db.commit()
    return workspace


def test_review_route_reports_a_cv_only_application(client, auth_headers, test_user, db):
    workspace = _application(db, test_user, cv_body=CV, cover_text=None)
    body = client.post(f"{PREFIX}/{workspace.id}/review", headers=auth_headers).json()
    assert body["documents"] == {"cv": True, "cover_letter": False}


def test_review_route_reports_a_cover_only_application(client, auth_headers, test_user, db):
    workspace = _application(db, test_user, cv_body=None, cover_text=COVER)
    body = client.post(f"{PREFIX}/{workspace.id}/review", headers=auth_headers).json()
    assert body["documents"] == {"cv": False, "cover_letter": True}
    assert not any("CV looks almost empty" in finding["message"] for finding in body["findings"])
    for finding in body["findings"]:
        assert not any(location.startswith("CV:") for location in finding["locations"]), finding


def test_review_route_still_checks_a_chosen_empty_cv(client, auth_headers, test_user, db):
    workspace = _application(db, test_user, cv_body="", cover_text=COVER)
    body = client.post(f"{PREFIX}/{workspace.id}/review", headers=auth_headers).json()
    assert body["documents"] == {"cv": True, "cover_letter": True}
    assert any("CV looks almost empty" in finding["message"] for finding in body["findings"])


# --- BT-2: a clause-joining "and" is not a skill list --------------------------------------------


@pytest.mark.parametrize(
    ("bullet", "term", "expected"),
    [
        (
            "Reduced costs by 30% using Python and cut latency in half",
            "Python",
            "Using Python, reduced costs by 30% and cut latency in half.",
        ),
        (
            "Built APIs in Python and reduced latency by 30%",
            "Python",
            "In Python, built APIs and reduced latency by 30%.",
        ),
        (
            "Built billing pipelines with Python and SQL for 3 regional teams.",
            "Python",
            "With Python and SQL, built billing pipelines for 3 regional teams.",
        ),
    ],
)
def test_fronting_a_skill_never_swallows_the_next_clause(bullet, term, expected):
    assert _front_phrase(bullet, term) == expected


# --- BT-3 / BT-5: role lines with places ---------------------------------------------------------


def _roles(text: str) -> list[tuple[str, str]]:
    return _parse_resume(text).roles


def test_role_at_employer_with_a_country_keeps_the_employer():
    assert _roles("Experience\nSenior Engineer at Siemens, Germany (2019 - 2022)\n- Built a thing for 3 teams.") == [
        ("Senior Engineer", "Siemens")
    ]


def test_role_comma_employer_still_parses():
    assert _roles("Experience\nBackend Engineer, Freightline (2022 - present)") == [("Backend Engineer", "Freightline")]


@pytest.mark.parametrize("line", ["Freightline, Austin (2022 - present)", "Berlin, Germany (2019 - 2022)"])
def test_employer_and_city_is_never_a_role_at_a_place(line):
    roles = _roles(f"Experience\nBackend Engineer\n{line}\n- Rebuilt the billing API for 40 teams.")
    assert all(employer not in ("Austin", "Germany") for _, employer in roles), roles
    assert all(role not in ("Freightline", "Berlin") for role, _ in roles), roles


# --- BT-4: Education first, then a heading outside the standard set -------------------------------


@pytest.mark.parametrize(
    "heading",
    ["Relevant Experience", "Employment History", "Internships", "Research Experience", "LEADERSHIP", "Volunteer Experience"],
)
def test_education_first_does_not_swallow_later_experience(heading):
    resume = _parse_resume(
        "Sam Lee\n"
        "EDUCATION\n"
        "B.S. Computer Science, State University, 2024\n"
        "- Thesis on distributed caching for edge networks.\n"
        f"{heading}\n"
        "Software Engineer Intern at Acme Robotics (2023)\n"
        "- Cut build times by 40% for 12 engineers by caching Docker layers.\n"
    )
    assert ("Software Engineer Intern", "Acme Robotics") in resume.roles
    assert [bullet.text for bullet in resume.bullets] == ["Cut build times by 40% for 12 engineers by caching Docker layers."]
