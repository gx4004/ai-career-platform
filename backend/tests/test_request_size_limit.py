import json

from app.main import (
    JSON_BODY_LIMIT_BYTES,
    MAX_BODY_CHUNKS,
    MULTIPART_BODY_LIMIT_BYTES,
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


def test_declared_json_within_limit_reaches_the_route(client):
    response = client.post(
        "/api/v1/auth/login",
        content=json.dumps({"email": "nobody@example.com", "password": "secret123"}),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 401


def test_multipart_uses_separate_upload_ceiling():
    assert MULTIPART_BODY_LIMIT_BYTES > JSON_BODY_LIMIT_BYTES


# ── the message cap guards bodies without a length, not slow declared uploads ──


async def _drive(pieces: list[bytes], *, declared: int | None) -> tuple[int, int]:
    """POST `pieces` through the middleware to an app that reads the whole body.

    Returns the response status and how many body bytes the app was handed.
    """
    seen = 0

    async def inner(scope, receive, send):
        nonlocal seen
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            seen += len(message.get("body", b""))
            if not message.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    headers = [(b"content-type", b"multipart/form-data; boundary=x")]
    if declared is not None:
        headers.append((b"content-length", str(declared).encode()))
    scope = {"type": "http", "method": "POST", "path": "/upload", "headers": headers}
    queue = [
        {"type": "http.request", "body": piece, "more_body": index < len(pieces) - 1}
        for index, piece in enumerate(pieces)
    ]

    async def receive():
        return queue.pop(0) if queue else {"type": "http.disconnect"}

    statuses: list[int] = []

    async def send(message):
        if message["type"] == "http.response.start":
            statuses.append(message["status"])

    await RequestSizeLimitMiddleware(inner)(scope, receive, send)
    return statuses[0], seen


async def test_a_slow_declared_upload_in_many_small_pieces_is_accepted():
    pieces = [b"x" * 100] * (MAX_BODY_CHUNKS + 904)

    status, seen = await _drive(pieces, declared=100 * len(pieces))

    assert status == 200
    assert seen == 100 * len(pieces)


async def test_a_chunked_body_over_the_message_cap_is_refused():
    status, _ = await _drive([b"x" * 10] * (MAX_BODY_CHUNKS + 904), declared=None)

    assert status == 413


async def test_a_body_longer_than_its_declared_length_is_refused():
    status, seen = await _drive([b"x" * 1000] * 3, declared=1500)

    assert status == 413
    assert seen <= 1500
