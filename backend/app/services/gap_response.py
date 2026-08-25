"""R17 honest-response mapping (#200, D-110/D-111).

Map one classified gap (#198) to its single truthful response. Pure and
write-free: it reuses :data:`app.schemas.development.RESPONSE_FOR_GAP` as the one
source of truth for the gap-kind -> response-kind mapping and never touches the
Evidence Profile. A substance gap can never be offered rewording; that invariant
is asserted here as a hard barrier so a future edit to the mapping cannot quietly
route a missing-skill or missing-evidence gap to a rewrite (D-110).
"""

from __future__ import annotations

from app.models.gap_classification import GapClassification
from app.schemas.development import RESPONSE_FOR_GAP
from app.schemas.evidence_profile import EvidenceItemCreate
from app.schemas.gap_response import (
    FirstPartyRoute,
    GapRecommendationSource,
    GapResponseOffer,
)

_CLAIM_PREFIX = "claim:"
_REQUIREMENT_PREFIX = "listing_requirement:"


def map_gap_to_response(classification: GapClassification) -> GapResponseOffer:
    gap_kind = classification.gap_kind
    response_kind = RESPONSE_FOR_GAP[gap_kind]

    # Hard D-110 barrier: only a presentation weakness may ever be offered
    # rewording. Any substance gap routed to a rewrite would be dishonest.
    if gap_kind != "presentation_weakness" and response_kind == "reword":
        raise ValueError(f"substance gap {gap_kind!r} must never be offered rewording")

    if gap_kind == "presentation_weakness":
        return GapResponseOffer(
            gap_classification_id=classification.id,
            gap_kind=gap_kind,
            response_kind=response_kind,
            action_path="reviewer_reword",
            headline="Reword for clarity",
            detail=(
                "The substance is already present. Refine the wording through the "
                "reviewer's diff-reviewed rewrite — no new claim is introduced."
            ),
        )

    if gap_kind == "uncaptured_evidence":
        return GapResponseOffer(
            gap_classification_id=classification.id,
            gap_kind=gap_kind,
            response_kind=response_kind,
            action_path="evidence_profile_create",
            headline="Capture this as evidence",
            detail=(
                "You already have this — add it to your Evidence Profile through the "
                "usual review-and-confirm flow so every tool can reuse it."
            ),
            capture_proposal=EvidenceItemCreate(
                kind="achievement",
                content={"statement": _capture_seed(classification)},
                provenance="inferred",
            ),
        )

    if gap_kind == "evidence_not_yet_produced":
        return GapResponseOffer(
            gap_classification_id=classification.id,
            gap_kind=gap_kind,
            response_kind=response_kind,
            action_path="portfolio_planner",
            headline="Plan a portfolio project",
            detail=(
                "Build something that demonstrates this requirement, then capture the "
                "result as evidence. The next step is the Portfolio Planner you "
                "already have; no outside source is recommended, and none is "
                "fabricated."
            ),
            sources=[_first_party_step("Portfolio Planner", "/portfolio", classification)],
        )

    # missing_skill
    return GapResponseOffer(
        gap_classification_id=classification.id,
        gap_kind=gap_kind,
        response_kind=response_kind,
        action_path="career_path",
        headline="Plan the learning that closes this",
        detail=(
            "Nothing in your materials or profile shows this skill yet. Plan the "
            "learning in Career Path, then demonstrate it. No outside learning source "
            "is recommended here; none is fabricated."
        ),
        sources=[_first_party_step("Career Path", "/career", classification)],
    )


def _first_party_step(
    surface: str, route: FirstPartyRoute, classification: GapClassification
) -> GapRecommendationSource:
    """The named next step for an advisory gap.

    A first-party surface the user already has, labelled with the requirement the
    classification's own trace cited — so the response names something concrete
    without inventing an external source or a commercial relationship (D-111).
    """
    return GapRecommendationSource(
        label=f"{surface}: {_capture_seed(classification)}",
        route=route,
    )


def _capture_seed(classification: GapClassification) -> str:
    """The most specific statement the classification's trace supports.

    Seeds both the capture proposal and the label of a named next step.

    Prefers the reviewer's own captured claim, then the unmet listing requirement,
    then the finding message — never invented text.
    """
    return trace_seed(classification.cited_trace, classification.message)


def trace_seed(trace: list[str] | None, fallback: str) -> str:
    """Shared with R17 #201 (completion proposals): the most specific statement a
    cited trace supports, never invented text.
    """
    for entry in trace or []:
        if entry.startswith(_CLAIM_PREFIX):
            return entry[len(_CLAIM_PREFIX) :]
    for entry in trace or []:
        if entry.startswith(_REQUIREMENT_PREFIX):
            return entry[len(_REQUIREMENT_PREFIX) :]
    return fallback
