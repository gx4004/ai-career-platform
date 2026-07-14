"""R15 #184 trust-chain gate: reviewer gate + regression halt + admin visibility.

Covers the acceptance criteria from the parent spec (#179, D-097):

* a packet with an unresolved fabrication finding is never queue-eligible;
* a failing packet-quality / fabrication regression eval halts preparation
  pipeline-wide until cleared, then preparation resumes;
* reviewer findings surface with the packet by-reference;
* gate state is emitted as ALLOWLISTED operational events (no content can ride
  them) and is visible on the admin dashboard.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.auth.security import create_access_token, hash_password
from app.evals.calibration import CalibrationReport, ToolMissRate
from app.evals.fabrication import FabricationReport, ToolFabricationCount
from app.models.application_packet import ApplicationPacket
from app.models.cv_document import CvDocument, CvVariant
from app.models.discovered_listing import DiscoveredListing
from app.models.queue_rule import QueueRule
from app.models.tool_run import ToolRun
from app.models.user import User
from app.schemas.analytics import ActivationEventCreate
from app.schemas.discovery_recommendations import (
    DiscoveryRecommendation,
    DiscoveryRecommendationList,
    RecommendationAttribution,
)
from app.services.analytics import record_activation_event
from app.services.application_packets import prepare_packets
from app.services.packet_gate import (
    apply_regression_gate,
    clear_pipeline_halt,
    evaluate_regression,
    is_preparation_halted,
    is_queue_eligible,
    set_pipeline_halt,
)

PREFIX = "/api/v1"
NEUTRAL_DESC = "We build reliable backend systems for a growing engineering team here."


# ── Helpers (self-contained, mirroring test_application_packets) ──


def _rec(listing_id: str, *, description: str = NEUTRAL_DESC) -> DiscoveryRecommendation:
    return DiscoveryRecommendation(
        listing_id=listing_id,
        title="Senior Backend Engineer",
        company="Acme",
        description=description,
        score=82,
        rationale=[],
        attributions=[
            RecommendationAttribution(
                source_id="source-1",
                source_name="Licensed Feed",
                source_family="licensed",
                source_url="https://feed.example/jobs/1",
                retrieved_at=datetime(2026, 7, 13, tzinfo=UTC),
            )
        ],
    )


def _patch_rank(monkeypatch, recs):
    def fake_rank(db, user_id, *, now=None):
        return DiscoveryRecommendationList(
            items=recs, confirmed_item_count=1, preference_item_count=0
        )

    monkeypatch.setattr("app.services.queue_rules.rank_discovery_recommendations", fake_rank)
    monkeypatch.setattr("app.services.discovery_adoption.rank_discovery_recommendations", fake_rank)


def _add_listing(db, listing_id, *, description=NEUTRAL_DESC):
    db.add(
        DiscoveredListing(
            id=listing_id,
            content_sha256=f"sha-{listing_id}",
            title="Senior Backend Engineer",
            company="Acme",
            description=description,
        )
    )
    db.commit()


def _add_cv_variant(db, user_id, *, body="Built backend systems."):
    doc = CvDocument(user_id=user_id, name="My CV", sections=[])
    db.add(doc)
    db.flush()
    sections = [
        {
            "id": "sec-exp",
            "kind": "experience",
            "title": "Experience",
            "visible": True,
            "position": 0,
            "entries": [{"id": "e1", "evidence_item_id": None, "body": body, "position": 0}],
        }
    ]
    doc.sections = sections
    variant = CvVariant(document_id=doc.id, name="Base", sections=sections)
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return variant


def _add_rule(db, user_id):
    db.add(QueueRule(user_id=user_id, rule_type="role", keywords=["engineer"]))
    db.commit()


async def _compose_clean(*, resume_text, job_description, listing_title="", company="", **kwargs):
    """A packet whose cover letter invents nothing — the reviewer finds no fabrication."""
    return {
        "schema_version": "application-packet/v1",
        "summary": {"headline": f"Packet drafts for {listing_title}"},
        "cover_letter": {"body": "I build backend systems.", "support": "document",
                         "evidence_item_ids": []},
        "screening_answers": [],
        "confirmed_evidence_item_ids": [],
    }


async def _compose_fabricated(*, resume_text, job_description, listing_title="", company="", **kwargs):
    """A cover letter claiming an employer absent from the CV — a fabrication finding."""
    return {
        "schema_version": "application-packet/v1",
        "summary": {"headline": f"Packet drafts for {listing_title}"},
        "cover_letter": {
            "body": "I led a platform team at Globex Corporation for several years.",
            "support": "document",
            "evidence_item_ids": [],
        },
        "screening_answers": [],
        "confirmed_evidence_item_ids": [],
    }


def _prep_one(db, user_id, monkeypatch, *, listing_id, compose, cv_body="Built backend systems."):
    _add_listing(db, listing_id)
    _add_cv_variant(db, user_id, body=cv_body)
    _patch_rank(monkeypatch, [_rec(listing_id)])
    _add_rule(db, user_id)
    return prepare_packets(db, user_id, compose_fn=compose)


# ── AC1: a fabrication finding keeps a packet out of the queue (D-097) ──


@pytest.mark.asyncio
async def test_fabrication_finding_blocks_queue(db, test_user, monkeypatch):
    await _prep_one(
        db, test_user.id, monkeypatch, listing_id="l-fab", compose=_compose_fabricated
    )
    packet = db.query(ApplicationPacket).one()
    assert packet.gate_state == "blocked"
    assert is_queue_eligible(packet) is False
    # The reviewer that blocked it is referenced, and it flagged a fabrication.
    assert packet.review_run_id is not None
    review = db.query(ToolRun).filter(ToolRun.id == packet.review_run_id).one()
    categories = {f["category"] for f in review.result_payload["findings"]}
    assert "unsupported_claim" in categories


@pytest.mark.asyncio
async def test_clean_packet_passes_gate_and_is_queue_eligible(db, test_user, monkeypatch):
    await _prep_one(
        db, test_user.id, monkeypatch, listing_id="l-clean", compose=_compose_clean
    )
    packet = db.query(ApplicationPacket).one()
    assert packet.gate_state == "passed"
    assert is_queue_eligible(packet) is True


@pytest.mark.asyncio
async def test_realistic_cv_with_no_confirmed_evidence_still_passes_gate(db, test_user, monkeypatch):
    """A normal CV mentioning a real employer/technology must not be gated as
    fabrication just because its owner has no confirmed Evidence Profile items —
    the common case. Without grounding CV claims in the CV's own source document
    (D-073), every proper noun and figure in a truthful CV would trip the
    fabrication gate and permanently block the packet (no other CV content is
    ever added post-preparation to clear it).
    """
    await _prep_one(
        db,
        test_user.id,
        monkeypatch,
        listing_id="l-realistic",
        compose=_compose_clean,
        cv_body="Led backend migration at Nimbus Freight using AWS and Kubernetes, cutting latency 35%.",
    )
    packet = db.query(ApplicationPacket).one()
    review = db.query(ToolRun).filter(ToolRun.id == packet.review_run_id).one()
    unsupported = [
        f for f in review.result_payload["findings"] if f["category"] == "unsupported_claim"
    ]
    assert unsupported == []
    assert packet.gate_state == "passed"
    assert is_queue_eligible(packet) is True


# ── AC3: findings surface with the packet (by-reference, D-093) ──


@pytest.mark.asyncio
async def test_findings_surface_with_packet_by_reference(db, test_user, monkeypatch):
    await _prep_one(
        db, test_user.id, monkeypatch, listing_id="l-surface", compose=_compose_clean
    )
    packet = db.query(ApplicationPacket).one()
    review = db.query(ToolRun).filter(ToolRun.id == packet.review_run_id).one()
    # The findings live on the referenced reviewer run — never copied onto the packet.
    assert review.tool_name == "application-reviewer"
    assert review.user_id == test_user.id
    assert isinstance(review.result_payload["findings"], list)


# ── AC2: a failing regression eval halts prep pipeline-wide, until cleared ──


def _fabrication_report(candidate_count: int) -> FabricationReport:
    return FabricationReport(
        results=(),
        per_tool={
            "cover-letter": ToolFabricationCount(
                tool="cover-letter",
                evaluated=3,
                candidate_count=candidate_count,
                flagged_fixture_ids=("f1",) if candidate_count else (),
            )
        },
    )


def _calibration_report(misses: int, evaluated: int = 10) -> CalibrationReport:
    return CalibrationReport(
        results=(),
        per_tool={
            "resume-analyzer": ToolMissRate(
                tool="resume-analyzer",
                evaluated=evaluated,
                misses=misses,
                missed_fixture_ids=(),
            )
        },
    )


def test_evaluate_regression_decision():
    assert evaluate_regression(fabrication_report=_fabrication_report(0)) == (False, None)
    assert evaluate_regression(fabrication_report=_fabrication_report(2)) == (
        True,
        "fabrication_regression",
    )
    assert evaluate_regression(calibration_report=_calibration_report(8)) == (
        True,
        "packet_quality_regression",
    )
    assert evaluate_regression(calibration_report=_calibration_report(1)) == (False, None)


@pytest.mark.asyncio
async def test_failing_regression_halts_then_clear_resumes(db, test_user, monkeypatch):
    _add_listing(db, "l-halt")
    _add_cv_variant(db, test_user.id)
    _patch_rank(monkeypatch, [_rec("l-halt")])
    _add_rule(db, test_user.id)

    # Failing fabrication regression halts preparation pipeline-wide.
    apply_regression_gate(db, fabrication_report=_fabrication_report(3))
    assert is_preparation_halted(db) is True

    halted = await prepare_packets(db, test_user.id, compose_fn=_compose_clean)
    assert halted.prepares is False
    assert halted.reason == "halted"
    assert db.query(ApplicationPacket).count() == 0

    # A subsequent passing eval clears the halt and preparation resumes.
    apply_regression_gate(db, fabrication_report=_fabrication_report(0))
    assert is_preparation_halted(db) is False

    resumed = await prepare_packets(db, test_user.id, compose_fn=_compose_clean)
    assert resumed.prepared_count == 1
    assert db.query(ApplicationPacket).count() == 1


def test_explicit_halt_and_clear(db):
    set_pipeline_halt(db, reason="packet_quality_regression")
    assert is_preparation_halted(db) is True
    clear_pipeline_halt(db)
    assert is_preparation_halted(db) is False


# ── AC4: gate events are allowlisted — no content can ride them ──


def test_gate_events_are_allowlisted(db):
    # Valid, bounded gate events write cleanly.
    record_activation_event(db, event_name="packet_queue_gate", operational_outcome="passed")
    record_activation_event(
        db,
        event_name="packet_preparation_halt",
        operational_dimension="fabrication_regression",
        operational_outcome="halted",
    )

    # An out-of-set outcome is rejected (bounded Literal).
    with pytest.raises(ValidationError):
        ActivationEventCreate(event_name="packet_queue_gate", operational_outcome="queued")

    # Packet / listing / user / finding content can never ride a gate event —
    # `extra="forbid"` rejects any field outside the allowlist.
    for bad in ("listing_id", "packet_id", "finding_text", "cover_letter", "user_id"):
        with pytest.raises(ValidationError):
            ActivationEventCreate(
                event_name="packet_queue_gate",
                operational_outcome="blocked",
                **{bad: "Globex Corporation"},
            )


# ── AC4: gate state is visible on the admin dashboard ──


@pytest.fixture
def admin_headers(db):
    admin = User(
        email="gate-admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Admin",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def test_packet_gate_admin_endpoint_requires_admin(client, auth_headers):
    assert client.get(f"{PREFIX}/admin/packet-gate").status_code == 401
    assert client.get(f"{PREFIX}/admin/packet-gate", headers=auth_headers).status_code == 403


def test_packet_gate_admin_endpoint_reports_state(client, admin_headers, db):
    # Seed one of each allowlisted gate event + a standing halt.
    record_activation_event(db, event_name="packet_queue_gate", operational_outcome="running")
    record_activation_event(db, event_name="packet_queue_gate", operational_outcome="passed")
    record_activation_event(db, event_name="packet_queue_gate", operational_outcome="blocked")
    set_pipeline_halt(db, reason="fabrication_regression")

    resp = client.get(f"{PREFIX}/admin/packet-gate", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["halted"] is True
    assert body["halt_reason"] == "fabrication_regression"
    assert body["gate_running"] == 1
    assert body["gate_passed"] == 1
    assert body["gate_blocked"] == 1
    assert body["pipeline_halted"] == 1
