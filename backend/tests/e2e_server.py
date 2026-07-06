"""Dedicated E2E process with deterministic AI at the external-provider seam.

This module is launched directly by Playwright. It is not imported by the
production application and exposes no runtime switch or HTTP control surface.
"""

from importlib import import_module
import os

import uvicorn

from app.services import (
    career_recommender,
    cover_letter_gen,
    interview_gen,
    job_matcher,
    portfolio_planner,
    resume_analyzer,
)
from app.limiter import limiter


async def deterministic_complete_structured(*_args, **_kwargs) -> dict:
    if any("[E2E_PROVIDER_FAILURE]" in str(value) for value in _args):
        raise RuntimeError("Deterministic E2E provider failure")
    return {}


for service_module in (
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
