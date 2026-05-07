# Stage H ablation — heuristic-v3 vs LLM-only baseline

Pearson *r* between each heuristic variant's overall score and the post-hoc-recovered LLM-only score on the Stage G disjoint-pool evaluation set (100 pairs). 95% CIs are cluster bootstrap on resume_id, 2 000 resamples, seed = 42.

| Variant | r vs LLM-only | 95% CI | Spearman ρ | Δ vs v2 |
|---|---|---|---|---|
| heuristic-v2 (BM25 + ESCO + fuzzy) | **0.627** | [0.470, 0.758] | 0.596 | +0.000 |
| heuristic-v3 with no Stage H features | **0.627** | [0.470, 0.758] | 0.596 | +0.000 |
| + bigram / trigram (H.4) | **0.629** | [0.470, 0.758] | 0.583 | +0.002 |
| + ESCO expansion (H.5) | **0.617** | [0.461, 0.752] | 0.578 | -0.009 |
| + STAR detection (H.2) | **0.621** | [0.463, 0.755] | 0.596 | -0.006 |
| + cross-axis coherence (H.3) | **0.605** | [0.438, 0.746] | 0.568 | -0.022 |
| + SBERT semantic fallback (H.1) | **0.623** | [0.452, 0.759] | 0.573 | -0.004 |
| heuristic-v3 (full) | **0.590** | [0.415, 0.735] | 0.556 | -0.036 |

*n = 100 pairs.*
