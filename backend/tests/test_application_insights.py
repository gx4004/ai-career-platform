"""What's working (#416): reply rate by segment, with n, never blended."""

from __future__ import annotations

import pytest

from app.models.campaign_event import CampaignEvent
from app.models.discovered_listing import DiscoveredListing
from app.services.application_insights import (
    AppliedApplication,
    compute_insights,
    fit_bucket,
    role_family,
)
from tests.test_applications import PREFIX, make_application


def app(status="applied", *, interviewed=False, **kwargs) -> AppliedApplication:
    return AppliedApplication(status=status, reached_interview=interviewed, **kwargs)


def dimension(result, key):
    return next(d for d in result.dimensions if d.key == key)


# ── Definitions ──


@pytest.mark.parametrize(
    ("applications", "applied", "replied", "rate"),
    [
        ([], 0, 0, None),
        ([app("applied"), app("no_reply")], 2, 0, 0),
        ([app("interviewing"), app("offer"), app("applied"), app("applied")], 4, 2, 50),
        # Rejected after an interview replied; rejected with no interview did not.
        ([app("rejected", interviewed=True), app("rejected")], 2, 1, 50),
        # Withdrawn before any reply never counted; after an interview it did.
        ([app("withdrawn"), app("withdrawn", interviewed=True), app("applied")], 2, 1, 50),
    ],
)
def test_reply_rate_definition(applications, applied, replied, rate):
    overall = compute_insights(applications).overall

    assert (overall.applied, overall.replied, overall.reply_rate) == (applied, replied, rate)


@pytest.mark.parametrize(
    ("title", "family"),
    [
        ("Senior Backend Engineer", "Engineering"),
        ("Data Scientist", "Data"),
        ("Product Designer", "Design"),
        ("Product Manager", "Product"),
        ("Head of Llama Grooming", "Other"),
        ("  ", None),
        (None, None),
    ],
)
def test_role_family(title, family):
    assert role_family(title) == family


@pytest.mark.parametrize(
    ("fit", "bucket"),
    [
        (100, "Strong fit (78%+)"),
        (78, "Strong fit (78%+)"),
        (77, "Partial fit (55-77%)"),
        (55, "Partial fit (55-77%)"),
        (54, "Low fit (under 55%)"),
        (0, "Low fit (under 55%)"),
        (None, None),
    ],
)
def test_fit_bucket_boundaries(fit, bucket):
    assert fit_bucket(fit) == bucket


# ── Segments ──


def test_a_segment_needs_three_applications_before_it_shows_a_rate():
    rows = [app("interviewing", company="Acme")] * 2 + [app(company="Globex")] * 3

    company = dimension(compute_insights(rows), "company")

    by_label = {s.label: s for s in company.segments}
    assert (
        by_label["Acme"].applied,
        by_label["Acme"].reply_rate,
        by_label["Acme"].enough_data,
    ) == (
        2,
        None,
        False,
    )
    assert (by_label["Globex"].applied, by_label["Globex"].reply_rate) == (3, 0)
    # Segments with enough data come first.
    assert [s.label for s in company.segments] == ["Globex", "Acme"]


def test_segments_are_separate_and_skip_applications_without_that_fact():
    rows = [
        app(
            "interviewing",
            source="employer_ats",
            remote=True,
            skills_fit=90,
            title="Backend Engineer",
        ),
        app("applied", source="employer_ats", remote=True, skills_fit=80, title="Data Engineer"),
        app(
            "applied",
            source="employer_ats",
            remote=False,
            skills_fit=30,
            title="Frontend Developer",
        ),
        app("applied", title="Backend Engineer"),  # pasted, nothing known
    ]

    result = compute_insights(rows)

    assert result.overall.applied == 4
    source = dimension(result, "source").segments
    assert [(s.label, s.applied, s.replied, s.reply_rate) for s in source] == [
        ("Employer job boards", 3, 1, 33)
    ]
    work_mode = {s.label: s.applied for s in dimension(result, "work_mode").segments}
    assert work_mode == {"Remote": 2, "On-site": 1}
    fits = {s.label: s.applied for s in dimension(result, "skills_fit").segments}
    assert fits == {"Strong fit (78%+)": 2, "Low fit (under 55%)": 1}


def test_company_names_group_case_insensitively_and_long_lists_are_capped():
    rows = [app(company="Acme"), app(company="ACME "), app(company="acme")]
    rows += [app(company=f"Co {n}") for n in range(10)]

    company = dimension(compute_insights(rows), "company")

    assert company.segments[0].applied == 3 and company.segments[0].enough_data
    assert len(company.segments) == 8 and company.hidden_count == 3


# ── Endpoint ──


def _sent(
    db,
    user_id,
    *,
    company,
    status,
    source_family=None,
    remote=None,
    fit=None,
    interviewed=False,
    role="Backend Engineer",
):
    from datetime import UTC, datetime

    workspace = make_application(db, user_id, company=company, role=role, status=status)
    workspace.applied_at = datetime(2026, 9, 1, tzinfo=UTC)
    workspace.match_score = fit
    if remote is not None:
        listing = DiscoveredListing(
            content_sha256=f"{company}{status}{fit}{role}".ljust(64, "x")[:64],
            title=role,
            company=company,
            description="d" * 30,
            remote=remote,
        )
        db.add(listing)
        db.flush()
        workspace.discovery_listing_id = listing.id
    if source_family:
        db.add(
            CampaignEvent(
                workspace_id=workspace.id,
                event_type="listing_adopted",
                details={"source_family": source_family, "outcome": "attached"},
            )
        )
    if interviewed:
        db.add(
            CampaignEvent(
                workspace_id=workspace.id,
                event_type="status_changed",
                details={"from": "applied", "to": "interviewing"},
            )
        )
    db.commit()


def test_endpoint_reports_the_owners_own_outcomes(client, db, test_user, auth_headers):
    _sent(
        db,
        test_user.id,
        company="Acme",
        status="rejected",
        interviewed=True,
        source_family="employer_ats",
        remote=True,
        fit=88,
    )
    _sent(
        db,
        test_user.id,
        company="Acme",
        status="applied",
        source_family="employer_ats",
        remote=True,
        fit=85,
    )
    _sent(
        db,
        test_user.id,
        company="Acme",
        status="no_reply",
        source_family="employer_ats",
        remote=False,
        fit=40,
    )
    make_application(db, test_user.id, company="Unsent")  # saved, never applied

    body = client.get(f"{PREFIX}/insights", headers=auth_headers).json()

    assert body["overall"] == {"applied": 3, "replied": 1, "reply_rate": 33}
    assert body["min_segment_size"] == 3
    company = next(d for d in body["dimensions"] if d["key"] == "company")["segments"]
    assert company == [
        {"label": "Acme", "applied": 3, "replied": 1, "reply_rate": 33, "enough_data": True}
    ]
    mode = next(d for d in body["dimensions"] if d["key"] == "work_mode")["segments"]
    assert {s["label"]: (s["applied"], s["reply_rate"]) for s in mode} == {
        "Remote": (2, None),
        "On-site": (1, None),
    }


def test_endpoint_is_empty_for_a_new_owner_and_private(client, db, test_user, auth_headers):
    from tests.test_applications import other_user_headers

    _sent(db, test_user.id, company="Acme", status="interviewing")

    mine = client.get(f"{PREFIX}/insights", headers=auth_headers).json()
    theirs = client.get(f"{PREFIX}/insights", headers=other_user_headers(db)).json()

    assert mine["overall"]["applied"] == 1
    assert theirs["overall"] == {"applied": 0, "replied": 0, "reply_rate": None}
    assert client.get(f"{PREFIX}/insights").status_code == 401


def test_role_family_matches_whole_words_only():
    from app.services.application_insights import role_family

    assert role_family("HTML Developer") == "Engineering"
    assert role_family("Linux Systems Engineer") == "Engineering"
    assert role_family("Senior UX Designer") == "Design"
    assert role_family("Data Engineer") == "Data"
    assert role_family("Product Managers") == "Product"
    assert role_family("Barista") == "Other"
