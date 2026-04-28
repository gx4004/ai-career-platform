from app.main import _scrub_sentry_event


def test_scrub_sentry_event_removes_request_body_and_cookies():
    event = {
        "request": {
            "url": "https://example.com/api/v1/resume/analyze",
            "method": "POST",
            "data": {"resume_text": "secret resume content"},
            "cookies": {"cw_access": "jwt-token"},
        },
    }

    scrubbed = _scrub_sentry_event(event, None)

    assert "data" not in scrubbed["request"]
    assert "cookies" not in scrubbed["request"]


def test_scrub_sentry_event_redacts_sensitive_headers():
    event = {
        "request": {
            "headers": {
                "Authorization": "Bearer abc",
                "Cookie": "cw_access=xyz",
                "X-CSRF-Token": "nonce",
                "Content-Type": "application/json",
                "User-Agent": "test",
            },
        },
    }

    scrubbed = _scrub_sentry_event(event, None)
    headers = scrubbed["request"]["headers"]

    assert headers["Authorization"] == "[scrubbed]"
    assert headers["Cookie"] == "[scrubbed]"
    assert headers["X-CSRF-Token"] == "[scrubbed]"
    assert headers["Content-Type"] == "application/json"
    assert headers["User-Agent"] == "test"


def test_scrub_sentry_event_drops_user_pii():
    event = {
        "user": {
            "id": "u-1",
            "email": "user@example.com",
            "ip_address": "1.2.3.4",
            "username": "user",
        },
    }

    scrubbed = _scrub_sentry_event(event, None)

    assert "email" not in scrubbed["user"]
    assert "ip_address" not in scrubbed["user"]
    assert scrubbed["user"]["id"] == "u-1"
    assert scrubbed["user"]["username"] == "user"


def test_scrub_sentry_event_handles_missing_keys_gracefully():
    event = {}

    scrubbed = _scrub_sentry_event(event, None)

    assert scrubbed == {}


def test_scrub_sentry_event_handles_non_dict_shapes():
    event = {"request": "not-a-dict", "user": ["also", "not", "a", "dict"]}

    scrubbed = _scrub_sentry_event(event, None)

    assert scrubbed["request"] == "not-a-dict"
    assert scrubbed["user"] == ["also", "not", "a", "dict"]
