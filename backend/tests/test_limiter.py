from starlette.requests import Request

from app.limiter import _get_client_ip


def _make_request(*, client_host: str, forwarded_for: str | None = None) -> Request:
    headers = []
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode("utf-8")))

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/auth/login",
        "headers": headers,
        "client": (client_host, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
        "query_string": b"",
    }
    return Request(scope)


def test_limiter_ignores_forwarded_header_by_default(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", False)

    request = _make_request(
        client_host="8.8.8.8",
        forwarded_for="203.0.113.10",
    )

    assert _get_client_ip(request) == "8.8.8.8"


def test_limiter_uses_forwarded_header_for_trusted_proxy(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)

    request = _make_request(
        client_host="127.0.0.1",
        forwarded_for="203.0.113.10, 127.0.0.1",
    )

    assert _get_client_ip(request) == "203.0.113.10"


def test_limiter_ignores_forwarded_header_from_untrusted_proxy(monkeypatch):
    monkeypatch.setattr("app.limiter.settings.TRUST_PROXY_HEADERS", True)

    request = _make_request(
        client_host="8.8.8.8",
        forwarded_for="203.0.113.10",
    )

    assert _get_client_ip(request) == "8.8.8.8"
