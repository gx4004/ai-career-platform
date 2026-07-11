"""Evidence Profile injection for the shared tool pipeline (R11, D-063).

This is the only seam that reads a user's Evidence Profile for tool execution:
`run_tool_pipeline` builds an :class:`EvidencePayload` here and threads it into
the tool's prompt builder. No tool router gains its own profile access path.

Trust rules (D-062):
- ``confirmed`` items become *locked facts* — the generation may reframe their
  wording but must never alter, drop, invent, or extend them.
- ``unconfirmed`` items appear at most as explicit gaps/suggestions, never as
  facts.
- ``rejected`` items are excluded entirely and never reach a prompt.

The profile version returned here participates in the result cache key, so any
edit to the profile invalidates cached results (ADR 0005).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.services.evidence_profile import list_evidence_items

_LOCKED_FACTS_HEADER = (
    "## Confirmed evidence profile (verified user facts)\n"
    "The user has explicitly confirmed every fact below. You MAY reframe or "
    "reword them to fit this output, but you MUST NOT change their meaning, drop "
    "them, invent new facts, or add details not stated here. Treat nothing "
    "outside this list as a confirmed fact about the user."
)
_GAPS_HEADER = (
    "## Unconfirmed profile items (NOT verified facts)\n"
    "The items below are unconfirmed suggestions the user has not vouched for. Do "
    "NOT state them as facts. Reference them at most as gaps or suggestions the "
    "user could add. If evidence for a claim is missing, report it as a gap "
    "rather than inventing it."
)


@dataclass(frozen=True)
class EvidencePayload:
    """Confirmed and unconfirmed profile evidence prepared for one tool run."""

    locked_facts: list[dict]
    gaps: list[dict]

    def is_empty(self) -> bool:
        return not self.locked_facts and not self.gaps


def _item_view(item: EvidenceItem) -> dict:
    """Minimal, prompt-safe projection of an evidence item."""
    return {"kind": item.kind, "content": item.content}


def build_evidence_payload(items: list[EvidenceItem]) -> EvidencePayload:
    """Split items by confirmation state; rejected items are dropped entirely."""
    locked_facts: list[dict] = []
    gaps: list[dict] = []
    for item in items:
        if item.confirmation_state == "confirmed":
            locked_facts.append(_item_view(item))
        elif item.confirmation_state == "unconfirmed":
            gaps.append(_item_view(item))
        # 'rejected' items are excluded from all downstream use (D-062).
    return EvidencePayload(locked_facts=locked_facts, gaps=gaps)


def compute_profile_version(items: list[EvidenceItem]) -> str:
    """Derive a profile version from data already on each item.

    The digest covers the multiset of ``(id, updated_at)`` pairs, so any create,
    edit, confirm, reject, or delete changes it — no schema column or migration
    is required. Editing the profile therefore changes the cache key (ADR 0005).
    """
    if not items:
        return "empty"
    fingerprint = sorted(f"{item.id}:{item.updated_at.isoformat()}" for item in items)
    digest = hashlib.sha256(json.dumps(fingerprint).encode()).hexdigest()
    return digest[:16]


def load_profile_for_injection(db: Session, user_id: str) -> tuple[EvidencePayload, str]:
    """Load a user's profile and return its injection payload plus version."""
    items = list_evidence_items(db, user_id)
    return build_evidence_payload(items), compute_profile_version(items)


def render_evidence_section(payload: EvidencePayload | None) -> str | None:
    """Render the payload as a locked prompt section, or ``None`` when empty."""
    if payload is None or payload.is_empty():
        return None
    blocks: list[str] = []
    if payload.locked_facts:
        lines = [
            f"- [{fact['kind']}] {json.dumps(fact['content'], ensure_ascii=False, sort_keys=True)}"
            for fact in payload.locked_facts
        ]
        blocks.append(_LOCKED_FACTS_HEADER + "\n" + "\n".join(lines))
    if payload.gaps:
        lines = [
            f"- [{gap['kind']}] {json.dumps(gap['content'], ensure_ascii=False, sort_keys=True)}"
            for gap in payload.gaps
        ]
        blocks.append(_GAPS_HEADER + "\n" + "\n".join(lines))
    return "\n\n".join(blocks)
