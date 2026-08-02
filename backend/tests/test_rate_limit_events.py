from app.services.rate_limit_events import rate_limit_route_family


def test_rate_limit_paths_collapse_to_bounded_families():
    assert rate_limit_route_family("/api/v1/auth/login") == "auth"
    assert rate_limit_route_family("/api/v1/resume/analyze") == "tools"
    assert rate_limit_route_family("/api/v1/history/workspaces/private-id/tasks") == "campaigns"
    assert rate_limit_route_family("/api/v1/packets/private-id/accept") == "queue"
    assert rate_limit_route_family("/unexpected/private/path") == "other"
