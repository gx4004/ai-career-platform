import asyncio
import json
from pathlib import Path

from app.services.campaign_reviewer import review_campaign_materials
from app.services.evidence_injection import EvidencePayload

PREFIX = "/api/v1/history"

FIXTURE = json.loads((Path(__file__).parent / "fixtures/application_reviewer.json").read_text())


def _run(case):
    payload = EvidencePayload(locked_facts=case["confirmed"], gaps=[])
    return asyncio.run(
        review_campaign_materials(
            resume_text=case["cv"],
            cover_text=case["cover"],
            job_description=case["listing"],
            evidence_profile=payload,
        )
    )


def test_reviewer_trigger_fixture_covers_all_advisory_categories():
    result = _run(FIXTURE["trigger"])
    categories = {finding["category"] for finding in result["findings"]}
    assert categories == {
        "unsupported_claim",
        "missed_requirement",
        "contradiction",
        "generic_language",
        "repetition",
        "document_defect",
    }
    unsupported = next(
        item
        for item in result["findings"]
        if item["category"] == "unsupported_claim" and "Nimbus Labs" in item["message"]
    )
    assert "result:unsupported" in unsupported["trace"]
    assert any(item.startswith("source:confirmed_evidence:") for item in unsupported["trace"])
    assert "source:selected_cv:no_match" in unsupported["trace"]
    assert not any("canonical_listing" in item for item in unsupported["trace"])
    assert all(
        ":chars " in location or location.endswith(":entire document")
        for finding in result["findings"]
        for location in finding["locations"]
    )
    contradiction = next(item for item in result["findings"] if item["category"] == "contradiction")
    assert any(location.startswith("CV:") for location in contradiction["locations"])
    assert any(location.startswith("Cover letter:") for location in contradiction["locations"])


def test_reviewer_near_miss_fixture_avoids_false_findings():
    result = _run(FIXTURE["near_miss"])
    assert result["findings"] == []


def test_reviewer_grounds_cv_claims_in_original_document_without_evidence_profile():
    """A truthful CV must not be flagged as fabrication just because its owner has
    no confirmed Evidence Profile items — the common case for most users. D-073
    accepts content already in the user's document as legitimate grounding, not
    only confirmed evidence; without this, every real company/technology/metric
    in a normal CV would be a "high severity" fabrication finding.
    """
    cv = "Led backend migration at Nimbus Freight using AWS and Kubernetes, cutting latency 35%."
    result = asyncio.run(
        review_campaign_materials(
            resume_text=cv,
            cover_text="",
            job_description="We need a backend engineer.",
            evidence_profile=None,
            cv_document_text=cv,
        )
    )
    assert not any(f["category"] == "unsupported_claim" for f in result["findings"])


def test_reviewer_still_flags_cv_content_new_to_both_evidence_and_document():
    """Content that is genuinely new — absent from the original document and from
    confirmed evidence — must still be caught. The grounding fallback must not
    turn the fabrication check into a no-op.
    """
    original_document = "Backend engineer with production experience."
    tailored_cv = "Backend engineer who led systems work at Nimbus Freight."
    result = asyncio.run(
        review_campaign_materials(
            resume_text=tailored_cv,
            cover_text="",
            job_description="We need a backend engineer.",
            evidence_profile=None,
            cv_document_text=original_document,
        )
    )
    unsupported = [f for f in result["findings"] if f["category"] == "unsupported_claim"]
    assert any("Nimbus Freight" in f["message"] for f in unsupported)


def test_campaign_reviewer_runs_through_pipeline_without_mutating_sources(
    client, auth_headers, test_user, db
):
    from app.models.campaign_listing import CampaignListing
    from app.models.cv_document import CvDocument, CvVariant
    from app.models.evidence_item import EvidenceItem
    from app.models.tool_run import ToolRun
    from app.models.workspace import Workspace

    case = FIXTURE["near_miss"]
    workspace = Workspace(user_id=test_user.id, label="Review")
    document = CvDocument(user_id=test_user.id, name="CV", sections=[])
    cover = ToolRun(
        user_id=test_user.id,
        tool_name="cover-letter",
        result_payload={
            "full_text": case["cover"],
            "summary": {"headline": "Nimbus Labs delivered 40% growth"},
            "opening": {"text": case["cover"], "why_this_paragraph": "Internal rationale"},
            "customization_notes": [{"note": "TODO mention Nimbus Labs"}],
        },
    )
    evidence = EvidenceItem(
        user_id=test_user.id,
        kind="experience",
        content=case["confirmed"][0]["content"],
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    db.add_all([workspace, document, cover, evidence])
    db.flush()
    variant = CvVariant(
        document_id=document.id,
        name="Selected",
        sections=[
            {
                "id": "summary",
                "kind": "summary",
                "title": "Summary",
                "visible": True,
                "position": 0,
                "entries": [
                    {
                        "id": "one",
                        "evidence_item_id": evidence.id,
                        "body": case["cv"],
                        "position": 0,
                    }
                ],
            },
            {
                "id": "hidden",
                "kind": "experience",
                "title": "Hidden",
                "visible": False,
                "position": 1,
                "entries": [
                    {
                        "id": "hidden-one",
                        "evidence_item_id": None,
                        "body": FIXTURE["trigger"]["cv"],
                        "position": 0,
                    }
                ],
            },
        ],
    )
    listing = CampaignListing(
        workspace_id=workspace.id, title="Engineer", company="Example", description=case["listing"]
    )
    db.add_all([variant, listing])
    db.flush()
    workspace.current_listing_id = listing.id
    workspace.selected_cv_variant_id = variant.id
    workspace.selected_cover_letter_run_id = cover.id
    db.commit()
    response = client.post(f"{PREFIX}/workspaces/{workspace.id}/review", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["schema_version"] == "application-reviewer/v1"
    assert response.json()["findings"] == []
    assert (
        db.query(ToolRun)
        .filter_by(workspace_id=workspace.id, tool_name="application-reviewer")
        .count()
        == 1
    )
    db.refresh(evidence)
    assert evidence.confirmation_state == "confirmed"
    assert evidence.content == case["confirmed"][0]["content"]

    # The selected cover letter is part of the review input and must invalidate
    # the result cache even though the shared pipeline's primary inputs are the
    # CV and canonical listing.
    cover.result_payload = {
        "full_text": FIXTURE["trigger"]["cover"],
        "summary": {"headline": "Internal text is not submitted"},
    }
    db.commit()
    changed_response = client.post(
        f"{PREFIX}/workspaces/{workspace.id}/review", headers=auth_headers
    )
    assert changed_response.status_code == 200
    assert changed_response.json()["findings"]
    assert (
        db.query(ToolRun)
        .filter_by(workspace_id=workspace.id, tool_name="application-reviewer")
        .count()
        == 2
    )
