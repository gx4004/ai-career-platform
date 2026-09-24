"""Fabrication-candidate claim extraction and tracing (D-043).

Covers the live surface :mod:`app.services.campaign_reviewer` calls —
``extract_claims`` and ``trace_claim`` — now that the R8 eval-harness
scoring around fixtures/corpora has been removed (#319).
"""

from app.services.fabrication import (
    KIND_FIGURE,
    KIND_PROPER_NOUN,
    Claim,
    claim_traceable,
    extract_claims,
    trace_claim,
)


def test_extract_claims_finds_proper_nouns_and_figures():
    output = "I led the Nimbus Ledger migration and cut latency by 40%."
    claims = extract_claims(output)
    kinds = {(c.text, c.kind) for c in claims}
    assert ("Nimbus Ledger", KIND_PROPER_NOUN) in kinds
    assert ("40%", KIND_FIGURE) in kinds


def test_extract_claims_drops_sentence_initial_common_word():
    claims = extract_claims("Thank you for the opportunity.")
    assert claims == []


def test_extract_claims_keeps_internal_signal_word_at_sentence_start():
    claims = extract_claims("FastAPI powers the backend.")
    assert any(c.text == "FastAPI" for c in claims)


def test_claim_traceable_proper_noun_uses_keyword_match():
    claim = Claim(text="Nimbus Ledger", kind=KIND_PROPER_NOUN)
    assert claim_traceable(claim, "Worked at Nimbus Ledger as an engineer.") is True
    assert claim_traceable(claim, "Worked at Globex Corp as an engineer.") is False


def test_claim_traceable_figure_tolerates_thousands_separator():
    claim = Claim(text="4,500", kind=KIND_FIGURE)
    assert claim_traceable(claim, "Grew revenue to 4500 units.") is True


def test_claim_traceable_figure_respects_digit_boundaries():
    claim = Claim(text="12", kind=KIND_FIGURE)
    assert claim_traceable(claim, "Shipped 120 releases.") is False


def test_trace_claim_records_every_source_attempt():
    claim = Claim(text="Globex Corp", kind=KIND_PROPER_NOUN)
    trace = trace_claim(claim, {"resume": "No mention here.", "cv": "Worked at Globex Corp."})
    assert trace.traceable is True
    assert {(a.source, a.matched) for a in trace.attempts} == {
        ("resume", False),
        ("cv", True),
    }


def test_trace_claim_untraceable_when_no_source_matches():
    claim = Claim(text="Initech", kind=KIND_PROPER_NOUN)
    trace = trace_claim(claim, {"resume": "Nothing relevant."})
    assert trace.traceable is False
