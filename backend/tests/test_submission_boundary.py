"""Structural guard for the R15/R16 boundary (ADR 0009, D-096).

``docs/threat-model.md`` states that the API surface has no submission endpoint
and calls that claim "test-verified". Nothing verified it: no test inspected the
routes, so a submission endpoint could have been added while the threat model
still asserted its absence.

ADR 0009 is explicit that the boundary is *structural* — the approval queue
prepares packets for review and hands the user to the official destination to
submit themselves. R16 #189 builds only the dark per-source governance gate;
user authorization, submission automation, and every outward-act route remain
unbuilt and may appear only behind all four ADR 0010 gates.

R16 #193 adds an exact, closed set of admin-only safety-control routes. They can
configure/read limits, attest a rehearsal, and trip kill switches; none accepts a
packet, invokes an adapter, schedules work, or retries an outward act. The guard
allowlists those paths exactly while remaining default-deny for every other path
containing a submission-shaped token.

This walks the router modules in ``app/routers/`` and inspects each
``APIRouter`` directly, rather than the assembled ``app.main`` application.
Earlier revisions inspected the assembled app and, under CI only, saw an
instance carrying just FastAPI's four default docs routes — so the guard passed
against nothing for four consecutive runs. Reading the routers removes that
dependency: every route reaches the app through one of these modules, and
discovery is a directory scan, so a new router file is covered the day it is
added.
"""

from __future__ import annotations

import importlib
import pkgutil

import app.routers

# Tokens that indicate a route performs or schedules a submission on the user's
# behalf. Deliberately narrow: matched as substrings against the lowercased
# path, so each must be specific enough not to collide with legitimate verbs.
FORBIDDEN_PATH_TOKENS = (
    "submit",
    "submission",
    "autopilot",
    "auto-apply",
    "auto_apply",
    "autoapply",
)

ALLOWED_SUBMISSION_CONTROL_ROUTES = {
    ("admin", "/submission-safety"),
    ("admin", "/submission-safety/global-kill-switch"),
    ("admin", "/submission-safety/rehearsal"),
    ("admin", "/discovery-sources/{source_id}/submission-safety"),
    ("admin", "/discovery-sources/{source_id}/submission-kill-switch"),
}

# ``/{document_id}/tailoring/apply`` applies a reviewed tailoring diff to the
# user's own CV document. It does not apply *to a job*, so a bare "apply" token
# is not a submission signal and is not in the list above. Pinned here so a
# future reader does not "tighten" the guard into a false positive.
KNOWN_NON_SUBMISSION_APPLY_SUFFIX = "/{document_id}/tailoring/apply"

# The backend ships well over a dozen router modules. Floors beneath the real
# counts still catch the failure mode that matters: an empty scan making every
# assertion below trivially true.
MINIMUM_EXPECTED_ROUTERS = 10
MINIMUM_EXPECTED_ROUTES = 50


def _router_routes() -> list[tuple[str, str]]:
    """Every (module_name, route_path) pair defined by an app router module."""
    found: list[tuple[str, str]] = []
    for module_info in pkgutil.iter_modules(app.routers.__path__):
        module = importlib.import_module(f"app.routers.{module_info.name}")
        router = getattr(module, "router", None)
        for route in getattr(router, "routes", None) or []:
            path = getattr(route, "path", None)
            if path is not None:
                found.append((module_info.name, path))
    return found


def test_surface_under_test_is_actually_populated():
    """Guard the guard: an empty scan would make every other test here pass.

    Not a formality. Earlier revisions inspected the assembled application and,
    under CI, found only FastAPI's four default docs routes — the submission
    assertion "passed" against nothing for four consecutive runs.
    """
    routes = _router_routes()
    modules = {module for module, _ in routes}

    assert len(modules) >= MINIMUM_EXPECTED_ROUTERS, (
        f"Only {len(modules)} router modules exposed a router — expected at least "
        f"{MINIMUM_EXPECTED_ROUTERS}. The scan is not seeing the routers, so the "
        "submission-boundary assertion below would be vacuous."
    )
    assert len(routes) >= MINIMUM_EXPECTED_ROUTES, (
        f"Only {len(routes)} routes discovered — expected at least "
        f"{MINIMUM_EXPECTED_ROUTES}."
    )


def test_api_surface_exposes_no_submission_endpoint():
    """No route may perform, schedule, or retry a submission (ADR 0009, D-096)."""
    offenders = sorted(
        f"{module}:{path}"
        for module, path in _router_routes()
        for token in FORBIDDEN_PATH_TOKENS
        if token in path.lower()
        and (module, path) not in ALLOWED_SUBMISSION_CONTROL_ROUTES
    )

    assert offenders == [], (
        "The API surface must expose no submission endpoint (ADR 0009, D-096); "
        "docs/threat-model.md asserts this boundary. Offending routes: "
        f"{offenders}. Submission automation belongs behind R16's per-source "
        "authorization contract (ADR 0010) and requires that gate to be open."
    )


def test_submission_named_routes_are_only_the_exact_safety_control_set():
    routes = set(_router_routes())
    named_routes = {
        (module, path)
        for module, path in routes
        if any(token in path.lower() for token in FORBIDDEN_PATH_TOKENS)
    }

    assert named_routes == ALLOWED_SUBMISSION_CONTROL_ROUTES


def test_tailoring_apply_is_not_treated_as_a_submission_route():
    """The guard must not false-positive on applying a tailoring diff.

    Also proves the scan reaches real routes rather than an empty list.
    """
    paths = [path for _, path in _router_routes()]

    assert KNOWN_NON_SUBMISSION_APPLY_SUFFIX in paths
    assert not any(
        token in KNOWN_NON_SUBMISSION_APPLY_SUFFIX.lower() for token in FORBIDDEN_PATH_TOKENS
    )


def test_guard_would_catch_a_submission_route():
    """The token list must actually match a submission-shaped path.

    Without this, an empty or typo'd token list would make the boundary test
    vacuously green forever.
    """
    assert any(token in "/{packet_id}/submit".lower() for token in FORBIDDEN_PATH_TOKENS)
