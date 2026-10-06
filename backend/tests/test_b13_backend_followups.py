"""B13: backend follow-ups the frontend lane asked for, tested at the HTTP seam.

Account identity (PATCH /auth/me, POST /auth/change-password), the
development-only reset link, the anonymous-safe session read, the job-import
paste fallback, and the admin source retry and role audit line.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from jose import jwt

from app.auth.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password_reset_token,
)
from app.config import settings
from app.models.campaign_listing import CampaignListing
from app.models.user import User
from app.models.workspace import Workspace

AUTH = "/api/v1/auth"
IMPORT_URL = "/api/v1/job-posts/import-url"
SOURCES = "/api/v1/admin/discovery-sources"
ADMIN_USERS = "/api/v1/admin/users"


def _bearer(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.token_version)}"}


def _user(db, email: str, *, password: str | None = "password123", admin: bool = False) -> User:
    user = User(
        email=email,
        hashed_password=hash_password(password) if password else None,
        is_admin=admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── PATCH /auth/me ──────────────────────────────────────────────────────────


def test_profile_update_trims_the_name_and_normalises_the_email(client, test_user):
    resp = client.patch(
        f"{AUTH}/me",
        headers=_bearer(test_user),
        json={"full_name": "  Ada Lovelace  ", "email": "  Ada@Example.COM "},
    )

    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Ada Lovelace"
    assert resp.json()["email"] == "ada@example.com"
    me = client.get(f"{AUTH}/me", headers=_bearer(test_user)).json()
    assert (me["full_name"], me["email"]) == ("Ada Lovelace", "ada@example.com")
    # The new address signs in; the old one no longer does.
    client.cookies.clear()
    assert (
        client.post(f"{AUTH}/login", json={"email": "ADA@example.com", "password": "password123"})
        .status_code
        == 200
    )
    assert (
        client.post(f"{AUTH}/login", json={"email": "test@example.com", "password": "password123"})
        .status_code
        == 401
    )


def test_profile_update_can_change_only_the_name_and_clear_it(client, test_user):
    resp = client.patch(f"{AUTH}/me", headers=_bearer(test_user), json={"full_name": "   "})

    assert resp.status_code == 200
    assert resp.json()["full_name"] is None
    assert resp.json()["email"] == "test@example.com"


def test_profile_update_refuses_an_address_another_account_holds_in_any_case(
    client, db, test_user
):
    _user(db, "taken@example.com")

    resp = client.patch(f"{AUTH}/me", headers=_bearer(test_user), json={"email": "Taken@EXAMPLE.com"})

    assert resp.status_code == 409
    db.refresh(test_user)
    assert test_user.email == "test@example.com"


def test_profile_update_to_a_capitalisation_of_the_own_address_is_not_a_conflict(
    client, test_user
):
    resp = client.patch(f"{AUTH}/me", headers=_bearer(test_user), json={"email": "TEST@example.com"})

    assert resp.status_code == 200
    assert resp.json()["email"] == "test@example.com"


def test_profile_update_applies_the_disposable_email_rule(client, db, test_user):
    resp = client.patch(
        f"{AUTH}/me", headers=_bearer(test_user), json={"email": "someone@sub.mailinator.com"}
    )

    assert resp.status_code == 400
    assert "Disposable" in resp.json()["detail"]
    db.refresh(test_user)
    assert test_user.email == "test@example.com"


@pytest.mark.parametrize(
    "body",
    [{}, {"email": "not-an-address"}, {"full_name": "x" * 201}, {"is_admin": True}],
)
def test_profile_update_rejects_invalid_or_empty_bodies(client, db, test_user, body):
    resp = client.patch(f"{AUTH}/me", headers=_bearer(test_user), json=body)

    assert resp.status_code == 422
    db.refresh(test_user)
    assert test_user.is_admin is False


def test_profile_update_requires_a_session(client):
    assert client.patch(f"{AUTH}/me", json={"full_name": "Anon"}).status_code == 401


# ── POST /auth/change-password ────────────────────────────────────────────────


def _login(client, email: str, password: str) -> httpx.Response:
    return client.post(f"{AUTH}/login", json={"email": email, "password": password})


def test_change_password_keeps_this_session_and_ends_every_other(client, db, test_user):
    other_session = _bearer(test_user)
    assert _login(client, "test@example.com", "password123").status_code == 200

    resp = client.post(
        f"{AUTH}/change-password",
        json={"current_password": "password123", "new_password": "a-better-secret"},
    )

    assert resp.status_code == 200
    # This browser's renewed cookie still works; a copy of the old token does not.
    assert client.get(f"{AUTH}/me").status_code == 200
    assert client.get(f"{AUTH}/me", headers=other_session).status_code == 401
    client.cookies.clear()
    assert _login(client, "test@example.com", "password123").status_code == 401
    assert _login(client, "test@example.com", "a-better-secret").status_code == 200


def test_change_password_with_a_wrong_current_password_is_refused_without_signing_out(
    client, db, test_user
):
    headers = _bearer(test_user)
    resp = client.post(
        f"{AUTH}/change-password",
        headers=headers,
        json={"current_password": "wrong-password", "new_password": "a-better-secret"},
    )

    # A 400, not a 401: the client treats a 401 as an expired session.
    assert resp.status_code == 400
    assert client.get(f"{AUTH}/me", headers=headers).status_code == 200
    assert _login(client, "test@example.com", "password123").status_code == 200


def test_change_password_validates_the_new_password(client, test_user):
    resp = client.post(
        f"{AUTH}/change-password",
        headers=_bearer(test_user),
        json={"current_password": "password123", "new_password": "short"},
    )

    assert resp.status_code == 422


def test_change_password_for_an_account_without_a_password_points_to_reset(client, db):
    google_only = _user(db, "google@example.com", password=None)

    resp = client.post(
        f"{AUTH}/change-password",
        headers=_bearer(google_only),
        json={"current_password": "anything-at-all", "new_password": "a-better-secret"},
    )

    assert resp.status_code == 400


def test_change_password_requires_a_session(client):
    resp = client.post(
        f"{AUTH}/change-password",
        json={"current_password": "password123", "new_password": "a-better-secret"},
    )

    assert resp.status_code == 401


def test_change_password_is_rate_limited(client, test_user):
    headers = _bearer(test_user)
    body = {"current_password": "wrong-password", "new_password": "a-better-secret"}
    statuses = [
        client.post(f"{AUTH}/change-password", headers=headers, json=body).status_code
        for _ in range(6)
    ]

    assert statuses[:5] == [400] * 5
    assert statuses[5] == 429


# ── Development-only reset link ───────────────────────────────────────────────


@pytest.fixture
def captured_reset_emails(monkeypatch):
    sent: list[tuple[str, str]] = []

    async def fake_send(to_email: str, reset_url: str) -> bool:
        sent.append((to_email, reset_url))
        return True

    monkeypatch.setattr("app.routers.auth.send_password_reset_email", fake_send)
    return sent


@pytest.fixture
def loopback_client(client):
    """The same app, called from this machine (as the Vite dev proxy does)."""
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, client=("127.0.0.1", 50000))


def test_development_returns_the_same_reset_link_that_is_emailed(
    loopback_client, test_user, monkeypatch, captured_reset_emails
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development", raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000", raising=False)

    resp = loopback_client.post(
        f"{AUTH}/password-reset/request", json={"email": "test@example.com"}
    )

    assert resp.status_code == 200
    dev_url = resp.json()["dev_reset_url"]
    assert dev_url.startswith("http://localhost:3000/reset-password#token=")
    assert captured_reset_emails == [("test@example.com", dev_url)]
    token = dev_url.split("#token=", 1)[1]
    assert verify_password_reset_token(token, test_user.hashed_password) == "test@example.com"


@pytest.mark.parametrize("environment", ["production", "staging", "test"])
def test_no_other_environment_ever_returns_the_reset_link(
    client, test_user, monkeypatch, captured_reset_emails, environment
):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment, raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000", raising=False)

    resp = client.post(f"{AUTH}/password-reset/request", json={"email": "test@example.com"})

    assert resp.status_code == 200
    assert "dev_reset_url" not in resp.json()
    assert "token=" not in resp.text
    assert len(captured_reset_emails) == 1


def test_a_hosted_frontend_never_gets_the_reset_link_even_if_environment_was_left_unset(
    loopback_client, test_user, monkeypatch, captured_reset_emails
):
    # ENVIRONMENT defaults to "development"; a deployment that forgot it serves https.
    monkeypatch.setattr(settings, "ENVIRONMENT", "development", raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com", raising=False)

    resp = loopback_client.post(
        f"{AUTH}/password-reset/request", json={"email": "test@example.com"}
    )

    assert "dev_reset_url" not in resp.json()


def test_a_caller_on_another_machine_never_gets_the_reset_link_even_in_development(
    client, test_user, monkeypatch, captured_reset_emails
):
    # FRONTEND_URL falls back to http://localhost:3000, so a deployment missing both
    # settings (or a dev backend bound to the LAN) must still refuse a remote caller.
    monkeypatch.setattr(settings, "ENVIRONMENT", "development", raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000", raising=False)

    resp = client.post(f"{AUTH}/password-reset/request", json={"email": "test@example.com"})

    assert resp.status_code == 200
    assert "dev_reset_url" not in resp.json()
    assert "token=" not in resp.text
    assert len(captured_reset_emails) == 1


def test_development_reset_for_an_unknown_address_has_no_link(
    loopback_client, monkeypatch, captured_reset_emails
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development", raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000", raising=False)

    resp = loopback_client.post(
        f"{AUTH}/password-reset/request", json={"email": "nobody@example.com"}
    )

    assert resp.status_code == 200
    assert "dev_reset_url" not in resp.json()
    assert captured_reset_emails == []


# ── GET /auth/session ─────────────────────────────────────────────────────────


def test_session_read_is_an_ok_null_for_an_anonymous_visitor(client):
    resp = client.get(f"{AUTH}/session")

    assert resp.status_code == 200
    assert resp.json() == {"user": None, "refreshable": False}
    assert "set-cookie" not in resp.headers


def test_session_read_names_the_signed_in_user(client, test_user):
    assert _login(client, "test@example.com", "password123").status_code == 200

    resp = client.get(f"{AUTH}/session")

    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == "test@example.com"
    assert resp.json()["user"]["id"] == test_user.id
    assert "set-cookie" not in resp.headers


def test_session_read_with_an_expired_access_cookie_is_null_without_refreshing(
    client, test_user
):
    now = datetime.now(UTC)
    expired = jwt.encode(
        {"sub": test_user.id, "exp": now - timedelta(minutes=1), "iat": now - timedelta(hours=1), "tv": 0},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    client.cookies.set("cw_access", expired)

    resp = client.get(f"{AUTH}/session")

    assert resp.status_code == 200
    assert resp.json() == {"user": None, "refreshable": False}
    assert "set-cookie" not in resp.headers


def test_session_read_with_a_revoked_token_is_null(client, db, test_user):
    headers = _bearer(test_user)
    test_user.token_version += 1
    db.commit()

    resp = client.get(f"{AUTH}/session", headers=headers)

    assert resp.status_code == 200
    assert resp.json() == {"user": None, "refreshable": False}


def _expired_access(user: User) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": user.id, "exp": now - timedelta(minutes=1), "iat": now - timedelta(hours=1), "tv": user.token_version},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def test_session_read_says_a_valid_refresh_cookie_can_restore_the_session(client, test_user):
    # A browser signed in before the session hint existed (or one that blocks
    # storage): the access cookie has lapsed, the 7-day refresh cookie has not.
    client.cookies.set("cw_access", _expired_access(test_user))
    client.cookies.set("cw_refresh", create_refresh_token(test_user.id, test_user.token_version))

    resp = client.get(f"{AUTH}/session")

    assert resp.status_code == 200
    assert resp.json() == {"user": None, "refreshable": True}
    assert "set-cookie" not in resp.headers


def test_session_read_with_a_live_access_cookie_is_not_refreshable(client, test_user):
    assert _login(client, "test@example.com", "password123").status_code == 200

    resp = client.get(f"{AUTH}/session")

    assert resp.json()["user"]["id"] == test_user.id
    assert resp.json()["refreshable"] is False


def test_session_read_with_a_revoked_refresh_cookie_is_not_refreshable(client, db, test_user):
    refresh = create_refresh_token(test_user.id, test_user.token_version)
    test_user.token_version += 1
    db.commit()
    client.cookies.set("cw_access", _expired_access(test_user))
    client.cookies.set("cw_refresh", refresh)

    resp = client.get(f"{AUTH}/session")

    assert resp.status_code == 200
    assert resp.json() == {"user": None, "refreshable": False}
    assert "set-cookie" not in resp.headers


@pytest.mark.parametrize("variant", ["expired", "access_type", "garbage", "inactive"])
def test_session_read_with_an_unusable_refresh_cookie_is_not_refreshable(client, db, test_user, variant):
    now = datetime.now(UTC)
    if variant == "expired":
        token = jwt.encode(
            {"sub": test_user.id, "exp": now - timedelta(minutes=1), "iat": now - timedelta(days=8),
             "type": "refresh", "tv": test_user.token_version},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
    elif variant == "access_type":
        token = create_access_token(test_user.id, test_user.token_version)
    elif variant == "garbage":
        token = "not-a-jwt"
    else:
        token = create_refresh_token(test_user.id, test_user.token_version)
        test_user.is_active = False
        db.commit()
    client.cookies.set("cw_refresh", token)

    resp = client.get(f"{AUTH}/session")

    assert resp.status_code == 200
    assert resp.json() == {"user": None, "refreshable": False}


# ── Job import: the paste fallback says so explicitly ─────────────────────────

# The page https://example.com/ serves (the audit's non-job import, tools D18).
EXAMPLE_DOMAIN_PAGE = """<!doctype html><html><head><title>Example Domain</title></head>
<body><div><h1>Example Domain</h1>
<p>This domain is for use in illustrative examples in documents. You may use this domain in
literature without prior coordination or asking for permission.</p>
<p><a href="https://www.iana.org/domains/example">More information...</a></p></div></body></html>"""

JOB_PAGE = """<html><body>
<h1 class="job-title">Backend Engineer</h1><div class="company-name">Acme Corp</div>
<div class="job-description">
We are looking for a Backend Engineer with Python, SQL and FastAPI experience.
You will build APIs, manage databases and deploy to cloud infrastructure.
Requirements: 3+ years of professional experience. Full-time, remote within the EU.
</div></body></html>"""


@pytest.fixture
def fetch_tiers(monkeypatch):
    """Serve both fetch tiers from fixtures; no DNS, no network, no browser."""
    monkeypatch.setattr("app.services.job_scraper._validate_url", lambda _url: None)
    tier1 = AsyncMock(side_effect=httpx.ConnectError("unreachable"))
    tier2 = AsyncMock(side_effect=RuntimeError("browser tier unavailable"))
    monkeypatch.setattr("app.services.job_scraper._fetch_with_httpx", tier1)
    monkeypatch.setattr("app.services.job_scraper._fetch_with_playwright", tier2)
    return tier1, tier2


def test_an_unreadable_page_comes_back_as_an_explicit_paste_fallback(client, fetch_tiers):
    resp = client.post(IMPORT_URL, json={"url": "https://example.com/job"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["readable"] is False
    # No sentence the client could mistake for the posting.
    assert body["job_description"] == ""
    assert body["job_title"] is None and body["company_name"] is None


def test_a_non_job_page_is_not_imported_as_a_job_description(client, fetch_tiers):
    tier1, tier2 = fetch_tiers
    tier1.side_effect = None
    tier1.return_value = EXAMPLE_DOMAIN_PAGE
    tier2.side_effect = None
    tier2.return_value = EXAMPLE_DOMAIN_PAGE

    resp = client.post(IMPORT_URL, json={"url": "https://example.com/"})

    assert resp.status_code == 200
    assert resp.json()["readable"] is False
    assert resp.json()["job_description"] == ""


def test_a_real_posting_is_readable(client, fetch_tiers):
    tier1, _tier2 = fetch_tiers
    tier1.side_effect = None
    tier1.return_value = JOB_PAGE

    resp = client.post(IMPORT_URL, json={"url": "https://example.com/jobs/1"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["readable"] is True
    assert body["job_title"] == "Backend Engineer"
    assert "FastAPI" in body["job_description"]


def _workspace(db, user_id: str, *, applied: bool = False, with_listing: bool = False) -> Workspace:
    workspace = Workspace(user_id=user_id, label="Target role")
    if applied:
        workspace.applied_at = datetime.now(UTC)
    db.add(workspace)
    db.commit()
    if with_listing:
        workspace.listing = CampaignListing(
            workspace_id=workspace.id,
            title="Existing role",
            company="Existing company",
            description="The posting that was sent with the application.",
            source_url="https://example.com/existing",
            retrieved_at=datetime.now(UTC),
        )
        db.commit()
    db.refresh(workspace)
    return workspace


def test_an_unreadable_page_leaves_the_applications_listing_alone(
    client, db, test_user, auth_headers, fetch_tiers
):
    workspace = _workspace(db, test_user.id, with_listing=True)

    resp = client.post(
        IMPORT_URL,
        headers=auth_headers,
        json={"url": "https://example.com/gone", "campaign_id": workspace.id},
    )

    assert resp.status_code == 200
    assert resp.json()["readable"] is False
    assert [listing.title for listing in db.query(CampaignListing).all()] == ["Existing role"]


def test_an_applied_application_refuses_a_new_posting_before_any_fetch(
    client, db, test_user, auth_headers, fetch_tiers
):
    tier1, tier2 = fetch_tiers
    workspace = _workspace(db, test_user.id, applied=True, with_listing=True)

    resp = client.post(
        IMPORT_URL,
        headers=auth_headers,
        json={"url": "https://example.com/jobs/1", "campaign_id": workspace.id},
    )

    assert resp.status_code == 409
    assert tier1.await_count == 0 and tier2.await_count == 0


def test_another_users_application_is_not_found_before_any_fetch(
    client, db, auth_headers, fetch_tiers
):
    tier1, _tier2 = fetch_tiers
    other = _user(db, "other@example.com")
    workspace = _workspace(db, other.id)

    resp = client.post(
        IMPORT_URL,
        headers=auth_headers,
        json={"url": "https://example.com/jobs/1", "campaign_id": workspace.id},
    )

    assert resp.status_code == 404
    assert tier1.await_count == 0


def test_attaching_without_a_session_is_refused_before_any_fetch(client, db, test_user, fetch_tiers):
    tier1, _tier2 = fetch_tiers
    workspace = _workspace(db, test_user.id)

    resp = client.post(IMPORT_URL, json={"url": "https://example.com/jobs/1", "campaign_id": workspace.id})

    assert resp.status_code == 401
    assert tier1.await_count == 0


# ── Admin: retry one source fetch, readable failure ──────────────────────────

_FIXTURES = Path(__file__).parent / "fixtures/ats"


def _serve(monkeypatch, handler):
    requests: list[httpx.Request] = []

    def dns(_host, port, _family, _socktype):
        import socket

        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    def recording(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", dns)
    monkeypatch.setattr(
        "app.services.discovery_fetch.httpx.HTTPTransport",
        lambda **_kwargs: httpx.MockTransport(recording),
    )
    return requests


def test_admin_retry_of_a_dead_board_records_the_status_and_a_readable_reason(
    client, discovery, monkeypatch
):
    source = discovery.source("deadboard")
    admin = discovery.user_headers("admin@example.com", admin=True)
    requests = _serve(monkeypatch, lambda _request: httpx.Response(404))

    resp = client.post(f"{SOURCES}/{source.id}/fetch", headers=admin)

    assert resp.status_code == 200
    body = resp.json()
    assert body["last_outcome"] == "failed: HTTPStatusError 404"
    assert "404" in body["failure_reason"]
    assert body["last_fetched_at"] is not None
    assert len(requests) == 1
    # The registry list says the same.
    item = client.get(SOURCES, headers=admin).json()["items"][0]
    assert (item["last_outcome"], item["failure_reason"]) == (
        body["last_outcome"],
        body["failure_reason"],
    )


def test_admin_retry_of_a_live_board_stores_its_listings(client, discovery, monkeypatch):
    source = discovery.source("examplecorp")
    admin = discovery.user_headers("admin@example.com", admin=True)
    greenhouse = (_FIXTURES / "greenhouse_jobs.json").read_bytes()
    _serve(
        monkeypatch,
        lambda _request: httpx.Response(
            200, content=greenhouse, headers={"content-type": "application/json"}
        ),
    )

    resp = client.post(f"{SOURCES}/{source.id}/fetch", headers=admin)

    assert resp.status_code == 200
    body = resp.json()
    assert body["last_outcome"] == "ok"
    assert body["failure_reason"] is None
    # The fixture board holds one complete posting (see test_discovery_ingestion).
    assert body["listing_count"] == 1


def test_admin_retry_never_fetches_a_source_that_is_not_accepted(client, discovery, monkeypatch):
    pending = discovery.source("pending", allowed=False)
    killed = discovery.source("killed")
    killed.kill_switch = True
    discovery.db.commit()
    admin = discovery.user_headers("admin@example.com", admin=True)
    requests = _serve(monkeypatch, lambda _request: httpx.Response(200))

    assert client.post(f"{SOURCES}/{pending.id}/fetch", headers=admin).status_code == 409
    assert client.post(f"{SOURCES}/{killed.id}/fetch", headers=admin).status_code == 409
    assert requests == []


def test_admin_retry_is_admin_only(client, discovery, auth_headers, monkeypatch):
    source = discovery.source()
    requests = _serve(monkeypatch, lambda _request: httpx.Response(404))

    assert client.post(f"{SOURCES}/{source.id}/fetch").status_code == 401
    assert client.post(f"{SOURCES}/{source.id}/fetch", headers=auth_headers).status_code == 403
    admin = discovery.user_headers("admin@example.com", admin=True)
    assert client.post(f"{SOURCES}/missing/fetch", headers=admin).status_code == 404
    assert requests == []


def test_admin_retry_is_rate_limited(client, discovery, monkeypatch):
    source = discovery.source()
    admin = discovery.user_headers("admin@example.com", admin=True)
    _serve(monkeypatch, lambda _request: httpx.Response(404))

    statuses = [
        client.post(f"{SOURCES}/{source.id}/fetch", headers=admin).status_code for _ in range(7)
    ]

    assert statuses[:6] == [200] * 6
    assert statuses[6] == 429


# ── Admin: who changed a role, and when ──────────────────────────────────────


def test_a_role_change_is_recorded_and_shown_in_the_user_list_and_detail(client, db):
    admin = _user(db, "boss@example.com", admin=True)
    member = _user(db, "member@example.com")
    untouched = _user(db, "quiet@example.com")

    resp = client.patch(
        f"{ADMIN_USERS}/{member.id}/admin", headers=_bearer(admin), json={"is_admin": True}
    )
    assert resp.status_code == 200

    items = {item["email"]: item for item in client.get(ADMIN_USERS, headers=_bearer(admin)).json()["items"]}
    assert items["member@example.com"]["role_changed_by"] == "boss@example.com"
    changed_at = datetime.fromisoformat(items["member@example.com"]["role_changed_at"])
    assert abs(datetime.now(UTC) - changed_at) < timedelta(minutes=1)
    assert items[untouched.email]["role_changed_at"] is None
    assert items[untouched.email]["role_changed_by"] is None

    detail = client.get(f"{ADMIN_USERS}/{member.id}", headers=_bearer(admin)).json()
    assert detail["role_changed_by"] == "boss@example.com"
    assert detail["is_admin"] is True


def test_setting_the_role_a_user_already_has_records_no_audit_line(client, db):
    admin = _user(db, "boss@example.com", admin=True)
    member = _user(db, "member@example.com")
    colleague = _user(db, "colleague@example.com", admin=True)

    for user, role in ((member, False), (colleague, True)):
        resp = client.patch(
            f"{ADMIN_USERS}/{user.id}/admin", headers=_bearer(admin), json={"is_admin": role}
        )
        assert resp.status_code == 200
        detail = client.get(f"{ADMIN_USERS}/{user.id}", headers=_bearer(admin)).json()
        assert (detail["is_admin"], detail["role_changed_at"], detail["role_changed_by"]) == (
            role,
            None,
            None,
        )


def test_a_role_change_by_a_since_deleted_admin_keeps_the_time_but_names_no_one(client, db):
    boss = _user(db, "boss@example.com", admin=True)
    other_admin = _user(db, "other@example.com", admin=True)
    member = _user(db, "member@example.com")
    client.patch(
        f"{ADMIN_USERS}/{member.id}/admin", headers=_bearer(boss), json={"is_admin": True}
    )

    resp = client.post(
        f"{AUTH}/me/delete", headers=_bearer(boss), json={"confirmation": boss.email}
    )
    assert resp.status_code == 204

    detail = client.get(f"{ADMIN_USERS}/{member.id}", headers=_bearer(other_admin)).json()
    assert detail["role_changed_at"] is not None
    assert detail["role_changed_by"] is None


def test_a_refused_endpoint_is_not_guessed_into_a_specific_cause():
    from app.schemas.discovery_sources import describe_failure

    # ValueError comes from more than one place (URL refusal, a malformed header), so
    # the reason names the class instead of claiming one cause.
    assert describe_failure("failed: ValueError") == "The fetch failed (ValueError)."


def test_the_role_audit_migration_is_additive_and_reversible():
    import importlib.util

    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    path = next(
        (Path(__file__).parent.parent / "alembic" / "versions").glob("*users_role_change_audit.py")
    )
    spec = importlib.util.spec_from_file_location("role_audit_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL)"))
        conn.execute(sa.text("INSERT INTO users VALUES ('1', 'kept@example.com')"))
        with Operations.context(MigrationContext.configure(conn)):
            module.upgrade()
            upgraded = {c["name"] for c in sa.inspect(conn).get_columns("users")}
            module.downgrade()
        downgraded = {c["name"] for c in sa.inspect(conn).get_columns("users")}
        rows = conn.execute(sa.text("SELECT id, email FROM users")).all()

    assert {"role_changed_at", "role_changed_by_id"} <= upgraded
    assert downgraded == {"id", "email"}
    assert rows == [("1", "kept@example.com")]
