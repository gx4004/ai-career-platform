from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.models.discovered_listing import (
    DiscoveredListing,
    DiscoveredListingAttribution,
)
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.schemas.discovery_recommendations import (
    DiscoveryRecommendationList,
    RecommendationAttribution,
)
from app.services.discovery_recommendations import rank_discovery_recommendations


def _source(key: str, retention_days: int = 30):
    return DiscoverySource(
        source_key=key,
        display_name=f"{key.title()} Jobs",
        source_family="licensed",
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


def _listing(db, source, *, title: str, description: str, retrieved_at: datetime):
    listing = DiscoveredListing(
        content_sha256=(title + description).encode().hex()[:64].ljust(64, "0"),
        title=title,
        company="Acme Systems",
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


def _evidence(db, user_id: str, *, kind: str, content: dict, state: str = "confirmed"):
    item = EvidenceItem(
        user_id=user_id,
        kind=kind,
        content=content,
        provenance="user-entered",
        confirmation_state=state,
    )
    db.add(item)
    db.commit()
    return item


def test_ranking_uses_only_confirmed_evidence_and_preferences(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    platform, _ = _listing(
        db,
        source,
        title="Senior Platform Engineer",
        description="Build Kubernetes platform services with Python.",
        retrieved_at=now,
    )
    data, _ = _listing(
        db,
        source,
        title="Streaming Data Engineer",
        description="Own streaming analytics infrastructure.",
        retrieved_at=now,
    )
    skill = _evidence(db, test_user.id, kind="skill", content={"name": "Kubernetes"})
    preference = _evidence(
        db,
        test_user.id,
        kind="preference",
        content={"target_role": "Platform Engineer"},
    )
    _evidence(
        db,
        test_user.id,
        kind="skill",
        content={"name": "streaming analytics"},
        state="unconfirmed",
    )

    result = rank_discovery_recommendations(db, test_user.id, now=now)

    assert [item.listing_id for item in result.items] == [platform.id, data.id]
    assert result.confirmed_item_count == 2
    assert result.preference_item_count == 1
    assert result.items[0].score > result.items[1].score
    assert result.items[0].rationale[0].matched_keywords == ["Kubernetes"]
    assert result.items[0].rationale[0].evidence_item_ids == [skill.id]
    assert "Platform" in result.items[0].rationale[1].matched_keywords
    assert result.items[0].rationale[1].evidence_item_ids == [preference.id]
    assert result.items[1].rationale[0].matched_keywords == []


def test_expired_listing_is_excluded_and_duplicate_attributions_render_once(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source_a = _source("feed-a", retention_days=5)
    source_b = _source("feed-b", retention_days=30)
    db.add_all([source_a, source_b])
    db.commit()
    live, _ = _listing(
        db,
        source_a,
        title="Platform Engineer",
        description="Build reliable platform services.",
        retrieved_at=now - timedelta(days=2),
    )
    db.add(
        DiscoveredListingAttribution(
            listing_id=live.id,
            source_id=source_b.id,
            source_listing_key="feed-b-copy",
            source_url="https://feed-b.example/jobs/copy",
            retrieved_at=now - timedelta(days=3),
        )
    )
    _listing(
        db,
        source_a,
        title="Expired Engineer",
        description="This listing is beyond its source retention window.",
        retrieved_at=now - timedelta(days=6),
    )
    db.commit()
    _evidence(db, test_user.id, kind="skill", content={"name": "platform"})

    result = rank_discovery_recommendations(db, test_user.id, now=now)

    assert len(result.items) == 1
    assert result.items[0].listing_id == live.id
    assert [item.source_name for item in result.items[0].attributions] == [
        "Feed-A Jobs",
        "Feed-B Jobs",
    ]


def test_recommendations_endpoint_is_authenticated(client, auth_headers, db, test_user):
    source = _source("feed-a")
    db.add(source)
    db.commit()
    _listing(
        db,
        source,
        title="Platform Engineer",
        description="Build Kubernetes services.",
        retrieved_at=datetime.now(UTC),
    )
    _evidence(db, test_user.id, kind="skill", content={"name": "Kubernetes"})

    assert client.get("/api/v1/discovery/recommendations").status_code in {401, 403}
    response = client.get("/api/v1/discovery/recommendations", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["rationale"][0]["kind"] == "confirmed_evidence"
    assert payload["items"][0]["attributions"][0]["source_url"].startswith("https://")


def test_profile_without_confirmed_items_receives_no_recommendations(db, test_user):
    source = _source("feed-a")
    db.add(source)
    db.commit()
    _listing(
        db,
        source,
        title="Platform Engineer",
        description="Build Kubernetes services for a reliable internal platform.",
        retrieved_at=datetime.now(UTC),
    )
    _evidence(
        db,
        test_user.id,
        kind="skill",
        content={"name": "Kubernetes"},
        state="unconfirmed",
    )

    result = rank_discovery_recommendations(db, test_user.id)

    assert result.confirmed_item_count == 0
    assert result.items == []


def test_available_signal_family_carries_the_full_score(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a")
    db.add(source)
    db.commit()
    _listing(
        db,
        source,
        title="Platform Engineer",
        description="Build Kubernetes services for a reliable internal platform.",
        retrieved_at=now,
    )
    _evidence(db, test_user.id, kind="skill", content={"name": "Kubernetes"})

    result = rank_discovery_recommendations(db, test_user.id, now=now)

    assert len(result.items[0].rationale) == 1
    assert result.items[0].rationale[0].kind == "confirmed_evidence"
    assert result.items[0].score == result.items[0].rationale[0].score


def test_candidate_cap_uses_live_attribution_freshness_before_limiting(db, test_user):
    now = datetime(2026, 7, 13, tzinfo=UTC)
    source = _source("feed-a", retention_days=5)
    db.add(source)
    db.flush()
    live_listing = DiscoveredListing(
        content_sha256="f" * 64,
        title="Platform Engineer",
        company="Kestrel Infrastructure",
        description="Build Kubernetes services for a reliable internal platform.",
        created_at=now - timedelta(days=365),
    )
    db.add(live_listing)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=live_listing.id,
            source_id=source.id,
            source_listing_key="fresh-old-canonical",
            source_url="https://feed-a.example/jobs/fresh",
            retrieved_at=now,
        )
    )
    for index in range(500):
        listing = DiscoveredListing(
            content_sha256=f"{index:064x}",
            title=f"Expired role {index}",
            company="Historical Corp",
            description="This newer canonical row has only expired attribution data.",
            created_at=now,
        )
        db.add(listing)
        db.flush()
        db.add(
            DiscoveredListingAttribution(
                listing_id=listing.id,
                source_id=source.id,
                source_listing_key=f"expired-{index}",
                source_url=f"https://feed-a.example/jobs/expired-{index}",
                retrieved_at=now - timedelta(days=6),
            )
        )
    db.commit()
    _evidence(db, test_user.id, kind="skill", content={"name": "Kubernetes"})

    result = rank_discovery_recommendations(db, test_user.id, now=now)

    assert [item.listing_id for item in result.items] == [live_listing.id]


def test_backend_recommendation_contract_rejects_url_and_extra_field_drift():
    with pytest.raises(ValidationError):
        RecommendationAttribution.model_validate(
            {
                "source_name": "Feed",
                "source_family": "licensed",
                "source_url": "https://not a valid host/jobs/1",
                "retrieved_at": "2026-07-13T00:00:00Z",
            }
        )
    with pytest.raises(ValidationError):
        DiscoveryRecommendationList.model_validate(
            {
                "items": [],
                "confirmed_item_count": 0,
                "preference_item_count": 0,
                "unexpected": True,
            }
        )
