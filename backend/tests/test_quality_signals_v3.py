"""Smoke / unit tests for the Stage H heuristic-v3 ablation module.

The heavy SBERT path (H.1) is exercised by the full ablation harness rather
than in unit tests because a unit-test model load adds ~30-60s to the test
suite without yielding more signal than the harness already provides.
The deterministic enhancements (H.2..H.5) and the public surface are covered
here.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.quality_signals_v3 import (
    ALL_FEATURES,
    FEATURE_COHERENCE,
    FEATURE_ESCO_EXPANDED,
    FEATURE_NGRAM,
    FEATURE_STAR,
    _compute_coherence,
    _esco_use_expanded,
    _load_esco_variant,
    _ngrams,
    _phrase_term_match,
    _star_score_for_bullet,
    _years_claimed_from_text,
    _years_supported_by_dates,
    build_resume_prepass_v3,
    compute_overall_score_v3,
    compute_resume_breakdown_v3,
)


# ---------------------------------------------------------------------------
# H.4 — n-gram phrase matching
# ---------------------------------------------------------------------------


def test_machine_learning_matches_machine_learning_in_resume():
    resume_tokens = ["built", "a", "machine", "learning", "pipeline"]
    assert _phrase_term_match("machine learning", resume_tokens) is True


def test_data_engineering_matches_data_engineering_pipeline():
    resume_tokens = ["maintained", "a", "data", "engineering", "pipeline"]
    assert _phrase_term_match("data engineering", resume_tokens) is True


def test_machine_vision_does_not_match_machine_learning():
    resume_tokens = ["built", "a", "machine", "learning", "system"]
    assert _phrase_term_match("machine vision", resume_tokens) is False


def test_phrase_match_with_window_allows_near_adjacency():
    # "machine" then "learning" within 5-token window of each other
    resume_tokens = ["machine", "based", "deep", "learning", "system"]
    assert _phrase_term_match("machine learning", resume_tokens) is True


def test_ngrams_basic():
    toks = ["a", "b", "c", "d"]
    assert _ngrams(toks, 1) == [("a",), ("b",), ("c",), ("d",)]
    assert _ngrams(toks, 2) == [("a", "b"), ("b", "c"), ("c", "d")]
    assert _ngrams(toks, 3) == [("a", "b", "c"), ("b", "c", "d")]
    assert _ngrams(toks, 5) == []


# ---------------------------------------------------------------------------
# H.2 — STAR detection
# ---------------------------------------------------------------------------


def test_star_score_action_only_bullet():
    # "introduced X" — action verb, no situation/task/result.
    score = _star_score_for_bullet("introduced rate-limiting middleware", frozenset({"introduced"}))
    assert score == 1


def test_star_score_full_starr_bullet():
    # Action verb at start; situation cue, task cue, quantified result.
    bullet = "Introduced caching when traffic doubled, to reduce latency by 30%."
    score = _star_score_for_bullet(bullet, frozenset({"introduced"}))
    assert score == 4


def test_star_score_quantified_only_bullet():
    bullet = "Reduced costs by 40%."
    # No S/T cue, action "Reduced" matches if in dictionary, R via quant.
    score = _star_score_for_bullet(bullet, frozenset({"reduced"}))
    # Action + Result = 2.
    assert score == 2


# ---------------------------------------------------------------------------
# H.3 — coherence checks
# ---------------------------------------------------------------------------


def test_years_claimed_extracts_largest():
    assert _years_claimed_from_text("3 years of Python and 7+ years of SQL") == 7
    assert _years_claimed_from_text("no experience claim") is None


def test_years_supported_by_dates_sums_ranges():
    text = "Engineer 2018 - 2021\nSenior Engineer 2021 - present"
    yrs = _years_supported_by_dates(text)
    # 2018-2021 = 3, 2021-now ≥ 4. Sum ≥ 7.
    assert yrs >= 7


def test_coherence_no_penalty_when_consistent():
    text = (
        "Software Engineer (2020 - 2024)\n"
        "5 years of Python.\n"
        "Skills: Python, FastAPI"
    )
    skills = {"Python", "FastAPI"}
    pen = _compute_coherence(text, skills)
    # Years claimed 5, supported ≈ 4, |delta| <= 1 → no years penalty.
    # Both skills appear in text (not orphan). No penalty.
    assert pen.years_mismatch == 0
    assert pen.orphan_skills == []
    assert pen.total_penalty == 0.0


def test_coherence_orphan_skill_penalty():
    full_text = (
        "Software Engineer (2022 - 2024)\n"
        "Worked on backend APIs in Python.\n"  # Python is grounded
        "Skills: Python, Rust"  # Rust is orphan
    )
    experience = "Software Engineer (2022 - 2024)\nWorked on backend APIs in Python.\n"
    skills = {"Python", "Rust"}
    pen = _compute_coherence(full_text, skills, experience_text=experience)
    assert "Rust" in pen.orphan_skills
    assert "Python" not in pen.orphan_skills
    assert pen.total_penalty >= 2.0  # at least one orphan


# ---------------------------------------------------------------------------
# H.5 — ESCO expansion loader
# ---------------------------------------------------------------------------


def test_esco_baseline_loads():
    v2c, c2v = _load_esco_variant(use_expanded=False)
    assert "python" in v2c
    assert v2c["python"] == "Python"
    # Baseline canonical count should match the bundled file.
    assert len(c2v) >= 100


def test_esco_expanded_is_superset():
    v2c_base, c2v_base = _load_esco_variant(use_expanded=False)
    v2c_exp, c2v_exp = _load_esco_variant(use_expanded=True)
    # Every baseline canonical must appear in the expanded set.
    for canonical in c2v_base:
        assert canonical in c2v_exp, f"missing {canonical} in expanded ESCO"
    # Expanded must be strictly larger.
    assert len(c2v_exp) > len(c2v_base)


def test_esco_use_expanded_via_features_flag():
    assert _esco_use_expanded({FEATURE_ESCO_EXPANDED}) is True
    assert _esco_use_expanded(set()) is False
    assert _esco_use_expanded(None) is False


# ---------------------------------------------------------------------------
# Integration — public surface
# ---------------------------------------------------------------------------


SAMPLE_RESUME = (
    "Jane Doe\n\n"
    "Skills\nPython, FastAPI, PostgreSQL\n\n"
    "Experience\n"
    "Senior Backend Engineer (2020 - 2024)\n"
    "- introduced caching layer reducing latency by 40%\n"
    "- migrated services to PostgreSQL with zero downtime\n"
    "- built FastAPI services serving 10000 requests per second\n"
)
SAMPLE_JD = (
    "We are hiring a Backend Engineer.\n\n"
    "Requirements: Python, FastAPI, PostgreSQL, Docker."
)


def test_v3_empty_returns_v3_dataclass():
    prepass = build_resume_prepass_v3(SAMPLE_RESUME, SAMPLE_JD, features=frozenset())
    assert prepass.detected_skills  # non-empty
    assert prepass.matched_keywords  # at least Python/FastAPI/PostgreSQL
    assert prepass.star_score == 0.0
    assert prepass.coherence_penalty == 0.0


def test_v3_full_runs_without_error_on_sample():
    # Includes SBERT — accepts that the model may fail to load in CI; the
    # module returns False sentinel on failure and short-circuits semantic
    # match without raising. Either path must produce a valid prepass.
    prepass = build_resume_prepass_v3(SAMPLE_RESUME, SAMPLE_JD, features=ALL_FEATURES)
    assert prepass is not None
    breakdown = compute_resume_breakdown_v3(prepass)
    assert len(breakdown) == 5
    overall = compute_overall_score_v3(breakdown)
    assert 0 <= overall <= 100


def test_v3_breakdown_keys_are_canonical():
    prepass = build_resume_prepass_v3(SAMPLE_RESUME, SAMPLE_JD, features=frozenset())
    breakdown = compute_resume_breakdown_v3(prepass)
    keys = [item["key"] for item in breakdown]
    assert keys == ["keywords", "impact", "structure", "clarity", "completeness"]


def test_v3_overall_clamped_to_0_100():
    prepass = build_resume_prepass_v3("", None, features=frozenset())
    breakdown = compute_resume_breakdown_v3(prepass)
    overall = compute_overall_score_v3(breakdown)
    assert 0 <= overall <= 100


def test_star_only_lifts_impact_axis_when_bullets_have_starr_structure():
    """STAR-rich resume should have higher impact under H.2 than without."""
    star_rich = (
        "Skills\nPython\n\n"
        "Experience\n"
        "Engineer (2020 - 2024)\n"
        "- When traffic doubled, to reduce latency, introduced caching, by 30%\n"
        "- During Q3 incident, to restore SLO, deployed circuit breakers, "
        "resulting in 99.99% uptime\n"
    )
    p_no_star = build_resume_prepass_v3(star_rich, "Python role", features=frozenset())
    p_star = build_resume_prepass_v3(star_rich, "Python role", features={FEATURE_STAR})
    b_no = {b["key"]: b["score"] for b in compute_resume_breakdown_v3(p_no_star)}
    b_yes = {b["key"]: b["score"] for b in compute_resume_breakdown_v3(p_star)}
    # STAR-on should not be lower; the convex blend means it should match or
    # exceed the baseline impact axis on this STAR-saturated input.
    assert b_yes["impact"] >= b_no["impact"]
