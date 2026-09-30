"""Odds signal in Discovery (#417): the owner's own reply rate for similar applications.

Similar = same kind of role and skills-fit bucket. Shown as its own signal, only
with enough outcomes overall and enough similar applications, and used solely to
break exact ties in the ranking.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models.campaign_event import CampaignEvent
from app.models.user import User
from app.services.application_insights import (
    AppliedApplication,
    build_odds_model,
)
from tests.test_applications import make_application
from tests.test_discovery import K8S, LISTINGS

STRONG = 90  # "Strong fit (78%+)"


def past(n, *, title="Backend Engineer", fit=STRONG, replied=0, status="rejected"):
    """``n`` applications, the first ``replied`` of which reached an interview."""
    return [
        AppliedApplication(
            status="interviewing" if i < replied else status,
            reached_interview=i < replied,
            title=title,
            skills_fit=fit,
        )
        for i in range(n)
    ]


def odds(applications):
    return build_odds_model(applications)


# ── The model ──


def test_similar_applications_report_x_of_n_replies():
    model = odds(past(6, replied=2) + past(14, title="Product Designer"))

    similar = model.similar("Senior Software Engineer", 85)

    assert (similar.replied, similar.applied) == (2, 6)
    assert (similar.role_family, similar.fit_bucket) == ("Engineering", "Strong fit (78%+)")


def test_no_signal_until_the_owner_has_twenty_recorded_outcomes():
    nineteen = past(6, replied=2) + past(13, title="Product Designer")
    assert odds(nineteen).similar("Backend Engineer", STRONG) is None
    assert odds(nineteen + past(1, title="Product Designer")).similar("Backend Engineer", STRONG)


def test_applications_still_waiting_are_not_recorded_outcomes():
    waiting = past(10, status="applied", title="Product Designer")
    assert (
        odds(past(6, replied=2) + past(12, title="Product Designer") + waiting).similar(
            "Backend Engineer", STRONG
        )
        is None
    )


def test_no_signal_below_five_similar_applications():
    model = odds(past(4, replied=2) + past(16, title="Product Designer"))
    assert model.similar("Backend Engineer", STRONG) is None


@pytest.mark.parametrize(
    ("title", "fit"),
    [("Product Designer", STRONG), ("Backend Engineer", 60), ("Backend Engineer", None)],
)
def test_only_the_same_role_family_and_fit_bucket_count_as_similar(title, fit):
    model = odds(past(5, replied=1) + past(15, title="Product Designer", fit=60))
    assert model.similar(title, fit) is None or (title, fit) == ("Product Designer", 60)


def test_withdrawn_before_any_reply_is_not_an_application():
    withdrawn = past(5, status="withdrawn")
    model = odds(past(5, replied=1) + withdrawn + past(15, title="Product Designer"))
    assert model.similar("Backend Engineer", STRONG).applied == 5


# ── Through the API ──


def _seed(db, discovery, user_id, count, *, title="Backend Engineer", replied=0, fit=STRONG):
    for i in range(count):
        listing = discovery.listing(
            title=title, company="History Co", description=f"History {title} {fit} {i}. " * 3
        )
        workspace = make_application(
            db, user_id, company=f"Old{i}-{title}", role=title, status="rejected"
        )
        workspace.applied_at = datetime(2026, 9, 1, tzinfo=UTC)
        workspace.match_score = fit
        workspace.discovery_listing_id = listing.id
        if i < replied:
            workspace.status = "interviewing"
            db.add(
                CampaignEvent(
                    workspace_id=workspace.id,
                    event_type="status_changed",
                    details={"from": "applied", "to": "interviewing"},
                )
            )
    db.commit()


def _by_title(client, headers):
    items = client.get(LISTINGS, params={"company": "Acme"}, headers=headers).json()["items"]
    return {item["title"]: item for item in items}


def test_listing_shows_the_owners_similar_outcomes_beside_skills_fit(
    client, auth_headers, test_user, db, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(title="Backend Engineer", description=K8S)
    fit = _by_title(client, auth_headers)["Backend Engineer"]["skills_fit"]
    _seed(db, discovery, test_user.id, 6, replied=2, fit=fit)
    _seed(db, discovery, test_user.id, 14, title="Product Designer", fit=fit)

    item = _by_title(client, auth_headers)["Backend Engineer"]

    assert item["skills_fit"] == fit
    assert item["similar_applications"]["replied"] == 2
    assert item["similar_applications"]["applied"] == 6
    detail = client.get(f"{LISTINGS}/{item['listing_id']}", headers=auth_headers).json()
    assert detail["similar_applications"] == item["similar_applications"]


def test_signal_is_absent_below_the_thresholds(client, auth_headers, test_user, db, discovery):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(title="Backend Engineer", description=K8S)
    fit = _by_title(client, auth_headers)["Backend Engineer"]["skills_fit"]
    _seed(db, discovery, test_user.id, 6, replied=2, fit=fit)  # only 6 outcomes overall

    assert _by_title(client, auth_headers)["Backend Engineer"]["similar_applications"] is None


def test_signal_is_private_to_the_owner(client, auth_headers, test_user, db, discovery):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(title="Backend Engineer", description=K8S)
    fit = _by_title(client, auth_headers)["Backend Engineer"]["skills_fit"]
    _seed(db, discovery, test_user.id, 6, replied=2, fit=fit)
    _seed(db, discovery, test_user.id, 14, title="Product Designer", fit=fit)
    other = discovery.user_headers("someone-else@example.com")
    other_user = db.query(User).filter_by(email="someone-else@example.com").one()
    discovery.evidence(other_user.id, "Kubernetes")

    assert _by_title(client, other)["Backend Engineer"]["similar_applications"] is None


def test_odds_break_exact_skills_fit_ties_but_never_outrank_fit(
    client, auth_headers, test_user, db, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    # Same description, so identical skills fit; titles put them in different families.
    discovery.listing(title="Backend Engineer", description=K8S, posted_days_ago=1)
    discovery.listing(title="Growth Marketer", description=K8S, posted_days_ago=1)
    discovery.listing(
        title="Weaker fit Engineer", description="Terraform and Java.", posted_days_ago=0
    )
    items = _by_title(client, auth_headers)
    fit = items["Backend Engineer"]["skills_fit"]
    assert (
        fit == items["Growth Marketer"]["skills_fit"] > items["Weaker fit Engineer"]["skills_fit"]
    )

    # Without history the newer listing wins the tie.
    baseline = list(_by_title(client, auth_headers))
    assert baseline[:2] == ["Growth Marketer", "Backend Engineer"]

    _seed(db, discovery, test_user.id, 8, title="Growth Marketer", replied=0, fit=fit)
    _seed(db, discovery, test_user.id, 8, title="Backend Engineer", replied=6, fit=fit)
    _seed(db, discovery, test_user.id, 4, title="Product Designer", fit=fit)
    ranked = list(_by_title(client, auth_headers))

    assert ranked[:2] == ["Backend Engineer", "Growth Marketer"]
    assert ranked[2] == "Weaker fit Engineer"
    assert set(baseline) == set(ranked)
