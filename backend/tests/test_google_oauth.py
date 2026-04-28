"""Regression tests for Google OAuth email_verified enforcement.

We mock authlib's authorize_access_token so tests don't need a real Google
roundtrip. The callback endpoint must redirect (not raise JSON errors) and
must reject unverified emails on both the link and signup paths.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.models.user import User

CALLBACK = "/api/v1/auth/google/callback"


@pytest.fixture(autouse=True)
def _configure_google(monkeypatch):
    # Ensure OAuth branch is active during tests.
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id", raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:3000", raising=False)


def _token(email: str, sub: str = "google-sub-1", email_verified: bool = True, name: str | None = "Google User"):
    return {"userinfo": {"sub": sub, "email": email, "email_verified": email_verified, "name": name}}


def test_signup_with_unverified_email_does_not_create_account(client, db):
    """Belt-and-braces: even before the new-signup block kicks in, an
    unverified Google email must never produce a User row. After the
    OAuth-signup gate landed, the redirect code is signup_via_email_required
    (the router rejects any new signup, verified or not, until ToS is
    wired into OAuth). The invariant we still care about is: no row was
    created from an unverified Google email."""
    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(return_value=_token("attacker@example.com", email_verified=False)),
    ):
        resp = client.get(CALLBACK, follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "oauth_error" in resp.headers["location"]
    # Crucially: zero rows touched.
    assert db.query(User).filter(User.email == "attacker@example.com").first() is None


def test_link_rejects_unverified_email(client, db, test_user):
    """An existing password-based account must NOT be silently linked when
    the Google email is unverified."""
    assert test_user.google_id is None

    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(
            return_value=_token(test_user.email, sub="attacker-google-sub", email_verified=False)
        ),
    ):
        resp = client.get(CALLBACK, follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "unverified_email" in resp.headers["location"]

    db.refresh(test_user)
    assert test_user.google_id is None, "account was silently linked despite unverified email"


def test_signup_via_oauth_is_blocked_until_tos_flow_exists(client, db):
    """Email registration now requires an explicit ToS checkbox
    (RegisterRequest.tos_accepted). The OAuth callback used to silently
    create new User rows on the first sign-in, which would let visitors
    bypass the consent gate. Until a ToS flow is wired into OAuth, the
    callback must redirect new accounts to the email signup form."""
    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(return_value=_token("brand-new@example.com", email_verified=True)),
    ):
        resp = client.get(CALLBACK, follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "oauth_error=signup_via_email_required" in resp.headers["location"]
    # Crucially, no User row was created.
    assert db.query(User).filter(User.email == "brand-new@example.com").first() is None


def test_link_accepts_verified_email(client, db, test_user):
    """Existing users (account created via email signup, ToS already accepted
    there) can still link a Google identity on first OAuth sign-in. This is
    the intended path for converting an email account to social sign-in."""
    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(
            return_value=_token(test_user.email, sub="linked-google-sub", email_verified=True)
        ),
    ):
        resp = client.get(CALLBACK, follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "/dashboard" in resp.headers["location"]
    db.refresh(test_user)
    assert test_user.google_id == "linked-google-sub"


def test_returning_oauth_user_signs_in_normally(client, db, test_user):
    """A user who previously linked Google (test_user.google_id is set)
    must be able to sign in repeatedly — the new-signup block does not
    apply because the lookup by google_id matches first."""
    test_user.google_id = "returning-google-sub"
    db.commit()

    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(
            return_value=_token(test_user.email, sub="returning-google-sub", email_verified=True)
        ),
    ):
        resp = client.get(CALLBACK, follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "/dashboard" in resp.headers["location"]
    assert "oauth_error" not in resp.headers["location"]
