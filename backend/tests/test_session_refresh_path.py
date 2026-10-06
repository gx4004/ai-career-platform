"""The session read must see the refresh cookie the browser really sends.

cw_refresh is scoped to /api/v1/auth/refresh, so a browser only sends it to that path and below; the
real Set-Cookie paths from a login are kept here (no hand-set cookies).
"""

PREFIX = "/api/v1"


def _login_then_lose_access(client, test_user):
    resp = client.post(f"{PREFIX}/auth/login", json={"email": "test@example.com", "password": "password123"})
    assert resp.status_code == 200
    paths = {cookie.name: cookie.path for cookie in client.cookies.jar}
    assert paths["cw_refresh"] == "/api/v1/auth/refresh"
    client.cookies.delete("cw_access", path="/api")  # the 30-minute access cookie lapsed


def test_the_refresh_path_session_read_sees_a_lapsed_but_refreshable_session(client, test_user):
    _login_then_lose_access(client, test_user)
    resp = client.get(f"{PREFIX}/auth/refresh/session")
    assert resp.status_code == 200
    assert resp.json() == {"user": None, "refreshable": True}
    assert "set-cookie" not in resp.headers


def test_the_plain_session_read_cannot_see_the_refresh_cookie(client, test_user):
    _login_then_lose_access(client, test_user)
    assert client.get(f"{PREFIX}/auth/session").json() == {"user": None, "refreshable": False}


def test_the_refresh_path_session_read_names_a_live_user(client, test_user):
    client.post(f"{PREFIX}/auth/login", json={"email": "test@example.com", "password": "password123"})
    body = client.get(f"{PREFIX}/auth/refresh/session").json()
    assert body["user"]["email"] == "test@example.com"
    assert body["refreshable"] is False
