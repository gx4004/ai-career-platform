"""Static deployment contracts that must hold before image construction."""

import re
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = REPOSITORY_ROOT / "frontend"
VITE_REFERENCE = re.compile(r"\bimport\.meta\.env\.(VITE_[A-Z0-9_]+)\b")
PROCESS_VITE_REFERENCE = re.compile(r"\bprocess\.env\.(VITE_[A-Z0-9_]+)\b")
ENV_ASSIGNMENT = re.compile(r"^([A-Z][A-Z0-9_]*)=")


def _dockerignore_entries(context: str) -> set[str]:
    dockerignore = REPOSITORY_ROOT / context / ".dockerignore"
    assert dockerignore.is_file(), f"{context}/.dockerignore must protect local builds"
    return {
        line.strip()
        for line in dockerignore.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def _frontend_build_variables() -> set[str]:
    variables: set[str] = set()
    for source in (FRONTEND_ROOT / "src").rglob("*"):
        if source.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
            continue
        variables.update(VITE_REFERENCE.findall(source.read_text()))
    return {variable for variable in variables if not variable.endswith("_")}


def _environment_inventory() -> set[str]:
    variables: set[str] = set()
    for raw_line in (FRONTEND_ROOT / ".env.example").read_text().splitlines():
        line = raw_line.strip().removeprefix("#").strip()
        if match := ENV_ASSIGNMENT.match(line):
            variables.add(match.group(1))
    return variables


def _docker_variables(stage: str, instruction: str) -> set[str]:
    if instruction == "ARG":
        pattern = re.compile(r"^ARG\s+([A-Z0-9_]+)(?:=.*)?$", re.MULTILINE)
    else:
        pattern = re.compile(r"^ENV\s+([A-Z0-9_]+)=", re.MULTILINE)
    return set(pattern.findall(stage))


def test_local_docker_contexts_exclude_sensitive_and_generated_content() -> None:
    common_entries = {
        "**/.env",
        "**/.env.*",
        "!**/.env.example",
        "**/.DS_Store",
        "**/*.log",
        ".artifacts/",
        "coverage/",
        "test-results/",
    }
    backend_entries = _dockerignore_entries("backend")
    frontend_entries = _dockerignore_entries("frontend")

    assert common_entries | {
        ".venv/",
        "venv/",
        "**/__pycache__/",
        "**/*.py[cod]",
        ".pytest_cache/",
        ".ruff_cache/",
        "*.db",
        "**/*.db",
        "*.sqlite",
        "**/*.sqlite",
        "*.sqlite3",
        "**/*.sqlite3",
    } <= backend_entries
    assert common_entries | {
        "node_modules/",
        "dist/",
        ".vite/",
        ".tanstack/",
        ".nitro/",
        ".output/",
        "playwright-report/",
    } <= frontend_entries


def test_frontend_public_build_variables_are_inventoried_and_wired() -> None:
    expected_new_variables = {
        "VITE_R7_ENTRY_CHOICE",
        "VITE_R7_SAMPLE_QUICKFILL",
        "VITE_R7_CONTEXT_CARRY",
        "VITE_R7_NEXT_BEST_ACTION",
        "VITE_R7_VALUE_SPECIFIC_SIGNUP",
        "VITE_R7_RESULTS_NUDGE",
        "VITE_SENTRY_DSN",
    }
    referenced_variables = _frontend_build_variables()
    build_stage = (FRONTEND_ROOT / "Dockerfile").read_text().split("\nFROM ", 1)[0]

    assert expected_new_variables <= referenced_variables
    assert referenced_variables <= _environment_inventory()
    assert referenced_variables <= _docker_variables(build_stage, "ARG")
    assert referenced_variables <= _docker_variables(build_stage, "ENV")


def test_frontend_server_variables_are_available_in_the_runtime_image() -> None:
    runtime_variables = set(
        PROCESS_VITE_REFERENCE.findall((FRONTEND_ROOT / "serve.mjs").read_text())
    )
    runtime_stage = (FRONTEND_ROOT / "Dockerfile").read_text().split("\nFROM ", 1)[1]

    assert {"VITE_API_URL", "VITE_SENTRY_DSN"} <= runtime_variables
    assert runtime_variables <= _docker_variables(runtime_stage, "ARG")
    assert runtime_variables <= _docker_variables(runtime_stage, "ENV")
