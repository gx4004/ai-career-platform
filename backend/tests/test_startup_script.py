import os
import subprocess
from pathlib import Path


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
