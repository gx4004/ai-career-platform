import json

from app.main import (
    JSON_BODY_LIMIT_BYTES,
    MULTIPART_BODY_LIMIT_BYTES,
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
