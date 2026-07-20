"""Structural guard for the R15/R16 boundary (ADR 0009, D-096).

``docs/threat-model.md`` states that the API surface has no submission endpoint
and calls that claim "test-verified". Until now nothing verified it: no test
inspected the route table, so a submission endpoint could have been added while
the threat model still asserted its absence.

ADR 0009 is explicit that the boundary is *structural* — the approval queue
prepares packets for review and hands the user to the official destination to
submit themselves. Submission automation may only ever appear behind R16's
per-source authorization contract (ADR 0010), which is gated and unbuilt.

The surface is read off the ``client`` fixture rather than by importing
``app.main`` in this module. Under CI — and only under CI — both a module-scope
and a lazy import of that module resolved to an instance carrying just
FastAPI's four default docs routes, while the 700+ other tests were
concurrently calling ``/api/v1/...`` against a fully mounted app. Rather than
guess at those import mechanics, this reads whatever app the suite actually
exercises. :func:`test_surface_under_test_is_actually_populated` then fails
loudly if that surface is ever empty, so the guard cannot silently pass against
nothing.

Routes are inspected directly instead of via the served OpenAPI schema because
``app.openapi()`` currently raises on this branch (an unrebuilt
``AdminSetAdminRequest`` forward reference — see issue #285). That is a
separate pre-existing defect; this guard must not depend on it.
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


def _route_paths(client) -> set[str]:
    """The routes of the exact app the rest of the suite exercises.

    Read off the test client rather than by importing ``app.main`` here. Both a
    module-scope and a lazy import of that module resolved, under CI only, to an
    instance carrying just FastAPI's four default docs routes — while the 700+
    other tests were happily calling ``/api/v1/...`` on a fully mounted app. The
    client fixture is the single source of truth for what is under test.
    """
    return {route.path for route in client.app.routes if hasattr(route, "path")}


def test_surface_under_test_is_actually_populated(client):
    """Guard the guard: an empty surface would make every other test here pass.

    This is not a formality — earlier versions of this module imported
    ``app.main`` directly and, under CI, saw only FastAPI's default docs routes.
    The submission assertion "passed" against nothing.
    """
    paths = _route_paths(client)

    assert len(paths) >= MINIMUM_EXPECTED_PATHS, (
        f"Only {len(paths)} mounted routes — expected at least "
        f"{MINIMUM_EXPECTED_PATHS}. The app under test is not fully mounted, so "
        "the submission-boundary assertions below would be vacuous."
    )
    assert KNOWN_NON_SUBMISSION_APPLY_PATH in paths


def test_api_surface_exposes_no_submission_endpoint(client):
    """No route may perform, schedule, or retry a submission (ADR 0009, D-096)."""
    offenders = sorted(
        path
        for path in _route_paths(client)
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
