import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.auth.security import hash_password
from app.models.application_packet import ApplicationPacket
from app.models.packet_approval_snapshot import PacketApprovalSnapshot
from app.models.submission_record import SubmissionDispatchClaim, SubmissionRecord
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.discovery_sources import DiscoverySourceCreate, DiscoverySourceUpdate
from app.schemas.submission_authorizations import VerifiedSourceAuthorization
from app.schemas.submission_sources import (
    SubmissionCompatibilityContract,
    SubmissionLegalTermsReview,
)
from app.services.data_export import export_career_data
from app.services.discovery_sources import (
    operate_source_kill_switch,
    register_source,
    update_source,
)
from app.services.submission_authorizations import (
    UserSubmissionNotAuthorized,
    record_submission_authorization,
    revoke_submission_authorization,
)
from app.services.submission_sources import (
    SourceSubmissionRefused,
    operate_submission_kill_switch,
    promote_submission_source,
    record_submission_contract,
    register_submission_governance,
    review_submission_legal_terms,
)
from app.services.submissions import (
    PacketSubmissionRefusal,
    PacketSubmissionRefused,
    SubmissionAdapterReceipt,
    submit_approved_snapshot,
)
from app.services.tool_runs import delete_all_user_data

FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "submission_contracts" / "synthetic_engine_v1.json"
)


class EnvelopeBlocked(RuntimeError):
    pass


class FixtureEnvelope:
    def __init__(self, *, healthy: bool = True):
        self.healthy = healthy
        self.checks: list[tuple[str, str]] = []

    def require_healthy(self, db, *, user_id: str, source_id: str) -> None:
        self.checks.append((user_id, source_id))
        if not self.healthy:
            raise EnvelopeBlocked("submission envelope is not healthy")


class FlipEnvelope(FixtureEnvelope):
    def require_healthy(self, db, *, user_id: str, source_id: str) -> None:
        super().require_healthy(db, user_id=user_id, source_id=source_id)
        if len(self.checks) == 1:
            self.healthy = False


class FixtureAdapter:
    source_key = "synthetic-engine"

    def __init__(self):
        self.requests = []
        self.accepted: dict[str, str] = {}

    def submit_idempotently(self, request):
        self.requests.append(request)
        confirmation = self.accepted.setdefault(
            request.idempotency_key, f"fixture-{len(self.accepted) + 1}"
        )
        return SubmissionAdapterReceipt(
            source_confirmation_id=confirmation,
            source_code="accepted",
        )


class ChallengeAdapter(FixtureAdapter):
    def submit_idempotently(self, request):
        self.requests.append(request)
        return SubmissionAdapterReceipt(
            source_confirmation_id="not-a-confirmation",
            source_code="challenge_required",
        )


class AmbiguousAdapter(FixtureAdapter):
    def submit_idempotently(self, request):
        self.requests.append(request)
        raise TimeoutError("source may have accepted the idempotency key")


def _admin(db) -> User:
    existing = db.query(User).filter(User.email == "engine-admin@example.com").one_or_none()
    if existing is not None:
        return existing
    actor = User(
        email="engine-admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Engine Admin",
        is_admin=True,
    )
    db.add(actor)
    db.commit()
    db.refresh(actor)
    return actor


def _source_and_grant(db, test_user):
    actor = _admin(db)
    source = register_source(
        db,
        DiscoverySourceCreate(
            source_key="synthetic-engine",
            display_name="Synthetic Engine Fixture",
            source_family="employer_ats",
            owner="Tests",
            allowed_behavior="ats_integration",
            endpoint_url="https://synthetic-engine.invalid/applications",
            allowed_query_parameters=[],
            robots_policy="not_applicable",
            rate_limit_per_minute=10,
            attribution_rule="Synthetic fixture only",
            retention_days=30,
        ),
    )
    update_source(db, source, DiscoverySourceUpdate(terms_status="accepted"), actor=actor)
    operate_source_kill_switch(db, source, tripped=False, actor=actor)
    governance = register_submission_governance(db, source)
    review_submission_legal_terms(
        db,
        governance,
        SubmissionLegalTermsReview(status="accepted"),
        actor=actor,
    )
    contract = SubmissionCompatibilityContract.model_validate_json(FIXTURE_PATH.read_text())
    record_submission_contract(db, governance, contract, actor=actor)
    promote_submission_source(db, governance, promoted=True, actor=actor)
    operate_submission_kill_switch(db, governance, tripped=False, actor=actor)
    grant = record_submission_authorization(
        db,
        user_id=test_user.id,
        source_key=source.source_key,
        authorization=VerifiedSourceAuthorization(
            mechanism="oauth2_authorization_code",
            scope="submit_applications",
            user_consent_confirmed=True,
        ),
    )
    return source, governance, grant


def _snapshot(db, test_user, *, unresolved=None, unsupported=None):
    campaign = Workspace(user_id=test_user.id, label="Engine test")
    db.add(campaign)
    db.flush()
    packet = ApplicationPacket(
        user_id=test_user.id,
        campaign_id=campaign.id,
        match_rationale={"composite_score": 90, "signals": [], "matched_rules": []},
        unresolved_questions=[],
        status="prepared",
        gate_state="passed",
        decision="accepted",
        estimated_cost_usd=0,
    )
    db.add(packet)
    db.flush()
    content = {
        "schema_version": "packet-approval/v1",
        "packet_id": packet.id,
        "campaign_id": campaign.id,
        "listing_id": None,
        "frozen_at": datetime.now(UTC).isoformat(),
        "match_rationale": packet.match_rationale,
        "unresolved_questions": unresolved or [],
        "unsupported_claims": unsupported or [],
        "resolved_stop_answers": [],
        "listing": {
            "id": "listing-fixture",
            "content_sha256": "a" * 64,
            "title": "Platform Engineer",
            "company": "Example Corp",
            "description": "Build reliable systems",
            "attributions": [],
        },
        "manual_handoff": None,
        "cv_variant": None,
        "drafts": {"cover_letter": "Exact approved cover letter"},
    }
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    snapshot = PacketApprovalSnapshot(
        user_id=test_user.id,
        packet_id=packet.id,
        campaign_id=campaign.id,
        listing_id=None,
        role_key="role:v1:" + "b" * 64,
        destination_url=None,
        content_json=canonical,
        content_sha256=hashlib.sha256(canonical.encode()).hexdigest(),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def _submit(db, test_user, snapshot, source, grant, envelope, adapter):
    return submit_approved_snapshot(
        db,
        user_id=test_user.id,
        snapshot_id=snapshot.id,
        source_key=source.source_key,
        grant_id=grant.id,
        envelope_gate=envelope,
        adapter=adapter,
    )


def test_submits_exact_frozen_fields_once_and_persists_proof(db, test_user):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    envelope = FixtureEnvelope()
    adapter = FixtureAdapter()

    first = _submit(db, test_user, snapshot, source, grant, envelope, adapter)
    second = _submit(db, test_user, snapshot, source, grant, envelope, adapter)

    assert first == second
    assert len(adapter.requests) == 1
    assert adapter.requests[0].fields == {
        "job_title": "Platform Engineer",
        "company_name": "Example Corp",
        "cover_letter": "Exact approved cover letter",
    }
    assert adapter.requests[0].snapshot_content_sha256 == snapshot.content_sha256
    assert first.submitted_fields == adapter.requests[0].fields
    assert first.idempotency_key == adapter.requests[0].idempotency_key
    assert db.query(SubmissionRecord).count() == 1
    # Source, grant, and envelope are checked at dispatch and immediately pre-act.
    assert envelope.checks == [
        (test_user.id, source.id),
        (test_user.id, source.id),
        (test_user.id, source.id),
    ]


def test_process_restart_uses_durable_record_not_in_memory_state(db, test_user):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    first_adapter = FixtureAdapter()
    first = _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), first_adapter)

    db.expire_all()
    restarted_adapter = FixtureAdapter()
    second = _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), restarted_adapter)

    assert second.id == first.id
    assert restarted_adapter.requests == []


def test_submission_records_export_and_erase_with_dispatch_claims(db, test_user):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    submitted = _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), FixtureAdapter())

    exported = export_career_data(db, test_user.id)
    assert exported.submission_records.record_count == 1
    assert exported.submission_records.records[0] == submitted
    assert exported.submission_records.dispatch_claim_count == 1
    assert exported.submission_records.dispatch_claims[0].submitted_fields == (
        submitted.submitted_fields
    )

    delete_all_user_data(db, test_user.id)

    assert db.query(SubmissionRecord).count() == 0
    assert db.query(SubmissionDispatchClaim).count() == 0


def test_campaign_deletion_erases_submission_records_without_fk_cascades(db, test_user):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), FixtureAdapter())
    campaign = db.query(Workspace).filter_by(id=snapshot.campaign_id).one()

    db.delete(campaign)
    db.commit()

    assert db.query(PacketApprovalSnapshot).count() == 0
    assert db.query(SubmissionRecord).count() == 0
    assert db.query(SubmissionDispatchClaim).count() == 0


def test_source_user_packet_and_envelope_gates_refuse_independently(db, test_user):
    source, governance, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    adapter = FixtureAdapter()

    operate_submission_kill_switch(db, governance, tripped=True, actor=_admin(db))
    with pytest.raises(SourceSubmissionRefused):
        _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), adapter)
    operate_submission_kill_switch(db, governance, tripped=False, actor=_admin(db))

    revoke_submission_authorization(db, user_id=test_user.id, grant_id=grant.id)
    with pytest.raises(UserSubmissionNotAuthorized):
        _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), adapter)

    other = User(
        email="other-engine@example.com",
        hashed_password=hash_password("password123"),
        full_name="Other",
    )
    db.add(other)
    db.commit()
    with pytest.raises(PacketSubmissionRefused) as packet_refusal:
        submit_approved_snapshot(
            db,
            user_id=other.id,
            snapshot_id=snapshot.id,
            source_key=source.source_key,
            grant_id=grant.id,
            envelope_gate=FixtureEnvelope(),
            adapter=adapter,
        )
    assert packet_refusal.value.reason == PacketSubmissionRefusal.SNAPSHOT_NOT_APPROVED

    # Re-grant so the envelope gate is reached independently.
    grant = record_submission_authorization(
        db,
        user_id=test_user.id,
        source_key=source.source_key,
        authorization=VerifiedSourceAuthorization(
            mechanism="oauth2_authorization_code",
            scope="submit_applications",
            user_consent_confirmed=True,
        ),
    )
    with pytest.raises(EnvelopeBlocked):
        _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(healthy=False), adapter)
    assert adapter.requests == []


@pytest.mark.parametrize(
    ("unresolved", "unsupported", "reason"),
    [
        (
            [
                {
                    "field": "work_authorization",
                    "category": "work_authorization",
                    "question": "Are you authorized?",
                }
            ],
            [],
            PacketSubmissionRefusal.UNRESOLVED_QUESTIONS,
        ),
        ([], [{"field": "cover_letter"}], PacketSubmissionRefusal.UNSUPPORTED_CLAIMS),
    ],
)
def test_packet_gate_rejects_unresolved_or_unsupported_content(
    db, test_user, unresolved, unsupported, reason
):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user, unresolved=unresolved, unsupported=unsupported)

    with pytest.raises(PacketSubmissionRefused) as refusal:
        _submit(
            db,
            test_user,
            snapshot,
            source,
            grant,
            FixtureEnvelope(),
            FixtureAdapter(),
        )
    assert refusal.value.reason == reason


def test_tampered_snapshot_and_contract_path_fail_before_adapter(db, test_user):
    source, governance, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    adapter = FixtureAdapter()
    original_content = snapshot.content_json
    snapshot.content_json = snapshot.content_json.replace("Platform", "Tampered")
    db.commit()

    with pytest.raises(PacketSubmissionRefused) as integrity:
        _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), adapter)
    assert integrity.value.reason == PacketSubmissionRefusal.SNAPSHOT_INTEGRITY_FAILED

    snapshot.content_json = original_content
    db.commit()
    contract = json.loads(FIXTURE_PATH.read_text())
    contract["fields"][0]["packet_field"] = "candidate.missing"
    record_submission_contract(
        db,
        governance,
        SubmissionCompatibilityContract.model_validate(contract),
        actor=_admin(db),
    )
    with pytest.raises(PacketSubmissionRefused) as mismatch:
        _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), adapter)
    assert mismatch.value.reason == PacketSubmissionRefusal.CONTRACT_MISMATCH
    assert adapter.requests == []


def test_snapshot_row_must_still_match_an_accepted_passed_owner_packet(db, test_user):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    packet = db.query(ApplicationPacket).filter_by(id=snapshot.packet_id).one()
    packet.decision = "pending"
    db.commit()

    with pytest.raises(PacketSubmissionRefused) as refusal:
        _submit(
            db,
            test_user,
            snapshot,
            source,
            grant,
            FixtureEnvelope(),
            FixtureAdapter(),
        )
    assert refusal.value.reason == PacketSubmissionRefusal.SNAPSHOT_NOT_APPROVED


def test_contract_format_mismatch_stops_before_adapter(db, test_user):
    source, governance, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    contract = json.loads(FIXTURE_PATH.read_text())
    contract["formats"][0]["kind"] = "email"
    record_submission_contract(
        db,
        governance,
        SubmissionCompatibilityContract.model_validate(contract),
        actor=_admin(db),
    )
    adapter = FixtureAdapter()

    with pytest.raises(PacketSubmissionRefused) as refusal:
        _submit(
            db,
            test_user,
            snapshot,
            source,
            grant,
            FixtureEnvelope(),
            adapter,
        )
    assert refusal.value.reason == PacketSubmissionRefusal.CONTRACT_MISMATCH
    assert adapter.requests == []


def test_pre_act_failure_preserves_the_globally_shared_frozen_claim(db, test_user):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)

    with pytest.raises(EnvelopeBlocked):
        _submit(
            db,
            test_user,
            snapshot,
            source,
            grant,
            FlipEnvelope(),
            FixtureAdapter(),
        )
    claim = db.query(SubmissionDispatchClaim).one()
    assert (
        claim.submitted_fields_sha256
        == hashlib.sha256(claim.submitted_fields_json.encode()).hexdigest()
    )


def test_non_accepted_source_code_never_creates_a_submission_record(db, test_user):
    source, _, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)

    with pytest.raises(PacketSubmissionRefused) as refusal:
        _submit(
            db,
            test_user,
            snapshot,
            source,
            grant,
            FixtureEnvelope(),
            ChallengeAdapter(),
        )
    assert refusal.value.reason == PacketSubmissionRefusal.CONTRACT_MISMATCH
    assert db.query(SubmissionRecord).count() == 0


def test_ambiguous_retry_stops_on_contract_change_then_reuses_frozen_request(db, test_user):
    source, governance, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    ambiguous = AmbiguousAdapter()
    with pytest.raises(TimeoutError):
        _submit(
            db,
            test_user,
            snapshot,
            source,
            grant,
            FixtureEnvelope(),
            ambiguous,
        )

    changed = json.loads(FIXTURE_PATH.read_text())
    changed["version"] = "synthetic-engine/v2"
    changed["fields"][0]["packet_field"] = "candidate.new_title"
    record_submission_contract(
        db,
        governance,
        SubmissionCompatibilityContract.model_validate(changed),
        actor=_admin(db),
    )
    retry = FixtureAdapter()
    with pytest.raises(PacketSubmissionRefused) as mismatch:
        _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), retry)
    assert mismatch.value.reason == PacketSubmissionRefusal.CONTRACT_MISMATCH
    assert retry.requests == []

    record_submission_contract(
        db,
        governance,
        SubmissionCompatibilityContract.model_validate_json(FIXTURE_PATH.read_text()),
        actor=_admin(db),
    )
    result = _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), retry)

    assert retry.requests[0] == ambiguous.requests[0]
    assert result.contract_version == "synthetic-engine/v1"
    assert result.submitted_fields["job_title"] == "Platform Engineer"


def test_same_version_contract_drift_stops_before_adapter(db, test_user):
    source, governance, grant = _source_and_grant(db, test_user)
    snapshot = _snapshot(db, test_user)
    ambiguous = AmbiguousAdapter()
    with pytest.raises(TimeoutError):
        _submit(
            db,
            test_user,
            snapshot,
            source,
            grant,
            FixtureEnvelope(),
            ambiguous,
        )

    changed = json.loads(FIXTURE_PATH.read_text())
    changed["error_semantics"].append(
        {
            "source_code": "rate_limited",
            "meaning": "transient_failure",
            "handling": "retry_with_source_idempotency",
        }
    )
    record_submission_contract(
        db,
        governance,
        SubmissionCompatibilityContract.model_validate(changed),
        actor=_admin(db),
    )
    retry = FixtureAdapter()

    with pytest.raises(PacketSubmissionRefused) as mismatch:
        _submit(db, test_user, snapshot, source, grant, FixtureEnvelope(), retry)

    assert mismatch.value.reason == PacketSubmissionRefusal.CONTRACT_MISMATCH
    assert retry.requests == []
