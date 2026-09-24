"""Job search over every visible discovered listing (#323)."""

from datetime import UTC, datetime, timedelta

from app.models.discovered_listing import DiscoveredListing, DiscoveredListingAttribution
from app.models.discovery_personalization import (
    DiscoveryDismissedListing,
    DiscoveryHiddenSource,
)
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.services.discovery_adoption import adopt_recommendation
from app.services.discovery_recommendations import search_listings

NOW = datetime(2026, 9, 20, tzinfo=UTC)


def _source(db, key: str, *, endpoint: str, retention_days: int = 45, **overrides):
    source = DiscoverySource(
        source_key=key,
        display_name=key.split("-")[-1].title(),
        source_family="employer_ats",
        owner="Discovery Operations",
        terms_status="accepted",
        terms_reviewed_at=datetime(2026, 7, 1, tzinfo=UTC),
        terms_reviewed_by="reviewer@example.com",
        allowed_behavior="ats_integration",
        endpoint_url=endpoint,
        allowed_query_parameters=[],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Show the company, the source and the original link",
        retention_days=retention_days,
        kill_switch=False,
        **overrides,
    )
    db.add(source)
    db.commit()
    return source


def _listing(db, source, *, title, company="Acme", description="", retrieved_at=NOW, **fields):
    listing = DiscoveredListing(
        content_sha256=(title + company + description).encode().hex()[:64].ljust(64, "0"),
        title=title,
        company=company,
        description=description or f"{title} role at {company}.",
        **fields,
    )
    db.add(listing)
    db.flush()
    db.add(
        DiscoveredListingAttribution(
            listing_id=listing.id,
            source_id=source.id,
            source_listing_key=listing.id,
            source_url=f"https://boards.example/jobs/{listing.id}",
            retrieved_at=retrieved_at,
        )
    )
    db.commit()
    return listing


def _greenhouse(db, slug="acme"):
    return _source(
        db,
        f"employer-ats-greenhouse-{slug}",
        endpoint=f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
    )


def _ids(page):
    return [item.listing_id for item in page.items]


def test_without_a_profile_listings_are_newest_first_and_unscored(db, test_user):
    source = _greenhouse(db)
    old = _listing(db, source, title="Data Analyst", posted_at=NOW - timedelta(days=20))
    new = _listing(db, source, title="Backend Engineer", posted_at=NOW - timedelta(days=1))

    page = search_listings(db, test_user.id, now=NOW)

    assert _ids(page) == [new.id, old.id]
    assert page.has_profile is False
    assert page.sort == "newest"
    assert all(item.score is None and item.matched_keywords == [] for item in page.items)
    assert page.items[0].source_name == "Greenhouse"
    assert page.stats.jobs == 2
    assert page.stats.companies == 1
    assert page.stats.new_this_week == 1
    assert page.companies == ["Acme"]


def test_filters_combine_text_location_remote_company_and_recency(db, test_user):
    source = _greenhouse(db)
    target = _listing(
        db,
        source,
        title="Senior Python Engineer",
        company="Stripe",
        location="Berlin, Germany",
        remote=True,
        posted_at=NOW - timedelta(days=2),
    )
    _listing(db, source, title="Python Engineer", company="Figma", location="Berlin", remote=True,
             posted_at=NOW - timedelta(days=2))
    _listing(db, source, title="Python Engineer", company="Stripe", location="Dublin", remote=True,
             posted_at=NOW - timedelta(days=2))
    _listing(db, source, title="Python Engineer II", company="Stripe", location="Berlin",
             remote=False, posted_at=NOW - timedelta(days=2))
    _listing(db, source, title="Python Platform Engineer", company="Stripe", location="Berlin",
             remote=True, posted_at=NOW - timedelta(days=40))
    _listing(db, source, title="Account Executive", company="Stripe", location="Berlin",
             remote=True, posted_at=NOW - timedelta(days=2))

    page = search_listings(
        db,
        test_user.id,
        q="python engineer",
        location="berlin",
        remote=True,
        company="Stripe",
        posted_within_days=7,
        now=NOW,
    )

    assert _ids(page) == [target.id]
    assert page.total == 1
    # Header stats describe everything visible, not the filtered slice.
    assert page.stats.jobs == 6
    assert page.companies == ["Figma", "Stripe"]


def test_text_search_treats_wildcards_literally(db, test_user):
    source = _greenhouse(db)
    _listing(db, source, title="Engineer", description="Owns 100% of the pipeline.")
    _listing(db, source, title="Designer", description="Owns 100 dashboards.")

    page = search_listings(db, test_user.id, q="100%", now=NOW)

    assert [item.title for item in page.items] == ["Engineer"]


def test_hidden_dismissed_revoked_and_expired_listings_are_excluded(db, test_user):
    visible_source = _greenhouse(db, "visible")
    hidden_source = _greenhouse(db, "hidden")
    killed_source = _greenhouse(db, "killed")
    visible = _listing(db, visible_source, title="Visible Role")
    dismissed = _listing(db, visible_source, title="Dismissed Role")
    _listing(db, visible_source, title="Expired Role", retrieved_at=NOW - timedelta(days=60))
    _listing(db, hidden_source, title="Hidden Role")
    _listing(db, killed_source, title="Killed Role")
    killed_source.kill_switch = True
    db.add(DiscoveryHiddenSource(user_id=test_user.id, source_id=hidden_source.id))
    db.add(DiscoveryDismissedListing(user_id=test_user.id, listing_id=dismissed.id))
    db.commit()

    page = search_listings(db, test_user.id, now=NOW)

    assert _ids(page) == [visible.id]
    assert page.stats.jobs == 1


def test_best_match_ranks_by_confirmed_evidence_and_exposes_matched_skills(db, test_user):
    source = _greenhouse(db)
    newer_unrelated = _listing(
        db,
        source,
        title="Account Executive",
        description="Close enterprise deals and manage a sales pipeline quota.",
        posted_at=NOW - timedelta(days=1),
    )
    older_match = _listing(
        db,
        source,
        title="Backend Engineer",
        description="Build Kubernetes services with Python and PostgreSQL.",
        posted_at=NOW - timedelta(days=5),
    )
    db.add(
        EvidenceItem(
            user_id=test_user.id,
            kind="skill",
            content={"name": "Python, Kubernetes, PostgreSQL"},
            provenance="user-entered",
            confirmation_state="confirmed",
        )
    )
    db.commit()

    best = search_listings(db, test_user.id, sort="best_match", now=NOW)
    newest = search_listings(db, test_user.id, sort="newest", now=NOW)

    assert best.has_profile is True
    assert _ids(best) == [older_match.id, newer_unrelated.id]
    assert _ids(newest) == [newer_unrelated.id, older_match.id]
    top = best.items[0]
    assert top.score is not None and top.score > best.items[1].score
    assert {"Python", "Kubernetes"} <= set(top.matched_keywords)
    # Scores are shown regardless of the chosen order.
    assert all(item.score is not None for item in newest.items)


def test_pagination_reports_total_and_slices(db, test_user):
    source = _greenhouse(db)
    for day in range(5):
        _listing(db, source, title=f"Role {day}", posted_at=NOW - timedelta(days=day))

    first = search_listings(db, test_user.id, limit=2, page=1, now=NOW)
    third = search_listings(db, test_user.id, limit=2, page=3, now=NOW)

    assert first.total == 5
    assert [item.title for item in first.items] == ["Role 0", "Role 1"]
    assert [item.title for item in third.items] == ["Role 4"]


def test_a_search_result_outside_the_ranked_feed_can_be_adopted(db, test_user):
    # Without confirmed evidence the ranked feed is empty; the listing is still
    # visible in search, so "Add to campaign" must work for it.
    source = _greenhouse(db)
    listing = _listing(db, source, title="Platform Engineer", posted_at=NOW)

    workspace = adopt_recommendation(db, test_user.id, listing.id, now=NOW)

    assert workspace.discovery_listing_id == listing.id
    assert workspace.role == "Platform Engineer"


def test_listings_endpoint_requires_auth_and_validates_params(client, auth_headers, db):
    assert client.get("/api/v1/discovery/listings").status_code in {401, 403}
    assert (
        client.get("/api/v1/discovery/listings?limit=500", headers=auth_headers).status_code
        == 422
    )
    source = _greenhouse(db)
    _listing(db, source, title="Backend Engineer", remote=True, posted_at=datetime.now(UTC))

    response = client.get(
        "/api/v1/discovery/listings?q=backend&remote=true&sort=newest", headers=auth_headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Backend Engineer"
    assert body["items"][0]["score"] is None
    assert body["items"][0]["source_name"] == "Greenhouse"
