"""Tailoring partial-drop robustness (#322): one stale change is skipped, not fatal."""

import pytest

from app.services.cv_tailoring import generate_cv_tailoring


def _sections():
    return [
        {
            "id": "section-experience",
            "kind": "experience",
            "title": "Experience",
            "visible": True,
            "position": 0,
            "entries": [
                {
                    "id": "entry-one",
                    "evidence_item_id": None,
                    "body": "Improved a synthetic process by 20%.",
                    "position": 0,
                },
                {
                    "id": "entry-two",
                    "evidence_item_id": None,
                    "body": "Led a synthetic migration.",
                    "position": 1,
                },
            ],
        }
    ]


@pytest.mark.asyncio
async def test_one_stale_change_is_dropped_and_reported_not_fatal(monkeypatch):
    async def fake_complete(system, user):
        return {
            "changes": [
                {
                    "id": "good-change",
                    "section_id": "section-experience",
                    "entry_id": "entry-one",
                    "before": "Improved a synthetic process by 20%.",
                    "after": "Improved a synthetic platform process by 20%.",
                    "job_requirement": "Improve platform reliability",
                    "evidence_item_ids": [],
                    "support": "document",
                },
                {
                    # Quotes source text that no longer matches entry-two's body.
                    "id": "stale-change",
                    "section_id": "section-experience",
                    "entry_id": "entry-two",
                    "before": "This text does not match the current document.",
                    "after": "Led a rewritten synthetic migration.",
                    "job_requirement": "Improve platform reliability",
                    "evidence_item_ids": [],
                    "support": "document",
                },
            ]
        }

    monkeypatch.setattr("app.services.cv_tailoring.complete_structured", fake_complete)
    result = await generate_cv_tailoring(
        "resume text",
        sections=_sections(),
        job_description="Improve platform reliability across distributed services.",
        job_title="Platform Engineer",
    )
    assert [c["id"] for c in result["changes"]] == ["good-change"]
    assert result["skipped"] == [{"id": "stale-change", "reason": "stale_before_text"}]


@pytest.mark.asyncio
async def test_all_changes_stale_yields_empty_changes_not_an_error(monkeypatch):
    async def fake_complete(system, user):
        return {
            "changes": [
                {
                    "id": "stale-only",
                    "section_id": "section-experience",
                    "entry_id": "entry-one",
                    "before": "stale text",
                    "after": "new text",
                    "job_requirement": "req",
                    "evidence_item_ids": [],
                    "support": "document",
                }
            ]
        }

    monkeypatch.setattr("app.services.cv_tailoring.complete_structured", fake_complete)
    result = await generate_cv_tailoring(
        "resume text",
        sections=_sections(),
        job_description="Improve platform reliability across distributed services.",
        job_title="Platform Engineer",
    )
    assert result["changes"] == []
    assert result["skipped"] == [{"id": "stale-only", "reason": "stale_before_text"}]


@pytest.mark.asyncio
async def test_unsupported_evidence_claim_still_raises_hard_error(monkeypatch):
    async def fake_complete(system, user):
        return {
            "changes": [
                {
                    "id": "bad-claim",
                    "section_id": "section-experience",
                    "entry_id": "entry-one",
                    "before": "Improved a synthetic process by 20%.",
                    "after": "Improved it more.",
                    "job_requirement": "req",
                    "evidence_item_ids": ["not-confirmed"],
                    "support": "confirmed",
                }
            ]
        }

    monkeypatch.setattr("app.services.cv_tailoring.complete_structured", fake_complete)
    with pytest.raises(ValueError):
        await generate_cv_tailoring(
            "resume text",
            sections=_sections(),
            job_description="Improve platform reliability across distributed services.",
            job_title="Platform Engineer",
        )


def test_tailoring_model_run_quota_counts_once_despite_a_partial_drop(
    client, auth_headers, db, test_user, monkeypatch
):
    from app.models.cv_document import CvDocument
    from app.schemas.cv_documents import CvDocumentCreate
    from app.services.cv_documents import create_document

    document = create_document(
        db,
        test_user.id,
        CvDocumentCreate(name="Quota doc", sections=_sections()),
    )

    async def fake_complete(system, user):
        return {
            "changes": [
                {
                    "id": "stale-only",
                    "section_id": "section-experience",
                    "entry_id": "entry-one",
                    "before": "stale text that will not match",
                    "after": "new text",
                    "job_requirement": "req",
                    "evidence_item_ids": [],
                    "support": "document",
                }
            ]
        }

    monkeypatch.setattr("app.services.cv_tailoring.complete_structured", fake_complete)
    response = client.post(
        f"/api/v1/cv-documents/{document.id}/tailoring",
        json={
            "job_title": "Platform Engineer",
            "job_description": "Improve platform reliability across distributed services.",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["changes"] == []
    assert response.json()["skipped"] == [{"id": "stale-only", "reason": "stale_before_text"}]
    db.expire_all()
    stored = db.query(CvDocument).filter(CvDocument.id == document.id).one()
    assert stored.tailoring_model_runs == 1
