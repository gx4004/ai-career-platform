import json

import pytest

from app.main import (
    JSON_BODY_LIMIT_BYTES,
    MULTIPART_BODY_LIMIT_BYTES,
    REQUEST_BODY_MAX_CHUNKS,
    RequestSizeLimitMiddleware,
)


def test_oversized_declared_json_is_rejected_before_password_verification(
    client, monkeypatch
):
    verified = False

    def fail_if_called(*_args, **_kwargs):
        nonlocal verified
        verified = True
        return False

    monkeypatch.setattr("app.routers.auth.verify_password", fail_if_called)
    response = client.post(
        "/api/v1/auth/login",
        content=json.dumps({"email": "user@example.com", "password": "x" * JSON_BODY_LIMIT_BYTES}),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413
    assert response.headers["x-content-type-options"] == "nosniff"
    assert verified is False


@pytest.mark.asyncio
async def test_chunked_json_is_rejected_before_downstream_app_runs():
    downstream_called = False
    sent = []
    messages = iter([
        {"type": "http.request", "body": b"x" * (JSON_BODY_LIMIT_BYTES // 2), "more_body": True},
        {"type": "http.request", "body": b"x" * (JSON_BODY_LIMIT_BYTES // 2 + 1), "more_body": False},
    ])

    async def downstream(_scope, _receive, _send):
        nonlocal downstream_called
        downstream_called = True

    async def receive():
        return next(messages)

    async def send(message):
        sent.append(message)

    middleware = RequestSizeLimitMiddleware(downstream)
    await middleware(
        {
            "type": "http",
            "method": "POST",
            "headers": [(b"content-type", b"application/json")],
        },
        receive,
        send,
    )

    assert downstream_called is False
    assert sent[0]["status"] == 413


@pytest.mark.asyncio
async def test_excessive_tiny_chunks_are_rejected_before_downstream_app_runs():
    downstream_called = False
    sent = []
    delivered = 0

    async def downstream(_scope, _receive, _send):
        nonlocal downstream_called
        downstream_called = True

    async def receive():
        nonlocal delivered
        delivered += 1
        return {"type": "http.request", "body": b"", "more_body": True}

    async def send(message):
        sent.append(message)

    middleware = RequestSizeLimitMiddleware(downstream)
    await middleware(
        {
            "type": "http",
            "method": "POST",
            "headers": [(b"content-type", b"application/json")],
        },
        receive,
        send,
    )

    assert downstream_called is False
    assert delivered == REQUEST_BODY_MAX_CHUNKS + 1
    assert sent[0]["status"] == 413


def test_multipart_uses_separate_upload_ceiling():
    assert MULTIPART_BODY_LIMIT_BYTES > JSON_BODY_LIMIT_BYTES
