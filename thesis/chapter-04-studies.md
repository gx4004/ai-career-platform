# Chapter 4 — Conducted studies and results

This chapter reports the empirical comparison between the two analytical scoring modes implemented in the system: *blended mode* (40% heuristic, 60% language-model output) and *fully heuristic mode* (classical information retrieval only). The research question, introduced in Section 1.4, is how much of the blended mode's discriminative power is recovered by a strictly non-neural heuristic on a controlled synthetic evaluation set, and at what latency and cost ratio.


## 4.1 Methodology

### 4.1.1 Evaluation dataset

The evaluation dataset contains *N* = 30 resumes and *M* = 20 job descriptions across six role tracks: backend engineering, frontend engineering, full-stack engineering, data analytics, product design, and product management. Each track contains five resumes at junior, mid, and senior levels and three or four job descriptions.

The dataset is generated deterministically by `scripts/synthesise_eval_dataset.py` with `SEED = 42`. Resume content is drawn from track-specific `resume_phrases` and job-description content from separate `jd_phrases`; after stop-words and role-domain skill terms are removed, the two pools are lexically disjoint. This Stage G construction mitigates shared-vocabulary leakage (T1) while preserving legitimate skill overlap through canonical labels. Synthetic generation avoids privacy and licensing issues but limits external validity, as discussed in Section 4.4.

The harness pairs each resume with every job description in the same role track. Four tracks contain three job descriptions and two tracks contain four, giving 5 × 3 × 4 + 5 × 4 × 2 = 100 pairs. Each pair is run once in blended mode and once in fully heuristic mode, producing 200 response objects for the metrics in Section 4.3. Appendix B documents the dataset structure.

### 4.1.2 Metrics

Four metric families are computed per pair.

**Score agreement.** Pearson *r* measures linear association between the two modes' overall scores. Spearman ρ and Kendall τ measure rank agreement, which is more relevant when the score is used as a screening signal. The value *r* ≈ 0.7 from retrieval-quality discussion [6] is used only as a reference anchor, not as a formal hypothesis.

**Score distribution.** The Kolmogorov–Smirnov distance compares the overall score distributions and shows whether the heuristic shifts or compresses the score scale even when ranking is similar.

**Latency.** Wall-clock service time is measured from request entry into the tool service until a complete response is returned. Network round-trip time between browser and backend is excluded.

**Per-call cost.** Marginal LLM-side cost is estimated in US dollars. Blended mode incurs Gemini 2.5 Flash token cost; fully heuristic mode incurs no third-party inference charge.

### 4.1.3 Controls

Three controls isolate the comparison. The same content hash is used for both modes per pair, and `RESULT_CACHE_ENABLED=false` prevents cache reuse from contaminating latency. The same heuristic implementation, selected by `HEURISTIC_VERSION`, is used by both modes, so the only experimental difference is whether `complete_structured` is invoked. The LLM temperature is fixed at 0.0, removing sampling variance from the blended-mode run.

### 4.1.4 Threats to validity

Four threats are tracked so that the interpretation of Section 4.3 remains bounded.

**T1 (Shared-vocabulary leakage between resume and job-description pools, MITIGATED).** The early synthesis script drew resume bullets and job-description responsibilities from the same per-track list. In pair `r-backend-01__jd-backend-02`, the sentence "designed and shipped REST APIs serving production traffic" appeared on both sides, and the leakage-version keyword-axis correlation was Pearson *r* = 0.941. The regenerated dataset separates `resume_phrases` and `jd_phrases`; `scripts/verify_disjoint_pools.py` reports mean per-pair content-token overlap falling from 11.82 to 0.44, a 27× reduction, with zero pairs above the >3-token threshold instead of 97. The results below use the post-mitigation dataset; leakage artefacts remain archived as `thesis/eval-dataset-with-leakage.json` and `thesis/eval-results-with-leakage.json`.

**T2 (Self-correlation between compared modes, MEASURED).** Since blended score = 0.40 × heuristic + 0.60 × LLM, the headline blended-versus-heuristic correlation includes a structural floor. Because the heuristic payload is locked inside the blended prompt, the LLM-only score is recoverable without new API calls: *llm_only = (blended − 0.4 × heuristic) / 0.6*. Section 4.3.1' reports this baseline.

**T3 (Non-independent paired observations, ADDRESSED).** The 100 observations are not independent because each resume appears in three or four pairs and each job description in five pairs. Pearson confidence intervals are therefore computed by cluster bootstrap on `resume_id` with 2 000 resamples and `seed=42`.

**T4 (Post-hoc heuristic design, DISCLOSED).** The strong heuristic v2 was designed after the blended pipeline existed. The agreement in Section 4.3 therefore partly reflects design coupling. A fully closed comparison would require designing the heuristic against a held-out reference; this is outside the Bachelor-thesis scope.

T1, T2, and T3 are mitigated by regeneration, LLM-only decomposition, and clustered intervals. T4 remains a disclosed limitation.

In Cook-Campbell terms T1 and T2 cluster under construct validity (the operationalisation of agreement between the two scoring modes), T3 falls under statistical-conclusion validity (the inferential machinery accommodating dependent paired observations), and T4 falls under internal validity (researcher degrees of freedom in the post-hoc heuristic design). External validity, the fourth canonical category, is not addressed within the experiment because the dataset is single-language (English), single-author (one synthesiser produced all 30 resumes), and single-evaluator (one Gemini family); Section 4.4 enumerates these as deployment caveats, foregrounded as the most consequential next step before any generalisation beyond the synthetic benchmark.

These threats also define how the results should not be read. The chapter does not claim population-level hiring validity, fairness, or universal superiority of one scoring family. It reports a controlled within-set characterisation of the implemented system, using a reproducible benchmark whose construction is transparent enough to audit.


## 4.2 The strong heuristic (v2)

The lightweight prepass from Chapter 3 is sufficient for fallback behaviour but too weak as a research baseline. The strong heuristic v2 replaces binary keyword matching and unweighted averaging with classical information-retrieval components while remaining strictly non-neural.

### 4.2.1 TF–IDF–weighted keyword evidence

The v2 heuristic weights keyword evidence by inverse document frequency, so rare technical terms contribute more than common words [5, 6]. Keyword alignment is computed as

\[
\text{keywords}(R, J) \;=\; \frac{\sum_{t \in K(R) \cap K(J)} \text{idf}(t)}{\sum_{t \in K(J)} \text{idf}(t)} \;\times\; 100,
\]

where *R* is the resume, *J* is the job description, and *K*(·) extracts the keyword set. BM25 is implemented in `app/services/quality_signals_v2.py` as `_bm25_score` with *k₁* = 1.5 and *b* = 0.75. Production uses a bundled ESCO-derived baseline IDF; the evaluation harness recomputes IDF from the job descriptions in the benchmark.

### 4.2.2 ESCO-aligned skill normalisation

The heuristic normalises surface variants such as *Postgres*, *PostgreSQL*, and *postgres database* to one canonical ESCO label [8, 9, 12]. A curated ESCO subset of roughly one hundred digital and creative-industry entries is bundled as JSON and structured for expansion to broader production coverage. Resume and job-description text are scanned for surface variants, mapped to canonical labels, and intersected.

This top-down design was chosen over a learned skill extractor because it keeps the fully heuristic path inspectable. Every accepted match can be traced to a surface variant in the bundled taxonomy or to the fuzzy rule described below. That property is useful when heuristic mode is presented as an auditable alternative to the LLM path.

### 4.2.3 Fuzzy matching

For skills or keywords outside the bundled ESCO subset, v2 applies a Levenshtein-style fuzzy pass [7] using Python's `difflib.SequenceMatcher`. A job-description keyword is counted when it appears exactly, maps through ESCO, or reaches similarity threshold *τ* = 0.85 against a resume token. The threshold admits typographic variants such as *Javacript* for *JavaScript* while rejecting unrelated tokens.

### 4.2.4 Section-weighted features

Skill evidence is weighted by resume section because a skill in *Skills* carries a different signal from the same word in *Education* or a project description [18]. Matches in *Skills* contribute 1.0, *Experience* or *Projects* 0.7, *Summary* 0.5, and *Education* 0.3. The weighted match total is normalised against the maximum possible weighted match.

### 4.2.5 Quantification regex

The impact sub-score detects measurable outcomes through one composite regular expression covering bare integers, percentages, currency amounts, time periods, magnitudes such as k/M/B/×, user or customer counts, and team-size descriptors. The count of quantified bullets enters the score with logarithmic saturation.

### 4.2.6 Action-verb scoring

The clarity sub-score counts the fraction of bullets whose leading token belongs to a curated action-verb dictionary of approximately 190 entries compiled from university career-services resources. Action verbs such as "led", "shipped", and "automated" are treated as stronger ownership evidence than passive or filler openings.

### 4.2.7 Score combination

The five sub-scores (keyword alignment, impact, structure, clarity, completeness) are combined as a weighted mean: 0.30, 0.25, 0.15, 0.15, and 0.15. These weights are author-selected rather than survey-derived. Section 4.3.5 reports an equal-weight sensitivity check.

### 4.2.8 Implementation notes

The strong heuristic v2 lives in `app/services/quality_signals_v2.py` alongside the lightweight `quality_signals.py`. `HEURISTIC_VERSION=v2` selects the strong implementation for the analytical tools and is the default for the experimental run reported here.

### 4.2.9 The administrative toggle

Runtime switchability is provided by `SCORING_MODE`, which accepts `blended` and `heuristic`. An in-memory override in `app/services/runtime_settings.py` is updated through `POST /api/v1/admin/scoring-mode` and read by analytical services on every request. The override supports live demonstration during the diploma defence but resets on process restart, leaving the environment variable as the configuration of record.


## 4.3 Results

The evaluation harness `scripts/eval_scoring.py` produced 100 paired observations. Both modes succeeded on every pair, and `scripts/analyze_eval_results.py` generated the tables below from `thesis/eval-results.json`.

### 4.3.1 Score agreement

Table 4.1 compares post-mitigation and leakage-version agreement.

| Statistic | Post-mitigation | Pre-mitigation (leakage) |
|-----------|-----------------|--------------------------|
| Pearson *r* | **0.836** [95% CI 0.762, 0.896] | 0.727 [95% CI 0.609, 0.814] |
| Spearman ρ | **0.847** | 0.708 |
| Kendall τ | **0.669** | 0.526 |

The post-mitigation Pearson *r* is higher than the leakage-version value even though leakage was expected to inflate keyword overlap. The per-sub-score table explains the result: lexical leakage added noise to some non-keyword axes, while the disjoint construction preserved legitimate canonical skill overlap.

| Sub-score | Post-mitigation Pearson *r* | Pre-mitigation Pearson *r* | Spearman ρ | Kendall τ |
|-----------|-----------------------------|----------------------------|------------|-----------|
| keywords | 0.937 | 0.941 | 0.946 | 0.845 |
| impact | 0.430 | 0.561 | 0.447 | 0.332 |
| structure | 0.830 | 0.440 | 0.865 | 0.804 |
| clarity | 0.395 | 0.475 | 0.373 | 0.289 |
| completeness | 0.756 | 0.691 | 0.793 | 0.689 |

The agreement is strongest on keywords and structure and weakest on clarity, the axis where the language model sees prose-quality evidence that the heuristic cannot inspect. A correlation-space sanity check is consistent with the blended formula. Under equal-variance assumptions on the heuristic and LLM-only sub-scores, the algebra of `blended = 0.4 × heuristic + 0.6 × LLM` predicts r(blended, heuristic) ≈ 0.857 from the observed r(LLM-only, heuristic) = 0.627; the observed value 0.836 sits within the cluster-bootstrap half-width of this prediction, indicating that the headline blended-versus-heuristic agreement is a transparent function of the two upstream agreements rather than an artefact of leakage or evaluator drift.

The keyword axis being stable across leakage and disjoint versions is important. It shows that the post-mitigation result is not simply an artefact of repeated responsibility sentences; both modes still respond to legitimate skill labels such as Python, React, BM25, and PostgreSQL. By contrast, the clarity axis remains low because a deterministic rule set cannot assess ownership and role-fit prose with the same nuance as the language model.

### 4.3.1' LLM-only baseline (T2 mitigation)

The locked-payload design makes the LLM-only score recoverable as:

LLM-only = (blended − 0.4 × heuristic) / 0.6

| Pair | Pearson *r* | 95% CI (cluster bootstrap) | Spearman ρ |
|------|-------------|----------------------------|------------|
| blended vs heuristic | **0.836** | [0.762, 0.896] | 0.847 |
| LLM-only vs heuristic | **0.627** | [0.476, 0.765] | 0.596 |
| blended vs LLM-only | 0.952 | [0.923, 0.973] | n/a |

The recovered LLM-only score has mean 71.29, standard deviation 8.45, median 73.33, 5th percentile 54.62, and 95th percentile 82.00. The 0.627 correlation is the honest cross-mode agreement after removing the 0.40 heuristic share embedded in the blended score; the 0.836 headline remains relevant for the operational question of what the runtime toggle changes.

The two numbers answer different questions. The LLM-only value asks how far classical IR agrees with the language model when the shared heuristic component is removed. The blended-versus-heuristic value asks what an operator loses when switching the deployed system from default blended mode to fully heuristic runtime mode.

### 4.3.2 Score distribution

Table 4.2 reports the distribution of overall scores across all 100 pairs.

| Statistic | Blended mode | Heuristic v2 mode |
|-----------|--------------|--------------------|
| Mean | 71.84 | 72.66 |
| Std. dev. | 7.19 | 7.08 |
| Median | 73.00 | 74.50 |
| 5th percentile | 58.00 | 59.00 |
| 95th percentile | 81.00 | 82.00 |
| KS distance | **0.100** | n/a |

The means differ by 0.82 points and the medians by 1.50 points, so the aggregate score distributions are close. The KS distance of 0.100 is half the leakage-version KS distance of 0.200. Figure 4.1 visualises the two distributions.

![Figure 4.1: Distribution of overall scores across 100 (resume, JD) pairs, by scoring mode.](figures/figure-4-1-score-distribution.png)

*Figure 4.1: Distribution of overall scores across 100 synthetic (resume, JD) pairs. Top: heuristic-only mode (mean 73.45, median 75.0). Bottom: blended mode (mean 70.84, median 72.0). The dashed vertical line marks the mean and the dotted vertical line marks the median in each panel.*

### 4.3.3 Latency

Table 4.3 reports service-side latency for one tool invocation.

| Latency | Blended mode | Heuristic v2 mode | Ratio |
|---------|--------------|--------------------|-------|
| Median | 18 232.1 ms | 25.5 ms | 714× |
| 95th percentile | 24 713.7 ms | 32.1 ms | 770× |
| Maximum observed | 65 926.6 ms | 34.1 ms | 1 933× |

Blended latency is dominated by Gemini structured-output inference over approximately 608 input tokens plus prompt overhead and 1 118 output tokens. The maximum of 65 926.6 ms reflects one retry-after-timeout case handled by the retry policy. Heuristic v2 runs in tens of milliseconds and satisfies the N1a target from Section 2.1.2. Component-level decomposition between token generation, network round-trip, and serialisation overhead was not instrumented in the prototype; future work could profile this granularity (for instance via OpenTelemetry spans on the Vertex AI client or middleware timing decorators) to localise optimisation targets.

### 4.3.4 Per-call cost

Cost uses the Vertex AI Gemini 2.5 Flash rates in effect at measurement time: input $0.075 / 1 M tokens and output $0.30 / 1 M tokens.

| Cost item | Blended mode | Heuristic v2 mode |
|-----------|--------------|--------------------|
| Input tokens (avg., est.) | 608 | 0 |
| Output tokens (avg., est.) | 1 118 | 0 |
| Per-call USD (avg.) | $0.00038 | $0.00000 |
| Per-call USD (95th pct.) | $0.00042 | $0.00000 |
| 1 000 calls / day projected monthly bill | $11.43 | $0.00 |

The estimator follows the ~4 characters per token rule and does not include all server-side prompt overhead, so the claim is order-of-magnitude rather than billing-grade. At 1 000 analyses per day, blended mode projects to roughly $11.43 per month in LLM-side spend on this dataset; heuristic mode is free on the LLM side.

This absolute cost is small at thesis scale, but the ratio matters for mode design. A demonstration, outage fallback, or high-volume preview flow can use the heuristic path without accumulating third-party inference cost. The blended path can then be reserved for cases where richer explanations are worth the additional latency.

### 4.3.5 Sensitivity to the score-combination weights

The author-selected weights from Section 4.2.7 are compared with equal weights recomputed offline from the same per-sub-score breakdown.

| Weighting | Pearson *r* | Spearman ρ |
|-----------|-------------|------------|
| Author-selected (0.30/0.25/0.15/0.15/0.15) | 0.836 | 0.847 |
| Equal (0.20 across all five) | 0.813 | 0.823 |

Pearson moves by Δ = −0.023 and Spearman by Δ = −0.024. Both remain above the 0.7 reference threshold, so the result is not dependent on the exact weighting choice.

### 4.3.6 Heuristic-enhancement ablation (Stage H)

Stage H tested whether targeted heuristic enhancements could close the LLM-only residual without adding a deployed neural dependency. A separate `quality_signals_v3.py` module added five gated signals: SBERT semantic fallback with `all-MiniLM-L6-v2` at cosine threshold 0.65 (H.1), STAR-format detection (H.2), cross-axis coherence checks (H.3), bigram/trigram matching (H.4), and ESCO expansion from 107 to 354 entries (H.5). Each variant was compared against the same post-hoc LLM-only baseline, so no additional LLM calls were issued.

| Variant | Pearson *r* vs LLM-only | 95% CI | Spearman ρ | Δ vs v2 |
|---------|-------------------------|--------|------------|---------|
| heuristic-v2 (BM25 + ESCO + fuzzy) | **0.627** | [0.470, 0.758] | 0.596 | baseline |
| heuristic-v3 with no Stage H features | 0.627 | [0.470, 0.758] | 0.596 | +0.000 |
| + bigram / trigram (H.4) | 0.629 | [0.470, 0.758] | 0.583 | +0.002 |
| + SBERT semantic fallback (H.1) | 0.623 | [0.452, 0.759] | 0.573 | −0.004 |
| + STAR detection (H.2) | 0.621 | [0.463, 0.755] | 0.596 | −0.006 |
| + ESCO expansion 107 → 354 (H.5) | 0.617 | [0.461, 0.752] | 0.578 | −0.009 |
| + cross-axis coherence (H.3) | 0.605 | [0.438, 0.746] | 0.568 | −0.022 |
| heuristic-v3 (full, all five) | 0.590 | [0.415, 0.735] | 0.556 | −0.036 |

The result is a controlled null with small negative drift in the full configuration. `v3-empty` reproduces v2 exactly to three decimals, validating the module boundary. Single-feature deltas range from +0.002 to −0.022 and remain inside the cluster-bootstrap interval width. The full v3 stack falls to *r* = 0.590 (Δ = −0.036), suggesting that small false-positive effects compound.

The likely explanation is that the synthetic benchmark already exposes canonical skill overlap, so extra keyword recall through SBERT, n-grams, or ESCO expansion adds little. The remaining gap to the LLM-only score reflects prose quality, narrative coherence, and role-fit judgement rather than missing keyword evidence. The ablation is reproducible through `scripts/eval_scoring_v3_ablation.py`, `scripts/analyze_v3_ablation.py`, `backend/app/services/quality_signals_v3.py`, and `backend/app/data/esco_skills_expanded.json`; PyTorch and sentence-transformers stay in `backend/requirements-thesis-eval.txt`, outside the production requirements.

This null result is still useful. It prevents the future-work section from overstating sentence-transformer matching as an obvious next production step. On this benchmark, the strict v2 heuristic is already near the available keyword-and-structure ceiling, and the unresolved gap sits in evidence classes that require either different features or a different evaluation surface.

### 4.3.7 Implementation note on Stage H reproducibility

The ablation reuses `thesis/eval-results.json` from Stage G and recovers LLM-only scores through the identity in Section 4.3.1'. It runs in approximately 4 minutes on commodity hardware: about 110 s for SBERT first load and inference, and about 10 s combined for deterministic variants. This keeps Stage H as a research artefact rather than a production dependency.


## 4.4 Discussion and limitations

Within this synthetic evaluation set, the fully heuristic mode recovers most of the blended mode's aggregate discrimination: Pearson *r* = 0.836 [95% CI 0.762, 0.896], Spearman ρ = 0.847, median latency 25.5 ms rather than 18.2 s, and zero LLM-side marginal cost. After removing the structural 0.40 heuristic share in the blended formula, LLM-only versus heuristic agreement is *r* = 0.627 [95% CI 0.476, 0.765]. The deterministic baseline is therefore strong enough to justify deployment as a fallback and runtime mode, while the blended mode remains valuable for qualitative explanations and clarity-sensitive judgement.

Four limitations constrain the claim. **Single-language scope:** all evaluation resumes and job descriptions are in English, although ESCO is multilingual. **Single-subject evaluation:** one author synthesised all 30 resumes, so stylistic regularities may not generalise. **Single LLM provider:** the blended mode uses Gemini 2.5 Flash only. **Bias and fairness:** the benchmark has no demographic annotations and cannot support disparate-impact analysis; production deployment beyond thesis scope would require a fairness audit aligned with algorithmic-hiring literature [22, 23, 24].

The per-sub-score breakdown is the most useful diagnostic result. Keywords and structure converge strongly, while clarity diverges. This explains why the heuristic can be fast, cheap, and operationally useful without replacing the LLM component entirely.

A final limitation concerns trend awareness. The approved topic includes current job-market trends, but the implemented system reasons over a static resume and the current text of a job description. It does not model posting-frequency changes, regional demand, salary movement, or temporal skill adoption. Those signals would require a separate labour-market data layer and are left to future work.
