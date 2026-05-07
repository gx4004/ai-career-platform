"""Compute Chapter 4.3 metrics from the evaluation harness output.

Reads `thesis/eval-results.json` (produced by `scripts/eval_scoring.py`),
computes the four metric families documented in Chapter 4.1.2 of the thesis —
score agreement (Pearson, Spearman, Kendall), distribution shape (mean, std,
median, percentiles, KS distance), latency (median, 95th, max), and per-call
cost — and prints a Markdown block ready to paste into Chapter 4.3 in place of
the *to be filled* cells.

Stdlib only; no scipy/numpy/matplotlib. The figures are exported separately by
hand into `thesis/figures/`.
"""

from __future__ import annotations

import json
import math
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

    print("# Chapter 4.3 metrics — autofill from eval-results.json\n")

    # 4.3.1 Score agreement
    r = pearson(blended_scores, heur_scores)
    rho = spearman(blended_scores, heur_scores)
    tau = kendall_tau(blended_scores, heur_scores)

    print("## 4.3.1 Score agreement\n")
    print(f"- Number of paired observations: **{len(paired)}**")
    print(f"- Pearson correlation (overall score): **r = {r:.3f}**")
    print(f"- Spearman rank correlation (overall score): **ρ = {rho:.3f}**")
    print(f"- Kendall tau-b (overall score): **τ = {tau:.3f}**\n")

    # Per-sub-score correlations
    print("| Sub-score | Pearson r | Spearman ρ |")
    print("|-----------|-----------|------------|")
    sub_keys = ["keywords", "impact", "structure", "clarity", "completeness"]
    for key in sub_keys:
        b_sub: list[float] = []
        h_sub: list[float] = []
        for b, h in paired:
            b_bd = {item.get("key"): item.get("score") for item in (b.get("score_breakdown") or [])}
            h_bd = {item.get("key"): item.get("score") for item in (h.get("score_breakdown") or [])}
            if key in b_bd and key in h_bd:
                b_sub.append(float(b_bd[key]))
                h_sub.append(float(h_bd[key]))
        rk = pearson(b_sub, h_sub) if b_sub else float("nan")
        rhk = spearman(b_sub, h_sub) if b_sub else float("nan")
        print(f"| {key} | {rk:.3f} | {rhk:.3f} |")
    print()

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

    print("Done. Paste the tables above into `thesis/chapter-04-studies.md` Section 4.3 in place of the *to be filled* cells.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
