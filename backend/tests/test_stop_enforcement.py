"""Stop fields are never drafted (D-095).

One server-side classifier decides which screening questions only the owner may
answer. Drafts never contain an answer to one; it becomes an open question with
the real question text, whatever support label the model or a client claims.
"""

import json

import pytest

from app.services.application_drafts import compose_application_drafts
from app.services.stop_classifier import STOP_CATEGORIES, classify_stop_category

# A field text that triggers each stop category, for the per-category coverage.
STOP_FIELD_TEXT: dict[str, str] = {
    "work_authorization": "Do you require visa sponsorship to work here?",
    "salary": "What is your expected salary for this role?",
    "relocation": "Are you willing to relocate for this position?",
    "eligibility": "Do you currently hold an active security clearance?",
    "demographic": "What is your citizenship?",
    "legal": "Have you ever been convicted of a felony?",
    "sensitive": "Please provide your social security number.",
    "uncertain": "In your own words, why do you want this job?",
}


# ── One authoritative classifier (D-095) ──


def test_classifier_covers_every_stop_category():
    for category in STOP_CATEGORIES:
        assert classify_stop_category(STOP_FIELD_TEXT[category]) == category


def test_classifier_lets_draftable_fields_through():
    assert classify_stop_category("What is your notice period?") is None
    assert classify_stop_category("Describe your experience with Python and REST APIs.") is None


# ── Never-draft guarantee, per category ──


@pytest.mark.asyncio
@pytest.mark.parametrize("category", list(STOP_CATEGORIES))
async def test_compose_never_drafts_any_stop_category(monkeypatch, category):
    drafted_text = f"DRAFTED ANSWER for {category} that must never be produced"

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                {
                    "question": STOP_FIELD_TEXT[category],
                    "answer": drafted_text,
                    # Even a "grounded" label must not let a stop field be drafted.
                    "support": "document",
                    "evidence_item_ids": [],
                }
            ],
        }

    monkeypatch.setattr("app.services.application_drafts.complete_structured", fake_llm)
    result = await compose_application_drafts(resume_text="cv", job_description="jd")

    # No content was drafted for the stop field.
    assert result["screening_answers"] == []
    assert drafted_text not in json.dumps(result)
    # It surfaced as an explicit unresolved question of that exact category.
    categories = {q["category"] for q in result["open_questions"]}
    assert category in categories


@pytest.mark.asyncio
async def test_compose_treats_ungrounded_answer_as_uncertain_stop(monkeypatch):
    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                {
                    "question": "What is your greatest weakness?",
                    "answer": "I guessed this.",
                    "support": "unsupported",
                    "evidence_item_ids": [],
                }
            ],
        }

    monkeypatch.setattr("app.services.application_drafts.complete_structured", fake_llm)
    result = await compose_application_drafts(resume_text="cv", job_description="jd")
    assert result["screening_answers"] == []
    assert "I guessed this." not in json.dumps(result)
    assert any(q["category"] == "uncertain" for q in result["open_questions"])


# ── No client input can bypass a stop (D-095) ──


@pytest.mark.asyncio
async def test_client_supplied_confirmed_label_cannot_bypass_stop(monkeypatch):
    """A model/client that labels a work-auth answer 'confirmed' with real evidence
    still cannot force the system to draft it — classification is server-side."""

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                {
                    "question": "Do you need visa sponsorship?",
                    "answer": "No sponsorship needed.",
                    "support": "confirmed",
                    "evidence_item_ids": ["c1"],
                }
            ],
        }

    from app.services.evidence_injection import EvidencePayload

    payload = EvidencePayload(
        locked_facts=[{"evidence_item_id": "c1", "kind": "skill", "content": {"t": "x"}}],
        gaps=[],
    )
    monkeypatch.setattr("app.services.application_drafts.complete_structured", fake_llm)
    result = await compose_application_drafts(
        resume_text="cv", job_description="jd", evidence_profile=payload
    )
    assert result["screening_answers"] == []
    assert "No sponsorship needed." not in json.dumps(result)
    assert any(q["category"] == "work_authorization" for q in result["open_questions"])
