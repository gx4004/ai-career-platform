"""Extract suggested Evidence Profile items from parsed resume text (R11, #146).

Resume parsing may only *suggest* evidence, never vouch for it: this module turns
resume text into typed `imported` items. The import endpoint stores them
`unconfirmed`, so they appear as suggestions on the profile — the one place the
owner reviews them. Saving confirms a suggestion; dismissing deletes it, leaving
no trace of its content (D-062).
"""

from __future__ import annotations

import logging
from typing import Any, get_args

from app.prompts.evidence_import import build_evidence_import_prompt
from app.schemas.evidence_profile import (
    MAX_CONTENT_FIELDS,
    MAX_CONTENT_KEY_CHARS,
    MAX_CONTENT_VALUE_CHARS,
    EvidenceItemCreate,
    EvidenceKind,
    normalize_evidence_content,
)
from app.services.ai_client import complete_structured
from app.services.input_sanitizer import sanitize_user_input

logger = logging.getLogger(__name__)

# Closed set of typed kinds a suggestion may carry (ADR 0005, D-061). Mirrors the
# EvidenceKind literal so a hallucinated kind is dropped rather than proposed.
_VALID_KINDS = frozenset(get_args(EvidenceKind))

# Upper bound on suggestions stored from one import. Matches the prompt cap
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
        if not isinstance(key, str) or len(content) >= MAX_CONTENT_FIELDS:
            continue
        key = key.strip()
        if not key or len(key) > MAX_CONTENT_KEY_CHARS:
            continue
        if isinstance(value, str):
            text = value.strip()
        elif isinstance(value, (int, float, bool)):
            text = str(value)
        else:
            continue
        # An over-long value is a model that ran on, not a fact: drop the field
        # rather than store (and later inject into every prompt) a truncated blob.
        if text and len(text) <= MAX_CONTENT_VALUE_CHARS:
            content[key] = text
    return content or None


def _normalize_proposals(result: Any) -> list[EvidenceItemCreate]:
    raw_items = result.get("proposals") if isinstance(result, dict) else None
    if not isinstance(raw_items, list):
        return []

    proposals: list[EvidenceItemCreate] = []
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
        try:
            content = normalize_evidence_content(content)
        except ValueError:
            continue
        proposals.append(
            EvidenceItemCreate(kind=kind, content=content, provenance="imported")
        )
    return proposals


async def extract_resume_evidence(resume_text: str) -> list[EvidenceItemCreate]:
    """Return typed `imported` items extracted from resume text.

    Persists nothing itself. On any LLM failure it returns an empty list so the
    optional import degrades to "no suggestions" rather than breaking the
    user's session.
    """
    clean_resume = sanitize_user_input(resume_text)
    system_prompt, user_prompt = build_evidence_import_prompt(clean_resume)

    try:
        result = await complete_structured(system_prompt, user_prompt)
    except Exception as exc:  # noqa: BLE001 — import is optional; degrade to no suggestions
        logger.warning(
            "LLM call failed for evidence-import proposals; returning none "
            "error_type=%s",
            type(exc).__name__,
        )
        return []

    return _normalize_proposals(result)
