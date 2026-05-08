# Chapter 4 — Conducted studies and results

This chapter reports the empirical comparison between the two analytical scoring modes implemented in the system: *blended mode* (40% heuristic, 60% language-model output) and *fully heuristic mode* (classical information retrieval only). The research question, introduced in Section 1.4, is how much of the blended mode's discriminative power is recovered by a strictly non-neural heuristic on a controlled synthetic evaluation set, and at what latency and cost ratio.


## 4.1 Methodology

### 4.1.1 Evaluation dataset

The evaluation dataset contains *N* = 30 resumes and *M* = 20 job descriptions across six role tracks: backend engineering, frontend engineering, full-stack engineering, data analytics, product design, and product management. Each track contains five resumes at junior, mid, and senior levels and three or four job descriptions.

The dataset is generated deterministically by `scripts/synthesise_eval_dataset.py` with `SEED = 42`. Resume content is drawn from track-specific `resume_phrases` and job-description content from separate `jd_phrases`; after stop-words and role-domain skill terms are removed, the two pools are lexically disjoint. This Stage G construction mitigates shared-vocabulary leakage (T1) while preserving legitimate skill overlap through canonical labels. Synthetic generation avoids privacy and licensing issues but limits external validity, as discussed in Section 4.4.

The harness pairs each resume with every job description in the same role track. Four tracks contain three job descriptions and two tracks contain four, giving 5 × 3 × 4 + 5 × 4 × 2 = 100 pairs. Each pair is run once in blended mode and once in fully heuristic mode, producing 200 response objects for the metrics in Section 4.3. Appendix B documents the dataset structure.

### 4.1.2 Metrics

Four metric families are computed per pair.

**Score agreement.** Pearson *r* measures linear association between the two modes' overall scores. Spearman ρ and Kendall τ measure rank agreement, which is more relevant when the score is used as a screening signal. The value *r* ≈ 0.7 is used as a practical interpretation anchor following Cohen's conventional benchmarks for large effects in behavioural research [26], not as a formal hypothesis or a literature-derived pass/fail threshold.

**Score distribution.** The Kolmogorov–Smirnov distance compares the overall score distributions and shows whether the heuristic shifts or compresses the score scale even when ranking is similar.

**Latency.** Wall-clock service time is measured from request entry into the tool service until a complete response is returned. Network round-trip time between browser and backend is excluded.

**Per-call cost.** Marginal LLM-side cost is estimated in US dollars. Blended mode incurs Gemini 2.5 Flash token cost; fully heuristic mode incurs no third-party inference charge.

### 4.1.3 Controls

Three controls isolate the comparison. `RESULT_CACHE_ENABLED=false` prevents cache reuse from contaminating latency, and `scripts/eval_scoring.py` sets `HEURISTIC_VERSION=v2` before importing the application settings so that both modes use the same strong heuristic implementation. The remaining experimental difference is whether `complete_structured` is invoked. The LLM client uses temperature 0.3, so sampling variance is not eliminated; it is bounded only by running one fixed dataset through one configured provider and by reporting the result as an implementation characterisation rather than a population estimate.

### 4.1.4 Threats to validity

Four threats are tracked so that the interpretation of Section 4.3 remains bounded.

**T1 (Shared-vocabulary leakage between resume and job-description pools, MITIGATED).** The early synthesis script drew resume bullets and job-description responsibilities from the same per-track list. In pair `r-backend-01__jd-backend-02`, the sentence "designed and shipped REST APIs serving production traffic" appeared on both sides, and the leakage-version keyword-axis correlation was Pearson *r* = 0.941. The regenerated dataset separates `resume_phrases` and `jd_phrases`; `scripts/verify_disjoint_pools.py` reports mean per-pair content-token overlap falling from 11.82 to 0.44, a 27× reduction, with zero pairs above the >3-token threshold instead of 97. The results below use the post-mitigation dataset; leakage artefacts remain archived as `thesis/eval-dataset-with-leakage.json` and `thesis/eval-results-with-leakage.json`.

**T2 (Self-correlation between compared modes, MEASURED).** Since blended score = 0.40 × heuristic + 0.60 × LLM, the headline blended-versus-heuristic correlation includes a structural floor. Because the backend stores the blended and heuristic scores produced by this formula, the LLM-only score is recoverable without new API calls: *llm_only = (blended − 0.4 × heuristic) / 0.6*. Section 4.3.1' reports this baseline.

**T3 (Non-independent paired observations, ADDRESSED).** The 100 observations are not independent because each resume appears in three or four pairs and each job description in five pairs. Pearson confidence intervals are therefore computed by cluster bootstrap on `resume_id` with 2 000 resamples and `seed=42`.

**T4 (Post-hoc heuristic design, DISCLOSED).** The strong heuristic v2 was designed after the blended pipeline existed. The agreement in Section 4.3 therefore partly reflects design coupling. A fully closed comparison would require designing the heuristic against a held-out reference; this is outside the Bachelor-thesis scope.

T1, T2, and T3 are mitigated by regeneration, LLM-only decomposition, and clustered intervals. T4 remains a disclosed limitation.

In Cook–Campbell terms [27] T1 and T2 cluster under construct validity (the operationalisation of agreement between the two scoring modes), T3 falls under statistical-conclusion validity (the inferential machinery accommodating dependent paired observations), and T4 falls under internal validity (researcher degrees of freedom in the post-hoc heuristic design). External validity, the fourth canonical category, is not addressed within the experiment because the dataset is single-language (English), single-author (one synthesiser produced all 30 resumes), and single-evaluator (one Gemini family); Section 4.4 enumerates these as deployment caveats, foregrounded as the most consequential next step before any generalisation beyond the synthetic benchmark.

These threats also define how the results should not be read. The chapter does not claim population-level hiring validity, fairness, or universal superiority of one scoring family. It reports a controlled within-set characterisation of the implemented system, using a reproducible benchmark whose construction is transparent enough to audit.


## 4.2 The strong heuristic (v2)

The lightweight prepass from Chapter 3 is sufficient for fallback behaviour but too weak as a research baseline. The strong heuristic v2 replaces binary keyword matching and unweighted averaging with classical information-retrieval components while remaining strictly non-neural.

### 4.2.1 TF–IDF–weighted keyword evidence

The v2 heuristic weights keyword evidence by inverse document frequency, so rare technical terms contribute more than common words [5, 6]. Keyword alignment is computed as

\[
\text{keywords}(R, J) \;=\; \frac{\sum_{t \in K(R) \cap K(J)} \text{idf}(t)}{\sum_{t \in K(J)} \text{idf}(t)} \;\times\; 100,
\]

where *R* is the resume, *J* is the job description, and *K*(·) extracts the keyword set. BM25 is implemented in `app/services/quality_signals_v2.py` as `_bm25_score` with *k₁* = 1.5 and *b* = 0.75. The final keyword-axis score is `0.7 × weighted_keyword_score + 0.3 × min(100, BM25 × 4)`, clamped to \[0, 100]. Production uses a bundled ESCO-derived baseline IDF; the evaluation harness recomputes IDF from the job descriptions in the benchmark.

### 4.2.2 ESCO-aligned skill normalisation

The heuristic normalises surface variants such as *Postgres*, *PostgreSQL*, and *postgres database* to one canonical ESCO label [8, 9, 12]. The bundled JSON contains 107 canonical digital and creative-industry skill entries and is structured for expansion to broader production coverage. Resume and job-description text are scanned for surface variants, mapped to canonical labels, and intersected.

This top-down design was chosen over a learned skill extractor because it keeps the fully heuristic path inspectable. Every accepted match can be traced to a surface variant in the bundled taxonomy or to the fuzzy rule described below. That property is useful when heuristic mode is presented as an auditable alternative to the LLM path.

### 4.2.3 Fuzzy matching

For skills or keywords outside the bundled ESCO subset, v2 applies a normalised string-similarity pass related to edit-distance matching [7] using Python's `difflib.SequenceMatcher`. A job-description keyword is counted when it appears exactly, maps through ESCO, or reaches similarity threshold *τ* = 0.85 against a resume candidate phrase. The threshold admits typographic variants such as *Javacript* for *JavaScript* while rejecting unrelated tokens.

### 4.2.4 Section-weighted features

Skill evidence is weighted by resume section because a skill in *Skills* carries a different signal from the same word in *Education* or a project description [18]. Matches in *Skills* contribute 1.0, *Experience* or *Projects* 0.7, *Summary* 0.5, and *Education* 0.3. The weighted match total is normalised against the maximum possible weighted match.

### 4.2.5 Quantification regex

The impact sub-score detects measurable outcomes through one composite regular expression covering bare integers, percentages, currency amounts, time periods, magnitudes such as k/M/B/×, user or customer counts, and team-size descriptors. The count of quantified bullets enters the score with logarithmic saturation.

### 4.2.6 Action-verb scoring

The clarity sub-score counts the fraction of bullets whose leading token belongs to an author-compiled action-verb dictionary of 190 entries (assembled from publicly available career-services word lists; the working list is archived in the project repository alongside the heuristic implementation). Action verbs such as "led", "shipped", and "automated" are treated as stronger ownership evidence than passive or filler openings.

### 4.2.7 Score combination

The five sub-scores (keyword alignment, impact, structure, clarity, completeness) are combined as a weighted mean: 0.30, 0.25, 0.15, 0.15, and 0.15. These weights are author-selected rather than survey-derived. The blended-mode 0.40/0.60 split is also an engineering choice rather than an optimised parameter: it keeps the default mode language-model-led while retaining a deterministic scoring floor. Section 4.3.5 reports an equal-weight sensitivity check for the heuristic sub-score weights.

### 4.2.8 Implementation notes

The strong heuristic v2 lives in `app/services/quality_signals_v2.py` alongside the lightweight `quality_signals.py`. `HEURISTIC_VERSION=v2` selects the strong implementation for the analytical tools and is the default for the experimental run reported here.

### 4.2.9 The administrative toggle

Runtime switchability is provided by `SCORING_MODE`, which accepts `blended` and `heuristic`. An in-memory override in `app/services/runtime_settings.py` is updated through `POST /api/v1/admin/scoring-mode` and read by analytical services on every request. The override supports live demonstration during the diploma defence but resets on process restart, leaving the environment variable as the configuration of record.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```


## 4.3 Results

The evaluation harness `scripts/eval_scoring.py` produced 100 paired observations. Both modes succeeded on every pair, and `scripts/analyze_eval_results.py` generated the tables below from `thesis/eval-results.json`.

### 4.3.1 Score agreement

Across the 100 (resume, job-description) pairs in the evaluation set, three rank- and value-agreement statistics are computed between the overall score in the blended mode and the overall score in the fully heuristic v2 mode: Pearson *r*, Spearman ρ, and Kendall τ. Table 4.1 reports the post-mitigation values computed on the disjoint-vocabulary dataset described in Section 4.1.1 alongside the pre-mitigation values from the archived leakage-version run, for an explicit before/after comparison.

*Table 4.1: Overall agreement between blended and fully heuristic modes (n = 100 pairs). Pearson confidence intervals are computed by cluster bootstrap on `resume_id` with 2 000 resamples and seed = 42, addressing threat T3 of Section 4.1.4.*

| Statistic | Post-mitigation (disjoint) | Pre-mitigation (leakage version) | Interpretation |
|-----------|----------------------------|----------------------------------|----------------|
| Pearson *r* | **0.836** [95% CI 0.762, 0.896] | 0.727 [95% CI 0.609, 0.814] | Linear association between mode scores. |
| Spearman ρ | **0.847** | 0.708 | Rank agreement; the property most relevant to screening use. |
| Kendall τ | **0.669** | 0.526 | Concordance-based rank agreement. |

The post-mitigation Pearson *r* is higher than the leakage-version value even though leakage was expected to inflate keyword overlap. The per-sub-score breakdown in Table 4.2 explains the result: lexical leakage added noise to some non-keyword axes, while the disjoint construction preserved legitimate canonical skill overlap.

*Table 4.2: Per-sub-score correlations between blended and heuristic-only modes, post-mitigation versus archived leakage version. Bold entries mark axes above the 0.7 practical interpretation anchor introduced in Section 4.1.2.*

| Sub-score | Post-mitigation Pearson *r* | Pre-mitigation Pearson *r* | Spearman ρ | Kendall τ |
|-----------|-----------------------------|----------------------------|------------|-----------|
| Keywords | **0.937** | 0.941 | 0.946 | 0.845 |
| Impact | 0.430 | 0.561 | 0.447 | 0.332 |
| Structure | **0.830** | 0.440 | 0.865 | 0.804 |
| Clarity | 0.395 | 0.475 | 0.373 | 0.289 |
| Completeness | **0.756** | 0.691 | 0.793 | 0.689 |

The agreement is strongest on keywords and structure and weakest on clarity, the axis where the language model sees prose-quality evidence that the heuristic cannot inspect. A correlation-space sanity check is consistent with the blended formula. Under equal-variance assumptions on the heuristic and LLM-only sub-scores, the algebra of `blended = 0.4 × heuristic + 0.6 × LLM` predicts r(blended, heuristic) ≈ 0.857 from the observed r(LLM-only, heuristic) = 0.627; the observed value 0.836 sits within the cluster-bootstrap half-width of this prediction, indicating that the headline blended-versus-heuristic agreement is a transparent function of the two upstream agreements rather than an artefact of leakage or evaluator drift.

The keyword axis being stable across leakage and disjoint versions is important. It shows that the post-mitigation result is not simply an artefact of repeated responsibility sentences; both modes still respond to legitimate skill labels such as Python, React, BM25, and PostgreSQL. By contrast, the clarity axis remains low because a deterministic rule set cannot assess ownership and role-fit prose with the same nuance as the language model.

### 4.3.1' LLM-only baseline (T2 mitigation)

Because the heuristic prepass is exposed to the language model as a *locked payload* (Section 3.2.3), the heuristic component of the blended score is invariant under the LLM call. The blended formula `blended = 0.4 × heuristic + 0.6 × LLM-only` is therefore an exact identity, and the LLM-only score per pair is recoverable post-hoc from the blended and heuristic-only scores already reported in the manifest:

LLM-only = (blended − 0.4 × heuristic) / 0.6

This recovery requires no additional API calls; it is a deterministic algebraic transformation of the existing per-pair results. The Pearson correlation between the recovered LLM-only score and the heuristic-only score isolates the *cross-mode agreement* (what the language model and the classical-IR heuristic agree on) controlling for the structural component shared between the blended and heuristic-only modes by construction. Table 4.3 reports the three pairwise correlations with cluster-bootstrap confidence intervals.

*Table 4.3: Pairwise score correlations after LLM-only decomposition. Cluster bootstrap on resume identity, 2 000 resamples, seed = 42. The LLM-only column is recovered post-hoc from the locked-payload identity rather than from a second LLM rerun.*

| Pair | Pearson *r* | 95% CI (cluster bootstrap) | Spearman ρ |
|------|-------------|----------------------------|------------|
| Blended vs heuristic | **0.836** | [0.762, 0.896] | 0.847 |
| LLM-only vs heuristic | **0.627** | [0.476, 0.765] | 0.596 |
| Blended vs LLM-only | 0.952 | [0.923, 0.973] | — |

The recovered LLM-only score has mean 71.29, standard deviation 8.45, median 73.33, 5th percentile 54.62, and 95th percentile 82.00. The 0.627 correlation is the honest cross-mode agreement after removing the 0.40 heuristic share embedded in the blended score; the 0.836 headline remains relevant for the operational question of what the runtime toggle changes.

The two numbers answer different questions. The LLM-only value asks how far classical IR agrees with the language model when the shared heuristic component is removed. The blended-versus-heuristic value asks what an operator loses when switching the deployed system from default blended mode to fully heuristic runtime mode.

### 4.3.2 Score distribution

Table 4.4 reports the per-mode score distribution statistics across all 100 pairs. The Kolmogorov–Smirnov distance between the two distributions complements the rank-correlation reading by reporting how differently the two modes spread the scores across the 0–100 range.

*Table 4.4: Overall score distribution per mode (n = 100 pairs). The KS distance compares the empirical cumulative distribution functions of the two modes; smaller values indicate more similar distributions.*

| Statistic | Blended mode | Heuristic v2 mode |
|-----------|--------------|-------------------|
| Mean | 71.84 | 72.66 |
| Standard deviation | 7.19 | 7.08 |
| Median | 73.00 | 74.50 |
| 5th percentile | 58.00 | 59.00 |
| 95th percentile | 81.00 | 82.00 |
| KS distance vs other mode | 0.100 | 0.100 |

The means differ by 0.82 points and the medians by 1.50 points, so the aggregate score distributions are close. The KS distance of 0.100 is half the leakage-version KS distance of 0.200, indicating that the disjoint-pool regeneration also tightens the per-mode distribution overlap, not only the rank agreement. Figure 4.1 visualises the two distributions.

![](figures/figure-4-1-score-distribution.png){width=100%}

*Figure 4.1: Distribution of overall scores across 100 synthetic (resume, JD) pairs. Top: heuristic-only mode (mean 72.66, median 74.5). Bottom: blended mode (mean 71.84, median 73.0). The dashed vertical line marks the mean and the dotted vertical line marks the median in each panel.*

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

### 4.3.3 Latency

Wall-clock service-side latency for a single tool invocation is summarised in Table 4.5. The blended-mode figure is dominated by the upstream Gemini structured-output inference call; the heuristic-only mode runs entirely as local string processing.

*Table 4.5: Service-side latency for a single tool invocation, in milliseconds, with the per-row blended-to-heuristic ratio. The maximum-observed row reflects one retry-after-timeout case absorbed by the four-retry exponential-backoff policy described in Section 3.1.1.*

| Metric | Blended (ms) | Heuristic v2 (ms) | Ratio |
|--------|--------------|-------------------|-------|
| Median | 18 232.1 | 25.5 | 714× |
| 95th percentile | 24 713.7 | 32.1 | 770× |
| Maximum observed | 65 926.6 | 34.1 | 1 933× |

Blended latency is dominated by Gemini structured-output inference over approximately 608 input tokens plus prompt overhead and 1 118 output tokens. The maximum of 65 926.6 ms reflects one retry-after-timeout case handled by the retry policy. Heuristic v2 runs in tens of milliseconds and satisfies the N1a target from Section 2.1.2. Component-level decomposition between token generation, network round-trip, and serialisation overhead was not instrumented in the prototype; future work could profile this granularity (for instance via OpenTelemetry spans on the Vertex AI client or middleware timing decorators) to localise optimisation targets. The two-to-three-orders-of-magnitude latency gap is the operational rationale for keeping both modes runtime-switchable rather than committing to one path.

### 4.3.4 Per-call cost

Cost uses the Vertex AI Gemini 2.5 Flash rates in effect at measurement time: input $0.075 / 1 M tokens and output $0.30 / 1 M tokens. The blended run used an estimated 608 input tokens and 1 118 output tokens per call on average; Table 4.6 summarises the resulting per-call and projected monthly cost figures.

*Table 4.6: Per-call LLM-side cost, in US dollars, at the Vertex AI Gemini 2.5 Flash rates in effect at measurement time. The estimator follows the ~4-characters-per-token rule of thumb and does not include all server-side prompt overhead, so the figures are order-of-magnitude rather than billing-grade.*

| Statistic | Blended mode | Heuristic v2 mode |
|-----------|--------------|-------------------|
| Average per-call cost | $0.00038 | $0.00000 |
| 95th-percentile per-call cost | $0.00042 | $0.00000 |
| Projected monthly cost at 1 000 analyses/day | $11.43 | $0.00 |

Token counts are approximations following the `~4 characters per token` rule of thumb that the Vertex AI documentation uses. The input-token figure counts the resume and the job description text the harness sends; the system prompt and the locked-payload block are configured server-side in the analytical service and contribute additional per-call overhead that is not captured by the harness's estimator. Exact tokeniser-derived counts are deferred to future work; the headline cost claim in this section is an order-of-magnitude statement, not a billing-grade figure. The recomputation that produces this table is implemented in `scripts/recompute_eval_cost.py`, which rebuilds the prompt for every pair without a second LLM call.

This absolute cost is small at thesis scale, but the ratio matters for mode design. A demonstration, outage fallback, or high-volume preview flow can use the heuristic path without accumulating third-party inference cost. The blended path can then be reserved for cases where richer explanations are worth the additional latency.

### 4.3.5 Sensitivity to the score-combination weights

The five-sub-score weights introduced in Section 4.2.7 are author-selected. To check that the comparative result is not an artefact of the specific weights, the score is recomputed offline from the same per-sub-score breakdown using equal weights (0.20 each), and the Pearson and Spearman correlations between modes are computed under both weight settings. Table 4.7 reports the result.

*Table 4.7: Sensitivity of the blended-versus-heuristic agreement to the score-combination weights. The Δ row shows the absolute movement after switching from the author-selected weighting to equal weights.*

| Weighting | Pearson *r* | Spearman ρ |
|-----------|-------------|------------|
| Author-selected (0.30, 0.25, 0.15, 0.15, 0.15) | 0.836 | 0.847 |
| Equal (0.20 across all five) | 0.813 | 0.823 |
| Δ | −0.023 | −0.024 |

Pearson moves by Δ = −0.023 and Spearman by Δ = −0.024 after rounding to three decimals. Both remain above the practical 0.7 interpretation anchor, so the value-association result is not dependent on the exact heuristic sub-score weighting choice. The rank-agreement reading is similarly robust; the comparative claim of Section 4.3.1 is therefore weighting-invariant within this evaluation set rather than weighting-specific.

### 4.3.6 Heuristic-enhancement ablation (Stage H)

Stage H tested whether targeted heuristic enhancements could close the LLM-only residual without adding a deployed neural dependency. A separate `quality_signals_v3.py` module added five gated signals: SBERT semantic fallback with `all-MiniLM-L6-v2` at cosine threshold 0.65 (H.1), STAR-format detection (H.2), cross-axis coherence checks (H.3), bigram/trigram matching (H.4), and ESCO expansion from 107 to 354 entries (H.5). Each variant was compared against the same post-hoc LLM-only baseline, so no additional LLM calls were issued.

Table 4.8 reports the Pearson correlation against the post-hoc LLM-only score for each variant, with the cluster-bootstrap interval and the absolute delta against the v2 baseline.

*Table 4.8: Stage H ablation. Pearson correlation between each variant and the post-hoc LLM-only score, with cluster-bootstrap 95% confidence intervals (`resume_id` clusters, 2 000 resamples, seed = 42). Bold rows mark the v2 baseline and the full v3 stack endpoints of the ablation.*

| Variant | Pearson *r* | 95% CI | Spearman ρ | Δ vs v2 |
|---------|-------------|--------|------------|---------|
| **heuristic-v2 (BM25 + ESCO + fuzzy)** | **0.627** | [0.470, 0.758] | 0.596 | baseline |
| heuristic-v3 with no Stage H features | 0.627 | [0.470, 0.758] | 0.596 | +0.000 |
| Bigram/trigram matching (H.4) | 0.629 | [0.470, 0.758] | 0.583 | +0.002 |
| SBERT semantic fallback (H.1) | 0.623 | [0.452, 0.759] | 0.573 | −0.004 |
| STAR detection (H.2) | 0.621 | [0.463, 0.755] | 0.596 | −0.006 |
| ESCO expansion 107 → 354 (H.5) | 0.617 | [0.461, 0.752] | 0.578 | −0.009 |
| Cross-axis coherence (H.3) | 0.605 | [0.438, 0.746] | 0.568 | −0.022 |
| **heuristic-v3 full stack** | **0.590** | [0.415, 0.735] | 0.556 | −0.036 |

The result is a controlled null with small negative drift in the full configuration. `v3-empty` reproduces v2 exactly to three decimals, validating the module boundary. Single-feature deltas range from +0.002 to −0.022 and remain inside the cluster-bootstrap interval width on the 100-pair set, so none of the variants are statistically distinguishable from the v2 baseline. The full v3 stack falls to *r* = 0.590 (Δ = −0.036), suggesting that small false-positive effects compound when all five gated signals fire simultaneously.

The likely explanation is that the synthetic benchmark already exposes canonical skill overlap, so extra keyword recall through SBERT, n-grams, or ESCO expansion adds little. The remaining gap to the LLM-only score reflects prose quality, narrative coherence, and role-fit judgement rather than missing keyword evidence. The ablation is reproducible through `scripts/eval_scoring_v3_ablation.py`, `scripts/analyze_v3_ablation.py`, `backend/app/services/quality_signals_v3.py`, and `backend/app/data/esco_skills_expanded.json`; PyTorch and sentence-transformers stay in `backend/requirements-thesis-eval.txt`, outside the production requirements.

This null result is still useful. It prevents the future-work section from overstating sentence-transformer matching as an obvious next production step. On this benchmark, the strict v2 heuristic is already near the available keyword-and-structure ceiling, and the unresolved gap sits in evidence classes that require either different features or a different evaluation surface.

### 4.3.7 Implementation note on Stage H reproducibility

The ablation reuses `thesis/eval-results.json` from Stage G and recovers LLM-only scores through the identity in Section 4.3.1'. It runs in approximately 4 minutes on commodity hardware: about 110 s for SBERT first load and inference, and about 10 s combined for deterministic variants. This keeps Stage H as a research artefact rather than a production dependency.


## 4.4 Discussion and limitations

Within this synthetic evaluation set, the fully heuristic mode recovers most of the blended mode's aggregate discrimination: Pearson *r* = 0.836 [95% CI 0.762, 0.896], Spearman ρ = 0.847, median latency 25.5 ms rather than 18.2 s, and zero LLM-side marginal cost. After removing the structural 0.40 heuristic share in the blended formula, LLM-only versus heuristic agreement is *r* = 0.627 [95% CI 0.476, 0.765]. The deterministic baseline is therefore strong enough to justify deployment as a fallback and runtime mode, while the blended mode remains valuable for qualitative explanations and clarity-sensitive judgement.

Four limitations constrain the claim. **Single-language scope:** all evaluation resumes and job descriptions are in English, although ESCO is multilingual. **Single-subject evaluation:** one author synthesised all 30 resumes, so stylistic regularities may not generalise. **Single LLM provider:** the blended mode uses Gemini 2.5 Flash only. **Bias and fairness:** the benchmark has no demographic annotations and cannot support disparate-impact analysis; production deployment beyond thesis scope would require a fairness audit aligned with algorithmic-hiring literature [22, 23, 24].

The per-sub-score breakdown is the most useful diagnostic result. Keywords and structure converge strongly, while clarity diverges. This explains why the heuristic can be fast, cheap, and operationally useful without replacing the LLM component entirely.

A final limitation concerns trend awareness. The approved topic includes current job-market trends, but the implemented system reasons over a static resume and the current text of a job description. It does not model posting-frequency changes, regional demand, salary movement, or temporal skill adoption. Those signals would require a separate labour-market data layer and are left to future work.
