from app.models.analytics_event import AnalyticsEvent


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
