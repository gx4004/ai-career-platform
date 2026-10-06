"""B7 review fixes: regressions and gaps the independent reviewers found.

Behaviour tests at the public seam (HTTP routes; the fabrication tracer and the
reviewer service where no route is the subject).
"""

import asyncio
import copy
import io
import json

import pytest

from app.models.campaign_listing import CampaignListing
from app.models.cv_document import CvDocument, CvVariant
from app.models.evidence_item import EvidenceItem
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.services.campaign_reviewer import review_campaign_materials
from app.services.evidence_injection import (
    EvidencePayload,
    build_evidence_payload,
    render_evidence_section,
)
from app.services.fabrication import claim_traceable, extract_claims

APPS = "/api/v1/applications"
CV_PREFIX = "/api/v1/cv-documents"
ITEMS = "/api/v1/evidence-profile/items"


def _unsupported(letter: str, cv: str) -> list[str]:
    return [claim.text for claim in extract_claims(letter) if not claim_traceable(claim, cv)]


# --- applications-d02 end to end: the route passes the posting's title/company ----


def _application(db, user_id, *, cv, cover, listing, title, company):
    workspace = Workspace(user_id=user_id, label="Review")
    document = CvDocument(user_id=user_id, name="CV", sections=[])
    cover_run = ToolRun(user_id=user_id, tool_name="cover-letter", result_payload={"full_text": cover})
    db.add_all([workspace, document, cover_run])
    db.flush()
    sections = [
        {
            "id": "summary",
            "kind": "summary",
            "title": "Summary",
            "visible": True,
            "position": 0,
            "entries": [{"id": "one", "evidence_item_id": None, "body": cv, "position": 0}],
        }
    ]
    document.sections = sections
    variant = CvVariant(document_id=document.id, name="Selected", sections=sections)
    posting = CampaignListing(
        workspace_id=workspace.id, title=title, company=company, description=listing
    )
    db.add_all([variant, posting])
    db.flush()
    workspace.current_listing_id = posting.id
    workspace.selected_cv_variant_id = variant.id
    workspace.selected_cover_letter_run_id = cover_run.id
    db.commit()
    return workspace


CV_TEXT = (
    "Built integration services in Python for logistics clients over many years "
    "of hands-on engineering work."
)
LETTER = (
    "Dear hiring team, I would love the Python Developer role at Tidewater. I built "
    "integration services in Python for logistics clients, and I would bring that to "
    "the Integrations team."
)


def _unsupported_messages(body):
    payload = body.get("result") or body
    return [f["message"] for f in payload["findings"] if f["category"] == "unsupported_claim"]


def test_review_route_grounds_the_postings_title_and_company(
    client, auth_headers, test_user, db
):
    workspace = _application(
        db,
        test_user.id,
        cv=CV_TEXT,
        cover=LETTER,
        listing="We need a Python developer to maintain Integrations.",
        title="Python Developer",
        company="Tidewater",
    )
    response = client.post(f"{APPS}/{workspace.id}/review", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert _unsupported_messages(response.json()) == []


def test_gap_classification_route_grounds_the_postings_title_and_company(
    client, auth_headers, test_user, db
):
    workspace = _application(
        db,
        test_user.id,
        cv=CV_TEXT,
        cover=LETTER,
        listing="We need a Python developer to maintain Integrations.",
        title="Python Developer",
        company="Tidewater",
    )
    response = client.post(f"{APPS}/{workspace.id}/gap-classifications", headers=auth_headers)
    assert response.status_code == 200, response.text
    traces = [" ".join(row["cited_trace"]) for row in response.json()["classifications"]]
    assert not any("claim:Tidewater" in trace for trace in traces)


def test_a_review_cached_before_the_title_changed_is_not_served_stale(
    client, auth_headers, test_user, db
):
    workspace = _application(
        db,
        test_user.id,
        cv=CV_TEXT,
        cover=LETTER,
        listing="We need a Python developer to maintain Integrations.",
        title="Python Developer",
        company="Initech",
    )
    first = client.post(f"{APPS}/{workspace.id}/review", headers=auth_headers).json()
    assert any("Tidewater" in message for message in _unsupported_messages(first))
    listing = db.get(CampaignListing, workspace.current_listing_id)
    listing.company = "Tidewater"
    db.commit()
    second = client.post(f"{APPS}/{workspace.id}/review", headers=auth_headers).json()
    assert _unsupported_messages(second) == []


# --- the description grounds names, but not a skill the owner never listed --------


def _review(**overrides):
    base = {
        "resume_text": CV_TEXT,
        "cv_document_text": CV_TEXT,
        "job_description": "We run Kubernetes on Tidewater Cloud.",
        "cover_text": "Dear team, I led our Kubernetes migration at the Python Developer role.",
        "evidence_profile": EvidencePayload(locked_facts=[], gaps=[]),
        "listing_title": "Python Developer",
        "listing_company": "Tidewater",
    }
    base.update(overrides)
    return asyncio.run(review_campaign_materials(**base))


def test_a_skill_named_only_in_the_posting_is_not_grounded_for_the_owner():
    messages = [
        f["message"] for f in _review()["findings"] if f["category"] == "unsupported_claim"
    ]
    assert any("Kubernetes" in message for message in messages)


def test_the_company_and_title_stay_grounded_even_when_they_look_like_skills():
    result = _review(
        cover_text="I would love the Python Developer role at Kubernetes Labs.",
        listing_company="Kubernetes Labs",
    )
    messages = [f["message"] for f in result["findings"] if f["category"] == "unsupported_claim"]
    assert messages == []


def test_a_non_skill_name_from_the_description_is_grounded():
    result = _review(
        job_description="You will join the Integrations group.",
        cover_text="I would bring that to the Integrations group.",
    )
    messages = [f["message"] for f in result["findings"] if f["category"] == "unsupported_claim"]
    assert messages == []


# --- CV import accept: bounded evidence content must not turn into a 500 ----------


def _propose(client, headers, text):
    response = client.post(
        f"{CV_PREFIX}/import/proposals",
        files={"file": ("cv.txt", io.BytesIO(text.encode()), "text/plain")},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


LONG_ROLE_CV = "\n".join(
    [
        "Casey Morgan",
        "casey@example.com",
        "",
        "Experience",
        "Senior Backend Engineer",
        "Northwind Labs",
        "Mar 2021 - Present",
        *[
            f"- Delivered workstream {n}: " + ("improved throughput for the platform " * 11)
            for n in range(10)
        ],
        "",
        "Education",
        "BSc Computer Science",
        "State University",
    ]
)


def test_accepting_a_role_with_many_long_bullets_succeeds(client, auth_headers):
    proposal = _propose(client, auth_headers, LONG_ROLE_CV)
    response = client.post(f"{CV_PREFIX}/import/accept", json=proposal, headers=auth_headers)
    assert response.status_code == 201, response.text
    experience = next(s for s in response.json()["sections"] if s["kind"] == "experience")
    assert len(experience["entries"][0]["bullets"]) == 10
    for item in client.get(ITEMS, headers=auth_headers).json()["items"]:
        assert all(len(str(v)) <= 2_000 for v in item["content"].values())


def _first_claim_entry(proposal):
    for section in proposal["sections"]:
        for entry in section["entries"]:
            if entry["claim"] is not None:
                return entry
    raise AssertionError("no claim in the proposal")


def test_an_oversize_but_legitimate_claim_is_clamped_not_rejected(client, auth_headers):
    proposal = _propose(client, auth_headers, LONG_ROLE_CV)
    payload = copy.deepcopy(proposal)
    entry = _first_claim_entry(payload)
    entry["claim"]["content"] = {"statement": "Shipped things. " * 160}  # 2,560 chars
    response = client.post(f"{CV_PREFIX}/import/accept", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    items = client.get(ITEMS, headers=auth_headers).json()["items"]
    assert any(item["content"].get("statement", "").startswith("Shipped things.") for item in items)
    assert all(len(str(v)) <= 2_000 for item in items for v in item["content"].values())


def test_a_blank_claim_field_is_dropped_not_a_server_error(client, auth_headers):
    proposal = _propose(client, auth_headers, LONG_ROLE_CV)
    payload = copy.deepcopy(proposal)
    entry = _first_claim_entry(payload)
    entry["claim"]["content"] = {"title": "Engineer", "company": "   "}
    response = client.post(f"{CV_PREFIX}/import/accept", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text


def test_a_claim_with_only_blank_fields_is_accepted_without_a_suggestion(client, auth_headers):
    proposal = _propose(client, auth_headers, LONG_ROLE_CV)
    payload = copy.deepcopy(proposal)
    entry = _first_claim_entry(payload)
    entry["claim"]["content"] = {"statement": "   "}
    response = client.post(f"{CV_PREFIX}/import/accept", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text


def test_an_absurdly_large_claim_payload_is_a_422(client, auth_headers):
    proposal = _propose(client, auth_headers, LONG_ROLE_CV)
    payload = copy.deepcopy(proposal)
    entry = _first_claim_entry(payload)
    entry["claim"]["content"] = {"statement": "x" * 60_000}
    response = client.post(f"{CV_PREFIX}/import/accept", json=payload, headers=auth_headers)
    assert response.status_code == 422


# --- fabrication: fewer false positives, no lost recall ---------------------------


@pytest.mark.parametrize(
    "letter,cv",
    [
        ("We saved $1.2 million.", "Saved $1.2M in cloud cost across the platform."),
        ("A 3.5mm tolerance.", "Held a 3.5mm tolerance on every part we shipped."),
        ("Reached the 99.9th percentile.", "Reached the 99.9th percentile of latency."),
        ("Saved $1.2M.", "Saved $1.2 million in cloud cost."),
    ],
)
def test_figures_with_unit_spellings_are_grounded(letter, cv):
    assert _unsupported(letter, cv) == []


@pytest.mark.parametrize(
    "letter", ["Boeing Aerospace hired me.", "Sterling Capital hired me."]
)
def test_a_sentence_opening_employer_name_is_still_checked(letter):
    cv = "Worked on aerospace capital projects for many years."
    assert _unsupported(letter, cv), f"employer in {letter!r} was never checked"


@pytest.mark.parametrize(
    "letter,cv",
    [
        ("Used Go daily.", "Wrote services in Go."),
        ("Built Atlas for payments.", "Created Atlas, a payments platform."),
        ("Led Atlas to launch.", "Ran the Atlas launch."),
    ],
)
def test_common_opening_verbs_are_not_glued_onto_the_name(letter, cv):
    assert _unsupported(letter, cv) == []


def test_a_different_figure_is_still_unsupported_after_the_unit_changes():
    assert "$9M" in _unsupported("Saved $9M.", "Saved $1.2 million.")


# --- prompt rendering stays valid JSON when it has to cut ------------------------


def test_an_oversize_legacy_fact_renders_as_a_valid_json_line(db, test_user):
    content = {f"field{n:02d}": "word " * 400 for n in range(12)}
    item = EvidenceItem(
        user_id=test_user.id,
        kind="achievement",
        content=content,
        provenance="imported",
        confirmation_state="confirmed",
    )
    db.add(item)
    db.commit()
    rendered = render_evidence_section(build_evidence_payload([item]))
    line = next(row for row in rendered.splitlines() if row.startswith("- [achievement] "))
    parsed = json.loads(line.removeprefix("- [achievement] "))
    assert parsed and set(parsed) <= set(content)
    assert len(line) <= 8_100


def test_facts_cut_by_the_section_cap_are_marked_not_silently_dropped(db, test_user):
    items = [
        EvidenceItem(
            user_id=test_user.id,
            kind="achievement",
            content={"statement": f"{n} " + "word " * 390},
            provenance="imported",
            confirmation_state="confirmed",
        )
        for n in range(30)
    ]
    db.add_all(items)
    db.commit()
    rendered = render_evidence_section(build_evidence_payload(items))
    assert "further items omitted" in rendered


# --- applications F01: nothing to check is a refusal, not a run that scores empty documents ---


def test_review_refuses_an_application_with_no_cv_and_no_letter(client, auth_headers, test_user, db):
    workspace = Workspace(user_id=test_user.id, label="Empty")
    db.add(workspace)
    db.flush()
    posting = CampaignListing(workspace_id=workspace.id, title="Data Engineer", company="Fjord", description="SQL and dbt.")
    db.add(posting)
    db.flush()
    workspace.current_listing_id = posting.id
    db.commit()

    response = client.post(f"{APPS}/{workspace.id}/review", headers=auth_headers)

    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "Pick a CV version or cover letter before checking"
    assert db.query(ToolRun).filter_by(user_id=test_user.id, tool_name="application-reviewer").count() == 0
