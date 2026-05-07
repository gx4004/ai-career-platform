"""Stage H ablation analysis — produce the Chapter 4 ablation table.

Reads thesis/eval-results-v3.json and prints the per-variant Pearson
correlation against the post-hoc-recovered LLM-only baseline, with 95%
cluster-bootstrap confidence intervals (resampled by resume_id, n=2000,
seed=42), plus the delta versus the v2 baseline cell.

Stdlib only — reuses the helpers already shipped in analyze_eval_results.py.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from analyze_eval_results import (  # noqa: E402
    cluster_bootstrap_pearson,
    cluster_id_from_pair,
    pearson,
    spearman,
)


IN = ROOT / "thesis" / "eval-results-v3.json"
OUT = ROOT / "thesis" / "eval-results-v3-summary.md"


VARIANT_LABELS: dict[str, str] = {
    "v2_baseline": "heuristic-v2 (BM25 + ESCO + fuzzy)",
    "v3_empty": "heuristic-v3 with no Stage H features",
    "ngram_only": "+ bigram / trigram (H.4)",
    "esco_only": "+ ESCO expansion (H.5)",
    "star_only": "+ STAR detection (H.2)",
    "coherence_only": "+ cross-axis coherence (H.3)",
    "sbert_only": "+ SBERT semantic fallback (H.1)",
    "v3_full": "heuristic-v3 (full)",
}

VARIANT_ORDER = list(VARIANT_LABELS)


def main() -> int:
    if not IN.exists():
        print(f"ERROR: {IN} missing — run eval_scoring_v3_ablation.py first", file=sys.stderr)
        return 1

    payload = json.loads(IN.read_text())
    llm_only = payload["llm_only_per_pair"]
    variants = payload["variants"]

    pair_ids = sorted(llm_only.keys())
    cluster_ids = [cluster_id_from_pair(pid) for pid in pair_ids]
    llm_vec = [float(llm_only[pid]) for pid in pair_ids]

    rows = []
    baseline_r: float | None = None
    for vname in VARIANT_ORDER:
        if vname not in variants:
            continue
        vmap = variants[vname]
        scores = [float(vmap[pid]) for pid in pair_ids if pid in vmap]
        if len(scores) != len(pair_ids):
            print(f"WARN: variant {vname} missing pairs ({len(scores)}/{len(pair_ids)})")
            continue
        r = pearson(scores, llm_vec)
        rho = spearman(scores, llm_vec)
        triples = list(zip(cluster_ids, scores, llm_vec, strict=True))
        r_mean, lo, hi = cluster_bootstrap_pearson(triples)
        if vname == "v2_baseline":
            baseline_r = r
            delta = 0.0
        else:
            delta = (r - baseline_r) if baseline_r is not None else float("nan")
        rows.append({
            "variant": vname,
            "label": VARIANT_LABELS[vname],
            "r": r,
            "r_lo": lo,
            "r_hi": hi,
            "rho": rho,
            "delta_r_vs_v2": delta,
            "n": len(scores),
        })

    # Print Markdown table
    md_lines: list[str] = []
    md_lines.append("# Stage H ablation — heuristic-v3 vs LLM-only baseline\n")
    md_lines.append(
        "Pearson *r* between each heuristic variant's overall score and the "
        "post-hoc-recovered LLM-only score on the Stage G disjoint-pool "
        "evaluation set (100 pairs). 95% CIs are cluster bootstrap on resume_id, "
        "2 000 resamples, seed = 42.\n"
    )
    md_lines.append("| Variant | r vs LLM-only | 95% CI | Spearman ρ | Δ vs v2 |")
    md_lines.append("|---|---|---|---|---|")
    for row in rows:
        md_lines.append(
            f"| {row['label']} | **{row['r']:.3f}** | "
            f"[{row['r_lo']:.3f}, {row['r_hi']:.3f}] | "
            f"{row['rho']:.3f} | {row['delta_r_vs_v2']:+.3f} |"
        )
    md_lines.append("")
    md_lines.append(f"*n = {rows[0]['n'] if rows else 0} pairs.*")

    print("\n".join(md_lines))
    OUT.write_text("\n".join(md_lines) + "\n")
    print(f"\nSaved Markdown to {OUT}")

    # Also dump JSON for downstream integration tests / chapter generation.
    summary_json = ROOT / "thesis" / "eval-results-v3-summary.json"
    summary_json.write_text(json.dumps({
        "n_pairs": rows[0]["n"] if rows else 0,
        "rows": rows,
    }, indent=2))
    print(f"Saved JSON summary to {summary_json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
