from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.auth.security import create_access_token, hash_password
from app.models.user import User
from app.schemas.admin import SubmissionFamilyQuality
from app.services.analytics import record_activation_event
from app.services.submission_quality import (
    SOURCE_FAMILIES,
    aggregate_submission_quality,
    record_submission_quality_outcome,
)

PREFIX = "/api/v1"


def _admin(db) -> User:
    admin = User(
        email="submission-quality@example.com",
        hashed_password=hash_password("password123"),
        full_name="Submission Quality Admin",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def test_quality_view_reports_rates_by_family_without_control_authority(db):
    for outcome in (
        "confirmed",
        "confirmed",
        "confirmed",
        "confirmed",
        "response_received",
        "response_received",
        "packet_edited",
        "duplicate_prevented",
    ):
        record_submission_quality_outcome(
            db,
            source_family="employer_ats",
            outcome=outcome,
        )

    now = datetime.now(UTC)
    result = aggregate_submission_quality(
        db,
        window_start=now - timedelta(days=1),
        window_end=now + timedelta(days=1),
    )

    assert [row.source_family for row in result.families] == list(SOURCE_FAMILIES)
    ats = next(row for row in result.families if row.source_family == "employer_ats")
    assert ats.evidence_base == 4
    assert ats.response_rate == 0.5
    assert ats.packet_edit_rate == 0.25
    assert ats.duplicate_prevention_rate == 0.2
    assert ats.complaint_rate == 0.0
    assert "kill" not in result.model_dump_json()
    assert "activate" not in result.model_dump_json()

    empty = next(row for row in result.families if row.source_family == "licensed")
    assert empty.evidence_base == 0
    assert empty.response_rate is None
    assert empty.packet_edit_rate is None


def test_quality_rates_stay_bounded_across_repeated_observations(db):
    for outcome in (
        "confirmed",
        "response_received",
        "response_received",
        "packet_edited",
        "packet_edited",
        "duplicate_prevented",
        "duplicate_prevented",
        "complaint_reported",
        "complaint_reported",
    ):
        record_submission_quality_outcome(
            db,
            source_family="employer_ats",
            outcome=outcome,
        )

    now = datetime.now(UTC)
    result = aggregate_submission_quality(
        db,
        window_start=now - timedelta(days=1),
        window_end=now + timedelta(days=1),
    )

    ats = next(row for row in result.families if row.source_family == "employer_ats")
    assert ats.response_rate == 1.0
    assert ats.packet_edit_rate == 1.0
    assert ats.duplicate_prevention_rate == 0.6667
    assert ats.complaint_rate == 1.0
    assert all(
        rate is not None and 0 <= rate <= 1
        for rate in (
            ats.response_rate,
            ats.packet_edit_rate,
            ats.duplicate_prevention_rate,
            ats.complaint_rate,
        )
    )


def test_quality_response_rejects_unknown_source_families():
    with pytest.raises(ValidationError):
        SubmissionFamilyQuality(source_family="arbitrary", evidence_base=0)


def test_submission_quality_events_reject_packet_content_and_field_values(db):
    record_submission_quality_outcome(
        db,
        source_family="employer_ats",
        outcome="complaint_reported",
    )

    with pytest.raises(ValidationError):
        record_activation_event(
            db,
            event_name="submission_quality_outcome",
            operational_dimension="employer_ats",
            operational_outcome="response_received",
            packet_content={"candidate": "private"},
        )
    with pytest.raises(ValidationError):
        record_activation_event(
            db,
            event_name="submission_quality_outcome",
            operational_dimension="employer_ats",
            operational_outcome="packet_edited",
            submitted_fields={"salary": "private"},
        )


def test_submission_quality_endpoint_is_admin_only_and_content_free(client, db, auth_headers):
    admin = _admin(db)
    record_submission_quality_outcome(
        db,
        source_family="employer_ats",
        outcome="confirmed",
    )

    path = f"{PREFIX}/admin/submission-quality"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=auth_headers).status_code == 403

    response = client.get(path, headers=_headers(admin))
    assert response.status_code == 200
    body = response.json()
    assert [row["source_family"] for row in body["families"]] == list(SOURCE_FAMILIES)
    assert "private" not in response.text
    assert "submitted_fields" not in response.text
