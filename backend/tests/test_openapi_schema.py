"""OpenAPI schema generation must not break (#285).

`/docs`, `/redoc`, and `/openapi.json` were all down and nothing caught it,
because no test ever asked the app for its schema.

The failure mode is subtle and repeatable. slowapi's `@limiter.limit` wrapper is
defined inside slowapi's own module, so a decorated route's `__globals__` are
slowapi's, not the router module's. In a module using
`from __future__ import annotations` every annotation is a string, FastAPI
cannot resolve a schema name against those foreign globals, and it silently
reclassifies the request body as a *query parameter*. The route keeps working
just enough to look fine until something asks for the schema, at which point
generation fails for the entire application.

So this file asserts that the schema builds, that the assembled application
contains every operation discovered from the router package, that its published
operation contract changes only through an explicit fixture update, and that the
body params which trigger the bug are typed as bodies rather than query params.

The annotation regression checks still build an independently aggregated router
schema. The assembled app is checked separately against that aggregation and the
reviewed public contract, so losing a router can no longer make the schema checks
vacuously green (#288).
"""

from __future__ import annotations

import importlib
import pkgutil
import warnings
from collections import Counter
from pathlib import Path

from fastapi import APIRouter
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

import app.routers
from app.main import app as assembled_app

SCHEMA_TEST_PREFIX = "/__schema__"
OPERATION_CONTRACT = Path(__file__).parent / "fixtures" / "openapi_operations.txt"
OPENAPI_METHODS = {"delete", "get", "head", "options", "patch", "post", "put", "trace"}


def _all_router_routes() -> list:
    aggregate = APIRouter()
    for module_info in pkgutil.iter_modules(app.routers.__path__):
        module = importlib.import_module(f"app.routers.{module_info.name}")
        router = getattr(module, "router", None)
        if router is not None:
            # Raw routers intentionally omit their production prefixes. Give
            # each module a synthetic namespace so this all-router scan cannot
            # collapse unrelated endpoints that share a local path and name.
            aggregate.include_router(
                router,
                prefix=f"{SCHEMA_TEST_PREFIX}/{module_info.name}",
            )
    return aggregate.routes


def _schema() -> dict:
    return get_openapi(title="Career Workbench", version="test", routes=_all_router_routes())


def _route_operation_counts(routes: list) -> Counter[tuple[str, str, str]]:
    """Count operations by their stable endpoint identity, independent of prefixes."""
    return Counter(
        (route.endpoint.__module__, route.endpoint.__qualname__, method)
        for route in _effective_routes(routes)
        if isinstance(route, APIRoute) or hasattr(route, "original_route")
        for method in route.methods
    )


def _effective_routes(routes: list):
    """Flatten FastAPI's lazy included-router wrappers into effective routes."""
    for route in routes:
        contexts = getattr(route, "effective_route_contexts", None)
        if callable(contexts):
            yield from contexts()
        else:
            yield route


def _openapi_operations(schema: dict) -> set[str]:
    return {
        f"{method.upper()} {path}"
        for path, path_item in schema["paths"].items()
        for method in path_item
        if method.lower() in OPENAPI_METHODS
    }


def _reviewed_operation_contract() -> set[str]:
    operations = [
        line.strip()
        for line in OPERATION_CONTRACT.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert operations == sorted(set(operations)), (
        f"{OPERATION_CONTRACT.name} must stay sorted and contain each operation once"
    )
    return set(operations)


def test_openapi_schema_generates():
    """The whole schema must build. One unresolvable annotation breaks all of it."""
    schema = _schema()

    assert schema["openapi"]


def test_assembled_app_contains_every_discovered_router_operation():
    assembled = _route_operation_counts(assembled_app.routes)
    discovered = _route_operation_counts(_all_router_routes())

    assert sum(assembled.values()) == 133
    assert assembled == discovered


def test_assembled_openapi_matches_the_reviewed_operation_contract():
    assert _openapi_operations(assembled_app.openapi()) == _reviewed_operation_contract()


def test_openapi_operation_ids_are_unique():
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        schema = _schema()

    operation_ids = [
        operation["operationId"]
        for methods in schema["paths"].values()
        for operation in methods.values()
        if isinstance(operation, dict) and "operationId" in operation
    ]
    counts = Counter(operation_ids)
    duplicate_warnings = [
        str(warning.message)
        for warning in caught
        if "Duplicate Operation ID" in str(warning.message)
    ]

    assert duplicate_warnings == []
    assert sorted(operation_id for operation_id, count in counts.items() if count > 1) == []


def test_pydantic_body_params_are_not_reclassified_as_query_params():
    """A request body typed as a query param is the signature of the #285 bug.

    Checked across every route rather than just the one that broke, since any
    router adopting `from __future__ import annotations` reintroduces it.
    """
    offenders = []
    for path, operations in _schema()["paths"].items():
        for method, operation in operations.items():
            for parameter in operation.get("parameters", []):
                if parameter.get("in") != "query":
                    continue
                schema = parameter.get("schema", {})
                # A body model reclassified as a query param surfaces as a
                # $ref or an object, never as the scalar a real query param is.
                if "$ref" in schema or schema.get("type") == "object":
                    offenders.append(f"{method.upper()} {path} -> {parameter.get('name')}")

    assert offenders == [], (
        "These query parameters carry an object/model schema, which means "
        "FastAPI failed to resolve a body annotation and reclassified it "
        f"(#285): {offenders}"
    )


def test_set_admin_declares_a_request_body():
    """Pins the specific route that regressed, at the schema level."""
    operation = _schema()["paths"][
        f"{SCHEMA_TEST_PREFIX}/admin/users/{{user_id}}/admin"
    ]["patch"]

    assert "requestBody" in operation
    assert not [
        parameter
        for parameter in operation.get("parameters", [])
        if parameter.get("name") == "body"
    ]
