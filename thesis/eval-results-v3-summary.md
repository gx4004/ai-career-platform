# Stage H ablation — heuristic-v3 vs LLM-only baseline

Pearson *r* between each heuristic variant's overall score and the post-hoc-recovered LLM-only score on the Stage G disjoint-pool evaluation set (100 pairs). 95% CIs are cluster bootstrap on resume_id, 2 000 resamples, seed = 42.

| Variant | r vs LLM-only | 95% CI | Spearman ρ | Δ vs v2 |
|---|---|---|---|---|
| heuristic-v2 (BM25 + ESCO + fuzzy) | **0.627** | [0.470, 0.758] | 0.596 | +0.000 |
| heuristic-v3 with no Stage H features | **0.626** | [0.469, 0.757] | 0.595 | -0.001 |
| + bigram / trigram (H.4) | **0.624** | [0.465, 0.753] | 0.580 | -0.003 |
| + ESCO expansion (H.5) | **0.613** | [0.459, 0.745] | 0.577 | -0.014 |
| + STAR detection (H.2) | **0.619** | [0.461, 0.751] | 0.595 | -0.008 |
| + cross-axis coherence (H.3) | **0.604** | [0.438, 0.745] | 0.566 | -0.023 |
| + SBERT semantic fallback (H.1) | **0.620** | [0.452, 0.756] | 0.572 | -0.007 |
| heuristic-v3 (full) | **0.588** | [0.415, 0.734] | 0.556 | -0.038 |

*n = 100 pairs.*
