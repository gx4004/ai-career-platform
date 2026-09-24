from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import urlparse

from sqlalchemy import and_, case, exists, func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_personalization import DiscoveryDismissedListing
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.schemas.discovery_recommendations import (
    DiscoveryListingItem,
    DiscoveryListingPage,
    DiscoveryListingStats,
    DiscoveryRecommendation,
    DiscoveryRecommendationList,
    RecommendationAttribution,
    RecommendationSignal,
)
from app.services.ats_ingestion import _PROVIDER_BY_API_HOST
from app.services.discovery_personalization import (
    dismissed_listing_ids,
    hidden_source_ids,
)
from app.services.quality_signals import (
    compute_match_score,
    extract_job_keywords,
    keyword_present,
)

MAX_RECOMMENDATIONS = 50
MAX_CANDIDATE_LISTINGS = 500
MAX_SEARCH_TERMS = 8
NEW_THIS_WEEK_DAYS = 7

SearchSort = Literal["best_match", "newest"]


def rank_discovery_recommendations(
    db: Session,
    user_id: str,
    *,
    now: datetime | None = None,
) -> DiscoveryRecommendationList:
    """Rank live canonical listings against owner-confirmed deterministic signals."""
    now = now or datetime.now(UTC)
    evidence, preferences = _confirmed_items(db, user_id)
    if not evidence and not preferences:
        return DiscoveryRecommendationList(
            items=[],
            confirmed_item_count=0,
            preference_item_count=0,
        )

    # Owner correction controls filter the feed on every read so a hide, dismiss,
    # or preference change takes effect immediately on the next load (D-090, D-088).
    hidden_sources = hidden_source_ids(db, user_id)
    dismissed = dismissed_listing_ids(db, user_id)

    candidate_ids = [
        listing_id for listing_id in _live_candidate_ids(db, now) if listing_id not in dismissed
    ]
    recommendations: list[DiscoveryRecommendation] = []
    for listing in _load_listings(db, candidate_ids):
        live_attributions = _visible_attributions(listing, hidden_sources, now)
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
        confirmed_item_count=len(evidence) + len(preferences),
        preference_item_count=len(preferences),
    )


def visible_recommendation(
    db: Session,
    user_id: str,
    listing_id: str,
    *,
    now: datetime | None = None,
) -> DiscoveryRecommendation | None:
    """One listing as this owner may currently see it, or None when it is hidden.

    Applies the same visibility rules as the ranked feed (not dismissed, at least
    one live source that is still allowed and not hidden) without the feed's
    top-N cut, so any listing the search shows can be acted on. Scores 0 when the
    owner has no confirmed items.
    """
    now = now or datetime.now(UTC)
    if listing_id in dismissed_listing_ids(db, user_id):
        return None
    listings = _load_listings(db, [listing_id])
    if not listings:
        return None
    live_attributions = _visible_attributions(listings[0], hidden_source_ids(db, user_id), now)
    if not live_attributions:
        return None
    evidence, preferences = _confirmed_items(db, user_id)
    return _rank_listing(listings[0], live_attributions, evidence, preferences)


def search_listings(
    db: Session,
    user_id: str,
    *,
    q: str | None = None,
    location: str | None = None,
    remote: bool | None = None,
    company: str | None = None,
    posted_within_days: int | None = None,
    sort: SearchSort = "best_match",
    page: int = 1,
    limit: int = 20,
    now: datetime | None = None,
) -> DiscoveryListingPage:
    """Filter every listing this owner can see; score against confirmed items if any.

    Filtering, counting and "newest" ordering happen in SQL. "Best match" scores
    the newest MAX_CANDIDATE_LISTINGS filtered matches and ranks them first; any
    older matches follow newest-first, so pagination always covers the full set.
    """
    now = now or datetime.now(UTC)
    evidence, preferences = _confirmed_items(db, user_id)
    has_profile = bool(evidence or preferences)
    hidden_sources = hidden_source_ids(db, user_id)
    visible = _visible_listing_clause(db, user_id, hidden_sources, now)

    filters = [visible]
    terms = (q or "").split()[:MAX_SEARCH_TERMS]
    for term in terms:
        pattern = _like_pattern(term)
        filters.append(
            or_(
                DiscoveredListing.title.ilike(pattern, escape="\\"),
                DiscoveredListing.company.ilike(pattern, escape="\\"),
                DiscoveredListing.description.ilike(pattern, escape="\\"),
            )
        )
    if location and location.strip():
        filters.append(DiscoveredListing.location.ilike(_like_pattern(location), escape="\\"))
    if remote is True:
        filters.append(DiscoveredListing.remote.is_(True))
    elif remote is False:
        filters.append(or_(DiscoveredListing.remote.is_(False), DiscoveredListing.remote.is_(None)))
    if company:
        filters.append(DiscoveredListing.company == company)
    if posted_within_days:
        filters.append(DiscoveredListing.posted_at >= now - timedelta(days=posted_within_days))

    ordered_ids = [
        listing_id
        for (listing_id,) in db.query(DiscoveredListing.id)
        .filter(and_(*filters))
        .order_by(
            DiscoveredListing.posted_at.desc().nulls_last(),
            DiscoveredListing.created_at.desc(),
            DiscoveredListing.id,
        )
    ]

    ranked: dict[str, DiscoveryRecommendation] = {}
    loaded: dict[str, DiscoveredListing] = {}
    effective_sort: SearchSort = sort if has_profile else "newest"
    if effective_sort == "best_match":
        head = ordered_ids[:MAX_CANDIDATE_LISTINGS]
        for listing in _load_listings(db, head):
            loaded[listing.id] = listing
            attributions = _visible_attributions(listing, hidden_sources, now)
            if attributions:
                ranked[listing.id] = _rank_listing(listing, attributions, evidence, preferences)
        position = {listing_id: index for index, listing_id in enumerate(head)}
        head.sort(
            key=lambda listing_id: (
                -(ranked[listing_id].score if listing_id in ranked else -1),
                position[listing_id],
            )
        )
        ordered_ids = head + ordered_ids[MAX_CANDIDATE_LISTINGS:]

    offset = (page - 1) * limit
    page_ids = ordered_ids[offset : offset + limit]
    missing = [listing_id for listing_id in page_ids if listing_id not in loaded]
    loaded.update({listing.id: listing for listing in _load_listings(db, missing)})

    items: list[DiscoveryListingItem] = []
    for listing_id in page_ids:
        listing = loaded[listing_id]
        attributions = _visible_attributions(listing, hidden_sources, now)
        if not attributions:
            continue
        recommendation = ranked.get(listing_id)
        if recommendation is None and has_profile:
            recommendation = _rank_listing(listing, attributions, evidence, preferences)
        items.append(_listing_item(listing, attributions[0], recommendation))

    return DiscoveryListingPage(
        items=items,
        total=len(ordered_ids),
        page=page,
        limit=limit,
        sort=effective_sort,
        has_profile=has_profile,
        stats=_listing_stats(db, visible, now),
        companies=[
            name
            for (name,) in db.query(DiscoveredListing.company)
            .filter(visible)
            .distinct()
            .order_by(DiscoveredListing.company)
        ],
    )


def _listing_item(
    listing: DiscoveredListing,
    attribution: DiscoveredListingAttribution,
    recommendation: DiscoveryRecommendation | None,
) -> DiscoveryListingItem:
    matched: list[str] = []
    if recommendation is not None:
        for signal in recommendation.rationale:
            matched.extend(signal.matched_keywords)
    return DiscoveryListingItem(
        listing_id=listing.id,
        title=listing.title,
        company=listing.company,
        description=listing.description,
        location=listing.location,
        remote=listing.remote,
        posted_at=listing.posted_at,
        apply_url=listing.apply_url,
        department=listing.department,
        score=recommendation.score if recommendation is not None else None,
        matched_keywords=list(dict.fromkeys(matched)),
        source_name=_source_label(attribution.source),
        source_url=attribution.source_url,
    )


def _listing_stats(db: Session, visible, now: datetime) -> DiscoveryListingStats:
    week_ago = now - timedelta(days=NEW_THIS_WEEK_DAYS)
    jobs, companies, new_this_week = (
        db.query(
            func.count(DiscoveredListing.id),
            func.count(func.distinct(DiscoveredListing.company)),
            func.count(case((DiscoveredListing.posted_at >= week_ago, 1))),
        )
        .filter(visible)
        .one()
    )
    return DiscoveryListingStats(jobs=jobs, companies=companies, new_this_week=new_this_week)


def _source_label(source: DiscoverySource) -> str:
    """The job board a listing came from, for the per-card attribution line."""
    provider = _PROVIDER_BY_API_HOST.get(urlparse(source.endpoint_url or "").hostname or "")
    return provider.title() if provider else source.display_name


def _like_pattern(value: str) -> str:
    escaped = value.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _confirmed_items(db: Session, user_id: str):
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
    return evidence, preferences


def _load_listings(db: Session, listing_ids: list[str]) -> list[DiscoveredListing]:
    if not listing_ids:
        return []
    return (
        db.query(DiscoveredListing)
        .options(
            selectinload(DiscoveredListing.attributions).selectinload(
                DiscoveredListingAttribution.source
            )
        )
        .filter(DiscoveredListing.id.in_(listing_ids))
        .all()
    )


def _visible_attributions(listing, hidden_sources: set[str], now: datetime):
    # A hidden source is removed from the listing's attributions; so is a source
    # whose terms were revoked or kill switch was tripped after ingestion — that
    # governance state is re-checked on every read, not just at ingest time, so a
    # listing already sitting inside its retention window stops being
    # recommended/adoptable the moment the source is no longer allowed (ADR 0008).
    # A listing left with no visible, live, allowed source drops out entirely.
    return sorted(
        (
            attribution
            for attribution in listing.attributions
            if attribution.source_id not in hidden_sources
            and attribution.source.ingestion_allowed
            and _is_live(attribution.retrieved_at, attribution.source.retention_days, now)
        ),
        key=lambda item: (_as_utc(item.retrieved_at), item.source.display_name),
        reverse=True,
    )


def _visible_listing_clause(db: Session, user_id: str, hidden_sources: set[str], now: datetime):
    """SQL twin of `_visible_attributions` plus the owner's dismissals."""
    live_source = (
        select(DiscoveredListingAttribution.id)
        .join(DiscoverySource, DiscoveredListingAttribution.source_id == DiscoverySource.id)
        .where(
            DiscoveredListingAttribution.listing_id == DiscoveredListing.id,
            DiscoveredListingAttribution.retrieved_at >= _live_cutoff(db, now),
            DiscoverySource.terms_status == "accepted",
            DiscoverySource.kill_switch.is_(False),
            DiscoverySource.id.not_in(hidden_sources),
        )
    )
    dismissed = select(DiscoveryDismissedListing.listing_id).where(
        DiscoveryDismissedListing.user_id == user_id
    )
    return and_(exists(live_source), DiscoveredListing.id.not_in(dismissed))


# Keyword extraction is the expensive step of scoring (~3 ms for a real ATS
# description) and depends only on the listing text, so it is memoized by a hash
# of that text. Bounded by a crude clear; listings are a few thousand rows.
_KEYWORD_CACHE: dict[str, list[str]] = {}
_KEYWORD_CACHE_MAX = 20_000


def _listing_keywords(listing_text: str) -> list[str]:
    key = hashlib.sha256(listing_text.encode()).hexdigest()
    keywords = _KEYWORD_CACHE.get(key)
    if keywords is None:
        if len(_KEYWORD_CACHE) >= _KEYWORD_CACHE_MAX:
            _KEYWORD_CACHE.clear()
        keywords = _KEYWORD_CACHE[key] = extract_job_keywords(listing_text, limit=12)
    return keywords


def _rank_listing(listing, attributions, evidence, preferences) -> DiscoveryRecommendation:
    listing_text = f"{listing.title}\n{listing.company}\n{listing.description}"
    listing_keywords = _listing_keywords(listing_text)
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
            source_id=attribution.source.id,
            source_name=attribution.source.display_name,
            source_family=attribution.source.source_family,
            source_url=attribution.source_url,
            retrieved_at=attribution.retrieved_at,
        )
        for attribution in attributions
    ]
    return DiscoveryRecommendation(
        listing_id=listing.id,
        title=listing.title,
        company=listing.company,
        description=listing.description,
        location=listing.location,
        remote=listing.remote,
        posted_at=listing.posted_at,
        apply_url=listing.apply_url,
        department=listing.department,
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


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _is_live(retrieved_at: datetime, retention_days: int, now: datetime) -> bool:
    return _as_utc(retrieved_at) >= now - timedelta(days=retention_days)


def _live_cutoff(db: Session, now: datetime):
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        return now - (DiscoverySource.retention_days * text("INTERVAL '1 day'"))
    return func.datetime(
        now,
        func.printf("-%d days", DiscoverySource.retention_days),
    )


def _live_candidate_ids(db: Session, now: datetime) -> list[str]:
    latest_retrieval = func.max(DiscoveredListingAttribution.retrieved_at)
    rows = (
        db.query(DiscoveredListingAttribution.listing_id)
        .join(
            DiscoverySource,
            DiscoveredListingAttribution.source_id == DiscoverySource.id,
        )
        .filter(DiscoveredListingAttribution.retrieved_at >= _live_cutoff(db, now))
        .group_by(DiscoveredListingAttribution.listing_id)
        .order_by(latest_retrieval.desc(), DiscoveredListingAttribution.listing_id)
        .limit(MAX_CANDIDATE_LISTINGS)
        .all()
    )
    return [listing_id for (listing_id,) in rows]
