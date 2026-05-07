"""Generate Figure 4.1 (score distribution histogram) for thesis Chapter 4.3.2.

Reads `thesis/eval-results.json`, extracts the overall scores for both modes
across all paired observations, and writes a 2x1 subplot histogram to
`thesis/figures/figure-4-1-score-distribution.png` at 300 DPI on a 6.5x4.5
inch canvas (fits A4 thesis page width).

Usage:
    python scripts/plot_figures.py

The output PNG is referenced from chapter-04-studies.md §4.3.2 as Figure 4.1.
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless rendering — no GUI required
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "thesis" / "eval-results.json"
OUT = ROOT / "thesis" / "figures" / "figure-4-1-score-distribution.png"


def main() -> int:
    if not RESULTS.exists():
        print(f"ERROR: results file missing at {RESULTS}", file=sys.stderr)
        return 1

    rows = json.loads(RESULTS.read_text())
    blended = [
        float(r["overall_score"]) for r in rows
        if r.get("mode") == "blended" and r.get("ok") and r.get("overall_score") is not None
    ]
    heuristic = [
        float(r["overall_score"]) for r in rows
        if r.get("mode") == "heuristic" and r.get("ok") and r.get("overall_score") is not None
    ]

    if not blended or not heuristic:
        print("ERROR: missing scores for one or both modes", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)

    fig, axes = plt.subplots(2, 1, figsize=(6.5, 4.5), sharex=True)

    bins = 20
    score_range = (40, 100)

    # Heuristic v2 — top
    ax_h = axes[0]
    ax_h.hist(heuristic, bins=bins, range=score_range, color="#3b6db8", edgecolor="white", linewidth=0.5)
    h_mean = statistics.mean(heuristic)
    h_median = statistics.median(heuristic)
    ax_h.axvline(h_mean, color="#1a3d6e", linestyle="--", linewidth=1.0, label=f"mean = {h_mean:.1f}")
    ax_h.axvline(h_median, color="#1a3d6e", linestyle=":", linewidth=1.0, label=f"median = {h_median:.1f}")
    ax_h.set_ylabel("Count")
    ax_h.set_title("Heuristic v2 mode (n = {})".format(len(heuristic)), fontsize=10)
    ax_h.legend(loc="upper left", fontsize=8, frameon=False)
    ax_h.spines["top"].set_visible(False)
    ax_h.spines["right"].set_visible(False)

    # Blended — bottom
    ax_b = axes[1]
    ax_b.hist(blended, bins=bins, range=score_range, color="#d97a3a", edgecolor="white", linewidth=0.5)
    b_mean = statistics.mean(blended)
    b_median = statistics.median(blended)
    ax_b.axvline(b_mean, color="#7a3f15", linestyle="--", linewidth=1.0, label=f"mean = {b_mean:.1f}")
    ax_b.axvline(b_median, color="#7a3f15", linestyle=":", linewidth=1.0, label=f"median = {b_median:.1f}")
    ax_b.set_xlabel("Overall score (0–100)")
    ax_b.set_ylabel("Count")
    ax_b.set_title("Blended mode (n = {})".format(len(blended)), fontsize=10)
    ax_b.legend(loc="upper left", fontsize=8, frameon=False)
    ax_b.spines["top"].set_visible(False)
    ax_b.spines["right"].set_visible(False)

    fig.suptitle(
        "Figure 4.1 — Distribution of overall scores across 100 (resume, JD) pairs",
        fontsize=11,
        y=0.995,
    )

    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(OUT, dpi=300, bbox_inches="tight", facecolor="white")
    print(f"Wrote {OUT} (heuristic μ={h_mean:.2f}, m={h_median:.1f}; blended μ={b_mean:.2f}, m={b_median:.1f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
