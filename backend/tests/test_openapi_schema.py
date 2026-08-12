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

So this file asserts two things: that the schema builds at all, and that the
body params which trigger the bug are typed as bodies rather than query params.

The schema is built from the router modules rather than `app.main`, for the
reason recorded in `test_submission_boundary.py`: under CI the assembled app has
been observed carrying only FastAPI's four default routes (#288), which would
make every assertion here vacuous.
"""

from __future__ import annotations

import importlib
import pkgutil
import warnings
from collections import Counter

from fastapi import APIRouter
from fastapi.openapi.utils import get_openapi

import app.routers

MINIMUM_EXPECTED_ROUTES = 50
SCHEMA_TEST_PREFIX = "/__schema__"


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


def test_openapi_schema_generates():
    """The whole schema must build. One unresolvable annotation breaks all of it."""
    schema = _schema()

    assert schema["openapi"]
    assert len(schema["paths"]) >= MINIMUM_EXPECTED_ROUTES, (
        f"Only {len(schema['paths'])} paths in the generated schema — expected at "
        f"least {MINIMUM_EXPECTED_ROUTES}. The scan is not seeing the routers, so "
        "the assertions here would be vacuous."
    )


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
