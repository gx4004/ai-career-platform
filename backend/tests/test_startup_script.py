import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.request import urlopen

UVICORN_LISTENING_PATTERN = re.compile(r"Uvicorn running on http://0\.0\.0\.0:(\d+)")


def test_startup_script_does_not_launch_server_after_failed_migration(tmp_path):
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    alembic = fake_bin / "alembic"
    alembic.write_text("#!/bin/sh\nexit 23\n")
    alembic.chmod(0o755)
    uvicorn = fake_bin / "uvicorn"
    uvicorn.write_text("#!/bin/sh\necho server-started\n")
    uvicorn.chmod(0o755)

    backend_dir = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["sh", "start.sh"],
        cwd=backend_dir,
        env={
            **os.environ,
            "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
            "RUN_MIGRATIONS": "true",
        },
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 23
    assert "server-started" not in result.stdout


def test_startup_script_launches_real_server_on_ephemeral_port(tmp_path):
    backend_dir = Path(__file__).resolve().parents[1]
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    migration_marker = tmp_path / "migration-succeeded"
    alembic = fake_bin / "alembic"
    alembic.write_text('#!/bin/sh\nprintf "migrated" > "$MIGRATION_MARKER"\n')
    alembic.chmod(0o755)
    process = subprocess.Popen(
        ["sh", "start.sh"],
        cwd=backend_dir,
        env={
            **os.environ,
            "DATABASE_URL": f"sqlite:///{tmp_path / 'startup-smoke.db'}",
            "ENVIRONMENT": "development",
            "MIGRATION_MARKER": str(migration_marker),
            "PATH": os.pathsep.join(
                (str(fake_bin), str(Path(sys.executable).parent), os.environ["PATH"])
            ),
            "PORT": "0",
            "RUN_MIGRATIONS": "true",
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

    captured = []
    port = None
    deadline = time.monotonic() + 20
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

        assert port is not None, "start.sh did not reach readiness:\n" + "".join(captured)
        assert port > 0
        assert migration_marker.read_text() == "migrated"

        with urlopen(f"http://127.0.0.1:{port}/api/v1/health", timeout=5) as response:
            payload = json.load(response)

        assert response.status == 200
        assert payload["status"] == "ok"
        assert payload["checks"] == {"database": "ok"}
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        reader.join(timeout=1)
