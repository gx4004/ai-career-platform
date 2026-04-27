from app.auth.security import hash_password, verify_password

PREFIX = "/api/v1/auth"


def test_register(client):
    resp = client.post(
        f"{PREFIX}/register",
        json={"email": "new@example.com", "password": "secret123", "full_name": "New", "tos_accepted": True},
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


def test_login(client, test_user):
    resp = client.post(
        f"{PREFIX}/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


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
