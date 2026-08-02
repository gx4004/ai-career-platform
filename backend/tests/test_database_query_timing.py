from app.models.analytics_event import AnalyticsEvent


def test_history_and_workspace_reads_emit_only_bounded_query_families(
    client, auth_headers, db
):
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
