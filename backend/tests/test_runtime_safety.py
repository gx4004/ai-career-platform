"""B2 runtime and ops safety: behaviour tests at the HTTP seam.

Event-loop tests drive the real ASGI app through httpx's ASGI transport so that
requests genuinely share one event loop, which is what a single uvicorn worker
does. A request that blocks the loop shows up as /health latency.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import bcrypt
import httpx
import pytest
from bs4 import BeautifulSoup
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth.security import hash_password
from app.database import Base, get_db
from app.main import app
from app.models.user import User

PREFIX = "/api/v1"
BACKEND_DIR = Path(__file__).resolve().parents[1]
BLOCK_SECONDS = 0.5
# /health is a SELECT 1; anything near the blocking time means the loop stalled.
# The margin is wide (0.4 of a 0.5 s block): the original serialised at ~0.5 s per
# call, so it still fails there, while a loaded machine does not flake the fixed code.
HEALTH_BUDGET_SECONDS = 0.4


@pytest.fixture
def app_db(tmp_path):
    """A file-backed database with a connection per request, like production.

    The shared in-memory test database funnels every session through one
    connection, which is not safe for requests that genuinely overlap.
    """
    engine = create_engine(f"sqlite:///{tmp_path / 'overlap.db'}")
    Base.metadata.create_all(bind=engine)
    maker = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_db():
        session = maker()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield maker
    app.dependency_overrides.clear()
    engine.dispose()


def _asgi_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("203.0.113.9", 4321)),
        base_url="http://testserver",
    )


async def _health_latency_while(*requests) -> float:
    """Worst /health latency (or event-loop stall) while the requests are in flight.

    /health is probed repeatedly until they finish, and a ticker records how long
    the loop was unavailable, so a stall is caught whatever order the loop
    schedules things in.
    """
    worst = 0.0
    async with _asgi_client() as http:
        tasks = [asyncio.create_task(request(http)) for request in requests]

        async def probe():
            nonlocal worst
            while not all(task.done() for task in tasks):
                started = time.perf_counter()
                response = await http.get(f"{PREFIX}/health")
                worst = max(worst, time.perf_counter() - started)
                assert response.status_code == 200
                await asyncio.sleep(0.02)

        async def ticker():
            nonlocal worst
            while not all(task.done() for task in tasks):
                started = time.perf_counter()
                await asyncio.sleep(0.01)
                worst = max(worst, time.perf_counter() - started - 0.01)

        await asyncio.gather(probe(), ticker())
        await asyncio.gather(*tasks)
    return worst


# ── CON-2: bcrypt off the event loop ──


def _slow_bcrypt(monkeypatch):
    real_hashpw, real_checkpw = bcrypt.hashpw, bcrypt.checkpw

    def hashpw(*args, **kwargs):
        time.sleep(BLOCK_SECONDS)
        return real_hashpw(*args, **kwargs)

    def checkpw(*args, **kwargs):
        time.sleep(BLOCK_SECONDS)
        return real_checkpw(*args, **kwargs)

    monkeypatch.setattr("app.auth.security.bcrypt.hashpw", hashpw)
    monkeypatch.setattr("app.auth.security.bcrypt.checkpw", checkpw)


async def test_health_stays_fast_during_parallel_wrong_password_logins(
    app_db, monkeypatch
):
    with app_db() as session:
        session.add(
            User(email="test@example.com", hashed_password=hash_password("password123"))
        )
        session.commit()
    _slow_bcrypt(monkeypatch)

    def wrong_login(http):
        return http.post(
            f"{PREFIX}/auth/login",
            json={"email": "test@example.com", "password": "wrong-password"},
        )

    latency = await _health_latency_while(wrong_login, wrong_login, wrong_login)

    assert latency < HEALTH_BUDGET_SECONDS


async def test_health_stays_fast_during_parallel_registrations(app_db, monkeypatch):
    _slow_bcrypt(monkeypatch)
    async def register_ok(http, email):
        response = await http.post(
            f"{PREFIX}/auth/register",
            json={
                "email": email,
                "password": "a-long-enough-password",
                "full_name": "New",
                "tos_accepted": True,
            },
        )
        assert response.status_code == 201

    def register(email):
        return lambda http: register_ok(http, email)

    latency = await _health_latency_while(
        *(register(f"new{n}@example.com") for n in range(4))
    )

    assert latency < HEALTH_BUDGET_SECONDS


def test_login_for_unknown_email_still_pays_for_a_password_check(client, monkeypatch):
    checks = []
    real_checkpw = bcrypt.checkpw

    def counting_checkpw(*args, **kwargs):
        checks.append(1)
        return real_checkpw(*args, **kwargs)

    monkeypatch.setattr("app.auth.security.bcrypt.checkpw", counting_checkpw)

    response = client.post(
        f"{PREFIX}/auth/login",
        json={"email": "nobody@example.com", "password": "whatever-password"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}
    assert len(checks) == 1


# ── CON-3: job-URL import off the event loop ──


@pytest.fixture
def public_dns(monkeypatch):
    def fake_getaddrinfo(_host, _port, _family, _socktype):
        return [(0, 0, 0, "", ("93.184.216.34", 0))]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", fake_getaddrinfo)


_JOB_HTML = (
    "<html><body><h1>Backend Engineer</h1><div class='company-name'>Acme</div>"
    "<div class='job-description'>" + "We build APIs with Python and SQL. " * 10 + "</div>"
    "</body></html>"
)


def _import_url(http):
    return http.post(
        f"{PREFIX}/job-posts/import-url", json={"url": "https://jobs.example.com/backend"}
    )


async def test_health_stays_fast_while_a_slow_nameserver_resolves_an_import(
    app_db, monkeypatch
):
    def slow_getaddrinfo(_host, _port, _family, _socktype):
        time.sleep(BLOCK_SECONDS)
        return [(0, 0, 0, "", ("93.184.216.34", 0))]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", slow_getaddrinfo)

    async def fetch(_url, **_kwargs):
        return _JOB_HTML

    monkeypatch.setattr("app.services.job_scraper._fetch_with_httpx", fetch)

    latency = await _health_latency_while(_import_url)

    assert latency < HEALTH_BUDGET_SECONDS


async def test_health_stays_fast_while_an_imported_page_is_parsed(
    app_db, monkeypatch, public_dns
):
    class SlowSoup(BeautifulSoup):
        def __init__(self, *args, **kwargs):
            time.sleep(BLOCK_SECONDS)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.services.job_scraper.BeautifulSoup", SlowSoup)

    async def fetch(_url, **_kwargs):
        return _JOB_HTML

    monkeypatch.setattr("app.services.job_scraper._fetch_with_httpx", fetch)

    latency = await _health_latency_while(_import_url)

    assert latency < HEALTH_BUDGET_SECONDS


def test_import_gives_up_on_a_nameserver_that_never_answers(client, monkeypatch):
    release = threading.Event()

    def hung_getaddrinfo(_host, _port, _family, _socktype):
        release.wait(5)
        return [(0, 0, 0, "", ("93.184.216.34", 0))]

    monkeypatch.setattr("app.services.outbound_target.socket.getaddrinfo", hung_getaddrinfo)
    monkeypatch.setattr("app.services.job_scraper.RESOLVE_DEADLINE_SECONDS", 0.2)

    started = time.perf_counter()
    response = client.post(
        f"{PREFIX}/job-posts/import-url", json={"url": "https://jobs.example.com/backend"}
    )
    elapsed = time.perf_counter() - started
    release.set()

    assert response.status_code == 400
    assert elapsed < 2


def _mock_job_page(monkeypatch, body_bytes: int):
    page = _JOB_HTML + "<!--" + "x" * body_bytes + "-->"

    def handler(_request):
        return httpx.Response(200, headers={"content-type": "text/html"}, text=page)

    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(handler),
    )

    async def no_browser(_url, **_kwargs):
        raise RuntimeError("browser tier unavailable")

    monkeypatch.setattr("app.services.job_scraper._fetch_with_playwright", no_browser)


def test_guests_get_a_smaller_page_cap_than_signed_in_users(
    client, auth_headers, monkeypatch, public_dns
):
    _mock_job_page(monkeypatch, body_bytes=1_500_000)
    body = {"url": "https://jobs.example.com/backend"}

    guest = client.post(f"{PREFIX}/job-posts/import-url", json=body)
    signed_in = client.post(f"{PREFIX}/job-posts/import-url", json=body, headers=auth_headers)

    assert guest.status_code == 200
    assert guest.json()["job_title"] is None  # too big for a guest: paste fallback
    assert signed_in.status_code == 200
    assert signed_in.json()["job_title"] == "Backend Engineer"


def test_guest_import_still_works_for_a_normal_sized_page(client, monkeypatch, public_dns):
    _mock_job_page(monkeypatch, body_bytes=50_000)

    response = client.post(
        f"{PREFIX}/job-posts/import-url", json={"url": "https://jobs.example.com/backend"}
    )

    assert response.status_code == 200
    assert response.json()["job_title"] == "Backend Engineer"


def test_the_browser_tier_inherits_the_guest_page_cap(
    client, auth_headers, monkeypatch, public_dns
):
    """Tier 1 failing for another reason must not let a guest reach the 2 MB default."""
    from app.services.job_scraper import _MAX_RESPONSE_BYTES, GUEST_MAX_RESPONSE_BYTES

    monkeypatch.setattr(
        "app.services.job_scraper.httpx.AsyncHTTPTransport",
        lambda **_kwargs: httpx.MockTransport(lambda _request: httpx.Response(403)),
    )
    caps = []

    async def spy_browser(_url, **kwargs):
        caps.append(kwargs.get("max_response_bytes"))
        return _JOB_HTML

    monkeypatch.setattr("app.services.job_scraper._fetch_with_playwright", spy_browser)
    body = {"url": "https://jobs.example.com/backend"}

    client.post(f"{PREFIX}/job-posts/import-url", json=body)
    client.post(f"{PREFIX}/job-posts/import-url", json=body, headers=auth_headers)

    assert caps == [GUEST_MAX_RESPONSE_BYTES, _MAX_RESPONSE_BYTES]


# ── CON-6: bounded CV parser concurrency ──


async def test_cv_parsing_runs_a_bounded_number_of_isolated_parsers_at_once(monkeypatch):
    from app.services import cv_parser_process

    active = 0
    peak = 0
    lock = threading.Lock()

    def fake_sync(*_args, **_kwargs):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.05)
        with lock:
            active -= 1
        return {"filename": "cv.txt", "extracted_text": "Python", "chars_count": 6}

    monkeypatch.setattr(cv_parser_process, "_run_parser_isolated_sync", fake_sync)

    results = await asyncio.gather(
        *(cv_parser_process.parse_cv_isolated(b"x", "cv.txt", "txt") for _ in range(12))
    )

    assert len(results) == 12
    assert 1 <= peak <= 4


async def test_cv_parsing_does_not_occupy_the_default_executor(monkeypatch):
    from app.services import cv_parser_process

    release = threading.Event()
    default_executor_threads: list[str] = []

    def fake_sync(*_args, **_kwargs):
        default_executor_threads.append(threading.current_thread().name)
        release.wait(2)
        return {"filename": "cv.txt", "extracted_text": "Python", "chars_count": 6}

    monkeypatch.setattr(cv_parser_process, "_run_parser_isolated_sync", fake_sync)

    task = asyncio.create_task(cv_parser_process.parse_cv_isolated(b"x", "cv.txt", "txt"))
    await asyncio.sleep(0.1)
    # The loop's default executor (used by to_thread and credential loads) stays free.
    started = time.perf_counter()
    await asyncio.to_thread(lambda: None)
    assert time.perf_counter() - started < 0.2
    release.set()
    await task

    assert default_executor_threads
    assert not any(name.startswith("asyncio_") for name in default_executor_threads)


# ── ABU-4: chunked request bodies are bounded at the receive seam ──


async def _chunked(total_bytes: int, chunk_bytes: int, prefix: bytes = b""):
    sent = 0
    if prefix:
        sent += len(prefix)
        yield prefix
    while sent < total_bytes:
        size = min(chunk_bytes, total_bytes - sent)
        sent += size
        yield b"x" * size


async def _post_chunked(path: str, body, content_type: str = "application/json"):
    async with _asgi_client() as http:
        return await http.post(path, content=body, headers={"content-type": content_type})


async def test_oversized_chunked_json_body_is_rejected_with_413(app_db):
    response = await _post_chunked(
        f"{PREFIX}/resume/analyze", _chunked(3 * 1024 * 1024, 64 * 1024, b'{"resume_text": "')
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "Request body is too large"}


async def test_chunked_body_with_too_many_tiny_chunks_is_rejected_with_413(app_db):
    response = await _post_chunked(f"{PREFIX}/auth/login", _chunked(5000 * 10, 10))

    assert response.status_code == 413


async def test_oversized_chunked_multipart_body_is_rejected_with_413(app_db):
    response = await _post_chunked(
        f"{PREFIX}/files/parse-cv",
        _chunked(
            12 * 1024 * 1024,
            256 * 1024,
            b'--x\r\nContent-Disposition: form-data; name="file"; filename="cv.pdf"\r\n'
            b"Content-Type: application/pdf\r\n\r\n",
        ),
        content_type="multipart/form-data; boundary=x",
    )

    assert response.status_code == 413


async def test_small_chunked_json_body_still_reaches_the_route(app_db):
    async def body():
        yield b'{"email": "nobody@example.com",'
        yield b' "password": "secret123"}'

    response = await _post_chunked(f"{PREFIX}/auth/login", body())

    assert response.status_code == 401


# ── REL-3: liveness vs readiness ──


def test_live_probe_answers_without_touching_the_database(client, db, monkeypatch):
    def fail_query(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(db, "execute", fail_query)

    response = client.get(f"{PREFIX}/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready_probe_is_ok_when_the_database_answers(client):
    response = client.get(f"{PREFIX}/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"


def test_ready_probe_is_503_when_the_database_is_down(client, db, monkeypatch):
    def fail_query(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(db, "execute", fail_query)

    response = client.get(f"{PREFIX}/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["database"] == "error: RuntimeError"


def test_ready_probe_reports_a_saturated_pool_without_waiting_for_a_connection(
    client, monkeypatch
):
    class SaturatedPool:
        def size(self):
            return 5

        def overflow(self):
            return 10

        def checkedout(self):
            return 15

    monkeypatch.setattr("app.database.engine.pool", SaturatedPool(), raising=False)
    monkeypatch.setattr("app.database.settings.DB_MAX_OVERFLOW", 10)

    started = time.perf_counter()
    response = client.get(f"{PREFIX}/health/ready")

    assert time.perf_counter() - started < 1
    assert response.status_code == 503
    assert response.json()["checks"]["pool"] == "saturated"


def test_the_original_health_route_keeps_working(client):
    assert client.get(f"{PREFIX}/health").status_code == 200


# ── REL-5: no query strings or addresses in request logs; catch-all handler ──


def test_request_log_line_carries_no_query_string_or_address(client, caplog):
    with caplog.at_level(logging.INFO):
        response = client.get(f"{PREFIX}/auth/providers?q=secret-search-term&company=Acme")

    assert response.status_code == 200
    lines = [r.getMessage() for r in caplog.records if r.name == "app.request"]
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["event"] == "http_request"
    assert event["method"] == "GET"
    assert event["path"] == f"{PREFIX}/auth/providers"
    assert event["status"] == 200
    assert isinstance(event["duration_ms"], int)
    everything = " ".join(r.getMessage() for r in caplog.records)
    assert "secret-search-term" not in everything
    assert "testclient" not in everything
    assert "203.0.113" not in everything


@pytest.fixture
def exploding_route():
    async def explode():
        raise RuntimeError("secret internal detail")

    app.add_api_route("/api/v1/_test_explode", explode, methods=["GET"])
    yield "/api/v1/_test_explode"
    app.router.routes[:] = [
        r for r in app.router.routes if getattr(r, "path", "") != "/api/v1/_test_explode"
    ]


def test_unhandled_error_returns_generic_500_and_logs_only_type_and_request_id(
    exploding_route, caplog
):
    with caplog.at_level(logging.INFO):
        with TestClient(app, raise_server_exceptions=False) as http:
            response = http.get(exploding_route)

    assert response.status_code == 500
    request_id = response.headers["x-request-id"]
    # B12 (REL-2): the generic body also names the request id, nothing else.
    assert response.json() == {"detail": "Internal server error", "request_id": request_id}
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "RuntimeError" in text
    assert request_id in text
    assert "secret internal detail" not in text
    assert not any(r.exc_info for r in caplog.records)


# ── start.sh / Dockerfile flags (REL-5, CON-8, ABU-4) ──


def _uvicorn_args_from_start_sh(tmp_path) -> list[str]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    uvicorn = fake_bin / "uvicorn"
    uvicorn.write_text('#!/bin/sh\necho "ARGS: $@"\n')
    uvicorn.chmod(0o755)
    result = subprocess.run(
        ["sh", "start.sh"],
        cwd=BACKEND_DIR,
        env={
            **os.environ,
            "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
            "RUN_MIGRATIONS": "false",
        },
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    line = next(line for line in result.stdout.splitlines() if line.startswith("ARGS: "))
    return line.removeprefix("ARGS: ").split()


def test_start_script_disables_access_logs_and_sets_shutdown_and_concurrency_limits(tmp_path):
    args = _uvicorn_args_from_start_sh(tmp_path)

    assert "--no-access-log" in args
    assert int(args[args.index("--timeout-graceful-shutdown") + 1]) >= 30
    assert int(args[args.index("--limit-concurrency") + 1]) >= 50
    assert "--timeout-keep-alive" in args


def test_dockerfile_default_command_uses_the_same_flag_values_as_the_start_script(tmp_path):
    import re

    start_args = _uvicorn_args_from_start_sh(tmp_path)
    cmd = json.loads(
        re.search(r"^CMD (\[.*\])$", (BACKEND_DIR / "Dockerfile").read_text(), re.M).group(1)
    )

    assert "--no-access-log" in cmd
    for flag in ("--timeout-graceful-shutdown", "--limit-concurrency", "--timeout-keep-alive"):
        assert cmd[cmd.index(flag) + 1] == start_args[start_args.index(flag) + 1], flag


# ── CFG-2: boot-time config validation ──


def _production_settings(**overrides):
    from app.config import Settings

    values = {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "k" * 64,
        "DATABASE_URL": "postgresql://user:pw@db.internal/app",
        "FRONTEND_URL": "https://app.example.com",
        "CORS_ORIGINS": "https://app.example.com",
        "LLM_PROVIDER": "vertex",
        "VERTEX_PROJECT_ID": "my-project",
        "RESEND_API_KEY": "re_test_value",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_a_complete_production_configuration_passes():
    from app.startup_checks import validate_startup_config

    validate_startup_config(_production_settings(), environ={})


def test_development_defaults_pass_without_any_hosted_variables():
    from app.config import Settings
    from app.startup_checks import validate_startup_config

    validate_startup_config(Settings(_env_file=None), environ={})


def test_boot_refuses_the_default_secret_outside_development():
    from app.startup_checks import validate_startup_config

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_startup_config(
            _production_settings(SECRET_KEY="change-me-to-a-random-secret-key"), environ={}
        )


@pytest.mark.parametrize("variable", ["RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME"])
def test_boot_refuses_development_mode_on_a_hosted_platform(variable):
    from app.config import Settings
    from app.startup_checks import validate_startup_config

    with pytest.raises(RuntimeError, match="ENVIRONMENT"):
        validate_startup_config(Settings(_env_file=None), environ={variable: "production"})


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"FRONTEND_URL": "http://localhost:3000"}, "FRONTEND_URL"),
        ({"FRONTEND_URL": "http://127.0.0.1:3000"}, "FRONTEND_URL"),
        (
            {"CORS_ORIGINS": "https://app.example.com,http://localhost:3000"},
            "CORS_ORIGINS",
        ),
        ({"CORS_ORIGINS": "http://localhost:5173,http://localhost:3000"}, "CORS_ORIGINS"),
        ({"LLM_PROVIDER": "vertex", "VERTEX_PROJECT_ID": ""}, "VERTEX_PROJECT_ID"),
        ({"LLM_PROVIDER": "google", "GOOGLE_API_KEY": ""}, "GOOGLE_API_KEY"),
        ({"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": ""}, "ANTHROPIC_API_KEY"),
        ({"RESEND_API_KEY": ""}, "RESEND_API_KEY"),
    ],
)
def test_boot_refuses_incomplete_production_configuration(overrides, message):
    from app.startup_checks import validate_startup_config

    with pytest.raises(RuntimeError, match=message):
        validate_startup_config(_production_settings(**overrides), environ={})


def test_boot_error_lists_every_problem_at_once():
    from app.startup_checks import validate_startup_config

    with pytest.raises(RuntimeError) as excinfo:
        validate_startup_config(
            _production_settings(RESEND_API_KEY="", FRONTEND_URL="http://localhost:3000"),
            environ={},
        )

    assert "RESEND_API_KEY" in str(excinfo.value)
    assert "FRONTEND_URL" in str(excinfo.value)


def test_config_summary_is_redacted():
    from app.startup_checks import redacted_config_summary

    summary = redacted_config_summary(
        _production_settings(SECRET_KEY="super-secret-signing-key-value-0123456789")
    )

    text = json.dumps(summary)
    assert summary["environment"] == "production"
    assert summary["llm_provider"] == "vertex"
    assert summary["resend_configured"] is True
    for secret in ("super-secret", "re_test_value", "user:pw", "my-project"):
        assert secret not in text


def test_production_boot_with_the_default_secret_refuses_to_start():
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in {"SECRET_KEY", "RAILWAY_ENVIRONMENT"}
    }
    env.update(
        {
            "ENVIRONMENT": "production",
            "DATABASE_URL": "postgresql://user:pw@127.0.0.1:1/app",
            "LLM_PROVIDER": "vertex",
            "VERTEX_PROJECT_ID": "p",
            "RESEND_API_KEY": "re_x",
            "FRONTEND_URL": "https://app.example.com",
            "CORS_ORIGINS": "https://app.example.com",
            "ATS_INGESTION_ENABLED": "false",
            "AUTOPILOT_EXPERIMENT_ENABLED": "false",
        }
    )
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=BACKEND_DIR,
        env={**env, "SECRET_KEY": "change-me-to-a-random-secret-key"},
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )

    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


# ── CON-9: supervised schedulers with a leader guard ──


@pytest.fixture
def scheduler_spies(monkeypatch):
    started = []

    def make(name):
        async def scheduler():
            started.append(name)
            await asyncio.sleep(3600)

        return scheduler

    monkeypatch.setattr("app.main.run_discovered_listing_expiry_scheduler", make("expiry"))
    monkeypatch.setattr("app.main.run_ats_ingestion_scheduler", make("ats"))
    return started


def test_schedulers_start_on_the_elected_leader(scheduler_spies, monkeypatch):
    monkeypatch.setattr("app.main.try_acquire_scheduler_leader", lambda: True)

    with TestClient(app):
        time.sleep(0.1)

    assert sorted(scheduler_spies) == ["ats", "expiry"]


def test_schedulers_stay_off_on_a_follower(scheduler_spies, monkeypatch):
    monkeypatch.setattr("app.main.try_acquire_scheduler_leader", lambda: False)

    with TestClient(app):
        time.sleep(0.1)

    assert scheduler_spies == []


def test_a_crashing_scheduler_is_logged_and_does_not_take_the_app_down(
    monkeypatch, caplog
):
    async def crashing():
        raise RuntimeError("scheduler boom")

    async def idle():
        await asyncio.sleep(3600)

    monkeypatch.setattr("app.main.try_acquire_scheduler_leader", lambda: True)
    monkeypatch.setattr("app.main.run_discovered_listing_expiry_scheduler", crashing)
    monkeypatch.setattr("app.main.run_ats_ingestion_scheduler", idle)

    with caplog.at_level(logging.INFO):
        with TestClient(app) as http:
            time.sleep(0.2)
            assert http.get(f"{PREFIX}/health/live").status_code == 200

    text = " ".join(r.getMessage() for r in caplog.records)
    assert "RuntimeError" in text
    assert "scheduler boom" not in text


def test_a_follower_takes_over_when_the_leader_lock_frees(scheduler_spies, monkeypatch):
    """Rolling deploy: the old instance holds the lock while the new one boots."""
    calls = []

    def acquire():
        calls.append(1)
        return len(calls) >= 3

    monkeypatch.setattr("app.main.try_acquire_scheduler_leader", acquire)
    monkeypatch.setattr("app.main.LEADER_RETRY_SECONDS", 0.05)

    with TestClient(app) as http:
        assert http.get(f"{PREFIX}/health/live").status_code == 200  # boot did not wait on the lock
        time.sleep(0.5)

    assert len(calls) == 3
    assert sorted(scheduler_spies) == ["ats", "expiry"]


def test_a_follower_stops_retrying_on_shutdown(scheduler_spies, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.main.try_acquire_scheduler_leader", lambda: calls.append(1) or False
    )
    monkeypatch.setattr("app.main.LEADER_RETRY_SECONDS", 0.05)

    with TestClient(app):
        time.sleep(0.2)
    after_shutdown = len(calls)
    time.sleep(0.3)

    assert len(calls) == after_shutdown
    assert scheduler_spies == []


def test_the_dummy_password_hash_is_warmed_at_boot(monkeypatch):
    from app.auth.security import dummy_password_hash

    dummy_password_hash.cache_clear()
    monkeypatch.setattr("app.main.try_acquire_scheduler_leader", lambda: False)
    monkeypatch.setattr("app.main.LEADER_RETRY_SECONDS", 3600)

    with TestClient(app):
        assert dummy_password_hash.cache_info().currsize == 1


# ── CON-9: the advisory-lock election itself, against a faked connection ──


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value


class _FakeConnection:
    def __init__(self, granted=True, fail=False):
        self.granted, self.fail, self.closed = granted, fail, False

    def execute(self, *_args, **_kwargs):
        if self.fail:
            raise RuntimeError("db down")
        return _FakeResult(self.granted)

    def close(self):
        self.closed = True


class _FakeEngine:
    def __init__(self, connection):
        self._connection, self.disposed = connection, False

    def connect(self):
        return self._connection

    def dispose(self):
        self.disposed = True


@pytest.fixture
def fake_postgres_lock(monkeypatch):
    import app.database as database

    made = []

    def install(connection):
        engine = _FakeEngine(connection)
        made.append(engine)
        monkeypatch.setattr(database, "create_engine", lambda *a, **k: engine)
        return engine

    monkeypatch.setattr(database, "_is_sqlite", False)
    monkeypatch.setattr(database, "_leader_connection", None)
    monkeypatch.setattr(database, "_leader_engine", None, raising=False)
    return install


def test_leader_lock_acquired_keeps_the_connection_open(fake_postgres_lock):
    import app.database as database

    connection = _FakeConnection(granted=True)
    fake_postgres_lock(connection)

    assert database.try_acquire_scheduler_leader() is True
    assert connection.closed is False
    assert database.try_acquire_scheduler_leader() is True  # already leading: no second lock


def test_leader_lock_declined_releases_the_connection_and_engine(fake_postgres_lock):
    import app.database as database

    connection = _FakeConnection(granted=False)
    engine = fake_postgres_lock(connection)

    assert database.try_acquire_scheduler_leader() is False
    assert connection.closed is True
    assert engine.disposed is True


def test_leader_lock_fails_open_and_cleans_up_when_it_cannot_be_attempted(
    fake_postgres_lock, caplog
):
    import app.database as database

    connection = _FakeConnection(fail=True)
    engine = fake_postgres_lock(connection)

    with caplog.at_level(logging.WARNING):
        assert database.try_acquire_scheduler_leader() is True

    assert connection.closed is True
    assert engine.disposed is True
    assert "RuntimeError" in " ".join(r.getMessage() for r in caplog.records)
    assert "db down" not in " ".join(r.getMessage() for r in caplog.records)


def test_releasing_the_leader_lock_closes_the_connection_and_engine(fake_postgres_lock):
    import app.database as database

    connection = _FakeConnection(granted=True)
    engine = fake_postgres_lock(connection)
    database.try_acquire_scheduler_leader()

    database.release_scheduler_leader()

    assert connection.closed is True
    assert engine.disposed is True
    assert database._leader_connection is None


# ── REL-5: the rate limiter's own warning must not log the client address ──


async def test_a_rate_limited_login_does_not_log_the_client_address(app_db, caplog):
    with caplog.at_level(logging.DEBUG):
        async with _asgi_client() as http:
            statuses = [
                (
                    await http.post(
                        f"{PREFIX}/auth/login",
                        json={"email": "nobody@example.com", "password": "wrong-password"},
                    )
                ).status_code
                for _ in range(12)
            ]

    assert 429 in statuses
    assert "203.0.113.9" not in " ".join(r.getMessage() for r in caplog.records)
