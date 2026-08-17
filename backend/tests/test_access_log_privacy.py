"""The uvicorn access log must never carry query strings (or client addresses).

stdout is the one surface `_scrub_sentry_event` (app/main.py) never sees, and real
query strings on this API carry user data — the admin user search filters on
`/api/v1/admin/users?q=<email>` (app/routers/admin.py). docs/threat-model.md §10.1
lists email addresses and IP addresses as deliberately not logged.

uvicorn emits one record per response as
``'%s - "%s %s HTTP/%s" %d' % (client_addr, method, full_path, http_version, status)``
(uvicorn/protocols/http/h11_impl.py:482-489 and httptools_impl.py:485-492), where
``full_path`` is ``get_path_with_query_string(scope)``
(uvicorn/protocols/utils.py:58-62) and therefore includes the raw query string.
Nothing in start.sh, the Dockerfile, or the default `uvicorn.access` logger config
(uvicorn/config.py:81-111) removes it.
"""

from __future__ import annotations

import io
import logging
import os
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest
from uvicorn.config import LOGGING_CONFIG
from uvicorn.logging import AccessFormatter

from app.services.observability import configure_logging

ACCESS_LOGGER_NAME = "uvicorn.access"
# Distinctive enough that it cannot appear in a log line by coincidence, and
# shaped like the data that actually shows up in this API's query strings.
MARKER = "leak-marker-8f21@example.com"
# The formatter/format the deployed process really uses — read from uvicorn
# rather than restated, so a uvicorn change cannot make this test vacuous.
ACCESS_LOG_FMT = LOGGING_CONFIG["formatters"]["access"]["fmt"]


def _emit_access_record(
    path: str,
    *,
    status: int = 200,
    client_addr: str = "203.0.113.7:52344",
) -> str:
    """Log one response exactly as uvicorn does and format it exactly as uvicorn would."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(AccessFormatter(fmt=ACCESS_LOG_FMT, use_colors=False))
    access_logger = logging.getLogger(ACCESS_LOGGER_NAME)
    previous_level = access_logger.level
    access_logger.addHandler(handler)
    access_logger.setLevel(logging.INFO)
    try:
        access_logger.info(
            '%s - "%s %s HTTP/%s" %d',
            client_addr,
            "GET",
            path,
            "1.1",
            status,
        )
    finally:
        access_logger.removeHandler(handler)
        access_logger.setLevel(previous_level)
    return stream.getvalue().strip()


def test_access_log_line_is_path_only_and_keeps_method_and_status():
    configure_logging()

    line = _emit_access_record(f"/api/v1/admin/users?q={MARKER}&page=2")

    assert MARKER not in line
    assert "page=2" not in line
    # Pins the effective format end to end: level prefix, client field, request
    # line, status code and phrase. A formatter or filter change that drops the
    # status, the method, or the path fails here rather than silently degrading
    # operational debugging.
    assert line == 'INFO:     - - "GET /api/v1/admin/users?<redacted> HTTP/1.1" 200 OK'


def test_access_log_line_without_a_query_string_is_unchanged():
    configure_logging()

    line = _emit_access_record("/api/v1/health")

    assert line == 'INFO:     - - "GET /api/v1/health HTTP/1.1" 200 OK'


@pytest.mark.parametrize("status", [200, 302, 404, 429, 500])
def test_access_log_line_preserves_every_status_code(status):
    configure_logging()

    line = _emit_access_record(f"/api/v1/resume/analyze?token={MARKER}", status=status)

    assert MARKER not in line
    assert f'"GET /api/v1/resume/analyze?<redacted> HTTP/1.1" {status}' in line


def test_access_log_line_drops_the_client_address():
    # docs/threat-model.md §10.1 lists IP addresses among the values deliberately
    # not logged; uvicorn's default access line carries the peer address.
    configure_logging()

    line = _emit_access_record("/api/v1/health", client_addr="198.51.100.23:41000")

    assert "198.51.100.23" not in line
    assert "41000" not in line


def test_configure_logging_is_what_establishes_the_redaction():
    # The guarantee must live in configure_logging(), which app.main runs at
    # import time (app/main.py:62), so it holds however the app is started —
    # start.sh, the Dockerfile CMD, `uvicorn --reload`, or an embedded server —
    # rather than depending on one entrypoint passing a flag.
    access_logger = logging.getLogger(ACCESS_LOGGER_NAME)
    saved_filters = list(access_logger.filters)
    access_logger.filters.clear()
    try:
        unprotected = _emit_access_record(f"/api/v1/admin/users?q={MARKER}")
        # Baseline: uvicorn's own default really does put the query string on stdout.
        assert MARKER in unprotected

        configure_logging()

        protected = _emit_access_record(f"/api/v1/admin/users?q={MARKER}")
        assert MARKER not in protected
    finally:
        access_logger.filters[:] = saved_filters
        configure_logging()


def test_access_log_filter_is_installed_once_even_if_configure_logging_repeats():
    configure_logging()
    configure_logging()
    configure_logging()

    access_logger = logging.getLogger(ACCESS_LOGGER_NAME)
    installed = [
        log_filter
        for log_filter in access_logger.filters
        if type(log_filter).__name__ == "_AccessLogPrivacyFilter"
    ]

    assert len(installed) == 1


UVICORN_LISTENING_PATTERN = re.compile(r"Uvicorn running on http://127\.0\.0\.1:(\d+)")


def test_real_server_access_log_omits_the_query_string(tmp_path):
    """End-to-end proof through the deployed entrypoint shape.

    start.sh:14 and Dockerfile:22 both run `uvicorn app.main:app` with no logging
    flags, so the only thing that can strip the query string is what app.main does
    at import. This drives a real uvicorn process on an ephemeral port and reads
    its real stdout.
    """
    backend_dir = Path(__file__).resolve().parents[1]
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "0",
        ],
        cwd=backend_dir,
        env={
            **os.environ,
            "DATABASE_URL": f"sqlite:///{tmp_path / 'access-log.db'}",
            "ENVIRONMENT": "development",
        },
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    output_lines: queue.Queue[str] = queue.Queue()

    def collect_output() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            output_lines.put(line)

    reader = threading.Thread(target=collect_output, daemon=True)
    reader.start()

    captured: list[str] = []
    port = None
    deadline = time.monotonic() + 30
    try:
        while time.monotonic() < deadline and port is None:
            try:
                line = output_lines.get(timeout=0.2)
            except queue.Empty:
                if process.poll() is not None:
                    break
                continue
            captured.append(line)
            match = UVICORN_LISTENING_PATTERN.search(line)
            if match:
                port = int(match.group(1))

        assert port is not None, "server did not reach readiness:\n" + "".join(captured)

        try:
            with urlopen(f"http://127.0.0.1:{port}/api/v1/health?q={MARKER}", timeout=10):
                pass
        except URLError as error:  # pragma: no cover - surfaced as a test failure
            pytest.fail(f"request failed: {error}")

        access_line = None
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline and access_line is None:
            try:
                line = output_lines.get(timeout=0.2)
            except queue.Empty:
                continue
            captured.append(line)
            if "/api/v1/health" in line and "GET" in line:
                access_line = line

        assert access_line is not None, "no access log line seen:\n" + "".join(captured)
        assert MARKER not in access_line
        assert "/api/v1/health" in access_line
        assert "200" in access_line
        # And the marker is nowhere else on the process output either.
        assert MARKER not in "".join(captured)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:  # pragma: no cover - defensive
                process.kill()
                process.wait(timeout=5)
        reader.join(timeout=1)
