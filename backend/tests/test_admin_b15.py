"""B15: the data the admin pages need, tested at the HTTP seam.

GET /admin/users filters by role on the server (before counting and paging), and
GET /admin/stats carries a 14-day run series (UTC days, oldest first, every day
present with zeros), so the dashboard no longer walks the run list itself.
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta

from app.auth.security import create_access_token, hash_password
from app.models.tool_run import ToolRun
from app.models.user import User

USERS = "/api/v1/admin/users"
STATS = "/api/v1/admin/stats"


def _bearer(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.token_version)}"}


def _user(db, email: str, *, admin: bool = False) -> User:
    user = User(email=email, hashed_password=hash_password("password123"), is_admin=admin)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _run(db, user: User, created_at: datetime, tool: str = "resume") -> None:
    db.add(ToolRun(user_id=user.id, tool_name=tool, result_payload={}, created_at=created_at))
    db.commit()


# ── Access ───────────────────────────────────────────────────────────────────


def test_the_admin_data_is_for_admins_only(client, db):
    member = _user(db, "member@example.com")
    for path in (f"{USERS}?is_admin=true", STATS):
        assert client.get(path).status_code == 401
        assert client.get(path, headers=_bearer(member)).status_code == 403


# ── Users: role filter ───────────────────────────────────────────────────────


def test_admins_only_filters_every_page_and_counts_the_filtered_set(client, db):
    boss = _user(db, "boss@example.com", admin=True)
    for index in range(5):
        _user(db, f"member{index}@example.com")
    _user(db, "second-admin@example.com", admin=True)
    _user(db, "third-admin@example.com", admin=True)

    first = client.get(f"{USERS}?is_admin=true&page=1&page_size=2", headers=_bearer(boss)).json()
    second = client.get(f"{USERS}?is_admin=true&page=2&page_size=2", headers=_bearer(boss)).json()

    assert first["total"] == 3
    assert second["total"] == 3
    emails = [item["email"] for item in first["items"] + second["items"]]
    assert sorted(emails) == ["boss@example.com", "second-admin@example.com", "third-admin@example.com"]
    assert all(item["is_admin"] for item in first["items"] + second["items"])


def test_members_only_and_no_filter(client, db):
    boss = _user(db, "boss@example.com", admin=True)
    for index in range(4):
        _user(db, f"member{index}@example.com")

    members = client.get(f"{USERS}?is_admin=false", headers=_bearer(boss)).json()
    everyone = client.get(USERS, headers=_bearer(boss)).json()

    assert members["total"] == 4
    assert not any(item["is_admin"] for item in members["items"])
    assert everyone["total"] == 5


def test_the_role_filter_combines_with_the_email_search(client, db):
    boss = _user(db, "boss@example.com", admin=True)
    _user(db, "ada@acme.example", admin=True)
    _user(db, "bob@acme.example")
    _user(db, "cy@other.example", admin=True)

    body = client.get(f"{USERS}?is_admin=true&q=acme", headers=_bearer(boss)).json()

    assert body["total"] == 1
    assert [item["email"] for item in body["items"]] == ["ada@acme.example"]


# ── Stats: runs by day ───────────────────────────────────────────────────────


def _noon(day) -> datetime:
    return datetime.combine(day, time(12, 0), tzinfo=UTC)


def test_runs_by_day_is_the_last_14_utc_days_with_zeros_and_today_counted(client, db):
    boss = _user(db, "boss@example.com", admin=True)
    today = datetime.now(UTC).date()
    _run(db, boss, datetime.now(UTC))  # today
    _run(db, boss, datetime.now(UTC), tool="job-match")  # today
    _run(db, boss, _noon(today - timedelta(days=3)))
    _run(db, boss, _noon(today - timedelta(days=13)))  # the oldest day in the window
    _run(db, boss, _noon(today - timedelta(days=14)))  # one day too old
    _run(db, boss, _noon(today - timedelta(days=40)))

    series = client.get(STATS, headers=_bearer(boss)).json()["runs_by_day"]

    expected_dates = [(today - timedelta(days=offset)).isoformat() for offset in range(13, -1, -1)]
    assert [day["date"] for day in series] == expected_dates
    counts = {day["date"]: day["count"] for day in series}
    assert counts[today.isoformat()] == 2
    assert counts[(today - timedelta(days=3)).isoformat()] == 1
    assert counts[(today - timedelta(days=13)).isoformat()] == 1
    assert sum(counts.values()) == 4
    assert list(counts.values()).count(0) == 11


def test_runs_by_day_is_fourteen_zero_days_when_nothing_ran(client, db):
    boss = _user(db, "boss@example.com", admin=True)

    series = client.get(STATS, headers=_bearer(boss)).json()["runs_by_day"]

    assert len(series) == 14
    assert series[-1]["date"] == datetime.now(UTC).date().isoformat()
    assert all(day["count"] == 0 for day in series)
