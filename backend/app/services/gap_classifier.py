"""R17 gap classification (#198, D-109/D-110).

Turn the advisory Application Quality Reviewer's findings
(:mod:`app.services.campaign_reviewer`) into one of exactly four honest gap
kinds. The classification is fully **deterministic** and derives only from the
finding's own ``category`` and ``trace`` plus the user's Evidence Profile state
(:class:`app.services.evidence_injection.EvidencePayload`). It runs no LLM and
opens no second, parallel judgment path over the materials (D-109, D-082): a
finding the reviewer never produced can never be classified here.

Kind mapping (each maps to a single truthful response in #200/D-110):

- presentation weakness  ← generic_language / repetition / document_defect /
  contradiction — the substance is present; the writing or document is the
  problem, so a diff-reviewed rewording is the honest fix (D-073).
- uncaptured evidence     ← unsupported_claim (the claim is already in the user's
  own materials, just not confirmed in the profile), or a missed requirement the
  profile already *demonstrates* through an experience / achievement / project /
  certification item — the honest fix is an R11 capture proposal that surfaces it.
- evidence not yet produced ← a missed requirement the profile mentions only as a
  bare skill or preference claim, with no demonstrated experience behind it — the
  honest fix is to produce a deliverable that demonstrates it.
- missing skill           ← a missed requirement the profile does not mention at
  all — nothing shows the user has it, so the honest fix is to develop it (a
  learning gap), never to assume an un-showcased capability.

The substance split (uncaptured vs. not-yet-produced vs. missing) is decided by
the profile item's own structured ``kind`` (D-062), never by a keyword lexicon:
a narrow app-specific skill list would misroute any real skill it omits (Rust,
Java, Kafka, …) and hand it the wrong honest response.

An unrecognized reviewer category is left unclassified (returns nothing) rather
than forced into a kind: mislabeling a substance gap as presentation would let
#200 offer rewording for it, which D-110 forbids.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.gap_classification import GapClassification
from app.services.evidence_injection import EvidencePayload
from app.services.quality_signals import keyword_present

GAP_PRESENTATION_WEAKNESS = "presentation_weakness"
GAP_UNCAPTURED_EVIDENCE = "uncaptured_evidence"
GAP_EVIDENCE_NOT_YET_PRODUCED = "evidence_not_yet_produced"
GAP_MISSING_SKILL = "missing_skill"

#: Reviewer categories whose findings are always presentation weaknesses: the
#: underlying substance is present, only the wording/document needs work.
_PRESENTATION_CATEGORIES = frozenset(
    {"generic_language", "repetition", "document_defect", "contradiction"}
)

#: Evidence Profile kinds (R11, D-062) that *demonstrate* a requirement, as
#: opposed to a bare skill/preference claim with nothing behind it. When one of
#: these mentions the requirement, the user already has the evidence; it is just
#: not in the selected materials (uncaptured), not a substance gap.
_DEMONSTRATED_KINDS = frozenset(
    {"experience", "achievement", "project", "certification", "education", "interview-evidence"}
)

_REQUIREMENT_TRACE_PREFIX = "listing_requirement:"


def classify_findings(
    findings: list[dict], evidence_profile: EvidencePayload | None
) -> list[dict]:
    """Classify every recognizable reviewer finding; skip the rest.

    Returns a list of classification dicts ready for persistence, one per
    recognized finding, preserving reviewer order.
    """
    classifications: list[dict] = []
    for finding in findings:
        classified = _classify_one(finding, evidence_profile)
        if classified is not None:
            classifications.append(classified)
    return classifications


def _classify_one(finding: dict, payload: EvidencePayload | None) -> dict | None:
    category = finding.get("category", "")
    trace = list(finding.get("trace", []))
    gap_kind, decision_trace = _decide(category, trace, payload)
    if gap_kind is None:
        return None
    return {
        "finding_id": finding["id"],
        "source_category": category,
        "gap_kind": gap_kind,
        "message": finding.get("message", ""),
        "locations": list(finding.get("locations", [])),
        "cited_trace": trace + decision_trace,
    }


def _decide(
    category: str, trace: list[str], payload: EvidencePayload | None
) -> tuple[str | None, list[str]]:
    if category in _PRESENTATION_CATEGORIES:
        return GAP_PRESENTATION_WEAKNESS, ["classified:presentation_weakness"]

    if category == "unsupported_claim":
        # The claim is present in the user's own materials but is not confirmed
        # profile evidence — they have it, they just have not captured it.
        return GAP_UNCAPTURED_EVIDENCE, [
            "classified:uncaptured_evidence:claim_present_unconfirmed"
        ]

    if category == "missed_requirement":
        keyword = _requirement_keyword(trace)
        kinds = _profile_kinds_mentioning(keyword, payload) if keyword else []
        demonstrated = next((kind for kind in kinds if kind in _DEMONSTRATED_KINDS), None)
        if demonstrated is not None:
            # The profile already demonstrates this through real evidence — it is
            # simply absent from the selected materials.
            return GAP_UNCAPTURED_EVIDENCE, [
                f"profile_lookup:{keyword}:demonstrated_in:{demonstrated}",
                "classified:uncaptured_evidence",
            ]
        if kinds:
            # Claimed only as a bare skill/preference, with nothing demonstrating it.
            return GAP_EVIDENCE_NOT_YET_PRODUCED, [
                f"profile_lookup:{keyword}:skill_claimed_undemonstrated",
                "classified:evidence_not_yet_produced",
            ]
        # No profile evidence at all: nothing shows the user has this, so the
        # honest response is to develop it, not to assume an un-showcased skill.
        return GAP_MISSING_SKILL, [
            f"profile_lookup:{keyword}:absent",
            "classified:missing_skill",
        ]

    # Unrecognized category: do not fabricate a classification.
    return None, []


def _requirement_keyword(trace: list[str]) -> str:
    for entry in trace:
        if entry.startswith(_REQUIREMENT_TRACE_PREFIX):
            return entry[len(_REQUIREMENT_TRACE_PREFIX) :]
    return ""


def _profile_kinds_mentioning(keyword: str, payload: EvidencePayload | None) -> list[str]:
    """Kinds of the confirmed/unconfirmed profile items that mention the keyword.

    A rejected item is already excluded from :class:`EvidencePayload`, so a gap the
    user explicitly rejected never counts. The item ``kind`` — not a keyword
    lexicon — is what distinguishes a *demonstrated* requirement from a bare skill
    claim, so the substance split stays honest for skills no lexicon would list.
    """
    if payload is None:
        return []
    kinds: list[str] = []
    for item in (*payload.locked_facts, *payload.gaps):
        content = json.dumps(item.get("content", {}), sort_keys=True)
        if keyword_present(keyword, content):
            kinds.append(item.get("kind", ""))
    return kinds


def persist_gap_classifications(
    db: Session, user_id: str, workspace_id: str, classifications: list[dict]
) -> list[GapClassification]:
    """Idempotently reconcile a campaign's persisted gaps to the current set.

    Rows for findings the latest classification no longer produces are removed,
    so the persisted set always reflects the current materials — never a stale
    union across edits. Rows are keyed by ``(workspace_id, finding_id)``.
    """
    new_ids = {item["finding_id"] for item in classifications}
    existing = {
        row.finding_id: row
        for row in db.query(GapClassification)
        .filter(
            GapClassification.workspace_id == workspace_id,
            GapClassification.user_id == user_id,
        )
        .all()
    }
    for finding_id, row in existing.items():
        if finding_id not in new_ids:
            db.delete(row)

    result: list[GapClassification] = []
    for item in classifications:
        row = existing.get(item["finding_id"])
        if row is None:
            row = GapClassification(
                user_id=user_id,
                workspace_id=workspace_id,
                finding_id=item["finding_id"],
                source_category=item["source_category"],
                gap_kind=item["gap_kind"],
                message=item["message"],
                locations=item["locations"],
                cited_trace=item["cited_trace"],
            )
            db.add(row)
        else:
            row.source_category = item["source_category"]
            row.gap_kind = item["gap_kind"]
            row.message = item["message"]
            row.locations = item["locations"]
            row.cited_trace = item["cited_trace"]
        result.append(row)

    db.commit()
    for row in result:
        db.refresh(row)
    return _ordered(result)


def list_gap_classifications(
    db: Session, user_id: str, workspace_id: str
) -> list[GapClassification]:
    rows = (
        db.query(GapClassification)
        .filter(
            GapClassification.workspace_id == workspace_id,
            GapClassification.user_id == user_id,
        )
        .all()
    )
    return _ordered(rows)


def delete_gap_classifications(db: Session, user_id: str) -> int:
    """Remove all of a user's gap classifications (erasure cascade, D-114)."""
    return (
        db.query(GapClassification)
        .filter(GapClassification.user_id == user_id)
        .delete(synchronize_session=False)
    )


def _ordered(rows: list[GapClassification]) -> list[GapClassification]:
    """Stable display order: by kind, then by finding id."""
    return sorted(rows, key=lambda row: (row.gap_kind, row.finding_id))
