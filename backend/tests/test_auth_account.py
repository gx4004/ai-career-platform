"""Auth and account correctness (B9): emails, rate-limit body, export, tokens."""

from unittest.mock import AsyncMock, patch

import pytest

from app.auth.security import create_access_token, hash_password
from app.config import settings
from app.models.tool_run import ToolRun
from app.models.user import User

PREFIX = "/api/v1/auth"


def _register(client, email: str, **extra):
    return client.post(
        f"{PREFIX}/register",
        json={"email": email, "password": "secret123", "tos_accepted": True, **extra},
    )


# --- emails are case-insensitive ------------------------------------------------


def test_register_normalises_the_email_and_rejects_a_case_variant_duplicate(client, db):
    first = _register(client, "QA@Example.com")
    assert first.status_code == 201
    assert first.json()["email"] == "qa@example.com"

    second = _register(client, "qa@example.com")
    assert second.status_code == 409

    third = _register(client, "Qa@EXAMPLE.com")
    assert third.status_code == 409
    assert db.query(User).count() == 1


def test_login_works_with_any_capitalisation_of_the_address(client):
    assert _register(client, "qa@example.com").status_code == 201
    client.cookies.clear()

    resp = client.post(
        f"{PREFIX}/login", json={"email": "QA@Example.COM", "password": "secret123"}
    )

    assert resp.status_code == 200
    assert client.get(f"{PREFIX}/me").json()["email"] == "qa@example.com"


def test_login_finds_a_legacy_account_stored_with_capitals(client, db):
    db.add(User(email="Legacy@example.com", hashed_password=hash_password("secret123")))
    db.commit()

    resp = client.post(
        f"{PREFIX}/login", json={"email": "legacy@example.com", "password": "secret123"}
    )

    assert resp.status_code == 200


def test_password_reset_request_matches_the_account_in_any_case(client, test_user, monkeypatch):
    sent: list[str] = []

    async def fake_send(to_email: str, reset_url: str) -> bool:
        sent.append(to_email)
        return True

    monkeypatch.setattr("app.routers.auth.send_password_reset_email", fake_send)

    resp = client.post(
        f"{PREFIX}/password-reset/request", json={"email": "TEST@Example.com"}
    )

    assert resp.status_code == 200
    assert sent == ["test@example.com"]


def test_google_sign_in_links_to_the_existing_account_regardless_of_case(
    client, db, monkeypatch
):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-secret", raising=False)
    monkeypatch.setattr(
        settings, "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback", raising=False
    )
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000", raising=False)
    user = User(email="person@example.com", hashed_password=hash_password("secret123"))
    db.add(user)
    db.commit()

    token = {
        "userinfo": {
            "sub": "g-1",
            "email": "Person@Example.com",
            "email_verified": True,
            "name": "Person",
        }
    }
    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(return_value=token),
    ):
        resp = client.get(f"{PREFIX}/google/callback", follow_redirects=False)

    assert resp.headers["location"].endswith("/dashboard")
    db.refresh(user)
    assert user.google_id == "g-1"


def test_concurrent_duplicate_registration_is_a_409_not_a_500(client, db):
    """Both requests pass the existence check; the unique index decides."""
    from app.routers import auth as auth_router

    real_hash = auth_router.hash_password

    def hash_then_lose_the_race(password):
        db.add(User(email="race@example.com", hashed_password="x"))
        db.commit()
        return real_hash(password)

    with patch.object(auth_router, "hash_password", hash_then_lose_the_race):
        resp = _register(client, "Race@Example.com")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "Email already registered"
    assert db.query(User).count() == 1


# --- rate-limit response ---------------------------------------------------------


def test_rate_limited_response_has_a_stable_body_and_retry_after(client):
    statuses = []
    last = None
    for _ in range(11):
        last = client.post(
            f"{PREFIX}/login", json={"email": "x@example.com", "password": "nope-nope"}
        )
        statuses.append(last.status_code)

    assert statuses[-1] == 429
    body = last.json()
    assert body["code"] == "rate_limited"
    assert isinstance(body["message"], str) and "try again" in body["message"].lower()
    assert isinstance(body["retry_after"], int) and 1 <= body["retry_after"] <= 60
    assert last.headers["retry-after"] == str(body["retry_after"])
    # Clients that only read `detail` still get the friendly sentence.
    assert body["detail"] == body["message"]


# --- tokens ------------------------------------------------------------------------


def test_password_reset_revokes_access_tokens_issued_before_it(client, db, test_user):
    old_access = create_access_token(test_user.id, test_user.token_version)
    headers = {"Authorization": f"Bearer {old_access}"}
    assert client.get(f"{PREFIX}/me", headers=headers).status_code == 200

    from app.auth.security import create_password_reset_token

    reset = create_password_reset_token(test_user.email, test_user.hashed_password)
    confirm = client.post(
        f"{PREFIX}/password-reset/confirm",
        json={"token": reset, "new_password": "brand-new-pass"},
    )
    assert confirm.status_code == 200

    assert client.get(f"{PREFIX}/me", headers=headers).status_code == 401


def test_logout_revokes_the_refresh_token_that_was_issued(client, test_user):
    login = client.post(
        f"{PREFIX}/login", json={"email": "test@example.com", "password": "password123"}
    )
    refresh_cookie = next(
        v for k, v in login.headers.multi_items() if k == "set-cookie" and "cw_refresh=" in v
    )
    refresh_value = refresh_cookie.split("cw_refresh=", 1)[1].split(";", 1)[0]

    access_value = client.cookies.get("cw_access")
    assert client.post(f"{PREFIX}/logout").status_code == 200
    client.cookies.clear()
    assert (
        client.get(f"{PREFIX}/me", headers={"Authorization": f"Bearer {access_value}"}).status_code
        == 401
    )
    client.cookies.set("cw_refresh", refresh_value, path="/api/v1/auth/refresh")

    assert client.post(f"{PREFIX}/refresh").status_code == 401


# --- providers ---------------------------------------------------------------------


def test_providers_lists_google_only_when_it_can_actually_sign_in(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", "", raising=False)
    assert client.get(f"{PREFIX}/providers").json()["providers"] == []

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret", raising=False)
    monkeypatch.setattr(
        settings, "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback",
        raising=False,
    )
    assert client.get(f"{PREFIX}/providers").json()["providers"] == ["google"]


def test_google_callback_with_partial_configuration_returns_to_the_login_page(
    client, monkeypatch
):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", "", raising=False)

    resp = client.get("/api/v1/auth/google/callback", follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert resp.headers["location"].endswith("/login?oauth_error=not_configured")


def test_google_login_without_configuration_returns_to_the_login_page(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "", raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000", raising=False)

    resp = client.get(f"{PREFIX}/google/login", follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert resp.headers["location"] == "http://localhost:3000/login?oauth_error=not_configured"


# --- inputs ------------------------------------------------------------------------


def test_register_bounds_the_display_name(client):
    resp = _register(client, "long@example.com", full_name="N" * 201)
    assert resp.status_code == 422

    padded = _register(client, "padded@example.com", full_name="N" * 200 + "   ")
    assert padded.status_code == 201

    ok = _register(client, "fine@example.com", full_name="  Ada Lovelace  ")
    assert ok.status_code == 201
    assert ok.json()["full_name"] == "Ada Lovelace"


@pytest.mark.parametrize(
    "email",
    [
        "someone@sub.mailinator.com",
        "someone@a.b.guerrillamail.com",
        "someone@MAILINATOR.com",
    ],
)
def test_disposable_block_covers_subdomains(client, email):
    resp = _register(client, email)
    assert resp.status_code == 400
    assert "Disposable" in resp.json()["detail"]


def test_disposable_block_does_not_catch_lookalike_domains(client):
    assert _register(client, "someone@notmailinator.com").status_code == 201


def test_dev_environment_surfaces_the_reset_link_in_the_log(caplog, monkeypatch):
    import asyncio
    import logging

    from app.services.email_service import send_password_reset_email

    monkeypatch.setattr(settings, "RESEND_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development", raising=False)
    url = "http://localhost:3000/reset-password#token=abc"

    with caplog.at_level(logging.INFO):
        sent = asyncio.run(send_password_reset_email("dev@example.com", url))

    assert sent is False
    assert url in caplog.text

    # A deployment that forgot ENVIRONMENT (default "development") but serves
    # https must not write the bearer link to its logs.
    caplog.clear()
    https_url = "https://app.example.com/reset-password#token=secret"
    with caplog.at_level(logging.INFO):
        asyncio.run(send_password_reset_email("dev@example.com", https_url))
    assert https_url not in caplog.text

    caplog.clear()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production", raising=False)
    with caplog.at_level(logging.INFO):
        asyncio.run(send_password_reset_email("dev@example.com", url))
    assert url not in caplog.text


# --- application details URL validation -------------------------------------------


@pytest.mark.parametrize(
    "field,value",
    [
        ("linkedin", "javascript:alert(1)"),
        ("website", "data:text/html,<script>1</script>"),
        ("website", "ftp://example.com/x"),
        ("linkedin", "JaVaScRiPt:alert(1)"),
        ("linkedin", "javascript:1/alert(1)"),
        ("website", "javascript:0"),
        ("website", "data:1/x"),
        ("website", "vbscript:1/x"),
        ("email", "not-an-email"),
    ],
)
def test_application_details_refuse_unsafe_links_and_bad_email(
    client, auth_headers, field, value
):
    resp = client.put(
        "/api/v1/applications/details", json={field: value}, headers=auth_headers
    )
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"linkedin": "https://linkedin.com/in/ada", "website": "http://ada.dev"},
        {"linkedin": "linkedin.com/in/ada", "website": "ada.dev/portfolio"},
        {"website": "localhost:3000/me", "linkedin": "ada.dev:8080/in/ada"},
        {"email": "ada@example.com"},
        {"email": "", "linkedin": "", "website": ""},
    ],
)
def test_application_details_accept_ordinary_values(client, auth_headers, payload):
    resp = client.put("/api/v1/applications/details", json=payload, headers=auth_headers)
    assert resp.status_code == 200, resp.text


# --- linked history ids ------------------------------------------------------------

_RESUME = {
    "resume_text": (
        "Professional Summary\nPython engineer.\nExperience\n- Built APIs.\nSkills\nPython"
    )
}


@pytest.fixture
def resume_llm(mock_ai_result):
    mock_ai_result(
        {
            "summary": {
                "headline": "A useful resume review.",
                "verdict": "Promising",
                "confidence_note": "Directional only.",
            },
            "strengths": ["Clear skills"],
            "issues": [],
        }
    )


def test_another_users_run_id_is_not_kept_as_linked_context(
    client, db, auth_headers, resume_llm
):
    stranger = User(email="stranger@example.com", hashed_password=hash_password("x" * 10))
    db.add(stranger)
    db.commit()
    foreign = ToolRun(user_id=stranger.id, tool_name="resume", label="theirs", result_payload={})
    db.add(foreign)
    db.commit()

    resp = client.post(
        "/api/v1/resume/analyze",
        json={**_RESUME, "workspace_context": {"linked_history_ids": [foreign.id]}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    saved = client.get(f"/api/v1/history/{resp.json()['history_id']}", headers=auth_headers)
    assert saved.status_code == 200
    assert foreign.id not in saved.text


def test_own_run_id_is_still_linked(client, db, auth_headers, resume_llm):
    first = client.post("/api/v1/resume/analyze", json=_RESUME, headers=auth_headers).json()
    second = client.post(
        "/api/v1/resume/analyze",
        json={**_RESUME, "workspace_context": {"linked_history_ids": [first["history_id"]]}},
        headers=auth_headers,
    ).json()

    saved = client.get(f"/api/v1/history/{second['history_id']}", headers=auth_headers)
    assert first["history_id"] in saved.text


# --- export ------------------------------------------------------------------------


def test_export_contains_the_account_and_every_saved_run(
    client, db, test_user, auth_headers, resume_llm
):
    resume = client.post("/api/v1/resume/analyze", json=_RESUME, headers=auth_headers).json()
    run = db.get(ToolRun, resume["history_id"])
    run.is_favorite = True
    db.commit()

    other = User(email="other@example.com", hashed_password=hash_password("x" * 10))
    db.add(other)
    db.commit()
    db.add(ToolRun(user_id=other.id, tool_name="resume", label="not mine", result_payload={}))
    db.commit()

    data = client.get("/api/v1/evidence-profile/export", headers=auth_headers).json()

    assert data["account"]["email"] == test_user.email
    assert data["account"]["full_name"] == test_user.full_name
    assert "hashed_password" not in str(data)
    assert data["runs"]["run_count"] == 1
    exported = data["runs"]["runs"][0]
    assert exported["id"] == resume["history_id"]
    assert exported["tool_name"] == "resume"
    assert exported["is_favorite"] is True
    assert exported["result_payload"]["overall_score"] == resume["overall_score"]


# --- migration -----------------------------------------------------------------------


def _run_email_migration(direction: str, rows: str | None = None, *, upgrade_first: bool = False):
    import importlib.util
    from pathlib import Path

    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    path = next(
        (Path(__file__).parent.parent / "alembic" / "versions").glob("*users_email_case*.py")
    )
    spec = importlib.util.spec_from_file_location("email_case_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL)"))
        conn.execute(
            sa.text(
                "INSERT INTO users VALUES "
                + (
                    rows
                    or "('1','Alice@Example.com'),('2','bob@example.com'),"
                    "('3','Dup@Example.com'),('4','dup@example.com')"
                )
            )
        )
        with Operations.context(MigrationContext.configure(conn)):
            if upgrade_first:
                module.upgrade()
            getattr(module, direction)()
        emails = dict(conn.execute(sa.text("SELECT id, email FROM users")).all())
        indexes = {
            name for (name,) in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type = 'index'"))
        }
    return emails, indexes


def test_migration_lowercases_addresses_and_leaves_colliding_accounts_alone():
    emails, indexes = _run_email_migration("upgrade")

    assert emails["1"] == "alice@example.com"
    assert emails["2"] == "bob@example.com"
    # Two real accounts that only differ by case are not merged or renamed.
    assert (emails["3"], emails["4"]) == ("Dup@Example.com", "dup@example.com")
    assert "uq_users_email_lower" not in indexes


def test_migration_adds_a_case_insensitive_unique_index_and_is_reversible():
    clean = "('1','Alice@Example.com'),('2','bob@example.com')"
    emails, indexes = _run_email_migration("upgrade", clean)
    assert emails["1"] == "alice@example.com"
    assert "uq_users_email_lower" in indexes

    _, after_downgrade = _run_email_migration("downgrade", clean, upgrade_first=True)
    assert "uq_users_email_lower" not in after_downgrade
