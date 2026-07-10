"""Tests for the R8 generative-tool fabrication-candidate check (issue #121, D-043).

Covers the acceptance criteria: a claim absent from the source resume is flagged
as a fabrication candidate; an output whose claims all trace back to the resume
produces zero candidates; and the check runs for all four generative tools. Every
case uses canned output strings — no live LLM call (D-044).
"""

from __future__ import annotations

import pytest

from app.evals import (
    GENERATIVE_TOOLS,
    TOOL_CAREER_PATH,
    TOOL_COVER_LETTER,
    TOOL_INTERVIEW_QA,
    TOOL_PORTFOLIO_PLANNER,
    FabricationReport,
    run_fabrication_check,
)
from app.evals.fabrication import (
    KIND_FIGURE,
    KIND_PROPER_NOUN,
    Claim,
    check_output,
    claim_traceable,
    extract_claims,
    find_fabrication_candidates,
)
from app.evals.loader import EvalFixture

# A synthetic resume whose employers/figures the canned outputs draw from. The
# content is irrelevant except that its proper nouns and numbers are known, so
# traceability assertions are exact.
_RESUME = (
    "Robin Alcott\n"
    "Senior Backend Engineer\n"
    "Experience\n"
    "Nimbus Ledger - Staff Backend Engineer\n"
    "- Reduced p95 latency by 38% across 14 microservices.\n"
    "- Owned PostgreSQL tuning that cut costs by 27%.\n"
    "Skills\n"
    "Python, FastAPI, PostgreSQL, Docker, Kubernetes, AWS\n"
)


def _fixture(fixture_id: str = "synthetic-case") -> EvalFixture:
    return EvalFixture(
        id=fixture_id,
        resume_text=_RESUME,
        job_description=None,
        expected_score_band=(0, 100),
        notes="synthetic fabrication test fixture",
    )


# --- Claim extraction ---


def test_extracts_proper_nouns_and_figures() -> None:
    claims = extract_claims("At Nimbus Ledger I cut latency by 38% over 14 services.")
    texts = {claim.text for claim in claims}
    kinds = {claim.text: claim.kind for claim in claims}
    assert "Nimbus Ledger" in texts
    assert kinds["Nimbus Ledger"] == KIND_PROPER_NOUN
    assert "38%" in texts
    assert kinds["38%"] == KIND_FIGURE
    assert "14" in texts
    # "At" opens the sentence and "I" is a pronoun stopword: neither is a claim.
    assert "At" not in texts
    assert "I" not in texts


def test_sentence_initial_word_is_not_a_proper_noun() -> None:
    # "Delivered" opens the sentence; it is sentence casing, not a proper noun.
    claims = extract_claims("Delivered a payments platform for Nimbus Ledger.")
    texts = {claim.text for claim in claims}
    assert "Delivered" not in texts
    assert "Nimbus Ledger" in texts


def test_internal_caps_survive_sentence_initial_rule() -> None:
    # A token with internal caps reads as a proper noun even at sentence start.
    claims = extract_claims("FastAPI powered the service.")
    assert any(claim.text == "FastAPI" for claim in claims)


def test_claims_are_deduplicated() -> None:
    claims = extract_claims("Nimbus Ledger. Nimbus Ledger again. 38% and 38%.")
    proper = [c for c in claims if c.text == "Nimbus Ledger"]
    figures = [c for c in claims if c.text == "38%"]
    assert len(proper) == 1
    assert len(figures) == 1


# --- Claim traceability ---


def test_proper_noun_claim_traced_case_insensitively() -> None:
    assert claim_traceable(Claim("nimbus ledger", KIND_PROPER_NOUN), _RESUME)
    assert not claim_traceable(Claim("Globex Corp", KIND_PROPER_NOUN), _RESUME)


def test_figure_claim_tolerates_thousands_separator() -> None:
    resume = "Handled 4,500 requests per second."
    assert claim_traceable(Claim("4500", KIND_FIGURE), resume)
    assert claim_traceable(Claim("4,500", KIND_FIGURE), resume)


def test_figure_claim_respects_digit_boundaries() -> None:
    # "12" must not be treated as present just because "120" contains it.
    assert not claim_traceable(Claim("12", KIND_FIGURE), "Scaled to 120 nodes.")


# --- Acceptance: absent claim is flagged ---


def test_absent_claim_is_flagged_as_fabrication_candidate() -> None:
    output = "I led the migration at Globex Corp, cutting latency by 55%."
    candidates = find_fabrication_candidates(output, _RESUME)
    texts = {claim.text for claim in candidates}
    # Neither the invented employer nor the invented metric is in the resume.
    assert "Globex Corp" in texts
    assert "55%" in texts


def test_check_output_flags_untraceable_claims() -> None:
    output = "At Nimbus Ledger I shipped Project Aurora and cut costs by 27%."
    result = check_output(TOOL_COVER_LETTER, _fixture(), output)
    candidate_texts = {claim.text for claim in result.candidates}
    # "Project Aurora" is invented; the real employer and figure are not flagged.
    assert "Project Aurora" in candidate_texts
    assert "Nimbus Ledger" not in candidate_texts
    assert "27%" not in candidate_texts
    assert result.candidate_count == len(result.candidates)


# --- Acceptance: fully grounded output produces zero candidates ---


def test_grounded_output_produces_zero_candidates() -> None:
    output = (
        "Nimbus Ledger relied on Python, FastAPI, and PostgreSQL. "
        "I reduced latency by 38% across 14 services and cut costs by 27%."
    )
    candidates = find_fabrication_candidates(output, _RESUME)
    assert candidates == []

    result = check_output(TOOL_CAREER_PATH, _fixture(), output)
    assert result.candidate_count == 0
    assert result.total_claims > 0  # claims were extracted, all traced


# --- Acceptance: the check runs for all four generative tools ---


def test_runs_for_all_four_generative_tools() -> None:
    assert set(GENERATIVE_TOOLS) == {
        TOOL_CAREER_PATH,
        TOOL_COVER_LETTER,
        TOOL_INTERVIEW_QA,
        TOOL_PORTFOLIO_PLANNER,
    }

    fixtures = [_fixture()]
    grounded = "Nimbus Ledger used Python and PostgreSQL."
    fabricated = "Globex Corp used Rust and Elixir."
    outputs = {
        TOOL_CAREER_PATH: {"synthetic-case": grounded},
        TOOL_COVER_LETTER: {"synthetic-case": fabricated},
        TOOL_INTERVIEW_QA: {"synthetic-case": grounded},
        TOOL_PORTFOLIO_PLANNER: {"synthetic-case": fabricated},
    }
    report = run_fabrication_check(outputs, fixtures=fixtures)

    assert isinstance(report, FabricationReport)
    # Every generative tool appears in the per-tool tally, even with no output.
    assert set(report.per_tool) == set(GENERATIVE_TOOLS)
    for tool in GENERATIVE_TOOLS:
        assert report.per_tool[tool].evaluated == 1

    assert report.per_tool[TOOL_CAREER_PATH].candidate_count == 0
    assert report.per_tool[TOOL_INTERVIEW_QA].candidate_count == 0
    assert report.per_tool[TOOL_COVER_LETTER].candidate_count > 0
    assert report.per_tool[TOOL_PORTFOLIO_PLANNER].candidate_count > 0
    assert report.per_tool[TOOL_COVER_LETTER].flagged_fixture_ids == ("synthetic-case",)


def test_tool_with_no_output_reports_zero() -> None:
    report = run_fabrication_check(
        {TOOL_COVER_LETTER: {"synthetic-case": "Grounded at Nimbus Ledger."}},
        fixtures=[_fixture()],
    )
    for tool in GENERATIVE_TOOLS:
        if tool != TOOL_COVER_LETTER:
            assert report.per_tool[tool].evaluated == 0
            assert report.per_tool[tool].candidate_count == 0


# --- Guardrails ---


def test_runs_against_committed_corpus_without_live_llm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The check must trace against the real corpus and never hit the provider."""

    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("fabrication check must not call the live LLM")

    monkeypatch.setattr("app.services.ai_client.complete_structured", _boom)

    # Default corpus (fixtures=None) is loaded and traced against; a fabricated
    # employer relative to a real fixture is flagged.
    outputs = {
        TOOL_COVER_LETTER: {
            "backend-engineering-senior": "I worked at Globex Corp on Project Zeta."
        }
    }
    report = run_fabrication_check(outputs)
    tally = report.per_tool[TOOL_COVER_LETTER]
    assert tally.evaluated == 1
    assert tally.candidate_count > 0


def test_run_fabrication_check_is_deterministic() -> None:
    outputs = {TOOL_COVER_LETTER: {"synthetic-case": "Globex Corp shipped 99 features."}}
    first = run_fabrication_check(outputs, fixtures=[_fixture()])
    second = run_fabrication_check(outputs, fixtures=[_fixture()])
    assert first.results == second.results
    assert first.per_tool == second.per_tool


def test_unknown_tool_id_is_rejected() -> None:
    with pytest.raises(ValueError, match="non-generative tool"):
        run_fabrication_check(
            {"resume-analyzer": {"synthetic-case": "text"}}, fixtures=[_fixture()]
        )


def test_unknown_fixture_id_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown fixture id"):
        run_fabrication_check(
            {TOOL_COVER_LETTER: {"does-not-exist": "text"}}, fixtures=[_fixture()]
        )
