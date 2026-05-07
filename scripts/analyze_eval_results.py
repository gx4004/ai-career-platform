"""Compute Chapter 4.3 metrics from the evaluation harness output.

Reads `thesis/eval-results.json` (produced by `scripts/eval_scoring.py`),
computes the four metric families documented in Chapter 4.1.2 of the thesis —
score agreement (Pearson, Spearman, Kendall), distribution shape (mean, std,
median, percentiles, KS distance), latency (median, 95th, max), and per-call
cost — and prints a Markdown block ready to paste into Chapter 4.3 in place of
the *to be filled* cells.

Stage-G additions (T2/T3 mitigation):
  * Recovers an LLM-only score per pair via post-hoc decomposition of the
    blended formula (blended = 0.4*heuristic + 0.6*llm_only ⇒
    llm_only = (blended - 0.4*heuristic) / 0.6). This isolates the
    cross-mode agreement, controlling for the structural component shared
    between blended and heuristic-only modes by construction.
  * Reports the three pairwise Pearson correlations with 95% confidence
    intervals computed via cluster bootstrap on resume_id, where pairs
    sharing a resume are resampled together to honour the in-track
    pairing structure documented in Chapter 4.1.3.

Stdlib only; no scipy/numpy/matplotlib. The figures are exported separately by
hand into `thesis/figures/`.
"""

from __future__ import annotations

import json
import math
import random
import statistics
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "thesis" / "eval-results.json"


# ---------------------------------------------------------------------------
# Statistical helpers (stdlib only)
# ---------------------------------------------------------------------------


def pearson(a: list[float], b: list[float]) -> float:
    if len(a) < 2 or len(a) != len(b):
        return float("nan")
    mean_a = sum(a) / len(a)
    mean_b = sum(b) / len(b)
    num = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b, strict=True))
    den_a = math.sqrt(sum((x - mean_a) ** 2 for x in a))
    den_b = math.sqrt(sum((y - mean_b) ** 2 for y in b))
    return num / (den_a * den_b) if den_a and den_b else float("nan")


def _ranks(values: list[float]) -> list[float]:
    """Return ranks of `values` with average-rank handling for ties."""
    indexed = sorted(enumerate(values), key=lambda x: x[1])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(indexed):
        j = i
        while j + 1 < len(indexed) and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float:
    """Spearman rank correlation = Pearson correlation of the ranks."""
    if len(a) < 2 or len(a) != len(b):
        return float("nan")
    return pearson(_ranks(a), _ranks(b))


def kendall_tau(a: list[float], b: list[float]) -> float:
    """Kendall tau-b rank correlation. O(n^2), fine for ~100 pairs.

    Matches `scipy.stats.kendalltau` and the Kendall (1945) formula:
        n1 = number of pairs tied in x (regardless of y)
        n2 = number of pairs tied in y (regardless of x)
        denominator = sqrt((n0 - n1) * (n0 - n2))
    Pairs tied in BOTH dimensions must contribute to BOTH n1 and n2 — earlier
    versions of this function `continue`d on the both-tied case and silently
    excluded such pairs from both counters.
    """
    n = len(a)
    if n < 2 or n != len(b):
        return float("nan")
    concordant = 0
    discordant = 0
    ties_a = 0
    ties_b = 0
    for i in range(n):
        for j in range(i + 1, n):
            da = a[i] - a[j]
            db = b[i] - b[j]
            if da == 0:
                ties_a += 1
            if db == 0:
                ties_b += 1
            if da != 0 and db != 0:
                if (da > 0) == (db > 0):
                    concordant += 1
                else:
                    discordant += 1
    n0 = n * (n - 1) / 2
    denom = math.sqrt((n0 - ties_a) * (n0 - ties_b))
    return (concordant - discordant) / denom if denom else float("nan")


def ks_distance(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return float("nan")
    a_sorted = sorted(a)
    b_sorted = sorted(b)
    grid = sorted(set(a_sorted + b_sorted))
    max_d = 0.0
    for x in grid:
        cdf_a = sum(1 for v in a_sorted if v <= x) / len(a_sorted)
        cdf_b = sum(1 for v in b_sorted if v <= x) / len(b_sorted)
        max_d = max(max_d, abs(cdf_a - cdf_b))
    return max_d


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    k = (len(s) - 1) * pct / 100.0
    f = int(math.floor(k))
    c = int(math.ceil(k))
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


# ---------------------------------------------------------------------------
# Stage G additions (T2/T3 mitigation): LLM-only post-hoc + cluster bootstrap
# ---------------------------------------------------------------------------


def recover_llm_only(blended: float, heuristic: float) -> float:
    """Post-hoc isolate the LLM-only score from blended and heuristic.

    The system computes blended = 0.4 * heuristic + 0.6 * llm_only with a
    locked heuristic prepass that the LLM cannot move (Chapter 3.2.3),
    therefore llm_only = (blended - 0.4 * heuristic) / 0.6 exactly. This
    is post-hoc reconstruction; it adds no LLM calls.
    """
    return (blended - 0.4 * heuristic) / 0.6


def cluster_bootstrap_pearson(
    pairs: list[tuple[str, float, float]],
    n_iter: int = 2000,
    seed: int = 42,
) -> tuple[float, float, float]:
    """Cluster bootstrap on a list of (cluster_key, x, y) triples.

    Resamples CLUSTERS with replacement; within each cluster keeps all
    pairs. Returns (mean_r, ci_lo, ci_hi) at 95% confidence (2.5/97.5
    percentiles of the bootstrap distribution).

    Per Chapter 4.1.3, in-track pairing means each resume is paired with
    every JD in its track, so pairs sharing a resume_id are not
    independent observations. Resampling at the resume level rather than
    at the pair level produces honest interval estimates.
    """
    rng = random.Random(seed)
    by_cluster: dict[str, list[tuple[float, float]]] = {}
    for cid, x, y in pairs:
        by_cluster.setdefault(cid, []).append((x, y))
    cluster_ids = list(by_cluster)
    n_clusters = len(cluster_ids)

    rs: list[float] = []
    for _ in range(n_iter):
        sampled = [rng.choice(cluster_ids) for _ in range(n_clusters)]
        xs: list[float] = []
        ys: list[float] = []
        for cid in sampled:
            for x, y in by_cluster[cid]:
                xs.append(x)
                ys.append(y)
        r = pearson(xs, ys)
        if r == r:  # not NaN
            rs.append(r)

    if not rs:
        return (float("nan"), float("nan"), float("nan"))

    rs_sorted = sorted(rs)
    mean_r = sum(rs_sorted) / len(rs_sorted)
    lo = rs_sorted[int(0.025 * len(rs_sorted))]
    hi = rs_sorted[int(0.975 * len(rs_sorted)) - 1]
    return mean_r, lo, hi


def cluster_id_from_pair(pair_id: str) -> str:
    """Extract the resume cluster id from a pair_id of form r-<track>-<n>__jd-<...>."""
    if "__" in pair_id:
        return pair_id.split("__", 1)[0]
    return pair_id


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    if not RESULTS.exists():
        print(f"ERROR: results file missing at {RESULTS}", file=sys.stderr)
        return 1

    rows: list[dict[str, Any]] = json.loads(RESULTS.read_text())
    by_pair: dict[str, dict[str, dict[str, Any]]] = {}
    for row in rows:
        pid = row.get("pair_id")
        mode = row.get("mode")
        if not pid or not mode:
            continue
        by_pair.setdefault(pid, {})[mode] = row

    paired = [
        (p["blended"], p["heuristic"])
        for p in by_pair.values()
        if "blended" in p and "heuristic" in p and p["blended"].get("ok") and p["heuristic"].get("ok")
    ]
    if not paired:
        print("ERROR: no successful pair found", file=sys.stderr)
        return 1

    blended_scores = [float(b["overall_score"]) for b, _ in paired if b.get("overall_score") is not None]
    heur_scores = [float(h["overall_score"]) for _, h in paired if h.get("overall_score") is not None]
    blended_lat = [float(b["latency_ms"]) for b, _ in paired]
    heur_lat = [float(h["latency_ms"]) for _, h in paired]

    # Stage-G recovery: post-hoc LLM-only score per pair
    llm_only_scores = [
        recover_llm_only(b, h) for b, h in zip(blended_scores, heur_scores, strict=True)
    ]

    # Cluster ids for bootstrap (resume_id from pair_id)
    cluster_ids = [cluster_id_from_pair(b["pair_id"]) for b, _ in paired]

    print("# Chapter 4.3 metrics — autofill from eval-results.json\n")

    # 4.3.1 Score agreement
    r = pearson(blended_scores, heur_scores)
    rho = spearman(blended_scores, heur_scores)
    tau = kendall_tau(blended_scores, heur_scores)

    # Cluster-bootstrap CI on the headline correlation
    triples_bh = list(zip(cluster_ids, blended_scores, heur_scores, strict=True))
    r_bh_mean, r_bh_lo, r_bh_hi = cluster_bootstrap_pearson(triples_bh)

    print("## 4.3.1 Score agreement\n")
    print(f"- Number of paired observations: **{len(paired)}**")
    print(f"- Pearson correlation (overall score): **r = {r:.3f}**")
    print(f"  [95% CI {r_bh_lo:.3f}, {r_bh_hi:.3f}; cluster bootstrap on resume_id, 2000 iterations, seed=42]")
    print(f"- Spearman rank correlation (overall score): **ρ = {rho:.3f}**")
    print(f"- Kendall tau-b (overall score): **τ = {tau:.3f}**\n")

    # Per-sub-score correlations
    print("| Sub-score | Pearson r | Spearman ρ | Kendall τ |")
    print("|-----------|-----------|------------|-----------|")
    sub_keys = ["keywords", "impact", "structure", "clarity", "completeness"]
    sub_data: dict[str, tuple[list[float], list[float]]] = {}
    for key in sub_keys:
        b_sub: list[float] = []
        h_sub: list[float] = []
        for b, h in paired:
            b_bd = {item.get("key"): item.get("score") for item in (b.get("score_breakdown") or [])}
            h_bd = {item.get("key"): item.get("score") for item in (h.get("score_breakdown") or [])}
            if key in b_bd and key in h_bd:
                b_sub.append(float(b_bd[key]))
                h_sub.append(float(h_bd[key]))
        sub_data[key] = (b_sub, h_sub)
        rk = pearson(b_sub, h_sub) if b_sub else float("nan")
        rhk = spearman(b_sub, h_sub) if b_sub else float("nan")
        tk = kendall_tau(b_sub, h_sub) if b_sub else float("nan")
        print(f"| {key} | {rk:.3f} | {rhk:.3f} | {tk:.3f} |")
    print()

    # 4.3.1' LLM-only baseline (Stage G, T2 mitigation)
    r_lh = pearson(llm_only_scores, heur_scores)
    rho_lh = spearman(llm_only_scores, heur_scores)
    triples_lh = list(zip(cluster_ids, llm_only_scores, heur_scores, strict=True))
    r_lh_mean, r_lh_lo, r_lh_hi = cluster_bootstrap_pearson(triples_lh)
    r_bl = pearson(blended_scores, llm_only_scores)
    triples_bl = list(zip(cluster_ids, blended_scores, llm_only_scores, strict=True))
    r_bl_mean, r_bl_lo, r_bl_hi = cluster_bootstrap_pearson(triples_bl)

    print("## 4.3.1' LLM-only baseline (T2 mitigation)\n")
    print(
        "Post-hoc decomposition: with the locked heuristic prepass (Section 3.2.3), "
        "blended = 0.4·heuristic + 0.6·LLM, so LLM-only = (blended − 0.4·heuristic) / 0.6 "
        "is recoverable without additional LLM calls. The Pearson correlation between "
        "LLM-only and heuristic-only scores isolates the cross-mode agreement, "
        "controlling for the structural component shared between blended and "
        "heuristic-only modes by construction.\n"
    )
    print("| Pair | Pearson r | 95% CI (cluster bootstrap) | Spearman ρ |")
    print("|------|-----------|----------------------------|------------|")
    print(f"| blended vs heuristic   | {r:.3f}   | [{r_bh_lo:.3f}, {r_bh_hi:.3f}] | {rho:.3f} |")
    print(f"| LLM-only vs heuristic  | {r_lh:.3f}   | [{r_lh_lo:.3f}, {r_lh_hi:.3f}] | {rho_lh:.3f} |")
    print(f"| blended vs LLM-only    | {r_bl:.3f}   | [{r_bl_lo:.3f}, {r_bl_hi:.3f}] | — |\n")

    print("LLM-only score distribution: "
          f"mean={statistics.mean(llm_only_scores):.2f}, "
          f"std={statistics.pstdev(llm_only_scores):.2f}, "
          f"median={statistics.median(llm_only_scores):.2f}, "
          f"5th={percentile(llm_only_scores, 5):.2f}, "
          f"95th={percentile(llm_only_scores, 95):.2f}.\n")

    # 4.3.2 Distribution
    print("## 4.3.2 Score distribution\n")
    print("| Statistic | Blended | Heuristic v2 |")
    print("|-----------|---------|--------------|")
    print(f"| Mean | {statistics.mean(blended_scores):.2f} | {statistics.mean(heur_scores):.2f} |")
    print(f"| Std. dev. | {statistics.pstdev(blended_scores):.2f} | {statistics.pstdev(heur_scores):.2f} |")
    print(f"| Median | {statistics.median(blended_scores):.2f} | {statistics.median(heur_scores):.2f} |")
    print(f"| 5th percentile | {percentile(blended_scores, 5):.2f} | {percentile(heur_scores, 5):.2f} |")
    print(f"| 95th percentile | {percentile(blended_scores, 95):.2f} | {percentile(heur_scores, 95):.2f} |")
    print(f"| KS distance | **{ks_distance(blended_scores, heur_scores):.3f}** | — |\n")

    # 4.3.3 Latency
    print("## 4.3.3 Latency (milliseconds)\n")
    print("| Latency | Blended | Heuristic v2 | Ratio |")
    print("|---------|---------|--------------|-------|")
    bm = statistics.median(blended_lat)
    hm = statistics.median(heur_lat)
    b95 = percentile(blended_lat, 95)
    h95 = percentile(heur_lat, 95)
    bmax = max(blended_lat)
    hmax = max(heur_lat)
    print(f"| Median | {bm:.1f} | {hm:.1f} | {bm / hm:.1f}× |")
    print(f"| 95th pct. | {b95:.1f} | {h95:.1f} | {b95 / h95:.1f}× |")
    print(f"| Maximum | {bmax:.1f} | {hmax:.1f} | {bmax / hmax:.1f}× |\n")

    # 4.3.4 Per-call cost (approximate, derived from estimated token counts)
    # Gemini 2.5 Flash pricing as of March 2026: input $0.075/M tokens, output $0.30/M tokens.
    INPUT_RATE_PER_M = 0.075
    OUTPUT_RATE_PER_M = 0.30
    blended_in = [int(b.get("input_tokens_est", 0)) for b, _ in paired]
    blended_out = [int(b.get("output_tokens_est", 0)) for b, _ in paired]
    blended_costs = [
        (i * INPUT_RATE_PER_M / 1_000_000) + (o * OUTPUT_RATE_PER_M / 1_000_000)
        for i, o in zip(blended_in, blended_out, strict=True)
    ]

    print("## 4.3.4 Per-call cost (Gemini 2.5 Flash, approximate)\n")
    print("| Cost item | Blended | Heuristic v2 |")
    print("|-----------|---------|--------------|")
    print(f"| Input tokens (avg., est.) | {statistics.mean(blended_in):.0f} | 0 |")
    print(f"| Output tokens (avg., est.) | {statistics.mean(blended_out):.0f} | 0 |")
    print(f"| Per-call USD (avg.) | ${statistics.mean(blended_costs):.5f} | $0.00000 |")
    print(f"| Per-call USD (95th pct.) | ${percentile(blended_costs, 95):.5f} | $0.00000 |")
    print(f"| 1 000 calls / day projected monthly bill | ${statistics.mean(blended_costs) * 1000 * 30:.2f} | $0.00 |\n")

    # 4.3.5 Sensitivity to score-combination weights — equal-weight rerun
    EQUAL_WEIGHT = 0.20

    def overall_with_equal_weights(breakdown_rows: list[dict]) -> float:
        if not breakdown_rows:
            return 0.0
        scores = [float(item.get("score", 0)) for item in breakdown_rows]
        return sum(scores) * EQUAL_WEIGHT if scores else 0.0

    blended_eq = [overall_with_equal_weights(b.get("score_breakdown") or []) for b, _ in paired]
    heur_eq = [overall_with_equal_weights(h.get("score_breakdown") or []) for _, h in paired]
    r_eq = pearson(blended_eq, heur_eq)
    rho_eq = spearman(blended_eq, heur_eq)

    print("## 4.3.5 Sensitivity to the score-combination weights\n")
    print("| Weighting | Pearson r | Spearman ρ |")
    print("|-----------|-----------|------------|")
    print(f"| Author-selected (0.30/0.25/0.15/0.15/0.15) | {r:.3f} | {rho:.3f} |")
    print(f"| Equal weights (0.20 across all five) | {r_eq:.3f} | {rho_eq:.3f} |")
    delta_r = (r_eq - r) if (r == r and r_eq == r_eq) else float("nan")
    print(f"\nΔ Pearson r = {delta_r:+.3f}. A small Δ indicates the comparative result is robust to the weight choice.\n")

    print("Done. Paste the tables above into `thesis/chapter-04-studies.md` Section 4.3 in place of the *to be filled* cells.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
