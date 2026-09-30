"""Job Discovery through its HTTP surface: visibility, ranking, search, adoption.

One visibility rule applies everywhere: a listing needs a live attribution from
a source whose terms are accepted and kill switch is clear, and must not be
dismissed by the owner.
"""

from __future__ import annotations

import pytest
from sqlalchemy import event

from app.models.campaign_event import CampaignEvent
from app.models.campaign_listing import CampaignListing
from app.models.discovery_personalization import DiscoveryDismissedListing
from app.models.workspace import Workspace
from app.services import discovery_recommendations
from app.services.data_export import export_career_data
from app.services.tool_runs import delete_all_user_data
from tests.conftest import engine

LISTINGS = "/api/v1/discovery/listings"
DISMISSALS = "/api/v1/discovery/dismissals"
K8S = "Run our Kubernetes platform and improve developer tooling for every team."


def _adopt(client, headers, listing_id):
    return client.post(f"/api/v1/discovery/recommendations/{listing_id}/adopt", headers=headers)


def _titles(client, headers, **params) -> list[str]:
    response = client.get(LISTINGS, params=params, headers=headers)
    assert response.status_code == 200
    return [item["title"] for item in response.json()["items"]]


def test_listing_endpoints_require_auth_and_validate_params(client, auth_headers, discovery):
    listing = discovery.listing()
    assert client.get(LISTINGS).status_code == 401
    assert client.get(f"{LISTINGS}/{listing.id}").status_code == 401
    assert _adopt(client, {}, listing.id).status_code == 401
    assert client.get(LISTINGS, params={"limit": 51}, headers=auth_headers).status_code == 422
    assert client.get(LISTINGS, params={"sort": "x"}, headers=auth_headers).status_code == 422
    # The unused ranked-feed endpoint is gone; search is the one read path.
    assert client.get("/api/v1/discovery/recommendations", headers=auth_headers).status_code in {
        404,
        405,
    }


def test_without_a_profile_listings_are_newest_first_unscored_with_a_preview(
    client, auth_headers, discovery
):
    discovery.listing(title="Older", posted_days_ago=5)
    discovery.listing(title="Newer", posted_days_ago=1, description="word " * 200)

    body = client.get(LISTINGS, headers=auth_headers).json()

    assert body["sort"] == "newest" and body["has_evidence"] is False
    assert [item["title"] for item in body["items"]] == ["Newer", "Older"]
    newer = body["items"][0]
    assert newer["skills_fit"] is None and newer["matched_skills"] == []
    assert newer["missing_skills"] == [] and newer["preference_hits"] == []
    assert "score" not in newer and "matched_keywords" not in newer
    assert newer["source_name"] == "Greenhouse"
    assert newer["source_url"].startswith("https://boards.greenhouse.io/")
    # Cards get a short preview; the full description comes from the detail.
    assert "description" not in newer
    assert len(newer["preview"]) <= 241 and newer["preview"].endswith("…")


def test_best_match_ranks_confirmed_evidence_overlap_above_newer_listings(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(title="Accountant", description="Close the books every month.", posted_days_ago=0)
    discovery.listing(title="Platform Engineer", description=K8S, posted_days_ago=9)

    body = client.get(LISTINGS, headers=auth_headers).json()

    assert body["sort"] == "best_match" and body["has_evidence"] is True
    assert [item["title"] for item in body["items"]] == ["Platform Engineer", "Accountant"]
    best, other = body["items"]
    assert best["skills_fit"] > other["skills_fit"]
    assert "Kubernetes" in best["matched_skills"]
    assert _titles(client, auth_headers, sort="newest") == ["Accountant", "Platform Engineer"]


def test_company_and_title_words_are_not_shown_as_matched_keywords(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes Labs Engineers Platform")
    discovery.listing(
        title="Platform Engineer",
        company="Acme Labs",
        description="Labs Engineers Platform " + K8S,
    )

    item = client.get(LISTINGS, headers=auth_headers).json()["items"][0]

    assert "Kubernetes" in item["matched_skills"]
    shown = set(item["matched_skills"]) | set(item["missing_skills"])
    assert not {"Labs", "Engineers", "Platform"} & shown


def test_changing_confirmed_items_rescores_on_the_next_load(
    client, auth_headers, db, test_user, discovery
):
    discovery.listing(title="Remote Platform Engineer", description="Fully remote " + K8S)
    discovery.evidence(test_user.id, "Kubernetes")
    preference = discovery.evidence(test_user.id, "remote", kind="preference")
    before = client.get(LISTINGS, headers=auth_headers).json()["items"][0]["preference_hits"]

    db.delete(preference)
    db.commit()
    after = client.get(LISTINGS, headers=auth_headers).json()["items"][0]["preference_hits"]

    assert before == ["Remote"] and after == []


def test_filters_combine_text_location_remote_company_and_recency(
    client, auth_headers, discovery
):
    discovery.listing(title="Backend Engineer", company="Acme", location="Berlin", remote=True)
    discovery.listing(title="Backend Engineer", company="Globex", location="Berlin", remote=True)
    discovery.listing(title="Backend Lead", company="Acme", location="Paris", remote=True)
    discovery.listing(title="Backend Intern", company="Acme", location="Berlin", remote=None)
    discovery.listing(title="Backend Veteran", company="Acme", location="Berlin", remote=True, posted_days_ago=40)

    assert _titles(
        client,
        auth_headers,
        q="backend",
        location="berl",
        remote="true",
        company="Acme",
        posted_within_days=30,
    ) == ["Backend Engineer"]
    assert set(_titles(client, auth_headers, remote="false")) == {"Backend Intern"}


def test_text_search_treats_wildcards_literally(client, auth_headers, discovery):
    discovery.listing(title="Growth 100% remote")
    discovery.listing(title="Growth 1000 people")
    assert _titles(client, auth_headers, q="100%") == ["Growth 100% remote"]
    assert _titles(client, auth_headers, q="_") == []


def test_dismissed_killed_unreviewed_and_expired_listings_are_hidden_everywhere(
    client, auth_headers, db, test_user, discovery
):
    visible = discovery.listing(title="Visible")
    dismissed = discovery.listing(title="Dismissed")
    killed_source = discovery.source("killed")
    killed = discovery.listing(killed_source, title="Killed")
    revoked_source = discovery.source("revoked")
    revoked = discovery.listing(revoked_source, title="Revoked")
    expired = discovery.listing(discovery.source("short", retention_days=3), title="Expired", retrieved_days_ago=4)
    client.post(DISMISSALS, json={"listing_id": dismissed.id}, headers=auth_headers)
    killed_source.kill_switch = True
    revoked_source.terms_status = "failed"
    db.commit()

    body = client.get(LISTINGS, headers=auth_headers).json()
    assert [item["title"] for item in body["items"]] == ["Visible"] and body["total"] == 1
    assert body["companies"] == ["Acme"]
    for hidden in (dismissed, killed, revoked, expired):
        assert client.get(f"{LISTINGS}/{hidden.id}", headers=auth_headers).status_code == 404
        assert _adopt(client, auth_headers, hidden.id).status_code == 404
    assert client.get(f"{LISTINGS}/{visible.id}", headers=auth_headers).status_code == 200
    assert db.query(Workspace).count() == 0


def test_a_listing_with_one_live_source_left_stays_visible_under_it(
    client, auth_headers, db, discovery
):
    kept_source = discovery.source("kept", provider="lever")
    killed_source = discovery.source("killed")
    discovery.listing(kept_source, retrieved_days_ago=5)
    # Same text on a second board: one canonical listing, two attributions.
    discovery.listing(killed_source, retrieved_days_ago=1)
    killed_source.kill_switch = True
    db.commit()

    items = client.get(LISTINGS, headers=auth_headers).json()["items"]
    assert [item["source_name"] for item in items] == ["Lever"]


@pytest.mark.parametrize("sort", ["newest", "best_match"])
def test_pagination_covers_every_visible_listing_exactly_once(
    client, auth_headers, test_user, discovery, monkeypatch, sort
):
    # A small scoring window so best match pages cross into the newest-first tail.
    monkeypatch.setattr(discovery_recommendations, "MAX_SCORED_CANDIDATES", 3)
    discovery.evidence(test_user.id, "Kubernetes")
    for index in range(7):
        discovery.listing(
            title=f"Role {index}",
            description=(K8S if index % 2 else "Plan quarterly budgets.") + f" #{index}",
            posted_days_ago=index,
        )

    pages = [
        client.get(
            LISTINGS, params={"sort": sort, "limit": 3, "page": page}, headers=auth_headers
        ).json()
        for page in (1, 2, 3)
    ]

    seen = [item["title"] for page in pages for item in page["items"]]
    assert sorted(seen) == [f"Role {index}" for index in range(7)]
    assert all(page["total"] == 7 for page in pages)
    assert pages[0]["companies"] == ["Acme"] and pages[1]["companies"] is None


def test_detail_returns_the_full_description(client, auth_headers, discovery):
    listing = discovery.listing(description="Long description. " * 40)
    body = client.get(f"{LISTINGS}/{listing.id}", headers=auth_headers).json()
    assert body["description"] == listing.description
    assert body["listing_id"] == listing.id and body["preview"]


def test_listing_page_issues_a_bounded_number_of_statements(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    statements: list[str] = []

    def count(_conn, _cursor, statement, *_args):
        statements.append(statement)

    def page_statements() -> int:
        statements.clear()
        event.listen(engine, "before_cursor_execute", count)
        try:
            assert client.get(LISTINGS, headers=auth_headers).status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", count)
        return len(statements)

    for index in range(3):
        discovery.listing(title=f"Few {index}", description=f"{K8S} {index}")
    few = page_statements()
    for index in range(40):
        discovery.listing(title=f"Many {index}", description=f"{K8S} many {index}")
    many = page_statements()

    assert many == few
    assert many <= 10


# ── Skills fit and preference hits are separate signals ──


def _only(client, headers):
    return client.get(LISTINGS, headers=headers).json()["items"][0]


def test_preferences_never_change_skills_fit(client, auth_headers, test_user, discovery):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(description="Remote " + K8S)
    without = _only(client, auth_headers)

    discovery.evidence(test_user.id, "remote", kind="preference")
    with_preference = _only(client, auth_headers)

    assert without["preference_hits"] == []
    assert with_preference["preference_hits"] == ["Remote"]
    assert with_preference["skills_fit"] == without["skills_fit"]
    assert "Remote" not in with_preference["matched_skills"]


def test_missing_skills_are_the_listing_keywords_the_evidence_lacks(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(description="Kubernetes and Terraform and Python for every team.")

    item = _only(client, auth_headers)

    assert "Kubernetes" in item["matched_skills"]
    assert {"Terraform", "Python"} <= set(item["missing_skills"])
    assert not set(item["matched_skills"]) & set(item["missing_skills"])


def test_ranking_uses_skills_fit_and_preference_hits_break_ties(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.evidence(test_user.id, "remote", kind="preference")
    discovery.listing(title="Newer no hit", description="Startup " + K8S, posted_days_ago=1)
    discovery.listing(title="Older with hit", description="Remote " + K8S, posted_days_ago=8)
    discovery.listing(title="Weaker fit", description="Remote, Terraform and Java.", posted_days_ago=0)

    assert _titles(client, auth_headers) == ["Older with hit", "Newer no hit", "Weaker fit"]


def test_preferences_alone_show_hits_but_no_skills_fit(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "remote", kind="preference")
    discovery.listing(description="Remote " + K8S)

    body = client.get(LISTINGS, headers=auth_headers).json()

    assert body["has_evidence"] is False and body["sort"] == "newest"
    assert body["items"][0]["skills_fit"] is None
    assert body["items"][0]["preference_hits"] == ["Remote"]


# ── Deep match ──

DEEP = "/api/v1/discovery/listings/{}/deep-match"
JOB_MATCH = "/api/v1/job-match/match"
MATCH_OUTPUT = {
    "requirements": [
        {
            "requirement": "Kubernetes",
            "importance": "must",
            "status": "matched",
            "resume_evidence": "Ran clusters.",
            "suggested_fix": "Keep it visible.",
        }
    ],
    "tailoring_actions": [],
    "interview_focus": ["Clusters"],
    "recruiter_summary": "Solid platform match.",
}


@pytest.fixture
def cv(db, test_user):
    from tests.test_applications import make_cv

    return make_cv(db, test_user.id)


def _deep(client, headers, listing_id):
    return client.post(DEEP.format(listing_id), headers=headers)


def test_deep_match_runs_job_match_once_and_reopening_shows_it(
    client, auth_headers, db, cv, mock_ai_result, discovery
):
    from app.models.tool_run import ToolRun

    mock_ai_result(MATCH_OUTPUT)
    listing = discovery.listing(description=K8S)
    assert client.get(f"{LISTINGS}/{listing.id}", headers=auth_headers).json()["deep_match"] is None

    first = _deep(client, auth_headers, listing.id)
    again = _deep(client, auth_headers, listing.id)

    assert first.status_code == 200 and again.status_code == 200
    assert first.json()["history_id"] == again.json()["history_id"]
    runs = db.query(ToolRun).filter_by(tool_name="job-match").all()
    assert len(runs) == 1
    detail = client.get(f"{LISTINGS}/{listing.id}", headers=auth_headers).json()
    assert detail["deep_match"]["history_id"] == runs[0].id
    assert detail["deep_match"]["match_score"] == runs[0].result_payload["match_score"]


def test_deep_match_is_grounded_in_the_cv_and_the_listing_text(
    client, auth_headers, cv, monkeypatch, discovery
):
    seen = {}

    from app.services.job_matcher import match_job as real

    async def fake_match(resume_text, job_description, **kwargs):
        seen.update(resume=resume_text, job=job_description)
        return await real(resume_text, job_description, **kwargs)

    monkeypatch.setattr("app.services.discovery_deep_match.match_job", fake_match)
    listing = discovery.listing(title="Platform Engineer", company="Acme", description=K8S)

    assert _deep(client, auth_headers, listing.id).status_code == 200

    assert "Platform Engineer" in seen["job"] and K8S in seen["job"]
    assert seen["resume"].strip()


def test_regenerating_the_deep_match_follows_the_revision_chain(
    client, auth_headers, db, cv, mock_ai_result, discovery
):
    mock_ai_result(MATCH_OUTPUT)
    listing = discovery.listing(description=K8S)
    first = _deep(client, auth_headers, listing.id).json()

    regenerated = client.post(
        JOB_MATCH,
        json={
            "resume_text": "Experience\n- Ran Kubernetes clusters for production platforms daily.",
            "job_description": K8S,
            "parent_run_id": first["history_id"],
        },
        headers=auth_headers,
    ).json()

    detail = client.get(f"{LISTINGS}/{listing.id}", headers=auth_headers).json()
    assert regenerated["history_id"] != first["history_id"]
    assert detail["deep_match"]["history_id"] == regenerated["history_id"]
    assert _deep(client, auth_headers, listing.id).json()["history_id"] == regenerated["history_id"]


def test_deep_match_needs_a_cv_and_a_visible_listing(
    client, auth_headers, db, test_user, discovery, mock_ai_result
):
    mock_ai_result(MATCH_OUTPUT)
    listing = discovery.listing(description=K8S)
    assert _deep(client, {}, listing.id).status_code == 401
    assert _deep(client, auth_headers, "missing").status_code == 404

    no_cv = _deep(client, auth_headers, listing.id)
    assert no_cv.status_code == 409 and "CV" in no_cv.json()["detail"]

    from tests.test_applications import make_cv

    make_cv(db, test_user.id)
    client.post(DISMISSALS, json={"listing_id": listing.id}, headers=auth_headers)
    assert _deep(client, auth_headers, listing.id).status_code == 404


def test_deep_match_is_owner_scoped(client, auth_headers, db, cv, mock_ai_result, discovery):
    mock_ai_result(MATCH_OUTPUT)
    listing = discovery.listing(description=K8S)
    _deep(client, auth_headers, listing.id)
    other = discovery.user_headers("other@example.com")

    detail = client.get(f"{LISTINGS}/{listing.id}", headers=other).json()

    assert detail["deep_match"] is None


# ── Dismissals ──


def test_dismissal_hides_a_listing_until_undismissed_and_is_owner_scoped(
    client, auth_headers, discovery
):
    listing = discovery.listing()
    other = discovery.user_headers("other@example.com")

    created = client.post(DISMISSALS, json={"listing_id": listing.id}, headers=auth_headers)
    assert created.status_code == 201
    assert _titles(client, auth_headers) == []
    assert _titles(client, other) == ["Platform Engineer"]

    assert client.delete(f"{DISMISSALS}/{listing.id}", headers=auth_headers).status_code == 204
    assert _titles(client, auth_headers) == ["Platform Engineer"]
    missing = client.post(DISMISSALS, json={"listing_id": "nope"}, headers=auth_headers)
    assert missing.status_code == 404


def test_dismissals_are_exported_and_erased_with_the_account(
    client, auth_headers, db, test_user, discovery
):
    listing = discovery.listing()
    client.post(DISMISSALS, json={"listing_id": listing.id}, headers=auth_headers)

    exported = export_career_data(db, test_user.id)
    assert [item.listing_id for item in exported.personalization.dismissals] == [listing.id]
    delete_all_user_data(db, test_user.id)
    assert db.query(DiscoveryDismissedListing).count() == 0


# ── Adoption ──


def test_adoption_creates_an_application_with_the_freshest_attribution(
    client, auth_headers, db, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    older = discovery.source("older")
    listing = discovery.listing(older, description=K8S, apply_url="https://acme.example/apply", retrieved_days_ago=3)
    fresher = discovery.source("fresher", provider="lever")
    # Same text on a second board: one canonical listing, two attributions.
    same = discovery.listing(fresher, description=K8S, retrieved_days_ago=1)
    assert same.content_sha256 == listing.content_sha256

    response = _adopt(client, auth_headers, same.id)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "saved" and body["match_score"] > 0
    assert body["listing"]["apply_url"] == "https://acme.example/apply"
    workspace = db.query(Workspace).one()
    adopted = db.query(CampaignListing).filter_by(workspace_id=workspace.id).one()
    assert adopted.source_url.startswith("https://jobs.lever.co/")
    assert adopted.description == K8S
    events = db.query(CampaignEvent).filter_by(workspace_id=workspace.id).all()
    assert [event.event_type for event in events] == ["listing_adopted"]


def test_adoption_is_idempotent_but_rechecks_visibility(client, auth_headers, db, discovery):
    source = discovery.source()
    listing = discovery.listing(source)

    first = _adopt(client, auth_headers, listing.id).json()
    again = _adopt(client, auth_headers, listing.id).json()
    assert first["id"] == again["id"] and db.query(Workspace).count() == 1

    source.kill_switch = True
    db.commit()
    assert _adopt(client, auth_headers, listing.id).status_code == 404
