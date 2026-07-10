"""Per-tool-run LLM cost estimation from actual provider token usage (issue #106).

R6 needs a per-tool LLM cost figure alongside the per-tool latency that #104
already persists (D-038, parent spec #103). The estimate must derive from the
*actual* token counts the model provider returns for each call, not a flat
per-tool guess.

The seam is a request-scoped accumulator, not a return value threaded through
every service. `complete_structured` may be called more than once per tool run
(e.g. interview generation), and its parsed-JSON result is persisted as the
`ToolRun` payload — so cost must not ride along in that dict. Instead the LLM
client records each call's usage into a `ContextVar` and the shared tool
pipeline reads the accumulated total once, at completion or failure. Because a
FastAPI request runs in its own task with a copied context, concurrent requests
never share an accumulator; the pipeline also resets it at the start of every
run for defence in depth.

`None` means "no provider call consumed tokens" (cached result, or failure
before the provider was reached) and is persisted as a null `cost_estimate`.
A recorded value of exactly zero is still a real observation and is kept
distinct from `None`.

Rates are USD-per-million-token estimates for the single V1 provider (Vertex
Gemini 2.5 Flash — see CLAUDE.md stack) used for cost *observability*, not
billing reconciliation; they live here so a price change is a one-line edit.
"""
from __future__ import annotations

from contextvars import ContextVar
from decimal import Decimal

# USD per 1M tokens, as (input_rate, output_rate). Vertex Gemini 2.5 Flash is the
# only active V1 provider; the lite tier is included because the interview
# practice-feedback path may run on a cheaper model (`LLM_PRACTICE_MODEL`).
_MODEL_RATES_PER_MTOK: dict[str, tuple[Decimal, Decimal]] = {
    "gemini-2.5-flash": (Decimal("0.30"), Decimal("2.50")),
    "gemini-2.5-flash-lite": (Decimal("0.10"), Decimal("0.40")),
}
# Fallback for an unrecognised model id (e.g. a future versioned id like
# `gemini-2.5-flash-002`): reuse the standard Flash rate so an unknown model
# still yields a non-zero, order-of-magnitude estimate rather than silently
# costing nothing. Derived from the table so a Flash price change is one edit.
_DEFAULT_RATE_PER_MTOK: tuple[Decimal, Decimal] = _MODEL_RATES_PER_MTOK["gemini-2.5-flash"]

_ONE_MILLION = Decimal(1_000_000)

# Request-scoped running total of estimated LLM cost, in USD. `None` until the
# first provider call of the run records usage.
_llm_cost_total: ContextVar[Decimal | None] = ContextVar("llm_cost_total", default=None)


def _rate_for(model: str) -> tuple[Decimal, Decimal]:
    return _MODEL_RATES_PER_MTOK.get(model, _DEFAULT_RATE_PER_MTOK)


def estimate_cost(model: str, prompt_tokens: int, output_tokens: int) -> Decimal:
    """Estimate one call's USD cost from its actual token usage and model rate."""
    input_rate, output_rate = _rate_for(model)
    prompt = Decimal(max(prompt_tokens, 0))
    output = Decimal(max(output_tokens, 0))
    return (prompt * input_rate + output * output_rate) / _ONE_MILLION


def reset_llm_cost() -> None:
    """Clear the accumulator for the current request/tool run."""
    _llm_cost_total.set(None)


def record_llm_usage(*, model: str, prompt_tokens: int, output_tokens: int) -> None:
    """Add one provider call's estimated cost to the request-scoped total.

    Called from the LLM client for every completed provider response, including
    responses that later fail to parse — the tokens were still consumed. Best
    effort: usage instrumentation must never break a tool run, so callers guard
    this and it never raises for missing/odd token counts.
    """
    call_cost = estimate_cost(model, prompt_tokens, output_tokens)
    current = _llm_cost_total.get()
    _llm_cost_total.set(call_cost if current is None else current + call_cost)


def get_llm_cost() -> Decimal | None:
    """Return the accumulated estimated cost, or `None` if no call was recorded."""
    return _llm_cost_total.get()
