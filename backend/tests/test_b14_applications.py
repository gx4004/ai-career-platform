"""B14: Applications and Today fixes from the live re-verification (2026-10-06)."""

from __future__ import annotations

import pytest
from sqlalchemy import event

from app.services.quality_signals import BORDERLINE_MATCH_FROM
from tests.conftest import engine
from tests.test_applications import make_cv

PREFIX = "/api/v1/applications"


def _create(client, headers, company: str) -> str:
    response = client.post(PREFIX, json={"role": "Backend Engineer", "company": company}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _move(client, headers, application_id: str, status: str) -> None:
    response = client.patch(f"{PREFIX}/{application_id}", json={"status": status}, headers=headers)
    assert response.status_code == 200, response.text


# --- Item 4: the reply-rate sample matches the board's post-applied stages ---------------


def _board_sent_count(client, headers) -> int:
    """Cards the board shows past Applied: what the owner reads as 'sent'."""
    cards = client.get(PREFIX, headers=headers).json()["items"]
    sent = {"applied", "no_reply", "interviewing", "offer", "rejected"}
    return sum(card["status"] in sent for card in cards)


def test_a_card_moved_straight_from_saved_to_interviewing_counts_as_applied_and_replied(client, auth_headers):
    straight = _create(client, auth_headers, "Acme")
    _move(client, auth_headers, straight, "interviewing")

    overall = client.get(f"{PREFIX}/insights", headers=auth_headers).json()["overall"]

    assert overall == {"applied": 1, "replied": 1, "reply_rate": 100}


def test_insights_sample_reconciles_with_the_board_on_every_path(client, auth_headers):
    via_applied = _create(client, auth_headers, "Acme")
    _move(client, auth_headers, via_applied, "applied")
    _move(client, auth_headers, via_applied, "interviewing")
    to_offer = _create(client, auth_headers, "Globex")
    _move(client, auth_headers, to_offer, "offer")
    to_rejected = _create(client, auth_headers, "Initech")
    _move(client, auth_headers, to_rejected, "rejected")
    waiting = _create(client, auth_headers, "Umbrella")
    _move(client, auth_headers, waiting, "applied")
    _create(client, auth_headers, "Hooli")  # still saved: never sent

    overall = client.get(f"{PREFIX}/insights", headers=auth_headers).json()["overall"]

    assert overall["applied"] == _board_sent_count(client, auth_headers) == 4
    assert overall["replied"] == 2  # the interview and the offer; a bare rejection is not a reply
    assert overall["reply_rate"] == 50


def test_a_card_moved_back_to_saved_or_withdrawn_before_sending_is_not_counted(client, auth_headers):
    back = _create(client, auth_headers, "Acme")
    _move(client, auth_headers, back, "interviewing")
    _move(client, auth_headers, back, "saved")
    withdrawn = _create(client, auth_headers, "Globex")
    _move(client, auth_headers, withdrawn, "withdrawn")

    overall = client.get(f"{PREFIX}/insights", headers=auth_headers).json()["overall"]

    assert overall["applied"] == 0


# --- Items 6 and 16: Today's best matches -------------------------------------------------

TODAY = "/api/v1/today"
# Four skills a listing names; evidence covering all of them is a strong fit.
STACK = "Kubernetes, Docker, Terraform and Python"


def _listing_text(skills: str, extra: str = "") -> str:
    return f"Run our platform with {skills} for every product team. {extra}".strip()


def test_best_matches_never_include_a_low_fit_listing(client, auth_headers, test_user, discovery):
    discovery.evidence(test_user.id, "Kubernetes, Docker, Terraform, Python")
    discovery.listing(title="Strong", company="Acme", description=_listing_text(STACK))
    discovery.listing(
        title="Weak", company="Globex", description=_listing_text("Kubernetes, Rust, Haskell, Erlang and Scala")
    )

    body = client.get(TODAY, headers=auth_headers).json()

    assert [m["title"] for m in body["best_matches"]] == ["Strong"]
    assert all(m["skills_fit"] >= BORDERLINE_MATCH_FROM for m in body["best_matches"])
    assert body["best_match_min_fit"] == BORDERLINE_MATCH_FROM


def test_with_only_low_fits_best_matches_is_empty_and_the_closest_are_listed_separately(
    client, auth_headers, test_user, discovery
):
    discovery.evidence(test_user.id, "Kubernetes")
    discovery.listing(
        title="Weak", company="Globex", description=_listing_text("Kubernetes, Rust, Haskell, Erlang and Scala")
    )

    body = client.get(TODAY, headers=auth_headers).json()

    assert body["best_matches"] == []
    assert [m["title"] for m in body["closest_matches"]] == ["Weak"]
    assert body["closest_matches"][0]["skills_fit"] < body["best_match_min_fit"]


def test_closest_matches_stay_empty_when_there_are_best_matches(client, auth_headers, test_user, discovery):
    discovery.evidence(test_user.id, "Kubernetes, Docker, Terraform, Python")
    discovery.listing(title="Strong", company="Acme", description=_listing_text(STACK))
    discovery.listing(title="Weak", company="Globex", description=_listing_text("Kubernetes, Rust, Haskell, Erlang and Scala"))

    assert client.get(TODAY, headers=auth_headers).json()["closest_matches"] == []


def test_today_reads_the_evidence_profile_and_listings_once(client, auth_headers, test_user, discovery):
    discovery.evidence(test_user.id, "Kubernetes, Docker, Terraform, Python")
    for index in range(3):
        discovery.listing(title=f"Platform {index}", company=f"Co {index}", description=_listing_text(STACK, str(index)))
    client.get(TODAY, headers=auth_headers)  # warm the per-process scoring caches

    statements: list[str] = []

    def record(_conn, _cursor, statement, *_args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = client.get(TODAY, headers=auth_headers)
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert response.status_code == 200
    evidence_reads = [s for s in statements if "FROM evidence_items" in s]
    listing_reads = [s for s in statements if s.lstrip().upper().startswith("SELECT discovered_listings.id, discovered_listings.content_sha256".upper())]
    assert len(evidence_reads) == 1, evidence_reads
    assert len(listing_reads) <= 1, listing_reads
    # 10 statements with warm caches: the user, evidence once, the board, sources, the
    # pipeline, outcomes for odds, ranking ids, listings, attributions, adoption links.
    assert len(statements) <= 10, statements


# --- Item 14: fake drafts raise the stop questions a listing implies ----------------------

LISTING_BASE = (
    "Data Engineer at Fjord Analytics. Build Python and SQL pipelines on Airflow for the analytics team, "
    "own data quality checks and mentor two analysts."
)


@pytest.fixture
def real_fake_provider(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "LLM_PROVIDER", "fake")


def _prepared_questions(client, headers, description: str) -> dict[str, str]:
    created = client.post(
        PREFIX,
        json={"role": "Data Engineer", "company": "Fjord Analytics", "description": description},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    prepared = client.post(f"{PREFIX}/{created.json()['id']}/prepare", headers=headers)
    assert prepared.status_code == 200, prepared.text
    detail = client.get(f"{PREFIX}/{created.json()['id']}", headers=headers).json()
    return {q["question"]: q["category"] for q in detail["open_questions"]}


def test_a_listing_that_mentions_salary_and_sponsorship_raises_both_stop_questions(
    client, db, test_user, auth_headers, real_fake_provider
):
    make_cv(db, test_user.id)
    questions = _prepared_questions(
        client,
        auth_headers,
        LISTING_BASE + " The salary range is 90-110k. Visa sponsorship is not available for this role.",
    )

    assert questions.get("What are your salary expectations?") == "salary"
    assert questions.get("Do you require visa sponsorship?") == "work_authorization"


def test_a_listing_without_those_topics_raises_no_stop_question(
    client, db, test_user, auth_headers, real_fake_provider
):
    make_cv(db, test_user.id)
    questions = _prepared_questions(client, auth_headers, LISTING_BASE)

    assert "What are your salary expectations?" not in questions
    assert "Do you require visa sponsorship?" not in questions


@pytest.mark.parametrize(
    "extra",
    [
        "Payments run through Visa and Mastercard card networks.",
        "Our client list includes Visa, Stripe and Adyen.",
    ],
)
def test_a_listing_that_only_names_visa_the_card_network_raises_no_sponsorship_question(
    client, db, test_user, auth_headers, real_fake_provider, extra
):
    make_cv(db, test_user.id)
    questions = _prepared_questions(client, auth_headers, f"{LISTING_BASE} {extra}")

    assert "Do you require visa sponsorship?" not in questions


@pytest.mark.parametrize(
    "extra",
    [
        "We cannot sponsor work visas.",
        "Candidates must have the right to work in the UK.",
        "Please state your visa status.",
    ],
)
def test_a_listing_about_work_authorisation_raises_the_sponsorship_question(
    client, db, test_user, auth_headers, real_fake_provider, extra
):
    make_cv(db, test_user.id)
    questions = _prepared_questions(client, auth_headers, f"{LISTING_BASE} {extra}")

    assert questions.get("Do you require visa sponsorship?") == "work_authorization"
