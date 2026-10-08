"""Job Discovery: which listings an owner can see, and how well each one fits.

One visibility rule, applied in SQL everywhere (search, detail, adoption, bulk
prepare): a listing is visible to an owner when it has at least one attribution
inside its source's retention window from a source whose terms are accepted and
kill switch is clear, and the owner has not dismissed it. Governance is re-read
on every request, so revoking or killing a source hides its listings at once
(ADR 0008, D-090).

Fit is deterministic keyword overlap with the owner's confirmed Evidence Profile
items, kept as two separate signals that are never blended: **skills fit**
(the share of a listing's keywords the confirmed evidence covers, with the
matched and missing ones; a listing naming fewer than four keywords is measured
against four so one keyword never reads as 100%, and one naming none has no fit)
and **preference hits** (the owner's confirmed preference keywords the
listing mentions). Ranking uses skills fit; preference hits only break ties. A third signal,
**similar applications** (the owner's own reply rate for the same kind of role
and skills-fit bucket, #417), is shown apart and only breaks ties that skills
fit and preference hits leave.
Nothing here calls an LLM. The owner's items are prepared once per request
(``MatchProfile``), and matches are cached per profile fingerprint and listing,
so a page request scores only listings it has not seen for that profile.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
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
from app.models.workspace import Workspace
from app.schemas.discovery_recommendations import (
    DiscoveryListingDetail,
    DiscoveryListingItem,
    DiscoveryListingPage,
    FitConfidence,
    HiddenListingItem,
    HiddenListingPage,
)
from app.services.application_insights import NO_ODDS, OddsModel, odds_model
from app.services.ats_providers import provider_for_endpoint
from app.services.quality_signals import (
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

# Skills fit is the share of a listing's keywords the owner's evidence covers,
# but a listing that names fewer than FIT_MIN_KEYWORDS keywords is measured as if
# it named that many: one covered keyword is 25%, never 100%. A listing that
# names none has no fit at all (null), not a default.
FIT_MIN_KEYWORDS = 4
# How many keywords a fit rests on before it is called medium / high confidence.
FIT_MEDIUM_KEYWORDS = FIT_MIN_KEYWORDS
FIT_HIGH_KEYWORDS = 6
HIDDEN_LISTINGS_LIMIT = 200


@dataclass(frozen=True)
class Match:
    # None when the owner has no confirmed evidence (not 0%: nothing to compare).
    skills_fit: int | None = None
    # How many keywords the fit rests on; None whenever skills_fit is None.
    fit_confidence: FitConfidence | None = None
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
    # The owner's application for this listing, when they already added it.
    application_id: str | None = None

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
    odds = _odds_for(db, user_id, profile)
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
        page_ids = _best_match_page(db, profile, odds, matching, offset=offset, limit=limit)
    else:
        page_ids = _newest_ids(db, matching, offset=offset, limit=limit)

    visible_rows = _load_visible(db, page_ids, profile, now, user_id=user_id)
    return DiscoveryListingPage(
        items=[listing_item(visible_rows[i], odds) for i in page_ids if i in visible_rows],
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
    odds = _odds_for(db, user_id, load_match_profile(db, user_id))
    # Local import: deep match builds on this module's visibility rule.
    from app.services.discovery_deep_match import linked_deep_match

    return DiscoveryListingDetail(
        **listing_item(row, odds).model_dump(),
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
    return _load_visible(
        db, [listing_id], load_match_profile(db, user_id), now, user_id=user_id
    ).get(listing_id)


def best_matches(
    db: Session,
    user_id: str,
    *,
    limit: int = BEST_MATCHES_LIMIT,
    now: datetime | None = None,
    profile: MatchProfile | None = None,
) -> list[VisibleListing]:
    """The owner's top visible listings by skills fit; empty without confirmed evidence.

    ``profile`` is for a caller that already loaded it (the Today plan), so the
    evidence is not read twice.
    """
    now = now or datetime.now(UTC)
    profile = profile or load_match_profile(db, user_id)
    if not profile.has_evidence:
        return []
    matching = select(DiscoveredListing.id).where(visible_listing_clause(db, user_id, now))
    odds = _odds_for(db, user_id, profile)
    page_ids = _best_match_page(db, profile, odds, matching, offset=0, limit=limit)
    rows = _load_visible(db, page_ids, profile, now, user_id=user_id)
    return [
        rows[listing_id]
        for listing_id in page_ids
        if listing_id in rows and rows[listing_id].match.skills_fit is not None
    ]


def has_live_source(db: Session, now: datetime | None = None) -> bool:
    """True when at least one listing is currently attributed to an allowed source."""
    live = (
        select(DiscoveredListingAttribution.id)
        .join(DiscoverySource, DiscoveredListingAttribution.source_id == DiscoverySource.id)
        .where(_live(db, now or datetime.now(UTC)))
        .limit(1)
    )
    return db.scalar(live) is not None


def visible_listing_clause(db: Session, user_id: str, now: datetime):
    """The one visibility rule, as a SQL condition on ``DiscoveredListing``."""
    dismissed = select(DiscoveryDismissedListing.listing_id).where(
        DiscoveryDismissedListing.user_id == user_id
    )
    return and_(_live_listing_clause(db, now), DiscoveredListing.id.not_in(dismissed))


def _live_listing_clause(db: Session, now: datetime):
    """The visibility rule without the owner's dismissals: a live, allowed source."""
    live_source = (
        select(DiscoveredListingAttribution.id)
        .join(DiscoverySource, DiscoveredListingAttribution.source_id == DiscoverySource.id)
        .where(DiscoveredListingAttribution.listing_id == DiscoveredListing.id, _live(db, now))
    )
    return exists(live_source)


def is_live_listing(db: Session, listing_id: str, *, now: datetime | None = None) -> bool:
    """True when a listing exists and a live, allowed source still carries it.

    Ignores the owner's own dismissals, so hiding a listing twice stays valid
    while a listing the owner could never see is not confirmed to exist.
    """
    now = now or datetime.now(UTC)
    return (
        db.scalar(
            select(DiscoveredListing.id).where(
                DiscoveredListing.id == listing_id, _live_listing_clause(db, now)
            )
        )
        is not None
    )


def hidden_listings(
    db: Session, user_id: str, *, now: datetime | None = None
) -> HiddenListingPage:
    """The listings this owner has hidden, newest hidden first, so each can be restored.

    A hidden listing whose source has since been revoked, killed or expired is
    left out: governance still decides what the owner may see.
    """
    now = now or datetime.now(UTC)
    rows = (
        select(DiscoveredListing, DiscoveryDismissedListing.created_at)
        .join(
            DiscoveryDismissedListing,
            DiscoveryDismissedListing.listing_id == DiscoveredListing.id,
        )
        .where(DiscoveryDismissedListing.user_id == user_id, _live_listing_clause(db, now))
    )
    total = db.scalar(select(func.count()).select_from(rows.subquery())) or 0
    page = db.execute(
        rows.order_by(DiscoveryDismissedListing.created_at.desc(), DiscoveredListing.id).limit(
            HIDDEN_LISTINGS_LIMIT
        )
    ).all()
    return HiddenListingPage(
        items=[
            HiddenListingItem(
                listing_id=listing.id,
                title=listing.title,
                company=listing.company,
                location=listing.location,
                remote=listing.remote,
                posted_at=listing.posted_at,
                hidden_at=hidden_at,
            )
            for listing, hidden_at in page
        ],
        total=total,
    )


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
        tuple(extract_job_keywords(_content_text(item.content), limit=8, include_plain_words=True))
        for item in items
        if item.kind == "preference"
    ]
    fingerprint = hashlib.sha256(
        json.dumps(
            [[item.kind, item.content] for item in items],
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
    confidence = None
    matched: list[str] = []
    missing: list[str] = []
    if profile.evidence_text is not None:
        for keyword in _listing_keywords(listing):
            covered = keyword_present(keyword, profile.evidence_text)
            (matched if covered else missing).append(keyword)
        skills_fit, confidence = _skills_fit(len(matched), len(matched) + len(missing))

    hits: list[str] = []
    if profile.preference_keywords:
        # The structured location and remote flag count as much as the prose:
        # "remote" or "Berlin" are the most common preferences.
        listing_text = "\n".join(
            part
            for part in (
                listing.title,
                listing.company,
                listing.location,
                "Remote" if listing.remote else None,
                listing.description,
            )
            if part
        )
        wanted = dict.fromkeys(k for item in profile.preference_keywords for k in item)
        hits = [k for k in wanted if keyword_present(k, listing_text)]
    return Match(
        skills_fit=skills_fit,
        fit_confidence=confidence,
        matched_skills=tuple(matched),
        missing_skills=tuple(missing),
        preference_hits=tuple(hits),
    )


def _skills_fit(matched: int, total: int) -> tuple[int | None, FitConfidence | None]:
    """The share of keywords covered (0-100) and how many keywords it rests on."""
    if total == 0:
        return None, None
    fit = round(100 * matched / max(total, FIT_MIN_KEYWORDS))
    if total >= FIT_HIGH_KEYWORDS:
        return fit, "high"
    return fit, "medium" if total >= FIT_MEDIUM_KEYWORDS else "low"


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


def _odds_for(db: Session, user_id: str, profile: MatchProfile) -> OddsModel:
    """The owner's own-outcomes signal; nothing without evidence (no skills fit to bucket)."""
    return odds_model(db, user_id) if profile.has_evidence else NO_ODDS


def _best_match_page(
    db: Session, profile: MatchProfile, odds: OddsModel, matching, *, offset: int, limit: int
) -> list[str]:
    """Score the newest candidates, then page through them and the newest-first tail.

    Order: skills fit, then preference hits, then the owner's own reply rate for
    similar applications (equal skills fit only, so it can never outrank fit),
    then newest first.
    """
    candidates = db.execute(
        matching.with_only_columns(
            DiscoveredListing.id, DiscoveredListing.title, DiscoveredListing.company,
            DiscoveredListing.location, DiscoveredListing.remote,
        ).order_by(*_NEWEST_FIRST).limit(MAX_SCORED_CANDIDATES)
    ).all()
    head = [row.id for row in candidates]
    scores = _scores(db, profile, head, revisions={row.id: tuple(row) for row in candidates})
    titles: dict[str, str] = {}
    if odds.segments:
        titles = dict(
            db.execute(
                select(DiscoveredListing.id, DiscoveredListing.title).where(
                    DiscoveredListing.id.in_(head)
                )
            ).all()
        )
    position = {listing_id: index for index, listing_id in enumerate(head)}
    head.sort(
        key=lambda listing_id: (
            # A listing with no fit (nothing to compare) ranks after a 0% fit.
            -(fit if (fit := scores[listing_id].skills_fit) is not None else -1),
            -len(scores[listing_id].preference_hits),
            -odds.tiebreak_rate(titles.get(listing_id), scores[listing_id].skills_fit)
            if odds.segments
            else 0,
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
    db: Session,
    listing_ids: list[str],
    profile: MatchProfile,
    now: datetime,
    *,
    user_id: str,
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
    applications = dict(
        db.execute(
            select(Workspace.discovery_listing_id, Workspace.id).where(
                Workspace.user_id == user_id, Workspace.discovery_listing_id.in_(listing_ids)
            )
        ).all()
    )
    return {
        listing_id: VisibleListing(
            listing, freshest[listing_id], scores.get(listing_id), applications.get(listing_id)
        )
        for listing_id, listing in listings.items()
        if listing_id in freshest
    }


def listing_item(row: VisibleListing, odds: OddsModel = NO_ODDS) -> DiscoveryListingItem:
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
        fit_confidence=row.match.fit_confidence if row.match else None,
        application_id=row.application_id,
        matched_skills=list(row.match.matched_skills) if row.match else [],
        missing_skills=list(row.match.missing_skills) if row.match else [],
        preference_hits=list(row.match.preference_hits) if row.match else [],
        similar_applications=(
            odds.similar(listing.title, row.match.skills_fit) if row.match else None
        ),
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
# text plus mutable title/company/location/remote fields, so they are cached per
# profile fingerprint. Bounded to the most recently used profiles.
_SCORE_CACHE: OrderedDict[str, dict[tuple, Match]] = OrderedDict()
_SCORE_CACHE_PROFILES = 128
# Scoring a cold cache is seconds of CPU that holds the GIL. One caller per
# profile computes while the others wait for its result instead of repeating it
# (single-flight); warm lookups and other profiles never wait on it.
_SCORE_GUARD = threading.Lock()
_SCORE_LOCKS: dict[str, threading.Lock] = {}
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
    revisions: dict[str, tuple] | None = None,
) -> dict[str, Match]:
    # Ingestion can revise location/remote without changing the canonical text.
    # Check the small mutable projection even on a warm cache; fetch descriptions
    # only for misses, keeping keyword extraction and scoring cached.
    rows = () if revisions is not None else (
        [loaded[listing_id] for listing_id in listing_ids if listing_id in loaded]
        if loaded is not None
        else db.execute(
            select(DiscoveredListing.id, DiscoveredListing.title, DiscoveredListing.company,
                   DiscoveredListing.location, DiscoveredListing.remote)
            .where(DiscoveredListing.id.in_(listing_ids))
        )
    )
    keys = revisions if revisions is not None else {
        row.id: (row.id, row.title, row.company, row.location, row.remote) for row in rows
    }
    with _SCORE_GUARD:
        cache = _SCORE_CACHE.get(profile.fingerprint)
        if cache is None:
            cache = _SCORE_CACHE[profile.fingerprint] = {}
            while len(_SCORE_CACHE) > _SCORE_CACHE_PROFILES:
                evicted, _ = _SCORE_CACHE.popitem(last=False)
                _SCORE_LOCKS.pop(evicted, None)
        else:
            _SCORE_CACHE.move_to_end(profile.fingerprint)
        profile_lock = _SCORE_LOCKS.setdefault(profile.fingerprint, threading.Lock())
    with profile_lock:
        missing = [listing_id for listing_id, key in keys.items() if key not in cache]
        if missing:
            listings = (
                [loaded[listing_id] for listing_id in missing]
                if loaded is not None
                else db.scalars(select(DiscoveredListing).where(DiscoveredListing.id.in_(missing)))
            )
            for listing in listings:
                for old_key in list(cache):
                    if old_key[0] == listing.id:
                        del cache[old_key]
                cache[keys[listing.id]] = score_listing(profile, listing)
        return {listing_id: cache[key] for listing_id, key in keys.items() if key in cache}


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
