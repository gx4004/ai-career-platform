"""R6 per-tool LLM cost estimation from actual token usage (issue #106).

Covers the parent spec's cost-related acceptance criteria at the seam that owns
them: the estimate derives from actual returned token counts and a per-model
rate (not a flat per-tool guess), accumulates across multiple provider calls in
one run, and stays `None` until a provider call is recorded.
"""
from __future__ import annotations

from decimal import Decimal

from app.services import ai_client
from app.services.llm_cost import (
    estimate_cost,
    get_llm_cost,
    record_llm_usage,
    reset_llm_cost,
)


class _FakeUsage:
    def __init__(self, prompt_token_count: int, candidates_token_count: int) -> None:
        self.prompt_token_count = prompt_token_count
        self.candidates_token_count = candidates_token_count


class _FakeResponse:
    def __init__(self, usage: _FakeUsage | None) -> None:
        self.usage_metadata = usage


def test_estimate_cost_uses_per_model_rate_and_token_split():
    # gemini-2.5-flash: input $0.30 / 1M, output $2.50 / 1M.
    cost = estimate_cost("gemini-2.5-flash", prompt_tokens=1_000_000, output_tokens=1_000_000)
    assert cost == Decimal("2.80")


def test_estimate_cost_varies_by_model():
    flash = estimate_cost("gemini-2.5-flash", 1_000_000, 1_000_000)
    lite = estimate_cost("gemini-2.5-flash-lite", 1_000_000, 1_000_000)
    assert lite < flash


def test_estimate_cost_is_not_a_flat_per_tool_guess():
    """Two different token counts must yield two different estimates."""
    small = estimate_cost("gemini-2.5-flash", 100, 50)
    large = estimate_cost("gemini-2.5-flash", 10_000, 5_000)
    assert small != large
    assert large > small


def test_unknown_model_falls_back_to_a_nonzero_rate():
    assert estimate_cost("some-future-model", 1_000_000, 0) > 0


def test_accumulator_starts_none_and_sums_across_calls():
    reset_llm_cost()
    assert get_llm_cost() is None

    record_llm_usage(model="gemini-2.5-flash", prompt_tokens=1000, output_tokens=200)
    first = get_llm_cost()
    assert first is not None and first > 0

    record_llm_usage(model="gemini-2.5-flash", prompt_tokens=1000, output_tokens=200)
    assert get_llm_cost() == first * 2


def test_reset_clears_accumulator():
    record_llm_usage(model="gemini-2.5-flash", prompt_tokens=10, output_tokens=10)
    assert get_llm_cost() is not None
    reset_llm_cost()
    assert get_llm_cost() is None


def test_record_usage_reads_provider_usage_metadata():
    reset_llm_cost()
    response = _FakeResponse(_FakeUsage(prompt_token_count=1200, candidates_token_count=300))

    ai_client._record_usage(response, "gemini-2.5-flash")

    expected = estimate_cost("gemini-2.5-flash", 1200, 300)
    assert get_llm_cost() == expected


def test_record_usage_is_best_effort_when_metadata_missing():
    reset_llm_cost()
    ai_client._record_usage(_FakeResponse(None), "gemini-2.5-flash")
    # No usable usage metadata -> nothing recorded, still None, never raises.
    assert get_llm_cost() is None
