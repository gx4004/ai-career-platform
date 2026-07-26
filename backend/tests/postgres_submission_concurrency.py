"""Two-worker PostgreSQL proof for #191 dispatch serialization."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.application_packet import ApplicationPacket
from app.models.discovery_source import DiscoverySource
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.submission_authorization import SubmissionAuthorizationGrant
from app.models.submission_source import SubmissionSourceGovernance
from app.models.user import User
from app.models.workspace import Workspace
from app.services.submissions import (
    SubmissionAdapterReceipt,
    delete_submission_records,
    submit_approved_snapshot,
)


class HealthyEnvelope:
    def require_healthy(self, db, *, user_id: str, source_id: str) -> None:
        return None


class CountingAdapter:
    source_key = "concurrency-fixture"

    def __init__(self) -> None:
        self.calls = 0
        self.lock = threading.Lock()
        self.entered = threading.Event()
        self.release = threading.Event()

    def submit_idempotently(self, request):
        with self.lock:
            self.calls += 1
        self.entered.set()
        assert self.release.wait(timeout=5)
        return SubmissionAdapterReceipt(
            source_confirmation_id="concurrent-confirmation",
            source_code="accepted",
        )


def _seed(session) -> tuple[str, str, str]:
    now = datetime.now(UTC)
    user = User(
        id="concurrent-user",
        email="concurrent@example.com",
        is_active=True,
        token_version=0,
    )
    source = DiscoverySource(
        id="concurrent-source",
        source_key="concurrency-fixture",
        display_name="Concurrency Fixture",
        source_family="employer_ats",
        owner="Tests",
        terms_status="accepted",
        terms_reviewed_at=now,
        terms_reviewed_by="test-reviewer",
        allowed_behavior="ats_integration",
        endpoint_url="https://concurrency.invalid/applications",
        allowed_query_parameters=[],
        robots_policy="not_applicable",
        rate_limit_per_minute=10,
        attribution_rule="Fixture only",
        retention_days=30,
        kill_switch=False,
    )
    contract_fields = [
        {"source_field": "job_title", "packet_field": "listing.title", "required": True}
    ]
    governance = SubmissionSourceGovernance(
        id="concurrent-governance",
        discovery_source_id=source.id,
        legal_terms_status="accepted",
        legal_terms_reviewed_at=now,
        legal_terms_reviewed_by="test-reviewer",
        contract_status="verified",
        contract_version="concurrency/v1",
        contract_fields=contract_fields,
        contract_formats=[{"source_field": "job_title", "kind": "utf8_text"}],
        contract_error_semantics=[
            {
                "source_code": "accepted",
                "meaning": "accepted",
                "handling": "confirm_success",
            }
        ],
        contract_reviewed_at=now,
        contract_reviewed_by="test-reviewer",
        promoted=True,
        promoted_at=now,
        promoted_by="test-reviewer",
        kill_switch=False,
    )
    grant = SubmissionAuthorizationGrant(
        id="concurrent-grant",
        user_id=user.id,
        discovery_source_id=source.id,
        mechanism="oauth2_authorization_code",
        scope="submit_applications",
    )
    campaign = Workspace(id="concurrent-campaign", user_id=user.id, label="Concurrent")
    packet = ApplicationPacket(
        id="concurrent-packet",
        user_id=user.id,
        campaign_id=campaign.id,
        match_rationale={"composite_score": 90, "signals": [], "matched_rules": []},
        unresolved_questions=[],
        status="prepared",
        gate_state="passed",
        decision="accepted",
        estimated_cost_usd=0,
    )
    content = {
        "schema_version": "packet-approval/v1",
        "packet_id": packet.id,
        "campaign_id": campaign.id,
        "listing_id": None,
        "frozen_at": now.isoformat(),
        "match_rationale": packet.match_rationale,
        "unresolved_questions": [],
        "unsupported_claims": [],
        "resolved_stop_answers": [],
        "listing": {
            "id": "concurrent-listing",
            "content_sha256": "a" * 64,
            "title": "Concurrency Engineer",
            "company": "Fixture",
            "description": "Test",
            "attributions": [],
        },
        "manual_handoff": None,
        "cv_variant": None,
        "drafts": None,
    }
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    snapshot = PacketApprovalSnapshot(
        id="concurrent-snapshot",
        user_id=user.id,
        packet_id=packet.id,
        campaign_id=campaign.id,
        role_key="role:v1:" + "e" * 64,
        content_json=canonical,
        content_sha256=hashlib.sha256(canonical.encode()).hexdigest(),
    )
    session.add_all([user, source, governance, grant, campaign, packet, snapshot])
    session.commit()
    return user.id, snapshot.id, grant.id


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    with Session() as session:
        user_id, snapshot_id, grant_id = _seed(session)

    adapter = CountingAdapter()
    barrier = threading.Barrier(2)
    results = []
    errors = []

    def worker() -> None:
        try:
            barrier.wait()
            with Session() as session:
                results.append(
                    submit_approved_snapshot(
                        session,
                        user_id=user_id,
                        snapshot_id=snapshot_id,
                        source_key=adapter.source_key,
                        grant_id=grant_id,
                        envelope_gate=HealthyEnvelope(),
                        adapter=adapter,
                    )
                )
        except Exception as error:  # pragma: no cover - surfaced below
            errors.append(error)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for thread in threads:
        thread.start()
    assert adapter.entered.wait(timeout=5)

    writer_finished = [threading.Event() for _ in range(3)]
    statements = [
        "UPDATE submission_source_governance SET kill_switch=true WHERE id='concurrent-governance'",
        "UPDATE discovery_sources SET kill_switch=true WHERE id='concurrent-source'",
        "DELETE FROM submission_authorization_grants WHERE id='concurrent-grant'",
    ]

    def policy_writer(statement: str, finished: threading.Event) -> None:
        with engine.begin() as connection:
            connection.execute(text(statement))
        finished.set()

    writers = [
        threading.Thread(target=policy_writer, args=(statement, finished))
        for statement, finished in zip(statements, writer_finished, strict=True)
    ]
    for writer in writers:
        writer.start()
    # Each writer must be waiting on the engine's final policy-row locks.
    assert all(not finished.wait(timeout=0.1) for finished in writer_finished)
    adapter.release.set()
    for thread in threads:
        thread.join(timeout=10)
    for writer in writers:
        writer.join(timeout=10)

    assert not errors, errors
    assert all(not thread.is_alive() for thread in threads)
    assert len(results) == 2
    assert results[0].id == results[1].id
    assert adapter.calls == 1
    assert all(finished.is_set() for finished in writer_finished)

    # Account erasure enters the same packet -> snapshot -> claim lock order.
    # Prove it waits for an in-flight outward act and then removes the completed
    # proof without deadlocking against the submission transaction.
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM users WHERE id='concurrent-user'"))
        connection.execute(text("DELETE FROM discovery_sources WHERE id='concurrent-source'"))
    with Session() as session:
        user_id, snapshot_id, grant_id = _seed(session)

    erasure_adapter = CountingAdapter()
    erasure_results = []
    erasure_errors = []

    def submission_during_erasure() -> None:
        try:
            with Session() as session:
                erasure_results.append(
                    submit_approved_snapshot(
                        session,
                        user_id=user_id,
                        snapshot_id=snapshot_id,
                        source_key=erasure_adapter.source_key,
                        grant_id=grant_id,
                        envelope_gate=HealthyEnvelope(),
                        adapter=erasure_adapter,
                    )
                )
        except Exception as error:  # pragma: no cover - surfaced below
            erasure_errors.append(error)

    erasure_finished = threading.Event()

    def erase_submission_lifecycle() -> None:
        try:
            with Session() as session:
                delete_submission_records(session, user_id)
                session.commit()
        except Exception as error:  # pragma: no cover - surfaced below
            erasure_errors.append(error)
        finally:
            erasure_finished.set()

    submitter = threading.Thread(target=submission_during_erasure)
    submitter.start()
    assert erasure_adapter.entered.wait(timeout=5)
    eraser = threading.Thread(target=erase_submission_lifecycle)
    eraser.start()
    assert not erasure_finished.wait(timeout=0.3)
    erasure_adapter.release.set()
    submitter.join(timeout=10)
    eraser.join(timeout=10)

    assert not erasure_errors, erasure_errors
    assert not submitter.is_alive()
    assert not eraser.is_alive()
    assert len(erasure_results) == 1
    assert erasure_finished.is_set()
    with Session() as session:
        assert session.execute(text("SELECT count(*) FROM submission_records")).scalar_one() == 0
        assert (
            session.execute(text("SELECT count(*) FROM submission_dispatch_claims")).scalar_one()
            == 0
        )
    engine.dispose()


if __name__ == "__main__":
    main()
