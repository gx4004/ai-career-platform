"""Public contract for the repository-local release gate."""

import os
import subprocess
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RUNNER = REPOSITORY_ROOT / "scripts" / "local-release.sh"


def _run(
    *arguments: str,
    environment: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(RUNNER), *arguments],
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )


def _fake_command(directory: Path, name: str, body: str) -> None:
    command = directory / name
    command.write_text(f"#!/bin/sh\n{body}\n")
    command.chmod(0o755)


def test_repository_declares_the_release_runtimes() -> None:
    assert (REPOSITORY_ROOT / ".nvmrc").read_text().strip() == "22"
    assert (REPOSITORY_ROOT / ".python-version").read_text().strip() == "3.12"


def test_full_release_requires_an_explicit_database_url() -> None:
    environment = {
        **os.environ,
        "DATABASE_URL": "postgresql://cw:ambient-secret@localhost/cw_local_release_ambient",
    }
    result = _run("--plan", environment=environment)

    assert result.returncode == 2
    assert "requires --database-url" in result.stderr
    assert "ambient-secret" not in result.stdout + result.stderr


def test_release_plan_rejects_a_non_disposable_database_without_leaking_credentials() -> None:
    secret = "do-not-print-this-password"
    result = _run(
        "--plan",
        "--database-url",
        f"postgresql+psycopg2://release:{secret}@db.example/production",
        "--authorization-database-url",
        "postgresql+psycopg2://release:secret@db.example/"
        "codex_submission_authorization_concurrency_contract",
    )

    assert result.returncode == 2
    assert "cw_local_release" in result.stderr
    assert secret not in result.stdout + result.stderr


def test_full_release_requires_a_separate_authorization_concurrency_database() -> None:
    result = _run(
        "--plan",
        "--database-url",
        "postgresql+psycopg2://cw:secret@localhost/cw_local_release_contract",
    )

    assert result.returncode == 2
    assert "requires --authorization-database-url" in result.stderr


def test_release_plan_rejects_an_ambiguous_authorization_database() -> None:
    secret = "authorization-password"
    result = _run(
        "--plan",
        "--database-url",
        "postgresql+psycopg2://cw:secret@localhost/cw_local_release_contract",
        "--authorization-database-url",
        f"postgresql+psycopg2://cw:{secret}@localhost/cw_local_release_auth",
    )

    assert result.returncode == 2
    assert "codex_submission_authorization_concurrency_" in result.stderr
    assert secret not in result.stdout + result.stderr


def test_release_plan_covers_every_local_manual_gate_and_redacts_the_database_url() -> None:
    secret = "local-release-secret"
    result = _run(
        "--plan",
        "--database-url",
        f"postgresql+psycopg2://cw:{secret}@127.0.0.1:5432/cw_local_release_contract",
        "--authorization-database-url",
        "postgresql+psycopg2://cw:authorization-secret@127.0.0.1:5432/"
        "codex_submission_authorization_concurrency_contract",
    )

    assert result.returncode == 0, result.stderr
    for command in (
        "pnpm install --frozen-lockfile",
        "pnpm audit --prod --audit-level=high",
        "pnpm typecheck",
        "pnpm test",
        "pnpm test:production-smoke",
        "python3 -m pip install --upgrade pip",
        "python3 -m pip install -r requirements-dev.txt",
        "python3 -m pip install pip-audit==2.10.1",
        "python3 -m pip check",
        "python3 -m pip_audit -r requirements.txt --ignore-vuln PYSEC-2026-1325",
        "python3 -m ruff check app",
        "python3 -m pytest -q tests/test_startup_script.py",
        "python3 -m pytest -q",
        "docker build --file frontend/Dockerfile --tag career-workbench-frontend:local-release frontend",
        "docker build --file backend/Dockerfile --tag career-workbench-backend:local-release backend",
        "docker image inspect",
        "docker run --rm career-workbench-frontend:local-release id -u",
        "docker run --rm career-workbench-backend:local-release id -u",
        "python3 tests/migration_stable_release_roundtrip.py",
        "python3 tests/migration_packet_approval_roundtrip.py",
        "python3 tests/migration_submission_roundtrip.py",
        "python3 tests/migration_operational_metric_roundtrip.py",
        "python3 -m alembic upgrade head",
        "python3 tests/postgres_submission_concurrency.py",
        "python3 tests/postgres_submission_authorization_concurrency.py",
        "pnpm exec playwright install chromium",
        "pnpm test:e2e:ci",
    ):
        assert command in result.stdout
    stable_round_trip = result.stdout.index(
        "python3 tests/migration_stable_release_roundtrip.py"
    )
    packet_round_trip = result.stdout.index(
        "python3 tests/migration_packet_approval_roundtrip.py"
    )
    assert stable_round_trip < packet_round_trip
    assert secret not in result.stdout + result.stderr
    assert "<disposable-postgresql-url>" in result.stdout
    assert "<authorization-concurrency-postgresql-url>" in result.stdout
    assert "authorization-secret" not in result.stdout + result.stderr
    assert "workflow_dispatch" not in result.stdout
    assert "gh workflow" not in result.stdout
    assert "gh run" not in result.stdout


def test_preflight_fails_clearly_on_node_runtime_drift(tmp_path: Path) -> None:
    _fake_command(tmp_path, "node", "printf 'v21.9.0\\n'")
    environment = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}"}

    result = _run("--preflight", environment=environment)

    assert result.returncode == 1
    assert "Node.js 22.x required; found v21.9.0" in result.stderr


def test_preflight_fails_clearly_on_python_runtime_drift(tmp_path: Path) -> None:
    _fake_command(tmp_path, "node", "printf 'v22.20.0\\n'")
    _fake_command(tmp_path, "pnpm", "printf '10.30.3\\n'")
    _fake_command(tmp_path, "python3", "printf '3.11\\n'")
    _fake_command(tmp_path, "pdftotext", "exit 0")
    _fake_command(tmp_path, "soffice", "exit 0")
    environment = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}"}

    result = _run("--preflight", environment=environment)

    assert result.returncode == 1
    assert "Python 3.12 required; found 3.11" in result.stderr


def _declared_runtime_commands(directory: Path) -> None:
    _fake_command(directory, "node", "printf 'v22.20.0\\n'")
    _fake_command(directory, "pnpm", "printf '10.30.3\\n'")
    _fake_command(
        directory,
        "python3",
        "case \"$*\" in\n"
        "  *version_info.major*version_info.minor*) printf '3.12\\n' ;;\n"
        "  *'sys.prefix != sys.base_prefix'*) exit 0 ;;\n"
        "  '-m pip --version') printf 'pip fixture\\n' ;;\n"
        "  *) exit 1 ;;\n"
        "esac",
    )
    _fake_command(directory, "pdftotext", "exit 0")
    _fake_command(directory, "soffice", "exit 0")


def _isolated_path(directory: Path) -> str:
    """A PATH that exposes only the fixture commands plus core system utilities."""

    return f"{directory}:/usr/bin:/bin:/usr/sbin:/sbin"


def test_release_plan_selects_its_own_e2e_ports() -> None:
    result = _run(
        "--plan",
        "--allow-missing-docker",
        "--database-url",
        "postgresql+psycopg2://cw:secret@127.0.0.1:5432/cw_local_release_contract",
        "--authorization-database-url",
        "postgresql+psycopg2://cw:authorization-secret@127.0.0.1:5432/"
        "codex_submission_authorization_concurrency_contract",
    )

    assert result.returncode == 0, result.stderr
    assert "E2E_FRONTEND_PORT=<selected-free-port>" in result.stdout
    assert "E2E_BACKEND_PORT=<selected-free-port>" in result.stdout


def test_release_ignores_ambient_e2e_ports() -> None:
    """A developer server on the default ports must not decide the gate's ports."""

    environment = {
        **os.environ,
        "E2E_FRONTEND_PORT": "3000",
        "E2E_BACKEND_PORT": "8000",
    }
    result = _run(
        "--plan",
        "--allow-missing-docker",
        "--database-url",
        "postgresql+psycopg2://cw:secret@127.0.0.1:5432/cw_local_release_contract",
        "--authorization-database-url",
        "postgresql+psycopg2://cw:authorization-secret@127.0.0.1:5432/"
        "codex_submission_authorization_concurrency_contract",
        environment=environment,
    )

    assert result.returncode == 0, result.stderr
    assert "E2E_FRONTEND_PORT=3000" not in result.stdout
    assert "E2E_BACKEND_PORT=8000" not in result.stdout


def test_preflight_fails_when_docker_is_missing_and_names_the_opt_out(
    tmp_path: Path,
) -> None:
    _declared_runtime_commands(tmp_path)
    environment = {**os.environ, "PATH": _isolated_path(tmp_path)}

    result = _run("--preflight", environment=environment)

    assert result.returncode == 1
    assert "--allow-missing-docker" in result.stderr


def test_preflight_skips_container_evidence_only_when_explicitly_allowed(
    tmp_path: Path,
) -> None:
    _declared_runtime_commands(tmp_path)
    environment = {**os.environ, "PATH": _isolated_path(tmp_path)}

    result = _run("--preflight", "--allow-missing-docker", environment=environment)

    assert result.returncode == 0, result.stderr
    assert "SKIPPED" in result.stdout
    assert "no container evidence" in result.stdout.lower()


def test_preflight_still_fails_on_an_unreachable_docker_daemon(tmp_path: Path) -> None:
    _declared_runtime_commands(tmp_path)
    _fake_command(tmp_path, "docker", "exit 1")
    environment = {**os.environ, "PATH": _isolated_path(tmp_path)}

    result = _run("--preflight", environment=environment)

    assert result.returncode == 1
    assert "--allow-missing-docker" in result.stderr


def test_release_plan_omits_container_commands_when_docker_is_allowed_missing() -> None:
    result = _run(
        "--plan",
        "--allow-missing-docker",
        "--database-url",
        "postgresql+psycopg2://cw:secret@127.0.0.1:5432/cw_local_release_contract",
        "--authorization-database-url",
        "postgresql+psycopg2://cw:authorization-secret@127.0.0.1:5432/"
        "codex_submission_authorization_concurrency_contract",
    )

    assert result.returncode == 0, result.stderr
    assert "docker build" not in result.stdout
    assert "docker run" not in result.stdout
    assert "SKIPPED" in result.stdout
    assert "pnpm test:e2e:ci" in result.stdout


def test_release_plan_marks_the_incomplete_result_without_container_evidence() -> None:
    result = _run(
        "--plan",
        "--allow-missing-docker",
        "--database-url",
        "postgresql+psycopg2://cw:secret@127.0.0.1:5432/cw_local_release_contract",
        "--authorization-database-url",
        "postgresql+psycopg2://cw:authorization-secret@127.0.0.1:5432/"
        "codex_submission_authorization_concurrency_contract",
    )

    assert result.returncode == 0, result.stderr
    assert "WITHOUT container evidence" in result.stdout


def test_preflight_accepts_the_declared_runtimes_and_local_tools(tmp_path: Path) -> None:
    _fake_command(tmp_path, "node", "printf 'v22.20.0\\n'")
    _fake_command(tmp_path, "pnpm", "printf '10.30.3\\n'")
    _fake_command(
        tmp_path,
        "python3",
        "case \"$*\" in\n"
        "  *version_info.major*version_info.minor*) printf '3.12\\n' ;;\n"
        "  *'sys.prefix != sys.base_prefix'*) exit 0 ;;\n"
        "  '-m pip --version') printf 'pip fixture\\n' ;;\n"
        "  *) exit 1 ;;\n"
        "esac",
    )
    _fake_command(tmp_path, "docker", "[ \"$1\" = info ]")
    _fake_command(tmp_path, "pdftotext", "exit 0")
    _fake_command(tmp_path, "soffice", "exit 0")
    environment = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}"}

    result = _run("--preflight", environment=environment)

    assert result.returncode == 0, result.stderr
    assert "Runtime preflight passed: Node 22.20.0, pnpm 10.30.3, Python 3.12" in result.stdout
