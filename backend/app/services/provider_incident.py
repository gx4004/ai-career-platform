"""Request-scoped provider-incident category for the R10 scorecard (issue #136).

The R10 provider-incident trigger (D-055) needs to count *user-visible* provider
incidents, and the spec is explicit that internal retries must not each count as
a separate incident. This module is the seam that makes that possible without
threading a category through every tool service or leaking the raw provider
exception message.

`complete_structured` retries up to four times per user request. On each failed
attempt the LLM client records the incident *category* here (timeout / quota /
unavailable / permission / malformed); the last write wins. The shared tool
pipeline resets the accumulator at the start of every run and reads it once, in
its failure path, emitting exactly one `r10_provider_incident` event per
user-visible failure — so a four-retry timeout is one incident, not four.

Only the closed-set category ever crosses the boundary; the raw exception
message stays in the stdout log. Mirrors the request-scoped `ContextVar`
discipline of `llm_cost.py`: a FastAPI request runs in its own task with a
copied context, so concurrent requests never share an accumulator.
"""
from __future__ import annotations

from contextvars import ContextVar

# Single source of truth for the closed category set is the allowlist schema, so
# the write seam and this producer can never drift apart (#136 review).
from app.schemas.analytics import ProviderIncidentCategory

# Request-scoped last-seen provider incident category. `None` until a provider
# call in this run fails with a recognised, categorised error.
_incident_category: ContextVar[ProviderIncidentCategory | None] = ContextVar(
    "provider_incident_category", default=None
)


def reset_provider_incident() -> None:
    """Clear the accumulator for the current request/tool run."""
    _incident_category.set(None)


def set_provider_incident(category: ProviderIncidentCategory) -> None:
    """Record the category of a provider failure for the current run.

    Called from the LLM client's provider except-blocks. Overwrites any earlier
    value so a run that retries and fails is recorded once, by its final
    category, when the pipeline reads it — never once per retry.
    """
    _incident_category.set(category)


def get_provider_incident() -> ProviderIncidentCategory | None:
    """Return the recorded provider-incident category, or `None` if the run had
    no categorised provider failure."""
    return _incident_category.get()
