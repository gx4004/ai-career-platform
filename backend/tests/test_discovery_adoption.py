"""R14 #176 — adopting a discovery recommendation into a campaign.

Covers the hard invariants: adoption copies listing content + attribution +
retrieval date into the campaign's canonical listing and records the adoption as
the campaign's first event (D-091, D-078); dismissed, fully hidden, and expired
recommendations are refused; and no discovery code path other than the explicit,
user-initiated adoption seam can create a campaign.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.models.analytics_event import AnalyticsEvent
from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_personalization import (
    DiscoveryDismissedListing,
    DiscoveryHiddenSource,
)
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.models.workspace import Workspace
from app.services.discovery_adoption import (
    RecommendationNotAdoptableError,
    adopt_recommendation,
)

NOW = datetime(2026, 7, 13, tzinfo=UTC)


def _as_utc(value: datetime) -> datetime:
    # SQLite drops tzinfo on read; normalize so wall-clock comparisons hold on
    # both the SQLite test backend and tz-aware Postgres.
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _source(key: str, *, family: str = "licensed", retention_days: int = 30):
    return DiscoverySource(
        source_key=key,
        display_name=f"{key.title()} Jobs",
        source_family=family,
        owner="Discovery Operations",
        terms_status="accepted",
        terms_reviewed_at=datetime(2026, 7, 1, tzinfo=UTC),
        terms_reviewed_by="reviewer@example.com",
        allowed_behavior="feed",
        endpoint_url=f"https://{key}.example/jobs",
        allowed_query_parameters=["role"],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Show source and link",
        retention_days=retention_days,
        kill_switch=False,
    )


def _listing(db, source, *, title, description, retrieved_at, company="Acme Systems"):
    listing = DiscoveredListing(
        content_sha256=(title + description).encode().hex()[:64].ljust(64, "0"),
        title=title,
        company=company,
        description=description,
    )
    db.add(listing)
    db.flush()
    attribution = DiscoveredListingAttribution(
        listing_id=listing.id,
        source_id=source.id,
        source_listing_key=listing.id,
        source_url=f"https://{source.source_key}.example/jobs/{listing.id}",
        retrieved_at=retrieved_at,
    )
    db.add(attribution)
    db.commit()
    return listing, attribution


def _confirmed_skill(db, user_id, name="Kubernetes"):
    item = EvidenceItem(
        user_id=user_id,
        kind="skill",
        content={"name": name},
        provenance="user-entered",
        confirmation_state="confirmed",
    )
    db.add(item)
    db.commit()
    return item


def test_adoption_copies_content_attribution_and_retrieval_date_and_records_first_event(
    db, test_user
):
    source = _source("feed-a")
    db.add(source)
    db.commit()
    retrieved = NOW - timedelta(days=2)
    listing, attribution = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=retrieved,
    )
    _confirmed_skill(db, test_user.id)

    workspace = adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    # A campaign was created for the owner, carrying company + role facts.
    assert workspace.user_id == test_user.id
    assert workspace.company == "Acme Systems"
    assert workspace.role == "Senior Platform Engineer"

    # The canonical listing carries the listing content, source attribution, and
    # the discovered retrieval date — not a fresh "now" (D-091, D-078).
    canonical = db.query(CampaignListing).filter_by(workspace_id=workspace.id).one()
    assert workspace.current_listing_id == canonical.id
    assert canonical.title == "Senior Platform Engineer"
    assert canonical.company == "Acme Systems"
    assert canonical.description == "Build Kubernetes platform services with Python."
    assert canonical.source_url == attribution.source_url
    assert _as_utc(canonical.retrieved_at) == retrieved

    # Adoption is the first (and only) campaign event.
    events = (
        db.query(CampaignEvent)
        .filter_by(workspace_id=workspace.id)
        .order_by(CampaignEvent.created_at, CampaignEvent.id)
        .all()
    )
    assert len(events) == 1
    assert events[0].event_type == "listing_adopted"
    assert events[0].details == {"source_family": "licensed", "outcome": "attached"}

    # Allowlisted, low-cardinality adoption telemetry only.
    analytics = db.query(AnalyticsEvent).filter_by(
        event_name="discovery_recommendation_adopted"
    ).all()
    assert len(analytics) == 1
    assert analytics[0].operational_outcome == "adopted"
    assert analytics[0].operational_dimension == "licensed"


def test_adopting_the_same_listing_twice_reuses_the_same_campaign(db, test_user):
    """A double-click, retry, or a listing that stays visible in the feed after
    its first adoption must never create a second campaign for it — that would
    silently fragment one application into two unrelated campaigns.
    """
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW - timedelta(days=1),
    )
    _confirmed_skill(db, test_user.id)

    first = adopt_recommendation(db, test_user.id, listing.id, now=NOW)
    second = adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    assert second.id == first.id
    assert db.query(Workspace).filter_by(user_id=test_user.id).count() == 1
    assert db.query(CampaignListing).filter_by(workspace_id=first.id).count() == 1
    assert db.query(CampaignEvent).filter_by(workspace_id=first.id).count() == 1


def test_adoption_copies_the_freshest_visible_source_when_deduped(db, test_user):
    stale = _source("feed-stale")
    fresh = _source("feed-fresh")
    db.add_all([stale, fresh])
    db.commit()
    listing = DiscoveredListing(
        content_sha256=b"dedup".hex().ljust(64, "0"),
        title="Platform Engineer",
        company="Acme Systems",
        description="Build Kubernetes platform services with Python.",
    )
    db.add(listing)
    db.flush()
    older = NOW - timedelta(days=5)
    newer = NOW - timedelta(days=1)
    db.add_all(
        [
            DiscoveredListingAttribution(
                listing_id=listing.id,
                source_id=stale.id,
                source_listing_key=f"{listing.id}-stale",
                source_url=f"https://feed-stale.example/jobs/{listing.id}",
                retrieved_at=older,
            ),
            DiscoveredListingAttribution(
                listing_id=listing.id,
                source_id=fresh.id,
                source_listing_key=f"{listing.id}-fresh",
                source_url=f"https://feed-fresh.example/jobs/{listing.id}",
                retrieved_at=newer,
            ),
        ]
    )
    db.commit()
    _confirmed_skill(db, test_user.id)

    workspace = adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    canonical = db.query(CampaignListing).filter_by(workspace_id=workspace.id).one()
    assert _as_utc(canonical.retrieved_at) == newer
    assert canonical.source_url == f"https://feed-fresh.example/jobs/{listing.id}"


def test_dismissed_recommendation_is_never_adopted(db, test_user):
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW,
    )
    _confirmed_skill(db, test_user.id)
    db.add(DiscoveryDismissedListing(user_id=test_user.id, listing_id=listing.id))
    db.commit()

    with pytest.raises(RecommendationNotAdoptableError):
        adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    assert db.query(Workspace).count() == 0
    assert db.query(CampaignListing).count() == 0


def test_recommendation_from_only_hidden_source_is_never_adopted(db, test_user):
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW,
    )
    _confirmed_skill(db, test_user.id)
    db.add(DiscoveryHiddenSource(user_id=test_user.id, source_id=source.id))
    db.commit()

    with pytest.raises(RecommendationNotAdoptableError):
        adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    assert db.query(Workspace).count() == 0


def test_expired_recommendation_is_never_adopted(db, test_user):
    source = _source("feed-a", retention_days=30)
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW - timedelta(days=60),
    )
    _confirmed_skill(db, test_user.id)

    with pytest.raises(RecommendationNotAdoptableError):
        adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    assert db.query(Workspace).count() == 0


def test_re_adopting_a_listing_governance_now_refuses_is_rejected(db, test_user):
    """A prior adoption must not grant standing access to a revoked listing.

    Ranking re-checks source governance on every read (#273). If the idempotent
    return fired first, re-adopting a listing whose source has since been
    revoked would hand back the campaign — idempotency outranking governance,
    inverting that decision.
    """
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW - timedelta(days=1),
    )
    _confirmed_skill(db, test_user.id)
    adopted = adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    # Governance revokes the source after the campaign already exists.
    source.kill_switch = True
    db.commit()

    with pytest.raises(RecommendationNotAdoptableError):
        adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    # The refusal must not retroactively destroy the campaign already adopted
    # under valid governance — it refuses the new action only.
    assert db.query(Workspace).filter_by(id=adopted.id).count() == 1


def test_re_adopting_a_still_governed_listing_stays_idempotent(db, test_user):
    """The governance re-check must not break dedup for listings still allowed.

    Paired with the test above: together they pin both directions, so neither
    the check nor the idempotent return can be dropped without a failure.
    """
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW - timedelta(days=1),
    )
    _confirmed_skill(db, test_user.id)

    first = adopt_recommendation(db, test_user.id, listing.id, now=NOW)
    second = adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    assert second.id == first.id
    assert db.query(Workspace).filter_by(user_id=test_user.id).count() == 1
    assert db.query(CampaignEvent).filter_by(workspace_id=first.id).count() == 1


def test_unknown_listing_is_refused(db, test_user):
    _confirmed_skill(db, test_user.id)
    with pytest.raises(RecommendationNotAdoptableError):
        adopt_recommendation(db, test_user.id, "does-not-exist", now=NOW)
    assert db.query(Workspace).count() == 0


def test_adopt_endpoint_creates_campaign_and_returns_detail(db, client, auth_headers, test_user):
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW - timedelta(days=1),
    )
    _confirmed_skill(db, test_user.id)

    resp = client.post(
        f"/api/v1/discovery/recommendations/{listing.id}/adopt",
        headers=auth_headers,
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["company"] == "Acme Systems"
    assert body["role"] == "Senior Platform Engineer"
    assert body["listing"]["title"] == "Senior Platform Engineer"
    assert body["listing"]["source_url"] == f"https://feed-a.example/jobs/{listing.id}"
    event_types = [event["event_type"] for event in body["events"]]
    assert event_types == ["listing_adopted"]


def test_adopt_endpoint_refuses_dismissed_recommendation(db, client, auth_headers, test_user):
    source = _source("feed-a")
    db.add(source)
    db.commit()
    listing, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=NOW,
    )
    _confirmed_skill(db, test_user.id)
    client.post(
        "/api/v1/discovery/dismissals",
        json={"listing_id": listing.id},
        headers=auth_headers,
    )

    resp = client.post(
        f"/api/v1/discovery/recommendations/{listing.id}/adopt",
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert db.query(Workspace).count() == 0


def test_no_discovery_read_or_ingest_path_creates_a_campaign():
    """Hard invariant (D-091): only the explicit adoption seam creates campaigns.

    Every discovery service module *except* the adoption seam must never
    instantiate a campaign, campaign event, campaign listing, task, note,
    contact, reminder, or call the listing-attach helper. This is the code-level
    proof that discovery creates nothing on its own — no scheduler, ingestion
    job, or ranking read can produce a commitment for the user.
    """
    services_dir = Path(__file__).resolve().parent.parent / "app" / "services"
    forbidden = (
        "Workspace(",
        "CampaignEvent(",
        "CampaignListing(",
        "CampaignTask(",
        "CampaignNote(",
        "CampaignContact(",
        "attach_listing",
        "reminders_enabled",
    )
    discovery_modules = [
        path
        for path in services_dir.glob("*.py")
        if path.stem.startswith("discov") or "ingestion" in path.stem
    ]
    # Sanity: the ranking, personalization, and ingestion modules are covered.
    covered = {path.stem for path in discovery_modules}
    assert "discovery_recommendations" in covered
    assert "discovery_personalization" in covered
    assert "licensed_source_ingestion" in covered

    offenders: dict[str, list[str]] = {}
    for path in discovery_modules:
        if path.stem == "discovery_adoption":
            continue  # the one explicit, user-initiated exception
        source = path.read_text()
        hits = [token for token in forbidden if token in source]
        if hits:
            offenders[path.name] = hits
    assert offenders == {}
