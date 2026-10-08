from types import SimpleNamespace

import fitz

from app.schemas.applications import ApplicationDetailsResponse
from app.services.autopilot.materials import build_materials
from app.services.campaign_reviewer import project_campaign_materials, project_cv_document_text
from app.services.discovery_recommendations import MatchProfile, _scores


def test_review_projects_the_visible_structured_cv_and_grounds_company_names():
    sections = [{"title": "Experience", "entries": [{"heading": "Engineer", "subheading": "AcmeCorp",
        "location": "Warsaw", "start_date": "2020", "end_date": "Present",
        "body": "Stale body", "bullets": ["Built Python APIs"]}]}]
    variant = SimpleNamespace(sections=sections, document=SimpleNamespace(sections=sections))
    campaign = SimpleNamespace(selected_cv_variant=variant, selected_cover_letter_run=None, drafts_run=None)
    visible, _ = project_campaign_materials(campaign)
    assert "Engineer" in visible and "AcmeCorp" in visible and "2020" in visible
    assert "Built Python APIs" in visible and "Stale body" not in visible
    assert project_cv_document_text(campaign) == visible
    sections[0]["visible"] = False
    assert project_cv_document_text(campaign) == ""


def test_autopilot_pdf_preserves_the_frozen_candidate_header():
    details = ApplicationDetailsResponse(full_name="Jane Doe", email="jane@example.com")
    content = {"listing": {"form_url": "https://jobs.lever.co/acme/123"}, "cv_variant": {
        "name": "Base", "header": {"name": "Jane Doe", "email": "jane@example.com"},
        "sections": [{"id": "s", "title": "Experience", "kind": "experience", "position": 0,
            "entries": [{"id": "e", "body": "Built reliable APIs", "position": 0}]}]}}
    materials = build_materials(details, content)
    with fitz.open(stream=materials.resume_pdf, filetype="pdf") as pdf:
        text = "\n".join(page.get_text() for page in pdf)
    assert "Jane Doe" in text and "jane@example.com" in text
    assert "Base" not in text


def test_warm_discovery_scores_follow_updated_location_and_remote_flag():
    profile = MatchProfile("readiness-mutable", None, (("remote", "berlin"),))
    listing = SimpleNamespace(id="job", title="Engineer", company="Acme", location="Warsaw",
        remote=False, description="Build APIs")
    first = _scores(None, profile, [listing.id], loaded={listing.id: listing})
    assert first[listing.id].preference_hits == ()
    listing.remote = True
    listing.location = "Berlin"
    refreshed = _scores(None, profile, [listing.id], loaded={listing.id: listing})
    assert refreshed[listing.id].preference_hits == ("remote", "berlin")
