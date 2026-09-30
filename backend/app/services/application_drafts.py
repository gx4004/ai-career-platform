"""Prepared drafts for one application: a cover letter and screening answers.

Runs as the ``service_fn`` of the shared tool pipeline. Drafts draw only on the
CV text and confirmed Evidence Profile items. A screening question in a stop
category (salary, work authorization, demographics and so on) is never drafted:
it becomes an open question only the owner answers. An answer the model could
not ground becomes an ``uncertain`` open question too.
"""

from __future__ import annotations

import hashlib
from typing import Any

from app.services.ai_client import complete_structured
from app.services.evidence_injection import EvidencePayload, render_evidence_section
from app.services.stop_classifier import classify_stop_category

DRAFTS_TOOL_NAME = "application-drafts"
DRAFTS_SCHEMA_VERSION = "application-drafts/v1"

SYSTEM_PROMPT = (
    "You prepare an application's cover letter and screening-answer drafts. "
    "Propose only truthful content grounded in the CV text or confirmed evidence. "
    "Never state an unconfirmed item as fact. For every screening answer set "
    "support to 'confirmed' (with the confirmed evidence_item_ids you used), "
    "'document' (grounded in the CV text, no evidence ids), or 'unsupported' "
    "(an ungrounded claim the user must confirm). Do not answer sensitive, legal, "
    "eligibility, relocation, demographic, salary, or work-authorization questions "
    "— leave those for the user."
)


def question_key(question: str) -> str:
    """A stable key for a question, so a re-prepare keeps the owner's answer."""
    normalized = " ".join(question.casefold().split())
    return "q-" + hashlib.sha256(normalized.encode()).hexdigest()[:12]


async def compose_application_drafts(
    *,
    resume_text: str,
    job_description: str,
    listing_title: str = "",
    company: str = "",
    evidence_profile: EvidencePayload | None = None,
) -> dict[str, Any]:
    confirmed_ids = {
        fact["evidence_item_id"]
        for fact in (evidence_profile.locked_facts if evidence_profile else [])
    }
    evidence_section = render_evidence_section(evidence_profile) or "No confirmed profile evidence."
    user_prompt = (
        f"# Role\n{listing_title} at {company}\n\n"
        f"# Listing\n{job_description}\n\n"
        f"# Candidate CV\n{resume_text}\n\n"
        f"# Evidence boundary\n{evidence_section}"
    )
    raw = await complete_structured(SYSTEM_PROMPT, user_prompt)
    screening_answers, open_questions = split_screening_answers(
        raw.get("screening_answers"), confirmed_ids
    )
    return {
        "schema_version": DRAFTS_SCHEMA_VERSION,
        "summary": {
            "headline": f"Application drafts for {listing_title or 'this role'}".strip(),
        },
        "cover_letter": _validate_cover_letter(raw.get("cover_letter"), confirmed_ids),
        "screening_answers": screening_answers,
        "open_questions": open_questions,
        # Exactly which confirmed items were available; never unconfirmed ids.
        "confirmed_evidence_item_ids": sorted(confirmed_ids),
    }


def validate_support(item: dict, confirmed_ids: set[str]) -> tuple[str, list[str]]:
    """Downgrade a claim the model cannot back to ``unsupported`` instead of raising.

    ``confirmed`` must cite a non-empty subset of confirmed evidence ids;
    ``document`` must cite none. Anything else is ``unsupported``.
    """
    support = item.get("support", "unsupported")
    ids = [str(i) for i in (item.get("evidence_item_ids") or [])]
    if support == "confirmed" and ids and set(ids).issubset(confirmed_ids):
        return support, ids
    if support == "document" and not ids:
        return support, ids
    return "unsupported", []


def _validate_cover_letter(raw: object, confirmed_ids: set[str]) -> dict | None:
    if not isinstance(raw, dict):
        return None
    support, ids = validate_support(raw, confirmed_ids)
    return {"body": str(raw.get("body", "")), "support": support, "evidence_item_ids": ids}


def split_screening_answers(
    raw: object, confirmed_ids: set[str]
) -> tuple[list[dict], list[dict]]:
    """Grounded answers survive; stop and ungrounded questions become open questions."""
    if not isinstance(raw, list):
        return [], []
    answers: list[dict] = []
    open_questions: list[dict] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", "")).strip()
        if not question:
            continue
        category = classify_stop_category(question)
        if category is None:
            support, ids = validate_support(item, confirmed_ids)
            if support != "unsupported":
                answers.append(
                    {
                        "question": question,
                        "answer": str(item.get("answer", "")),
                        "support": support,
                        "evidence_item_ids": ids,
                    }
                )
                continue
            category = "uncertain"
        key = question_key(question)
        if key not in seen:
            seen.add(key)
            open_questions.append({"key": key, "question": question, "category": category})
    return answers, open_questions
