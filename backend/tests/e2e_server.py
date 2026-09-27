"""Dedicated E2E process with deterministic AI at the external-provider seam.

This module is launched directly by Playwright. It is not imported by the
production application and exposes no runtime switch or HTTP control surface.

Why this monkeypatches `complete_structured` directly instead of setting
`LLM_PROVIDER=fake` (issue #357): `app/services/fake_llm.py` already provides
schema-valid fixtures for these same six tools and would be the simpler
seam, but `guest-tools.spec.ts` deliberately exercises the
`[E2E_PROVIDER_FAILURE]` marker to assert each tool's *provider-unavailable*
behavior (heuristic fallback for Resume/Job Match, explicit error for the
generative tools). Going through `LLM_PROVIDER=fake` would route that failure
through `ai_client.complete_structured`'s retry wrapper (`_with_retry`: 4
retries, 5s->10s->20s->40s backoff, ~75s before giving up) since a
provider-side exception there is indistinguishable from a transient Vertex
error — turning a fast, deterministic failure test into a ~75s stall that
risks the suite's timeouts. Patching `complete_structured` on each service
module bypasses that retry wrapper entirely, so the failure path stays
instant. Keep this monkeypatch until/unless the retry wrapper gains a
fail-fast path for deterministic test failures.
"""

import os
from importlib import import_module

import uvicorn

from app.limiter import limiter
from app.services import (
    application_drafts,
    career_recommender,
    cover_letter_gen,
    interview_gen,
    job_matcher,
    portfolio_planner,
    resume_analyzer,
)


async def deterministic_complete_structured(*_args, **_kwargs) -> dict:
    if any("[E2E_PROVIDER_FAILURE]" in str(value) for value in _args):
        raise RuntimeError("Deterministic E2E provider failure")
    return {}


for service_module in (
    application_drafts,
    resume_analyzer,
    job_matcher,
    cover_letter_gen,
    interview_gen,
    career_recommender,
    portfolio_planner,
):
    service_module.complete_structured = deterministic_complete_structured

# The browser suite creates many isolated users through one loopback/CI address.
# Production throttling is covered by backend tests; keeping it enabled here makes
# test order and machine speed decide which otherwise-valid registrations receive 429.
limiter.enabled = False

app = import_module("app.main").app


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("E2E_BACKEND_PORT", "8000")),
    )
