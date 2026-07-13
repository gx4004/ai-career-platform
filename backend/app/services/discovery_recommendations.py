from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, text
from sqlalchemy.orm import Session, selectinload

from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.schemas.discovery_recommendations import (
    DiscoveryRecommendation,
    DiscoveryRecommendationList,
    RecommendationAttribution,
    RecommendationSignal,
)
from app.services.quality_signals import (
    compute_match_score,
    extract_job_keywords,
    keyword_present,
)

MAX_RECOMMENDATIONS = 50
MAX_CANDIDATE_LISTINGS = 500


def rank_discovery_recommendations(
    db: Session,
    user_id: str,
    *,
    now: datetime | None = None,
) -> DiscoveryRecommendationList:
    """Rank live canonical listings against owner-confirmed deterministic signals."""
    now = now or datetime.now(UTC)
    confirmed_items = (
        db.query(EvidenceItem)
        .filter(
            EvidenceItem.user_id == user_id,
            EvidenceItem.confirmation_state == "confirmed",
        )
        .order_by(EvidenceItem.created_at, EvidenceItem.id)
        .all()
    )
    preferences = [item for item in confirmed_items if item.kind == "preference"]
    evidence = [item for item in confirmed_items if item.kind != "preference"]
    if not confirmed_items:
        return DiscoveryRecommendationList(
            items=[],
            confirmed_item_count=0,
            preference_item_count=0,
        )

    candidate_ids = _live_candidate_ids(db, now)
    listings = (
        db.query(DiscoveredListing)
        .options(
            selectinload(DiscoveredListing.attributions).selectinload(
                DiscoveredListingAttribution.source
            )
        )
        .filter(DiscoveredListing.id.in_(candidate_ids))
        .all()
    )
    recommendations: list[DiscoveryRecommendation] = []
    for listing in listings:
        live_attributions = [
            attribution
            for attribution in listing.attributions
            if _is_live(attribution.retrieved_at, attribution.source.retention_days, now)
        ]
        if not live_attributions:
            continue
        recommendations.append(_rank_listing(listing, live_attributions, evidence, preferences))

    recommendations.sort(
        key=lambda item: (
            -item.score,
            item.company.casefold(),
            item.title.casefold(),
            item.listing_id,
        )
    )
    return DiscoveryRecommendationList(
        items=recommendations[:MAX_RECOMMENDATIONS],
        confirmed_item_count=len(confirmed_items),
        preference_item_count=len(preferences),
    )


def _rank_listing(listing, attributions, evidence, preferences) -> DiscoveryRecommendation:
    listing_text = f"{listing.title}\n{listing.company}\n{listing.description}"
    listing_keywords = extract_job_keywords(listing_text, limit=12)
    evidence_matches, evidence_ids = _match_listing_keywords(listing_keywords, evidence)
    missing = [keyword for keyword in listing_keywords if keyword not in evidence_matches]
    evidence_score = compute_match_score(evidence_matches, missing) if evidence else 0

    preference_matches, preference_ids = _match_preference_keywords(listing_text, preferences)
    if preferences:
        preference_keywords = _keywords_for_items(preferences)
        preference_score = compute_match_score(
            preference_matches,
            [keyword for keyword in preference_keywords if keyword not in preference_matches],
        )
    else:
        preference_score = 0

    if evidence and preferences:
        score = round((evidence_score * 0.8) + (preference_score * 0.2))
    elif evidence:
        score = evidence_score
    else:
        score = preference_score

    rationale: list[RecommendationSignal] = []
    if evidence:
        rationale.append(
            RecommendationSignal(
                kind="confirmed_evidence",
                label=(
                    "Confirmed evidence overlaps this listing"
                    if evidence_matches
                    else "No confirmed evidence overlap detected"
                ),
                matched_keywords=evidence_matches,
                evidence_item_ids=evidence_ids,
                score=evidence_score,
            )
        )
    if preferences:
        rationale.append(
            RecommendationSignal(
                kind="preference",
                label=(
                    "Confirmed preferences align with this listing"
                    if preference_matches
                    else "No confirmed preference overlap detected"
                ),
                matched_keywords=preference_matches,
                evidence_item_ids=preference_ids,
                score=preference_score,
            )
        )
    attribution_models = [
        RecommendationAttribution(
            source_name=attribution.source.display_name,
            source_family=attribution.source.source_family,
            source_url=attribution.source_url,
            retrieved_at=attribution.retrieved_at,
        )
        for attribution in sorted(
            attributions,
            key=lambda item: (item.retrieved_at, item.source.display_name),
            reverse=True,
        )
    ]
    return DiscoveryRecommendation(
        listing_id=listing.id,
        title=listing.title,
        company=listing.company,
        description=listing.description,
        score=max(0, min(100, score)),
        rationale=rationale,
        attributions=attribution_models,
    )


def _match_listing_keywords(keywords: list[str], items: list[EvidenceItem]):
    matched: list[str] = []
    item_ids: list[str] = []
    for keyword in keywords:
        matching_ids = [
            item.id for item in items if keyword_present(keyword, _content_text(item.content))
        ]
        if matching_ids:
            matched.append(keyword)
            item_ids.extend(matching_ids)
    return matched, list(dict.fromkeys(item_ids))


def _match_preference_keywords(listing_text: str, items: list[EvidenceItem]):
    matched: list[str] = []
    item_ids: list[str] = []
    for item in items:
        item_matched = [
            keyword
            for keyword in extract_job_keywords(_content_text(item.content), limit=8)
            if keyword_present(keyword, listing_text)
        ]
        if item_matched:
            matched.extend(item_matched)
            item_ids.append(item.id)
    return list(dict.fromkeys(matched)), item_ids


def _keywords_for_items(items: list[EvidenceItem]) -> list[str]:
    keywords: list[str] = []
    for item in items:
        keywords.extend(extract_job_keywords(_content_text(item.content), limit=8))
    return list(dict.fromkeys(keywords))


def _content_text(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(_content_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_content_text(item) for item in value)
    if value is None or isinstance(value, bool):
        return ""
    return str(value)


def _is_live(retrieved_at: datetime, retention_days: int, now: datetime) -> bool:
    if retrieved_at.tzinfo is None:
        retrieved_at = retrieved_at.replace(tzinfo=UTC)
    return retrieved_at >= now - timedelta(days=retention_days)


def _live_candidate_ids(db: Session, now: datetime) -> list[str]:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        live_cutoff = now - (DiscoverySource.retention_days * text("INTERVAL '1 day'"))
    else:
        live_cutoff = func.datetime(
            now,
            func.printf("-%d days", DiscoverySource.retention_days),
        )
    latest_retrieval = func.max(DiscoveredListingAttribution.retrieved_at)
    rows = (
        db.query(DiscoveredListingAttribution.listing_id)
        .join(
            DiscoverySource,
            DiscoveredListingAttribution.source_id == DiscoverySource.id,
        )
        .filter(DiscoveredListingAttribution.retrieved_at >= live_cutoff)
        .group_by(DiscoveredListingAttribution.listing_id)
        .order_by(latest_retrieval.desc(), DiscoveredListingAttribution.listing_id)
        .limit(MAX_CANDIDATE_LISTINGS)
        .all()
    )
    return [listing_id for (listing_id,) in rows]
