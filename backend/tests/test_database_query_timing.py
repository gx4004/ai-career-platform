from time import perf_counter

import pytest
from pydantic import ValidationError

from app.models.analytics_event import AnalyticsEvent
from app.models.tool_run import ToolRun
from app.models.workspace import Workspace
from app.schemas.analytics import ActivationEventCreate
from app.services.analytics import record_database_query_timing


def test_history_and_workspace_reads_emit_only_bounded_query_families(
    client, auth_headers, db
):
    assert client.get("/api/v1/history", headers=auth_headers).status_code == 200
    assert client.get("/api/v1/history/workspaces", headers=auth_headers).status_code == 200
    for _ in range(25):
        assert client.get("/api/v1/history", headers=auth_headers).status_code == 200
        assert client.get("/api/v1/history/workspaces", headers=auth_headers).status_code == 200

    rows = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "r10_database_query")
        .order_by(AnalyticsEvent.created_at)
        .all()
    )
    assert [row.operational_dimension for row in rows] == [
        "history_list",
        "workspace_list",
    ]
    assert all(row.duration_ms is not None and row.duration_ms >= 0 for row in rows)
    assert all(row.tool_id is None and row.access_mode is None for row in rows)


def test_query_sampling_storage_failure_does_not_break_history_read(
    client, auth_headers, monkeypatch, caplog
):
    def fail_increment(*_args, **_kwargs):
        raise RuntimeError("private storage detail")

    monkeypatch.setattr("app.services.analytics.abuse_counters.increment", fail_increment)

    response = client.get("/api/v1/history", headers=auth_headers)

    assert response.status_code == 200
    assert "database_query_sample_failed" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "private storage detail" not in caplog.text


# ── #141 FIX 1: the heaviest remaining read paths ──────────────────────────
#
# `history_list`, `workspace_list`, and `admin_runs` were the only three
# families reaching `record_database_query_timing`. The two detail reads below
# are the heaviest reads left uninstrumented, so the database trigger was blind
# to them:
#   - `campaign_detail` (`GET /history/workspaces/{id}`) fans one request out
#     into an unbounded per-owner CV-variant join, an unbounded per-owner
#     cover-letter/interview run scan, a submission-record join, and six
#     collection loads off the campaign row.
#   - `history_detail` (`GET /history/{id}`) loads the run, then re-queries
#     every sibling run in the same campaign to build the workspace summary.


def _campaign_with_run(db, user_id: str) -> tuple[Workspace, ToolRun]:
    workspace = Workspace(
        user_id=user_id,
        label="Northwind Robotics — Staff Platform Engineer",
        company="Northwind Robotics",
        role="Staff Platform Engineer",
        status="preparing",
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    run = ToolRun(
        user_id=user_id,
        workspace_id=workspace.id,
        tool_name="resume",
        label="Resume review for Northwind Robotics",
        result_payload={"overall_score": 71},
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return workspace, run


def _query_rows(db) -> list[AnalyticsEvent]:
    return (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_name == "r10_database_query")
        .order_by(AnalyticsEvent.created_at)
        .all()
    )


def test_campaign_and_run_detail_reads_emit_bounded_query_families(
    client, auth_headers, test_user, db
):
    workspace, run = _campaign_with_run(db, test_user.id)

    for _ in range(25):
        assert (
            client.get(
                f"/api/v1/history/workspaces/{workspace.id}", headers=auth_headers
            ).status_code
            == 200
        )
        assert (
            client.get(f"/api/v1/history/{run.id}", headers=auth_headers).status_code == 200
        )

    rows = _query_rows(db)
    assert sorted(row.operational_dimension for row in rows) == [
        "campaign_detail",
        "history_detail",
    ]
    assert all(row.duration_ms is not None and row.duration_ms >= 0 for row in rows)
    assert all(row.tool_id is None and row.access_mode is None for row in rows)


def test_detail_query_families_carry_no_identifier_content_or_sql(
    client, auth_headers, test_user, db
):
    workspace, run = _campaign_with_run(db, test_user.id)

    assert (
        client.get(
            f"/api/v1/history/workspaces/{workspace.id}", headers=auth_headers
        ).status_code
        == 200
    )
    assert client.get(f"/api/v1/history/{run.id}", headers=auth_headers).status_code == 200

    rows = _query_rows(db)
    assert len(rows) == 2

    forbidden = (
        workspace.id,
        run.id,
        test_user.id,
        test_user.email,
        "Northwind Robotics",
        "Staff Platform Engineer",
        "Resume review for Northwind Robotics",
        "preparing",
    )
    sql_tokens = ("SELECT", "FROM", "JOIN", "WHERE", "ORDER BY", "tool_runs", "workspaces")
    for row in rows:
        recorded = {
            column.name: getattr(row, column.name)
            for column in AnalyticsEvent.__table__.columns
            if column.name != "id"
        }
        text_values = [value for value in recorded.values() if isinstance(value, str)]
        for secret in forbidden:
            assert all(secret not in value for value in text_values), (secret, recorded)
        for token in sql_tokens:
            assert all(token.upper() not in value.upper() for value in text_values), (
                token,
                recorded,
            )
        populated = {
            name for name, value in recorded.items() if value is not None
        }
        assert populated == {
            "event_name",
            "level",
            "duration_ms",
            "operational_dimension",
            "created_at",
        }


@pytest.mark.parametrize(
    "family",
    ["history_list", "workspace_list", "admin_runs", "campaign_detail", "history_detail"],
)
def test_query_family_allowlist_accepts_every_instrumented_family(family):
    event = ActivationEventCreate(
        event_name="r10_database_query", operational_dimension=family, duration_ms=4
    )
    assert event.operational_dimension == family


@pytest.mark.parametrize(
    "family",
    [
        "campaign_detail_v2",
        "history_detail:9f0c-42",
        "SELECT * FROM tool_runs",
        "user_email",
        "",
    ],
)
def test_query_family_allowlist_rejects_an_unknown_family(family):
    with pytest.raises(ValidationError):
        ActivationEventCreate(
            event_name="r10_database_query", operational_dimension=family, duration_ms=4
        )


def test_recording_an_unknown_query_family_writes_no_row(db, caplog):
    record_database_query_timing(db, query_family="listing_scan", started_at=perf_counter())
    assert _query_rows(db) == []
