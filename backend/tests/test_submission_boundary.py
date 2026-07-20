"""Structural guard for the R15/R16 boundary (ADR 0009, D-096).

``docs/threat-model.md`` states that the API surface has no submission endpoint
and calls that claim "test-verified". Until now nothing verified it: no test
inspected the route table, so a submission endpoint could have been added while
the threat model still asserted its absence.

ADR 0009 is explicit that the boundary is *structural* — the approval queue
prepares packets for review and hands the user to the official destination to
submit themselves. Submission automation may only ever appear behind R16's
per-source authorization contract (ADR 0010), which is gated and unbuilt.

This test fails loudly if a submission-shaped route lands on the app, so that
crossing the boundary has to be a deliberate, reviewed act rather than a quiet
side effect.
"""

from __future__ import annotations

from app.main import app

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


def _route_paths() -> set[str]:
    return {route.path for route in app.routes if hasattr(route, "path")}


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
    """The guard must not false-positive on applying a tailoring diff.

    Keeps the boundary test honest: it proves the assertion above passes because
    no submission route exists, not because the token list is too narrow to
    match anything real.
    """
    assert KNOWN_NON_SUBMISSION_APPLY_PATH in _route_paths()
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
