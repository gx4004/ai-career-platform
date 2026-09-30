"""Job Discovery: which listings an owner can see, and how well each one fits.

One visibility rule, applied in SQL everywhere (search, detail, adoption, bulk
prepare): a listing is visible to an owner when it has at least one attribution
inside its source's retention window from a source whose terms are accepted and
kill switch is clear, and the owner has not dismissed it. Governance is re-read
on every request, so revoking or killing a source hides its listings at once
(ADR 0008, D-090).

Fit is deterministic keyword overlap with the owner's confirmed Evidence Profile
items, kept as two separate signals that are never blended: **skills fit**
(listing keywords the confirmed evidence covers, with the matched and missing
ones) and **preference hits** (the owner's confirmed preference keywords the
listing mentions). Ranking uses skills fit; preference hits only break ties.
Nothing here calls an LLM. The owner's items are prepared once per request
(``MatchProfile``), and matches are cached per profile fingerprint and listing,
so a page request scores only listings it has not seen for that profile.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import OrderedDict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import and_, exists, func, or_, select, text
from sqlalchemy.orm import Session, contains_eager

from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_personalization import DiscoveryDismissedListing
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.schemas.discovery_recommendations import (
    DiscoveryListingDetail,
    DiscoveryListingItem,
    DiscoveryListingPage,
)
from app.services.ats_providers import provider_for_endpoint
from app.services.quality_signals import (
    compute_match_score,
    extract_detected_skills,
    extract_job_keywords,
    keyword_present,
)

# Best match scores the newest this-many filtered listings; older matches
# follow newest-first, so pagination still covers every visible listing.
MAX_SCORED_CANDIDATES = 500
BEST_MATCHES_LIMIT = 50
MAX_SEARCH_TERMS = 8
PREVIEW_CHARS = 240

SearchSort = Literal["best_match", "newest"]


@dataclass(frozen=True)
class Match:
    # None when the owner has no confirmed evidence (not 0%: nothing to compare).
    skills_fit: int | None = None
    matched_skills: tuple[str, ...] = ()
    missing_skills: tuple[str, ...] = ()
    preference_hits: tuple[str, ...] = ()


@dataclass(frozen=True)
class MatchProfile:
    """An owner's confirmed items, prepared once per request for scoring."""

    fingerprint: str
    evidence_text: str | None
    preference_keywords: tuple[tuple[str, ...], ...]

    @property
    def has_items(self) -> bool:
        return self.has_evidence or bool(self.preference_keywords)

    @property
    def has_evidence(self) -> bool:
        return self.evidence_text is not None


@dataclass(frozen=True)
class VisibleListing:
    """One listing as its owner may currently see it."""

    listing: DiscoveredListing
    # The freshest live attribution from an allowed source.
    attribution: DiscoveredListingAttribution
    # None when the owner has no confirmed items to score against.
    match: Match | None

    @property
    def listing_id(self) -> str:
        return self.listing.id


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
    """One page of the listings this owner can see, filtered and ordered in SQL.

    Issues a fixed number of statements whatever the listing count. ``companies``
    (the filter options) is returned on page 1 only.
    """
    now = now or datetime.now(UTC)
    profile = load_match_profile(db, user_id)
    visible = visible_listing_clause(db, user_id, now)
    filters = _search_filters(
        q=q,
        location=location,
        remote=remote,
        company=company,
        posted_within_days=posted_within_days,
        now=now,
    )
    matching = select(DiscoveredListing.id).where(visible, *filters)
    total = db.scalar(select(func.count()).select_from(matching.subquery())) or 0

    effective_sort: SearchSort = sort if profile.has_evidence else "newest"
    offset = (page - 1) * limit
    if effective_sort == "best_match":
        page_ids = _best_match_page(db, profile, matching, offset=offset, limit=limit)
    else:
        page_ids = _newest_ids(db, matching, offset=offset, limit=limit)

    visible_rows = _load_visible(db, page_ids, profile, now)
    return DiscoveryListingPage(
        items=[_listing_item(visible_rows[i]) for i in page_ids if i in visible_rows],
        total=total,
        page=page,
        limit=limit,
        sort=effective_sort,
        has_evidence=profile.has_evidence,
        companies=(
            list(
                db.scalars(
                    select(DiscoveredListing.company)
                    .where(visible)
                    .distinct()
                    .order_by(DiscoveredListing.company)
                )
            )
            if page == 1
            else None
        ),
    )


def listing_detail(
    db: Session, user_id: str, listing_id: str, *, now: datetime | None = None
) -> DiscoveryListingDetail | None:
    row = visible_listing(db, user_id, listing_id, now=now)
    if row is None:
        return None
    # Local import: deep match builds on this module's visibility rule.
    from app.services.discovery_deep_match import linked_deep_match

    return DiscoveryListingDetail(
        **_listing_item(row).model_dump(),
        description=row.listing.description,
        deep_match=linked_deep_match(db, user_id, listing_id),
    )


def visible_listing(
    db: Session,
    user_id: str,
    listing_id: str,
    *,
    now: datetime | None = None,
) -> VisibleListing | None:
    """One listing as this owner may currently see it, or None when it is hidden."""
    now = now or datetime.now(UTC)
    is_visible = db.scalar(
        select(DiscoveredListing.id).where(
            DiscoveredListing.id == listing_id,
            visible_listing_clause(db, user_id, now),
        )
    )
    if is_visible is None:
        return None
    return _load_visible(db, [listing_id], load_match_profile(db, user_id), now).get(listing_id)


def best_matches(
    db: Session,
    user_id: str,
    *,
    limit: int = BEST_MATCHES_LIMIT,
    now: datetime | None = None,
) -> list[VisibleListing]:
    """The owner's top visible listings by skills fit; empty without confirmed evidence."""
    now = now or datetime.now(UTC)
    profile = load_match_profile(db, user_id)
    if not profile.has_evidence:
        return []
    matching = select(DiscoveredListing.id).where(visible_listing_clause(db, user_id, now))
    page_ids = _best_match_page(db, profile, matching, offset=0, limit=limit)
    rows = _load_visible(db, page_ids, profile, now)
    return [rows[listing_id] for listing_id in page_ids if listing_id in rows]


def visible_listing_clause(db: Session, user_id: str, now: datetime):
    """The one visibility rule, as a SQL condition on ``DiscoveredListing``."""
    live_source = (
        select(DiscoveredListingAttribution.id)
        .join(DiscoverySource, DiscoveredListingAttribution.source_id == DiscoverySource.id)
        .where(DiscoveredListingAttribution.listing_id == DiscoveredListing.id, _live(db, now))
    )
    dismissed = select(DiscoveryDismissedListing.listing_id).where(
        DiscoveryDismissedListing.user_id == user_id
    )
    return and_(exists(live_source), DiscoveredListing.id.not_in(dismissed))


def load_match_profile(db: Session, user_id: str) -> MatchProfile:
    items = list(
        db.scalars(
            select(EvidenceItem)
            .where(
                EvidenceItem.user_id == user_id,
                EvidenceItem.confirmation_state == "confirmed",
            )
            .order_by(EvidenceItem.created_at, EvidenceItem.id)
        )
    )
    evidence = [_content_text(item.content) for item in items if item.kind != "preference"]
    preferences = [
        tuple(extract_job_keywords(_content_text(item.content), limit=8))
        for item in items
        if item.kind == "preference"
    ]
    fingerprint = hashlib.sha256(
        json.dumps(
            [[item.id, item.kind, item.content] for item in items],
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()
    return MatchProfile(
        fingerprint=fingerprint,
        evidence_text="\n".join(evidence) if evidence else None,
        preference_keywords=tuple(preferences),
    )


def score_listing(profile: MatchProfile, listing: DiscoveredListing) -> Match:
    """Skills fit and preference hits for one listing; the two are never combined."""
    skills_fit = None
    matched: list[str] = []
    missing: list[str] = []
    if profile.evidence_text is not None:
        for keyword in _listing_keywords(listing):
            covered = keyword_present(keyword, profile.evidence_text)
            (matched if covered else missing).append(keyword)
        skills_fit = max(0, min(100, compute_match_score(matched, missing)))

    hits: list[str] = []
    if profile.preference_keywords:
        listing_text = f"{listing.title}\n{listing.company}\n{listing.description}"
        wanted = dict.fromkeys(k for item in profile.preference_keywords for k in item)
        hits = [k for k in wanted if keyword_present(k, listing_text)]
    return Match(
        skills_fit=skills_fit,
        matched_skills=tuple(matched),
        missing_skills=tuple(missing),
        preference_hits=tuple(hits),
    )


# ── Internals ──


def _search_filters(*, q, location, remote, company, posted_within_days, now) -> list:
    filters = []
    for term in (q or "").split()[:MAX_SEARCH_TERMS]:
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
    return filters


_NEWEST_FIRST = (
    DiscoveredListing.posted_at.desc().nulls_last(),
    DiscoveredListing.created_at.desc(),
    DiscoveredListing.id,
)


def _newest_ids(db: Session, matching, *, offset: int, limit: int) -> list[str]:
    if limit <= 0:
        return []
    return list(db.scalars(matching.order_by(*_NEWEST_FIRST).offset(offset).limit(limit)))


def _best_match_page(
    db: Session, profile: MatchProfile, matching, *, offset: int, limit: int
) -> list[str]:
    """Score the newest candidates, then page through them and the newest-first tail."""
    head = list(db.scalars(matching.order_by(*_NEWEST_FIRST).limit(MAX_SCORED_CANDIDATES)))
    scores = _scores(db, profile, head)
    position = {listing_id: index for index, listing_id in enumerate(head)}
    head.sort(
        key=lambda listing_id: (
            -(scores[listing_id].skills_fit or 0),
            -len(scores[listing_id].preference_hits),
            position[listing_id],
        )
    )
    page_ids = head[offset : offset + limit]
    if len(head) == MAX_SCORED_CANDIDATES and len(page_ids) < limit:
        page_ids += _newest_ids(
            db,
            matching,
            offset=max(offset, MAX_SCORED_CANDIDATES),
            limit=limit - len(page_ids),
        )
    return page_ids


def _load_visible(
    db: Session, listing_ids: list[str], profile: MatchProfile, now: datetime
) -> dict[str, VisibleListing]:
    """The listings plus their freshest live attribution, in two statements."""
    if not listing_ids:
        return {}
    listings = {
        listing.id: listing
        for listing in db.scalars(
            select(DiscoveredListing).where(DiscoveredListing.id.in_(listing_ids))
        )
    }
    freshest: dict[str, DiscoveredListingAttribution] = {}
    for attribution in db.scalars(
        select(DiscoveredListingAttribution)
        .join(DiscoverySource, DiscoveredListingAttribution.source_id == DiscoverySource.id)
        .options(contains_eager(DiscoveredListingAttribution.source))
        .where(DiscoveredListingAttribution.listing_id.in_(listing_ids), _live(db, now))
        .order_by(
            DiscoveredListingAttribution.retrieved_at.desc(),
            DiscoverySource.display_name.desc(),
        )
    ):
        freshest.setdefault(attribution.listing_id, attribution)
    scores = _scores(db, profile, list(listings), loaded=listings) if profile.has_items else {}
    return {
        listing_id: VisibleListing(listing, freshest[listing_id], scores.get(listing_id))
        for listing_id, listing in listings.items()
        if listing_id in freshest
    }


def _listing_item(row: VisibleListing) -> DiscoveryListingItem:
    listing = row.listing
    return DiscoveryListingItem(
        listing_id=listing.id,
        title=listing.title,
        company=listing.company,
        preview=_preview(listing.description),
        location=listing.location,
        remote=listing.remote,
        posted_at=listing.posted_at,
        apply_url=listing.apply_url,
        department=listing.department,
        skills_fit=row.match.skills_fit if row.match else None,
        matched_skills=list(row.match.matched_skills) if row.match else [],
        missing_skills=list(row.match.missing_skills) if row.match else [],
        preference_hits=list(row.match.preference_hits) if row.match else [],
        source_name=_source_label(row.attribution.source),
        source_url=row.attribution.source_url,
    )


def _preview(description: str) -> str:
    collapsed = " ".join(description[: PREVIEW_CHARS * 4].split())
    if len(collapsed) <= PREVIEW_CHARS:
        return collapsed
    return collapsed[:PREVIEW_CHARS].rstrip() + "…"


def _source_label(source: DiscoverySource) -> str:
    """The job board a listing came from, for the per-card attribution line."""
    provider = provider_for_endpoint(source.endpoint_url)
    return provider.label if provider else source.display_name


def _like_pattern(value: str) -> str:
    escaped = value.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _live(db: Session, now: datetime):
    """An attribution inside its source's retention, from an allowed source."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        cutoff = now - (DiscoverySource.retention_days * text("INTERVAL '1 day'"))
    else:
        cutoff = func.datetime(now, func.printf("-%d days", DiscoverySource.retention_days))
    return and_(
        DiscoveredListingAttribution.retrieved_at >= cutoff,
        DiscoverySource.terms_status == "accepted",
        DiscoverySource.kill_switch.is_(False),
    )


# Scores depend only on the owner's confirmed items and the listing's immutable
# text (a canonical listing's text is its content hash), so they are cached per
# profile fingerprint. Bounded to the most recently used profiles.
_SCORE_CACHE: OrderedDict[str, dict[str, Match]] = OrderedDict()
_SCORE_CACHE_PROFILES = 64
# Keyword extraction is the expensive step (~3 ms for a real ATS description)
# and depends only on the listing text; shared across profiles.
_KEYWORD_CACHE: dict[str, list[str]] = {}
_KEYWORD_CACHE_MAX = 20_000


def _scores(
    db: Session,
    profile: MatchProfile,
    listing_ids: list[str],
    *,
    loaded: dict[str, DiscoveredListing] | None = None,
) -> dict[str, Match]:
    cache = _SCORE_CACHE.get(profile.fingerprint)
    if cache is None:
        cache = _SCORE_CACHE[profile.fingerprint] = {}
        while len(_SCORE_CACHE) > _SCORE_CACHE_PROFILES:
            _SCORE_CACHE.popitem(last=False)
    else:
        _SCORE_CACHE.move_to_end(profile.fingerprint)
    missing = [listing_id for listing_id in listing_ids if listing_id not in cache]
    if missing:
        listings = (
            [loaded[listing_id] for listing_id in missing]
            if loaded is not None
            else db.scalars(select(DiscoveredListing).where(DiscoveredListing.id.in_(missing)))
        )
        for listing in listings:
            cache[listing.id] = score_listing(profile, listing)
    return {listing_id: cache[listing_id] for listing_id in listing_ids if listing_id in cache}


def _words(value: str) -> set[str]:
    """Lowercased words with a plural 's' folded, so "Engineers" matches "Engineer"."""
    return {w.removesuffix("s") for w in re.findall(r"[a-z0-9+#]+", value.lower())}


def _listing_keywords(listing: DiscoveredListing) -> list[str]:
    """Keywords from the description, minus words that only name the company or role.

    "Labs" or "Engineers" from a company name or title are not skills the owner
    matched. Known skills are kept even when the title mentions them.
    """
    cache_key = f"{listing.content_sha256}:{listing.title}:{listing.company}"
    keywords = _KEYWORD_CACHE.get(cache_key)
    if keywords is None:
        if len(_KEYWORD_CACHE) >= _KEYWORD_CACHE_MAX:
            _KEYWORD_CACHE.clear()
        name_words = _words(f"{listing.title} {listing.company}")
        skills = {k.lower() for k in extract_detected_skills(listing.description)}
        extracted = extract_job_keywords(listing.description, limit=12)
        keywords = _KEYWORD_CACHE[cache_key] = [
            k for k in extracted if k.lower() in skills or not _words(k) <= name_words
        ]
    return keywords


def _content_text(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(_content_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_content_text(item) for item in value)
    if value is None or isinstance(value, bool):
        return ""
    return str(value)
