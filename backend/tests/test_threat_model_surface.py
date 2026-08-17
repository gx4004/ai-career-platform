"""Keep the threat model's authentication and store inventories executable.

The threat model is the R3 evidence baseline, so §6 and §4.2 are security claims
rather than prose: they assert exactly which operations answer without an
authenticated identity and exactly which tables exist. Nothing previously
enforced them, and they had already drifted by 79 operations before the
R11-R17 build-ahead surface was re-derived by hand.

These tests re-derive both inventories from the assembled application and fail
when the document and the code disagree in either direction.
"""

import re
from pathlib import Path

from app.database import Base
from app.main import app

THREAT_MODEL = Path(__file__).resolve().parents[2] / "docs" / "threat-model.md"

API_PREFIX = "/api/v1"

#: The one operation §6.1 deliberately excludes: it is unauthenticated by
#: dependency but presents a refresh credential in an HttpOnly cookie, so §6.3
#: counts it separately.
REFRESH_CREDENTIAL_OPERATION = ("POST", "/auth/refresh")

AUTHENTICATED_DEPENDENCY = "get_current_user"
ADMIN_DEPENDENCY = "get_current_admin"
OPTIONAL_DEPENDENCY = "get_optional_current_user"


def _effective_app_routes():
    for route in app.routes:
        contexts = getattr(route, "effective_route_contexts", None)
        if callable(contexts):
            yield from contexts()
        else:
            yield route


def _dependency_names(route) -> set[str]:
    return {
        getattr(dependency.call, "__name__", "")
        for dependency in route.dependant.dependencies
    }


def _classified_operations() -> dict[str, set[tuple[str, str]]]:
    """Map each authentication class to its ``(METHOD, path)`` operations."""

    classified: dict[str, set[tuple[str, str]]] = {
        "none": set(),
        "optional": set(),
        "authenticated": set(),
        "admin": set(),
    }
    for route in _effective_app_routes():
        # Effective routes come back as router-local views rather than APIRoute
        # instances, so identify them by contract, not by type.
        path = getattr(route, "path", "")
        if not path.startswith(API_PREFIX) or getattr(route, "dependant", None) is None:
            continue
        names = _dependency_names(route)
        if ADMIN_DEPENDENCY in names:
            bucket = "admin"
        elif AUTHENTICATED_DEPENDENCY in names:
            bucket = "authenticated"
        elif OPTIONAL_DEPENDENCY in names:
            bucket = "optional"
        else:
            bucket = "none"
        for method in getattr(route, "methods", set()) - {"HEAD", "OPTIONS"}:
            classified[bucket].add((method, path[len(API_PREFIX) :]))
    assert any(classified.values()), "route introspection found no /api/v1 operations"
    return classified


def _document() -> str:
    return THREAT_MODEL.read_text(encoding="utf-8")


def _section(heading_pattern: str) -> str:
    text = _document()
    match = re.search(heading_pattern, text, flags=re.MULTILINE)
    assert match is not None, f"threat model is missing a section matching {heading_pattern!r}"
    remainder = text[match.end() :]
    end = re.search(r"^#{2,4} ", remainder, flags=re.MULTILINE)
    return remainder[: end.start()] if end else remainder


def _documented_operations(heading_pattern: str) -> set[tuple[str, str]]:
    rows = re.findall(
        r"^\|\s*`([A-Z]+)`\s*\|\s*`(/[^`]*)`\s*\|",
        _section(heading_pattern),
        flags=re.MULTILINE,
    )
    return {(method, path) for method, path in rows}


def _documented_count(heading_pattern: str, group: int = 1) -> int:
    match = re.search(heading_pattern, _document(), flags=re.MULTILINE)
    assert match is not None, f"threat model is missing a heading matching {heading_pattern!r}"
    return int(match.group(group))


def test_unauthenticated_operations_match_the_threat_model_exactly() -> None:
    documented = _documented_operations(r"^### 6\.1 No Authentication Required \(\d+ operations\)$")
    actual = _classified_operations()["none"] - {REFRESH_CREDENTIAL_OPERATION}

    assert documented, "§6.1 lists no operations"
    assert actual == documented, (
        "unauthenticated surface drifted from the threat model.\n"
        f"undocumented in §6.1: {sorted(actual - documented)}\n"
        f"documented but no longer unauthenticated: {sorted(documented - actual)}"
    )
    assert len(documented) == _documented_count(
        r"^### 6\.1 No Authentication Required \((\d+) operations\)$"
    )


def test_optional_authentication_operations_match_the_threat_model_exactly() -> None:
    heading = r"^### 6\.2 Optional Authentication — Guest or Authenticated \(\d+ operations\)$"
    documented = _documented_operations(heading)
    actual = _classified_operations()["optional"]

    assert documented, "§6.2 lists no operations"
    assert actual == documented, (
        "optional-authentication surface drifted from the threat model.\n"
        f"undocumented in §6.2: {sorted(actual - documented)}\n"
        f"documented but no longer optional-auth: {sorted(documented - actual)}"
    )
    assert len(documented) == _documented_count(
        r"^### 6\.2 Optional Authentication — Guest or Authenticated \((\d+) operations\)$"
    )


def test_refresh_credential_operation_stays_singular_and_documented() -> None:
    classified = _classified_operations()

    assert REFRESH_CREDENTIAL_OPERATION in classified["none"], (
        "the refresh operation no longer answers without an authenticated identity; "
        "§6.1 and §6.3 both describe it and must be updated together"
    )
    assert _documented_count(
        r"^### 6\.3 Authenticated Owner \(\d+\) or Refresh Credential \((\d+)\)$"
    ) == 1


def test_authenticated_and_admin_counts_match_the_threat_model() -> None:
    classified = _classified_operations()

    assert len(classified["authenticated"]) == _documented_count(
        r"^### 6\.3 Authenticated Owner \((\d+)\) or Refresh Credential \(\d+\)$"
    )
    assert len(classified["admin"]) == _documented_count(
        r"^### 6\.4 Admin Required \((\d+) operations\)$"
    )


def test_relational_store_inventory_matches_the_threat_model() -> None:
    tables = {name for name in Base.metadata.tables if name != "alembic_version"}
    documented_count = _documented_count(r"\*\*(\d+) application tables\*\*")
    inventory = _section(r"^### 4\.2 Executable Relational Store Inventory$")
    documented_tables = set(re.findall(r"`([a-z_]+)`", inventory))

    assert len(tables) == documented_count, (
        f"§4.2 declares {documented_count} application tables; "
        f"Base.metadata registers {len(tables)}: {sorted(tables)}"
    )
    missing = tables - documented_tables
    assert not missing, f"§4.2 does not name these registered tables: {sorted(missing)}"
