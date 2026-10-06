"""Dashboard "today" (#418): best matches to add, and applications needing action.

Through GET /api/v1/today with the real Discovery visibility rule and the real
Applications board.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.workspace import Workspace

TODAY = "/api/v1/today"
# Four skills, all covered by STACK_EVIDENCE: a strong fit, so Today may call it a best match
# (B14: a low fit is never a "best" match).
K8S = "Run our Kubernetes platform with Docker, Terraform and Python and improve developer tooling for every team."
STACK_EVIDENCE = "Kubernetes, Docker, Terraform, Python"


def _adopt(client, headers, listing_id):
    response = client.post(f"/api/v1/discovery/recommendations/{listing_id}/adopt", headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _today(client, headers):
    response = client.get(TODAY, headers=headers)
    assert response.status_code == 200
    return response.json()


def _set(db, application_id, **fields):
    workspace = db.get(Workspace, application_id)
    for name, value in fields.items():
        setattr(workspace, name, value)
    db.commit()


def test_today_requires_auth(client):
    assert client.get(TODAY).status_code == 401


def test_without_boards_it_asks_for_a_board_and_lists_nothing(client, auth_headers):
    body = _today(client, auth_headers)

    assert body["has_sources"] is False
    assert body["best_matches"] == [] and body["needs_action"] == []


def test_without_confirmed_evidence_it_asks_for_evidence_instead_of_matches(
    client, auth_headers, discovery
):
    discovery.listing(description=K8S)

    body = _today(client, auth_headers)

    assert body["has_sources"] is True and body["has_evidence"] is False
    assert body["best_matches"] == []


def test_best_matches_are_the_top_five_by_skills_fit_skipping_hidden_and_applied(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, STACK_EVIDENCE)
    discovery.listing(title="Accountant", description="Close the books every month.")
    for index in range(6):
        discovery.listing(title=f"Platform {index}", description=f"{K8S} Team {index}.")
    applied = discovery.listing(title="Already Added", description=K8S + " Added.")
    hidden = discovery.listing(title="Hidden", description=K8S + " Hidden.")
    _adopt(client, auth_headers, applied.id)
    client.post(
        "/api/v1/discovery/dismissals", json={"listing_id": hidden.id}, headers=auth_headers
    )

    body = _today(client, auth_headers)

    titles = [item["title"] for item in body["best_matches"]]
    assert len(titles) == 5
    assert all(title.startswith("Platform") for title in titles)
    first = body["best_matches"][0]
    # Skills fit keeps its sample: matched and missing skills come with it.
    assert first["skills_fit"] > 0 and "Kubernetes" in first["matched_skills"]
    assert "apply_url" in first and first["source_name"] == "Greenhouse"


def test_needs_action_lists_interviews_upcoming_deadlines_and_no_reply_prompts(
    client, auth_headers, db, discovery
):
    now = datetime.now(UTC)
    ids = {}
    for name in ("interview", "soon", "later", "past", "stale", "fresh", "offer"):
        listing = discovery.listing(title=name.title(), description=f"Hiring for the {name} role on our team.")
        ids[name] = _adopt(client, auth_headers, listing.id)
    _set(db, ids["interview"], status="interviewing")
    _set(db, ids["soon"], deadline=now + timedelta(days=3))
    _set(db, ids["later"], deadline=now + timedelta(days=30))
    _set(db, ids["past"], deadline=now - timedelta(days=2))
    _set(db, ids["stale"], status="applied", applied_at=now - timedelta(days=22))
    _set(db, ids["fresh"], status="applied", applied_at=now - timedelta(days=5))
    _set(db, ids["offer"], status="offer")

    items = _today(client, auth_headers)["needs_action"]

    assert [(item["title"], item["reason"]) for item in items] == [
        ("Interview", "interview"),
        ("Soon", "deadline"),
        ("Stale", "no_reply"),
    ]
    assert items[0]["application_id"] == ids["interview"]
    assert items[1]["deadline"] is not None
    # The prompt shows how long it has been, so the count is never hidden.
    assert items[2]["days_since_applied"] == 22


def test_needs_action_is_owner_scoped_and_never_changes_status(
    client, auth_headers, db, discovery
):
    listing = discovery.listing()
    application_id = _adopt(client, auth_headers, listing.id)
    _set(db, application_id, status="applied", applied_at=datetime.now(UTC) - timedelta(days=30))
    other = discovery.user_headers("other@example.com")

    assert _today(client, other)["needs_action"] == []
    _today(client, auth_headers)
    assert db.get(Workspace, application_id).status == "applied"


def test_a_deadline_due_today_stays_listed_after_its_noon_timestamp(client, auth_headers, db, discovery):
    from app.services.today import todays_plan

    listing = discovery.listing()
    application_id = _adopt(client, auth_headers, listing.id)
    afternoon = datetime(2026, 10, 5, 16, 0, tzinfo=UTC)
    _set(db, application_id, deadline=datetime(2026, 10, 5, 12, 0, tzinfo=UTC))
    user_id = db.get(Workspace, application_id).user_id

    assert [i.reason for i in todays_plan(db, user_id, now=afternoon).needs_action] == ["deadline"]
    next_day = afternoon + timedelta(days=1)
    assert todays_plan(db, user_id, now=next_day).needs_action == []


# ── Best matches never offer a job that is already in the pipeline (D04) ──


def _application(db, user_id, *, company, role, status="saved", **fields):
    """An application with no link to a Discovery listing (pasted or seeded)."""
    workspace = Workspace(
        user_id=user_id, company=company, role=role, status=status, label=f"{role} - {company}", **fields
    )
    db.add(workspace)
    db.commit()
    return workspace


def test_a_job_already_an_application_without_a_listing_link_is_not_offered_again(
    client, auth_headers, test_user, db, discovery
):
    discovery.evidence(test_user.id, STACK_EVIDENCE)
    discovery.listing(title="Senior Backend Engineer, Platform", company="Northwind Labs", description=K8S)
    discovery.listing(title="Platform Engineer", company="Acme", description=K8S + " Other.")
    _application(
        db,
        test_user.id,
        company="  northwind LABS ",
        role="senior backend engineer,  platform",
        status="interviewing",
    )

    titles = [m["title"] for m in _today(client, auth_headers)["best_matches"]]

    assert titles == ["Platform Engineer"]


def test_a_job_whose_apply_link_is_already_in_the_pipeline_is_not_offered_again(
    client, auth_headers, test_user, db, discovery
):
    from app.models.campaign_listing import CampaignListing

    discovery.evidence(test_user.id, STACK_EVIDENCE)
    discovery.listing(
        title="Infra Lead", company="Initech", description=K8S, apply_url="https://jobs.example.com/apply/42"
    )
    discovery.listing(title="Platform Engineer", company="Acme", description=K8S + " Other.")
    workspace = _application(db, test_user.id, company="Initech Corp", role="Head of Infra")
    pasted = CampaignListing(
        workspace_id=workspace.id,
        title="Head of Infra",
        company="Initech Corp",
        description="Pasted.",
        apply_url="https://jobs.example.com/apply/42/",
    )
    db.add(pasted)
    db.commit()
    workspace.current_listing_id = pasted.id
    db.commit()

    titles = [m["title"] for m in _today(client, auth_headers)["best_matches"]]

    assert titles == ["Platform Engineer"]


def test_other_owners_applications_do_not_hide_a_match(client, auth_headers, test_user, db, discovery):
    discovery.evidence(test_user.id, STACK_EVIDENCE)
    discovery.listing(title="Platform Engineer", company="Acme", description=K8S)
    other = discovery.user_headers("other2@example.com")
    other_id = client.get("/api/v1/auth/me", headers=other).json()["id"]
    _application(db, other_id, company="Acme", role="Platform Engineer")

    assert [m["title"] for m in _today(client, auth_headers)["best_matches"]] == ["Platform Engineer"]


def test_the_list_still_fills_up_after_skipping_many_pipeline_jobs(
    client, auth_headers, test_user, db, discovery
):
    discovery.evidence(test_user.id, STACK_EVIDENCE)
    for index in range(12):
        discovery.listing(title=f"Role {index}", company=f"Co {index}", description=f"{K8S} Variant {index}.")
        if index < 9:
            _application(db, test_user.id, company=f"Co {index}", role=f"Role {index}")

    assert len(_today(client, auth_headers)["best_matches"]) == 3


def test_the_list_still_fills_up_when_one_application_hides_many_same_title_listings(
    client, auth_headers, test_user, db, discovery
):
    discovery.evidence(test_user.id, STACK_EVIDENCE)
    # Listed first, so the newer same-title postings outrank it on the tie-break.
    discovery.listing(title="Data Engineer", company="Beta", description=K8S)
    for index in range(8):
        discovery.listing(
            title="Platform Engineer",
            company="Acme",
            description=f"{K8S} Location {index}. Kubernetes Kubernetes platform.",
        )
    _application(db, test_user.id, company="Acme", role="Platform Engineer")

    titles = [m["title"] for m in _today(client, auth_headers)["best_matches"]]

    assert titles == ["Data Engineer"]


# ── A cold process scores each listing once, however many first visitors arrive (DB-3) ──


def _count_scoring(monkeypatch):
    import time

    from app.services import discovery_recommendations as recs

    calls: list[str] = []
    real = recs.score_listing

    def counting(profile, listing):
        calls.append(listing.id)
        time.sleep(0.005)
        return real(profile, listing)

    monkeypatch.setattr(recs, "score_listing", counting)
    recs._SCORE_CACHE.clear()
    return calls


def test_concurrent_cold_visitors_score_each_listing_once(test_user, db, discovery, monkeypatch):
    # Unit-level on purpose: the test database is one shared sqlite connection, so
    # real concurrent requests cannot run here. The profile and listings are real;
    # only the scoring step is raced.
    import threading

    from app.models.discovered_listing import DiscoveredListing
    from app.services import discovery_recommendations as recs

    discovery.evidence(test_user.id, STACK_EVIDENCE)
    for index in range(12):
        discovery.listing(title=f"Role {index}", company=f"Co {index}", description=f"{K8S} Variant {index}.")
    profile = recs.load_match_profile(db, test_user.id)
    loaded = {row.id: row for row in db.query(DiscoveredListing).all()}
    calls = _count_scoring(monkeypatch)
    results: list[dict] = []

    def visit():
        results.append(recs._scores(None, profile, list(loaded), loaded=loaded))

    threads = [threading.Thread(target=visit) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(results) == 6 and all(len(r) == 12 for r in results)
    assert sorted(calls) == sorted(loaded)


def test_owners_with_the_same_confirmed_items_share_the_scoring_work(
    client, auth_headers, test_user, db, discovery, monkeypatch
):
    discovery.evidence(test_user.id, STACK_EVIDENCE)
    twin = discovery.user_headers("twin@example.com")
    twin_id = db.query(type(test_user)).filter_by(email="twin@example.com").one().id
    discovery.evidence(twin_id, STACK_EVIDENCE)
    for index in range(5):
        discovery.listing(title=f"Role {index}", company=f"Co {index}", description=f"{K8S} Variant {index}.")
    calls = _count_scoring(monkeypatch)

    _today(client, auth_headers)
    first_owner_calls = len(calls)
    _today(client, twin)

    assert first_owner_calls == 5
    assert len(calls) == first_owner_calls
