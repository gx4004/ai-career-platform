from app.auth.security import hash_password, verify_password
from app.models.user import User

PREFIX = "/api/v1/auth"


def test_register(client):
    resp = client.post(
        f"{PREFIX}/register",
        json={
            "email": "new@example.com",
            "password": "secret123",
            "full_name": "New",
            "tos_accepted": True,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "new@example.com"
    assert data["full_name"] == "New"
    assert data["is_active"] is True
    assert "id" in data


def test_register_duplicate(client, test_user):
    resp = client.post(
        f"{PREFIX}/register",
        json={"email": "test@example.com", "password": "secret123", "tos_accepted": True},
    )
    assert resp.status_code == 409
    assert "already registered" in resp.json()["detail"]


def test_password_inputs_reject_values_over_bcrypt_byte_limit(client):
    too_long_ascii = "a" * 73
    too_long_multibyte = "🔒" * 19

    for password in (too_long_ascii, too_long_multibyte):
        register = client.post(
            f"{PREFIX}/register",
            json={
                "email": "long-password@example.com",
                "password": password,
                "tos_accepted": True,
            },
        )
        reset = client.post(
            f"{PREFIX}/password-reset/confirm",
            json={"token": "invalid", "new_password": password},
        )

        assert register.status_code == 422
        assert reset.status_code == 422


def test_login_accepts_legacy_password_over_current_bcrypt_limit(client, db):
    legacy_password = "a" * 73
    db.add(
        User(
            email="legacy-password@example.com",
            hashed_password=hash_password(legacy_password),
        )
    )
    db.commit()

    response = client.post(
        f"{PREFIX}/login",
        json={"email": "legacy-password@example.com", "password": legacy_password},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_password_inputs_reject_invalid_unicode_as_validation_errors(client):
    payloads = [
        ("/register", '{"email":"unicode@example.com","password":"\\ud800","tos_accepted":true}'),
        ("/login", '{"email":"unicode@example.com","password":"\\ud800"}'),
        ("/password-reset/confirm", '{"token":"invalid","new_password":"\\ud800"}'),
    ]

    for path, body in payloads:
        response = client.post(
            f"{PREFIX}{path}",
            content=body,
            headers={"content-type": "application/json"},
        )

        assert response.status_code == 422
        assert "unicode@example.com" not in response.text
        assert "\\ud800" not in response.text


def test_registration_fails_closed_when_captcha_secret_is_missing(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "CAPTCHA_ENABLED", True)
    monkeypatch.setattr(settings, "CAPTCHA_SECRET_KEY", "")

    response = client.post(
        f"{PREFIX}/register",
        json={
            "email": "captcha@example.com",
            "password": "secret123",
            "tos_accepted": True,
            "captcha_token": "browser-token",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "CAPTCHA verification failed"}


def test_login(client, test_user):
    resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert resp.cookies.get("cw_access")
    assert resp.cookies.get("cw_refresh")


def test_refresh_rotates_cookie_session_without_exposing_tokens(client, test_user):
    login_resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert login_resp.status_code == 200

    resp = client.post(f"{PREFIX}/refresh", json={})

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert resp.cookies.get("cw_access")
    assert resp.cookies.get("cw_refresh")


def test_refresh_requires_http_only_cookie_not_body_token(client, test_user):
    login_resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    body_token = login_resp.cookies.get("cw_refresh")
    assert body_token
    client.cookies.clear()

    resp = client.post(f"{PREFIX}/refresh", json={"refresh_token": body_token})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "No refresh token provided"


def test_login_invalid_password(client, test_user):
    resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "wrong"},
    )
    assert resp.status_code == 401


def test_login_nonexistent(client):
    resp = client.post(
        f"{PREFIX}/login",
        json={"email": "nobody@example.com", "password": "secret"},
    )
    assert resp.status_code == 401


def test_me(client, auth_headers):
    resp = client.get(f"{PREFIX}/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "test@example.com"


def test_me_no_token(client):
    resp = client.get(f"{PREFIX}/me")
    assert resp.status_code in (401, 403)


def test_logout_clears_cookie_backed_session(client, test_user):
    login_resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert login_resp.status_code == 200

    me_resp = client.get(f"{PREFIX}/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "test@example.com"

    logout_resp = client.post(f"{PREFIX}/logout")
    assert logout_resp.status_code == 200
    assert logout_resp.json() == {"ok": True}

    expired_resp = client.get(f"{PREFIX}/me")
    assert expired_resp.status_code in (401, 403)


def test_providers(client):
    resp = client.get(f"{PREFIX}/providers")
    assert resp.status_code == 200
    assert resp.json()["providers"] == []


def test_password_hashing_and_verification():
    hashed = hash_password("secret123")

    assert hashed != "secret123"
    assert hashed.startswith("$2")
    assert verify_password("secret123", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_delete_account_requires_email_confirmation_in_body(client, auth_headers, test_user, db):
    """Server-side guard: the typed-email confirmation the UI shows is also
    required by the API contract, so a direct call with no body or a wrong
    confirmation cannot wipe the account."""
    from app.models.campaign_snapshot import CampaignSubmissionSnapshot
    from app.models.campaign_tracking import CampaignContact, CampaignNote, CampaignTask
    from app.models.tool_run import ToolRun
    from app.models.workspace import Workspace

    # Seed a row so we can confirm "no deletion happens" on rejection.
    workspace = Workspace(user_id=test_user.id, label="Private campaign")
    db.add_all([ToolRun(user_id=test_user.id, tool_name="resume", label="probe"), workspace])
    db.flush()
    db.add_all(
        [
            CampaignTask(workspace_id=workspace.id, title="Private task"),
            CampaignNote(workspace_id=workspace.id, text="Private note"),
            CampaignContact(workspace_id=workspace.id, name="Private contact"),
            CampaignSubmissionSnapshot(
                workspace_id=workspace.id,
                role_key=f"campaign:{workspace.id}",
                content_json="{}",
                content_sha256="0" * 64,
            ),
        ]
    )
    db.commit()
    workspace_id = workspace.id
    pre_count = db.query(ToolRun).filter(ToolRun.user_id == test_user.id).count()
    assert pre_count == 1

    # Wrong confirmation → 400, no rows touched, account intact.
    resp = client.post(
        f"{PREFIX}/me/delete",
        json={"confirmation": "not-the-email@example.com"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "match" in resp.json()["detail"].lower()
    assert db.query(ToolRun).filter(ToolRun.user_id == test_user.id).count() == pre_count

    # Right confirmation (case-insensitive) → 204 and full erasure.
    resp = client.post(
        f"{PREFIX}/me/delete",
        json={"confirmation": "TEST@Example.COM"},
        headers=auth_headers,
    )
    assert resp.status_code == 204
    assert db.query(ToolRun).filter(ToolRun.user_id == test_user.id).count() == 0
    assert db.query(CampaignTask).filter_by(workspace_id=workspace_id).count() == 0
    assert db.query(CampaignNote).filter_by(workspace_id=workspace_id).count() == 0
    assert db.query(CampaignContact).filter_by(workspace_id=workspace_id).count() == 0
    assert db.query(CampaignSubmissionSnapshot).filter_by(workspace_id=workspace_id).count() == 0


def test_delete_account_requires_authentication(client):
    """Direct calls without a session cookie or bearer must be rejected."""
    resp = client.post(f"{PREFIX}/me/delete", json={"confirmation": "anyone@example.com"})
    assert resp.status_code in (401, 403)


def test_password_reset_request_schedules_email_as_background_task(client, test_user, monkeypatch):
    sent: list[tuple[str, str]] = []

    async def fake_send(to_email: str, reset_url: str) -> bool:
        sent.append((to_email, reset_url))
        return True

    monkeypatch.setattr("app.routers.auth.send_password_reset_email", fake_send)

    existing_resp = client.post(
        f"{PREFIX}/password-reset/request",
        json={"email": test_user.email},
    )
    nobody_resp = client.post(
        f"{PREFIX}/password-reset/request",
        json={"email": "nobody@example.com"},
    )

    assert existing_resp.status_code == 200
    assert nobody_resp.status_code == 200
    assert existing_resp.json() == nobody_resp.json()

    assert len(sent) == 1
    assert sent[0][0] == test_user.email
    assert "/reset-password#token=" in sent[0][1]
    assert "?token=" not in sent[0][1]


async def test_password_reset_email_payload_includes_plain_text_body(monkeypatch):
    from app.config import settings
    from app.services import email_service

    captured: dict = {}

    class FakeEmails:
        @staticmethod
        def send(payload):
            captured.update(payload)

    class FakeResend:
        api_key = ""
        Emails = FakeEmails

    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(settings, "PASSWORD_RESET_REPLY_TO", "support@example.com")

    import sys

    monkeypatch.setitem(sys.modules, "resend", FakeResend)

    result = await email_service.send_password_reset_email(
        "user@example.com", "https://example.com/reset?token=x"
    )

    assert result is True
    assert "html" in captured
    assert "text" in captured
    assert captured["text"]
    assert "https://example.com/reset?token=x" in captured["text"]
    assert captured["reply_to"] == ["support@example.com"]


async def test_password_reset_email_omits_reply_to_when_unset(monkeypatch):
    from app.config import settings
    from app.services import email_service

    captured: dict = {}

    class FakeEmails:
        @staticmethod
        def send(payload):
            captured.update(payload)

    class FakeResend:
        api_key = ""
        Emails = FakeEmails

    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(settings, "PASSWORD_RESET_REPLY_TO", "")

    import sys

    monkeypatch.setitem(sys.modules, "resend", FakeResend)

    await email_service.send_password_reset_email(
        "user@example.com", "https://example.com/reset?token=x"
    )

    assert "reply_to" not in captured


async def test_password_reset_email_failure_captures_sentry_without_logging_email(
    monkeypatch, caplog
):
    from app.config import settings
    from app.services import email_service

    captured: list[tuple[str, str]] = []

    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.services.email_service.sentry_sdk.capture_message",
        lambda message, level: captured.append((message, level)),
    )

    def boom(to_email: str, reset_url: str) -> None:
        raise RuntimeError("resend down")

    monkeypatch.setattr(email_service, "_send_resend_sync", boom)

    result = await email_service.send_password_reset_email(
        "user@example.com", "https://example.com/reset?token=x"
    )

    assert result is False
    assert captured == [("Password reset email delivery failed", "error")]
    assert "user@example.com" not in caplog.text


def test_login_blocks_deactivated_user(client, test_user, db):
    test_user.is_active = False
    db.add(test_user)
    db.commit()

    resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert resp.status_code == 403
    assert "deactivated" in resp.json()["detail"].lower()
    assert "cw_access" not in resp.cookies
    assert "cw_refresh" not in resp.cookies


def test_refresh_blocks_deactivated_user(client, test_user, db):
    login_resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert login_resp.status_code == 200

    test_user.is_active = False
    db.add(test_user)
    db.commit()

    resp = client.post(f"{PREFIX}/refresh")
    assert resp.status_code == 403
    assert "deactivated" in resp.json()["detail"].lower()


def test_optional_auth_treats_bad_cookie_as_guest(db):
    """A malformed access cookie must degrade to guest, not 401 — tool
    routers depend on this fall-through for the guest-demo path."""
    from starlette.requests import Request

    from app.auth.security import get_optional_current_user

    scope = {
        "type": "http",
        "headers": [(b"cookie", b"cw_access=this-is-not-a-valid-jwt")],
    }
    req = Request(scope)

    result = get_optional_current_user(req, credentials=None, db=db)
    assert result is None


def test_optional_auth_returns_none_for_inactive_user(db, test_user):
    """An access cookie for a deactivated account also degrades to guest."""
    from starlette.requests import Request

    from app.auth.security import create_access_token, get_optional_current_user

    test_user.is_active = False
    db.add(test_user)
    db.commit()

    token = create_access_token(test_user.id)
    scope = {
        "type": "http",
        "headers": [(b"cookie", f"cw_access={token}".encode())],
    }
    req = Request(scope)

    result = get_optional_current_user(req, credentials=None, db=db)
    assert result is None
