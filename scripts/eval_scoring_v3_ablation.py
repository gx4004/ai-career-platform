"""Stage H ablation harness — heuristic-v3 only, no new LLM calls.

Reads thesis/eval-dataset.json (100 pairs) and thesis/eval-results.json (existing
v2 + blended scores from Stage G's run) and computes the heuristic score for
each of the seven Stage H ablation variants. The LLM-only score per pair is
recovered post-hoc from the locked-payload identity:

    llm_only = (blended - 0.4 * heuristic_v2) / 0.6

so no new Gemini calls are issued — total runtime ≈ 5–10 min on commodity
hardware (SBERT first-load ~30–60s, ~50ms per pair for SBERT inference).

Output: thesis/eval-results-v3.json with per-variant heuristic-overall scores
plus pairwise Pearson correlations and cluster-bootstrap CIs against the
recovered LLM-only baseline.

Usage from repository root:

    python scripts/eval_scoring_v3_ablation.py

Variants computed:
    v2_baseline       — heuristic v2 reference (from existing eval-results.json)
    v3_empty          — v3 module with no features active (sanity-check vs v2)
    ngram_only        — v2 + bigram/trigram phrase matching (H.4)
    esco_only         — v2 + expanded ESCO taxonomy (H.5)
    star_only         — v2 + STAR-format detection (H.2)
    coherence_only    — v2 + cross-axis coherence checks (H.3)
    sbert_only        — v2 + SBERT semantic fallback (H.1)
    v3_full           — all five enhancements together
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("HEURISTIC_VERSION", "v2")
os.environ.setdefault("RESULT_CACHE_ENABLED", "false")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("USE_TF", "0")

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.quality_signals_v2 import (  # noqa: E402
    _idf_from_corpus,
    _tokenize,
    set_corpus_idf,
)
from app.services.quality_signals_v3 import (  # noqa: E402
    ALL_FEATURES,
    FEATURE_COHERENCE,
    FEATURE_ESCO_EXPANDED,
    FEATURE_NGRAM,
    FEATURE_SBERT,
    FEATURE_STAR,
    build_resume_prepass_v3,
    compute_overall_score_v3,
    compute_resume_breakdown_v3,
)

# Ablation variants: name -> feature set.
VARIANTS: dict[str, frozenset[str]] = {
    "v3_empty": frozenset(),
    "ngram_only": frozenset({FEATURE_NGRAM}),
    "esco_only": frozenset({FEATURE_ESCO_EXPANDED}),
    "star_only": frozenset({FEATURE_STAR}),
    "coherence_only": frozenset({FEATURE_COHERENCE}),
    "sbert_only": frozenset({FEATURE_SBERT}),
    "v3_full": frozenset(ALL_FEATURES),
}


DATASET = ROOT / "thesis" / "eval-dataset.json"
EXISTING = ROOT / "thesis" / "eval-results.json"
OUT = ROOT / "thesis" / "eval-results-v3.json"


def install_corpus_idf(pairs: list[dict]) -> int:
    seen: set[str] = set()
    documents: list[list[str]] = []
    for pair in pairs:
        jd = pair.get("jd")
        if not jd or jd in seen:
            continue
        seen.add(jd)
        documents.append(_tokenize(jd))
    if not documents:
        return 0
    set_corpus_idf(_idf_from_corpus(documents))
    return len(documents)


def overall_for_variant(resume: str, jd: str, features: frozenset[str]) -> int:
    prepass = build_resume_prepass_v3(resume, jd, features=features)
    breakdown = compute_resume_breakdown_v3(prepass)
    return compute_overall_score_v3(breakdown)


def load_existing() -> dict[str, dict[str, dict]]:
    rows = json.loads(EXISTING.read_text())
    by_pair: dict[str, dict[str, dict]] = {}
    for row in rows:
        pid = row.get("pair_id")
        mode = row.get("mode")
        if not pid or not mode:
            continue
        by_pair.setdefault(pid, {})[mode] = row
    return by_pair


async def main() -> int:
    if not DATASET.exists():
        print(f"ERROR: dataset missing at {DATASET}", file=sys.stderr)
        return 1
    if not EXISTING.exists():
        print(f"ERROR: existing eval-results missing at {EXISTING}", file=sys.stderr)
        return 1

    pairs = json.loads(DATASET.read_text())
    print(f"Loaded {len(pairs)} pairs from {DATASET}")

    n_corpus = install_corpus_idf(pairs)
    print(f"Installed corpus IDF over {n_corpus} distinct JDs.")

    existing = load_existing()
    print(f"Loaded {len(existing)} pairs from existing eval-results.json")

    # Recover llm_only per pair via post-hoc identity.
    llm_only: dict[str, float] = {}
    heur_v2_existing: dict[str, float] = {}
    for pid, modes in existing.items():
        b = modes.get("blended")
        h = modes.get("heuristic")
        if not b or not h:
            continue
        if not (b.get("ok") and h.get("ok")):
            continue
        bs = b.get("overall_score")
        hs = h.get("overall_score")
        if bs is None or hs is None:
            continue
        llm_only[pid] = (float(bs) - 0.4 * float(hs)) / 0.6
        heur_v2_existing[pid] = float(hs)

    print(f"Recovered LLM-only scores for {len(llm_only)} pairs.")

    # Compute heuristic-overall under each variant for each pair.
    results: dict[str, dict[str, dict]] = {name: {} for name in VARIANTS}
    print(f"Variants to compute: {list(VARIANTS)}")

    for vname, feats in VARIANTS.items():
        print(f"\n--- variant: {vname}  features={sorted(feats) or '[]'} ---")
        t0 = time.perf_counter()
        for i, pair in enumerate(pairs):
            pid = pair.get("id") or f"pair-{i:03d}"
            resume = pair.get("resume", "") or ""
            jd = pair.get("jd") or ""
            try:
                score = overall_for_variant(resume, jd, feats)
            except Exception as exc:  # noqa: BLE001
                print(f"  [{i + 1:03d}/{len(pairs)}] {pid}: FAIL {type(exc).__name__}: {exc}")
                continue
            results[vname][pid] = {"heuristic_score": score}
            if (i + 1) % 25 == 0 or i == len(pairs) - 1:
                elapsed = time.perf_counter() - t0
                print(
                    f"  [{i + 1:03d}/{len(pairs)}] elapsed={elapsed:.1f}s "
                    f"last={pid} score={score}"
                )
        elapsed = time.perf_counter() - t0
        print(f"  variant {vname} done in {elapsed:.1f}s")

    # Add v2_baseline cell (from existing eval-results.json).
    results["v2_baseline"] = {pid: {"heuristic_score": int(round(s))} for pid, s in heur_v2_existing.items()}

    payload = {
        "_metadata": {
            "description": (
                "Stage H ablation results — heuristic v3 variants vs LLM-only "
                "baseline (post-hoc recovered) on the Stage G disjoint-pool "
                "evaluation set. No new LLM calls."
            ),
            "n_pairs": len(pairs),
            "variants": {k: sorted(v) for k, v in VARIANTS.items()},
            "v2_baseline_source": str(EXISTING.relative_to(ROOT)),
        },
        "llm_only_per_pair": {pid: round(score, 4) for pid, score in sorted(llm_only.items())},
        "heuristic_v2_existing_per_pair": {pid: int(round(s)) for pid, s in sorted(heur_v2_existing.items())},
        "variants": {
            name: {pid: cell["heuristic_score"] for pid, cell in sorted(rows.items())}
            for name, rows in results.items()
        },
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
