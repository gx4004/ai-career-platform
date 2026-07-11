"""Derive reviewable Evidence Profile proposals from parsed resume text (R11, #146).

Resume parsing may only *propose* evidence, never write it: this module turns
resume text into a list of ephemeral, typed proposals that the authenticated
owner reviews. Nothing here touches the database — a proposal becomes a stored
item only when the user explicitly accepts it through the existing item-create
path, which stamps it `unconfirmed` with `imported` provenance (D-062). A
discarded or skipped proposal is simply never persisted, so it leaves no
server-side trace of its content.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.prompts.evidence_import import build_evidence_import_prompt
from app.schemas.evidence_profile import EvidenceProposal
from app.services.ai_client import complete_structured
from app.services.input_sanitizer import sanitize_user_input

logger = logging.getLogger(__name__)

# Closed set of typed kinds the proposal may carry (ADR 0005, D-061). Mirrors the
# EvidenceKind literal so a hallucinated kind is dropped rather than proposed.
_VALID_KINDS = frozenset(
    {
        "experience",
        "achievement",
        "skill",
        "education",
        "project",
        "certification",
        "preference",
        "interview-evidence",
    }
)

# Upper bound on proposals returned in one review batch. Matches the prompt cap
# and keeps the reviewable list bounded regardless of what the model returns.
_MAX_PROPOSALS = 40


def _normalize_content(raw: Any) -> dict[str, str] | None:
    """Coerce a model-proposed content object into a non-empty {str: str} record.

    Anything that is not an object of stringifiable scalar fields is rejected
    (returns None) so a malformed proposal is dropped, never stored. Non-scalar
    values (nested objects/arrays) are skipped rather than JSON-encoded to keep
    proposal content flat and human-reviewable.
    """
    if not isinstance(raw, dict):
        return None
    content: dict[str, str] = {}
    for key, value in raw.items():
        if not isinstance(key, str):
            continue
        if isinstance(value, str):
            text = value.strip()
        elif isinstance(value, (int, float, bool)):
            text = str(value)
        else:
            continue
        if text:
            content[key] = text
    return content or None


def _normalize_proposals(result: Any) -> list[EvidenceProposal]:
    raw_items = result.get("proposals") if isinstance(result, dict) else None
    if not isinstance(raw_items, list):
        return []

    proposals: list[EvidenceProposal] = []
    for item in raw_items:
        if len(proposals) >= _MAX_PROPOSALS:
            break
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        if kind not in _VALID_KINDS:
            continue
        content = _normalize_content(item.get("content"))
        if content is None:
            continue
        proposals.append(
            EvidenceProposal(
                # Ephemeral, per-request handle for the review UI only. It is not
                # a database id and is never persisted — a discarded proposal's
                # id disappears with the response.
                proposal_id=str(uuid.uuid4()),
                kind=kind,
                content=content,
                provenance="imported",
            )
        )
    return proposals


async def generate_import_proposals(resume_text: str) -> list[EvidenceProposal]:
    """Return ephemeral evidence proposals extracted from resume text.

    Never persists anything. On any LLM failure it returns an empty list so the
    (optional, skippable) review flow degrades to "no proposals" rather than
    breaking the user's session.
    """
    clean_resume = sanitize_user_input(resume_text)
    system_prompt, user_prompt = build_evidence_import_prompt(clean_resume)

    try:
        result = await complete_structured(system_prompt, user_prompt)
    except Exception as exc:  # noqa: BLE001 — review flow is optional; degrade to no proposals
        logger.warning(
            "LLM call failed for evidence-import proposals; returning none "
            "error_type=%s",
            type(exc).__name__,
        )
        return []

    return _normalize_proposals(result)
