"""Structural guard for the R15/R16 boundary (ADR 0009, D-096).

``docs/threat-model.md`` states that the API surface has no submission endpoint
and calls that claim "test-verified". Until now nothing verified it: no test
inspected the route table, so a submission endpoint could have been added while
the threat model still asserted its absence.

ADR 0009 is explicit that the boundary is *structural* — the approval queue
prepares packets for review and hands the user to the official destination to
submit themselves. Submission automation may only ever appear behind R16's
per-source authorization contract (ADR 0010), which is gated and unbuilt.

``app.main`` is imported *inside* each test rather than at module scope. A
module-scope import bound a partially initialised ``app.main`` under CI —
``conftest.py`` imports the same module, and when this module was pulled into
that import chain ``sys.modules`` handed back the half-built module, with the
``app`` object created but its ``include_router`` calls not yet executed. The
guard then scanned only FastAPI's four default docs routes and passed against
nothing. Importing lazily guarantees a fully initialised module, and
:func:`test_surface_under_test_is_actually_populated` fails loudly if the
surface is ever empty again.

The surface is read from ``app.routes`` rather than the served OpenAPI schema
because ``app.openapi()`` currently raises on this branch (an unrebuilt
``AdminSetAdminRequest`` forward reference). That is a separate pre-existing
defect; this guard must not depend on it.
"""

from __future__ import annotations

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

# ``/cv-documents/{document_id}/tailoring/apply`` applies a reviewed tailoring
# diff to the user's own CV document. It does not apply *to a job*, so a bare
# "apply" token is not a submission signal and is not in the list above. Pinned
# here so a future reader does not "tighten" the guard into a false positive.
KNOWN_NON_SUBMISSION_APPLY_PATH = "/api/v1/cv-documents/{document_id}/tailoring/apply"

# The served surface is well over a hundred paths. A floor well beneath that
# still catches the failure mode that matters: a near-empty schema making every
# assertion below trivially true.
MINIMUM_EXPECTED_PATHS = 50


def _route_paths() -> set[str]:
    from app.main import app  # imported lazily — see module docstring

    return {route.path for route in app.routes if hasattr(route, "path")}


def test_surface_under_test_is_actually_populated():
    """Guard the guard: an empty surface would make every other test here pass.

    This is not a formality — the first version of this module bound ``app`` at
    module scope and, under CI, saw only FastAPI's default docs routes. The
    submission assertion "passed" against nothing.
    """
    paths = _route_paths()

    assert len(paths) >= MINIMUM_EXPECTED_PATHS, (
        f"Only {len(paths)} mounted routes — expected at least "
        f"{MINIMUM_EXPECTED_PATHS}. The app under test is not fully mounted, so "
        "the submission-boundary assertions below would be vacuous."
    )
    assert KNOWN_NON_SUBMISSION_APPLY_PATH in paths


def test_api_surface_exposes_no_submission_endpoint():
    """No route may perform, schedule, or retry a submission (ADR 0009, D-096)."""
    offenders = sorted(
        path
        for path in _route_paths()
        for token in FORBIDDEN_PATH_TOKENS
        if token in path.lower()
    )

    assert offenders == [], (
        "The API surface must expose no submission endpoint (ADR 0009, D-096); "
        "docs/threat-model.md asserts this boundary. Offending routes: "
        f"{offenders}. Submission automation belongs behind R16's per-source "
        "authorization contract (ADR 0010) and requires that gate to be open."
    )


def test_tailoring_apply_is_not_treated_as_a_submission_route():
    """The guard must not false-positive on applying a tailoring diff."""
    assert not any(
        token in KNOWN_NON_SUBMISSION_APPLY_PATH.lower() for token in FORBIDDEN_PATH_TOKENS
    )


def test_guard_would_catch_a_submission_route():
    """The token list must actually match a submission-shaped path.

    Without this, an empty or typo'd token list would make the boundary test
    vacuously green forever.
    """
    hypothetical = "/api/v1/packets/{packet_id}/submit"
    assert any(token in hypothetical.lower() for token in FORBIDDEN_PATH_TOKENS)
