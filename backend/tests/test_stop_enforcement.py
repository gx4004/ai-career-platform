"""R15 #182 — mandatory-stop enforcement for sensitive fields.

Covers the four acceptance criteria:
- one authoritative server-side classifier, unbypassable by any client input (D-095);
- for every stop category, the system never drafts the field;
- approval is rejected server-side while any question is unresolved;
- stop answers are owner-scoped and excluded from telemetry entirely (D-099).
"""

import json

import pytest
from pydantic import ValidationError

from app.models.application_packet import ApplicationPacket
from app.models.packet_stop_answer import PacketStopAnswer
from app.schemas.discovery_recommendations import (
    DiscoveryRecommendationList,
)
from app.services.analytics import record_activation_event
from app.services.application_packets import (
    compose_packet_materials,
    list_packets,
    prepare_packets,
)
from app.services.data_export import export_career_data
from app.services.packet_approval import (
    PacketNotApprovableError,
    StopAnswerError,
    assert_packet_approvable,
    export_packet_stop_answers,
    is_packet_approvable,
    store_stop_answer,
)
from app.services.stop_classifier import (
    STOP_CATEGORIES,
    classify_stop_category,
    stop_categories_in,
)
from app.services.tool_runs import delete_all_user_data

# Reuse the packet test helpers so setup matches the shipped preparation flow.
from tests.test_application_packets import (
    NEUTRAL_DESC,
    _add_cv_variant,
    _add_listing,
    _add_rule,
    _rec,
    _stub_compose,
)

PREFIX = "/api/v1"

# A field text that triggers each stop category, for the per-category coverage.
STOP_FIELD_TEXT: dict[str, str] = {
    "work_authorization": "Do you require visa sponsorship to work here?",
    "salary": "What is your expected salary for this role?",
    "relocation": "Are you willing to relocate for this position?",
    "eligibility": "Do you currently hold an active security clearance?",
    "demographic": "What is your citizenship?",
    "legal": "Have you ever been convicted of a felony?",
    "sensitive": "Please provide your social security number.",
    "uncertain": "In your own words, why do you want this job?",
}


def _patch_rank(monkeypatch, recs):
    def fake_rank(db, user_id, *, now=None):
        return DiscoveryRecommendationList(
            items=recs, confirmed_item_count=1, preference_item_count=0
        )

    monkeypatch.setattr("app.services.queue_rules.rank_discovery_recommendations", fake_rank)
    monkeypatch.setattr("app.services.discovery_adoption.rank_discovery_recommendations", fake_rank)


# ── One authoritative classifier (D-095) ──


def test_classifier_covers_every_stop_category():
    for category in STOP_CATEGORIES:
        assert classify_stop_category(STOP_FIELD_TEXT[category]) == category


def test_classifier_lets_draftable_fields_through():
    assert classify_stop_category(NEUTRAL_DESC) is None
    assert classify_stop_category("Describe your experience with Python and REST APIs.") is None


def test_listing_scan_returns_all_stops_in_canonical_order():
    text = "We offer relocation support and a competitive salary; visa sponsorship available."
    found = stop_categories_in(text)
    assert set(found) == {"work_authorization", "salary", "relocation"}
    # Canonical order regardless of appearance order in the text.
    assert found == [c for c in STOP_CATEGORIES if c in set(found)]


# ── Never-draft guarantee, per category ──


@pytest.mark.asyncio
@pytest.mark.parametrize("category", list(STOP_CATEGORIES))
async def test_compose_never_drafts_any_stop_category(monkeypatch, category):
    drafted_text = f"DRAFTED ANSWER for {category} that must never be produced"

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                {
                    "question": STOP_FIELD_TEXT[category],
                    "answer": drafted_text,
                    # Even a "grounded" label must not let a stop field be drafted.
                    "support": "document",
                    "evidence_item_ids": [],
                }
            ],
        }

    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)
    result = await compose_packet_materials(resume_text="cv", job_description="jd")

    # No content was drafted for the stop field.
    assert result["screening_answers"] == []
    assert drafted_text not in json.dumps(result)
    # It surfaced as an explicit unresolved question of that exact category.
    categories = {q["category"] for q in result["unresolved_questions"]}
    assert category in categories


@pytest.mark.asyncio
async def test_compose_treats_ungrounded_answer_as_uncertain_stop(monkeypatch):
    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                {
                    "question": "What is your greatest weakness?",
                    "answer": "I guessed this.",
                    "support": "unsupported",
                    "evidence_item_ids": [],
                }
            ],
        }

    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)
    result = await compose_packet_materials(resume_text="cv", job_description="jd")
    assert result["screening_answers"] == []
    assert "I guessed this." not in json.dumps(result)
    assert any(q["category"] == "uncertain" for q in result["unresolved_questions"])


# ── No client input can bypass a stop (D-095) ──


@pytest.mark.asyncio
async def test_client_supplied_confirmed_label_cannot_bypass_stop(monkeypatch):
    """A model/client that labels a work-auth answer 'confirmed' with real evidence
    still cannot force the system to draft it — classification is server-side."""

    async def fake_llm(system_prompt, user_prompt, schema=None, model_override=None):
        return {
            "cover_letter": None,
            "screening_answers": [
                {
                    "question": "Do you need visa sponsorship?",
                    "answer": "No sponsorship needed.",
                    "support": "confirmed",
                    "evidence_item_ids": ["c1"],
                }
            ],
        }

    from app.services.evidence_injection import EvidencePayload

    payload = EvidencePayload(
        locked_facts=[{"evidence_item_id": "c1", "kind": "skill", "content": {"t": "x"}}],
        gaps=[],
    )
    monkeypatch.setattr("app.services.application_packets.complete_structured", fake_llm)
    result = await compose_packet_materials(
        resume_text="cv", job_description="jd", evidence_profile=payload
    )
    assert result["screening_answers"] == []
    assert "No sponsorship needed." not in json.dumps(result)
    assert any(q["category"] == "work_authorization" for q in result["unresolved_questions"])


@pytest.mark.asyncio
async def test_prepared_packet_stop_survives_regardless_of_status_field(
    db, test_user, monkeypatch
):
    """The stop is derived from the listing text; the packet is blocked server-side
    even though no client field controls it."""
    desc = "Visa sponsorship offered for this engineer role."
    _add_listing(db, "l-bypass", description=desc)
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-bypass", description=desc)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()
    assert packet.status == "blocked"
    assert any(q["category"] == "work_authorization" for q in packet.unresolved_questions)


# ── Approval rejected while any question is unresolved ──


@pytest.mark.asyncio
async def test_approval_rejected_while_unresolved_then_unlocked(db, test_user, monkeypatch):
    desc = "Visa sponsorship available for this engineer role."
    _add_listing(db, "l-appr", description=desc)
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-appr", description=desc)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)

    packet = db.query(ApplicationPacket).one()
    assert is_packet_approvable(db, test_user.id, packet.id) is False
    with pytest.raises(PacketNotApprovableError):
        assert_packet_approvable(db, test_user.id, packet.id)

    # The user's typed answer is the only thing that resolves the stop.
    outcome = store_stop_answer(
        db, test_user.id, packet.id, field="work_authorization", answer="I hold an EU passport."
    )
    assert outcome.approvable is True
    assert outcome.remaining_unresolved == 0
    assert is_packet_approvable(db, test_user.id, packet.id) is True
    assert_packet_approvable(db, test_user.id, packet.id)  # does not raise


@pytest.mark.asyncio
async def test_missing_material_question_is_not_answerable_and_blocks(db, test_user, monkeypatch):
    _add_listing(db, "l-nocv")
    _patch_rank(monkeypatch, [_rec("l-nocv")])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()

    # A missing-material question cannot be resolved by typing an answer.
    with pytest.raises(StopAnswerError):
        store_stop_answer(db, test_user.id, packet.id, field="cv_variant", answer="whatever")
    assert is_packet_approvable(db, test_user.id, packet.id) is False


# ── Stop-answer storage: owner-scoped ──


@pytest.mark.asyncio
async def test_stop_answers_owner_scoped(db, test_user, monkeypatch):
    from app.auth.security import hash_password
    from app.models.user import User

    other = User(
        email="stop-other@example.com",
        hashed_password=hash_password("password123"),
        full_name="Other",
    )
    db.add(other)
    db.commit()

    desc = "Visa sponsorship available for this engineer role."
    _add_listing(db, "l-owner", description=desc)
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-owner", description=desc)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()

    # A different user cannot store an answer against this owner's packet.
    with pytest.raises(StopAnswerError):
        store_stop_answer(db, other.id, packet.id, field="work_authorization", answer="hack")

    store_stop_answer(
        db, test_user.id, packet.id, field="work_authorization", answer="EU citizen."
    )
    assert export_packet_stop_answers(db, other.id).stop_answers == []
    mine = export_packet_stop_answers(db, test_user.id).stop_answers
    assert len(mine) == 1 and mine[0].answer == "EU citizen."


@pytest.mark.asyncio
async def test_stop_answer_rejects_field_not_on_packet(db, test_user, monkeypatch):
    desc = "Visa sponsorship available for this engineer role."
    _add_listing(db, "l-badfield", description=desc)
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-badfield", description=desc)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()
    # 'salary' is not one of this packet's unresolved questions.
    with pytest.raises(StopAnswerError):
        store_stop_answer(db, test_user.id, packet.id, field="salary", answer="100k")


# ── Telemetry exclusion (D-099) ──


def test_stop_answer_text_cannot_ride_telemetry(db):
    """No activation event may carry stop-answer or stop-question free text — the
    allowlist rejects any such field before a row is written (extra='forbid')."""
    for bad in ("stop_answer", "answer", "answer_text", "stop_question", "question", "field"):
        with pytest.raises(ValidationError):
            record_activation_event(db, event_name="tool_run_started", **{bad: "SECRET"})


@pytest.mark.asyncio
async def test_resolving_stop_writes_no_analytics_row(db, test_user, monkeypatch):
    from app.models.analytics_event import AnalyticsEvent

    desc = "Visa sponsorship available for this engineer role."
    _add_listing(db, "l-tel", description=desc)
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-tel", description=desc)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()

    before = db.query(AnalyticsEvent).count()
    store_stop_answer(
        db, test_user.id, packet.id, field="work_authorization", answer="Sensitive answer text."
    )
    after = db.query(AnalyticsEvent).count()
    # Storing a stop answer emits no telemetry at all, so the text cannot leak.
    assert after == before
    assert (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name.like("%stop%"))
        .count()
        == 0
    )


# ── Deletion cascade + export (D-099) ──


@pytest.mark.asyncio
async def test_stop_answers_deleted_and_exported(db, test_user, monkeypatch):
    desc = "Visa sponsorship available for this engineer role."
    _add_listing(db, "l-cascade", description=desc)
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-cascade", description=desc)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    await prepare_packets(db, test_user.id, compose_fn=_stub_compose)
    packet = db.query(ApplicationPacket).one()
    store_stop_answer(
        db, test_user.id, packet.id, field="work_authorization", answer="EU passport holder."
    )

    # Export carries the owner's own stop answers.
    export = export_career_data(db, test_user.id)
    assert len(export.packet_stop_answers.stop_answers) == 1
    assert export.packet_stop_answers.stop_answers[0].category == "work_authorization"

    # Erasure removes them.
    assert db.query(PacketStopAnswer).count() == 1
    delete_all_user_data(db, test_user.id)
    assert db.query(PacketStopAnswer).count() == 0


# ── Endpoint (owner-scoped resolve) ──


def test_stop_answer_endpoint(client, auth_headers, db, test_user, monkeypatch):
    desc = "Visa sponsorship available for this engineer role."
    _add_listing(db, "l-ep", description=desc)
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-ep", description=desc)])
    _add_rule(db, test_user.id, "role", keywords=["engineer"])
    monkeypatch.setattr("app.services.application_packets.compose_packet_materials", _stub_compose)

    client.post(f"{PREFIX}/packets/prepare", headers=auth_headers)
    packet_id = list_packets(db, test_user.id).items[0].id

    resp = client.post(
        f"{PREFIX}/packets/{packet_id}/stop-answers",
        headers=auth_headers,
        json={"field": "work_authorization", "answer": "EU citizen, no sponsorship needed."},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["approvable"] is True
    assert body["remaining_unresolved"] == 0

    # A field not present on the packet is rejected server-side.
    bad = client.post(
        f"{PREFIX}/packets/{packet_id}/stop-answers",
        headers=auth_headers,
        json={"field": "salary", "answer": "n/a"},
    )
    assert bad.status_code == 400


def test_stop_answer_endpoint_requires_auth(client):
    resp = client.post(
        f"{PREFIX}/packets/some-id/stop-answers", json={"field": "salary", "answer": "x"}
    )
    assert resp.status_code == 401
