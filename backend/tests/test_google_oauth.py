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


def test_signup_rejects_unverified_email(client, db):
    """A brand-new user whose Google email is unverified must not get an account."""
    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(return_value=_token("attacker@example.com", email_verified=False)),
    ):
        resp = client.get(CALLBACK, follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "oauth_error" in resp.headers["location"]
    assert "unverified_email" in resp.headers["location"]
    # Ensure no user was created.
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


def test_signup_accepts_verified_email(client, db):
    with patch(
        "app.routers.google_auth.oauth.google.authorize_access_token",
        new=AsyncMock(return_value=_token("newuser@example.com", email_verified=True)),
    ):
        resp = client.get(CALLBACK, follow_redirects=False)

    assert resp.status_code in (302, 307)
    assert "/dashboard" in resp.headers["location"]
    created = db.query(User).filter(User.email == "newuser@example.com").first()
    assert created is not None
    assert created.google_id == "google-sub-1"


def test_link_accepts_verified_email(client, db, test_user):
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
