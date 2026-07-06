from app.config import settings

AUTH_PREFIX = "/api/v1/auth"
ALLOWED_ORIGIN = settings.FRONTEND_URL
DISALLOWED_ORIGIN = "https://attacker.example"


def _preflight(client, path: str, *, origin: str, method: str, headers: str):
    return client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": headers,
        },
    )


def test_allowed_frontend_origin_can_preflight_cookie_authenticated_mutations(client):
    response = _preflight(
        client,
        f"{AUTH_PREFIX}/me/delete",
        origin=ALLOWED_ORIGIN,
        method="POST",
        headers="content-type,authorization",
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "POST" in response.headers["access-control-allow-methods"]
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_untrusted_origin_cannot_preflight_json_or_authorization_mutations(client):
    response = _preflight(
        client,
        f"{AUTH_PREFIX}/me/delete",
        origin=DISALLOWED_ORIGIN,
        method="POST",
        headers="content-type,authorization",
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
    assert response.headers["access-control-allow-credentials"] == "true"


def test_allowed_origin_never_replaces_endpoint_authorization(client, test_user, db):
    response = client.post(
        f"{AUTH_PREFIX}/me/delete",
        json={"confirmation": test_user.email},
        headers={"Origin": ALLOWED_ORIGIN},
    )

    assert response.status_code in (401, 403)
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert db.get(type(test_user), test_user.id) is not None


def test_simple_cross_origin_body_cannot_reach_json_account_deletion(
    client, test_user, db
):
    login = client.post(
        f"{AUTH_PREFIX}/login",
        json={"email": test_user.email, "password": "password123"},
    )
    assert login.status_code == 200

    response = client.post(
        f"{AUTH_PREFIX}/me/delete",
        content=f'{{"confirmation":"{test_user.email}"}}',
        headers={
            "Origin": DISALLOWED_ORIGIN,
            "Content-Type": "text/plain",
        },
    )

    assert response.status_code == 422
    assert "access-control-allow-origin" not in response.headers
    assert db.get(type(test_user), test_user.id) is not None


def test_bodyless_cross_origin_logout_reaches_cookie_deletion(client, test_user):
    login = client.post(
        f"{AUTH_PREFIX}/login",
        json={"email": test_user.email, "password": "password123"},
    )
    assert login.status_code == 200

    response = client.post(
        f"{AUTH_PREFIX}/logout",
        headers={
            "Origin": DISALLOWED_ORIGIN,
            "Content-Type": "text/plain",
        },
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
    set_cookie_headers = response.headers.get_list("set-cookie")
    assert any(
        header.startswith("cw_access=") and "Max-Age=0" in header
        for header in set_cookie_headers
    )
    assert any(
        header.startswith("cw_refresh=") and "Max-Age=0" in header
        for header in set_cookie_headers
    )


def test_login_from_allowed_origin_sets_lax_path_scoped_http_only_cookies(
    client, test_user
):
    response = client.post(
        f"{AUTH_PREFIX}/login",
        json={"email": test_user.email, "password": "password123"},
        headers={"Origin": ALLOWED_ORIGIN},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"

    set_cookie_headers = response.headers.get_list("set-cookie")
    access_cookie = next(
        header for header in set_cookie_headers if header.startswith("cw_access=")
    )
    refresh_cookie = next(
        header for header in set_cookie_headers if header.startswith("cw_refresh=")
    )
    for header in (access_cookie, refresh_cookie):
        assert "HttpOnly" in header
        assert "SameSite=lax" in header
    assert "Path=/api;" in access_cookie
    assert "Path=/api/v1/auth/refresh;" in refresh_cookie


def test_production_login_adds_secure_without_changing_lax_or_paths(
    client, test_user, monkeypatch
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    response = client.post(
        f"{AUTH_PREFIX}/login",
        json={"email": test_user.email, "password": "password123"},
    )

    assert response.status_code == 200
    set_cookie_headers = response.headers.get_list("set-cookie")
    access_cookie = next(
        header for header in set_cookie_headers if header.startswith("cw_access=")
    )
    refresh_cookie = next(
        header for header in set_cookie_headers if header.startswith("cw_refresh=")
    )
    for header in (access_cookie, refresh_cookie):
        assert "HttpOnly" in header
        assert "Secure" in header
        assert "SameSite=lax" in header
    assert "Path=/api;" in access_cookie
    assert "Path=/api/v1/auth/refresh;" in refresh_cookie
