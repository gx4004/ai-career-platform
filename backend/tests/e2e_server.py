"""Dedicated E2E process with deterministic AI at the external-provider seam.

This module is launched directly by Playwright. It is not imported by the
production application and exposes no runtime switch or HTTP control surface.
"""

from importlib import import_module

import uvicorn

from app.services import (
    career_recommender,
    cover_letter_gen,
    interview_gen,
    job_matcher,
    portfolio_planner,
    resume_analyzer,
)


async def deterministic_complete_structured(*_args, **_kwargs) -> dict:
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

app = import_module("app.main").app


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
