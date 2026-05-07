# Chapter 4 — Conducted studies and results

This chapter reports the empirical work of the thesis. The system described in Chapters 2 and 3 supports two modes for the analytical tools: a *blended mode* combining a heuristic baseline with the language-model output (40% / 60% weighting) and a *fully heuristic mode* that runs entirely on classical information-retrieval techniques. The research question motivating the chapter is the one stated in Section 1.4: on the controlled synthetic evaluation set described in Section 4.1.1, how much of the discriminative power of the blended mode is recoverable from a strictly classical-IR heuristic, and at what cost ratio?

The chapter is structured as follows. Section 4.1 specifies the methodology — the evaluation dataset, the metrics, the experimental controls. Section 4.2 introduces the strong heuristic (v2), the defendable replacement of the lightweight prepass described in Chapter 3. Section 4.3 reports the results. Section 4.4 discusses the limitations.


## 4.1 Methodology

### 4.1.1 Evaluation dataset

The evaluation dataset consists of *N* = 30 resumes and *M* = 20 job descriptions, organised into six role tracks: backend engineering, frontend engineering, full-stack engineering, data analytics, product design, and product management. Each track contains five resumes spanning junior, mid, and senior seniority levels and three to four job descriptions paired only within the same track.

Both the resumes and the job descriptions are deterministically template-synthesised by the script `scripts/synthesise_eval_dataset.py` from a fixed-seed (`SEED = 42`) random generator. The script is reproducible: every invocation reproduces the same 30 resumes and 20 job descriptions byte-for-byte, so the evaluation manifest is recoverable from the script alone without any cached artefact. Surface details (candidate names, employer placeholders, cities, universities) are drawn from curated lists shipped inside the synthesis script; the resume body content and the job-description body content are composed from track-specific responsibility, achievement, and skill pools enumerated in Appendix B. Synthesising both sides of the pair rather than scraping public listings removes the privacy and licensing risks associated with persisting third-party content, but it introduces the validity threats discussed in Section 4.1.4.

The decision to synthesise the dataset rather than recruit a panel of real applicants and scrape real postings was a pragmatic one for a Bachelor-thesis schedule. A real-applicant panel would have required a written-consent process, a privacy review for the persistence of the data, and a collection window longer than the four months between project kick-off and the submission deadline. Section 4.4 returns to the implication for external validity.

The full evaluation pairs every resume with every job description on the same role track. Per-track job-description counts are three for four tracks and four for two tracks, which produces an exact total of 5 × 3 × 4 + 5 × 4 × 2 = 100 (resume, job-description) pairs; Appendix B.3 documents the per-track distribution. Each pair is run through the analytical pipeline once in *blended mode* and once in *fully heuristic mode*, producing two complete response objects per pair. The resulting dataset of 200 response objects is the basis for all metrics reported in Section 4.3.

### 4.1.2 Metrics

Four metrics are computed per pair.

**Score agreement.** The Pearson product–moment correlation *r* between the two modes' overall scores measures linear association across all pairs. The Spearman rank correlation ρ and Kendall τ are also computed: these capture *rank* agreement, which is the property most relevant to using the heuristic as a screening signal even when its score scale differs from the blended mode. Values around *r* = 0.7 are sometimes used as soft anchors in retrieval-quality discussions [6]; this thesis treats the number as a reference point only, not as a hypothesis the chapter seeks to confirm.

**Score distribution.** The Kolmogorov–Smirnov distance between the two distributions of overall scores. This complements the correlation by reporting how differently the two modes spread the scores across the 0–100 range; a high correlation with a high KS distance would indicate that the heuristic ranks pairs in the same order as the blended mode but compresses or shifts the score scale.

**Latency.** The wall-clock time from the moment the request reaches the tool service to the moment a complete response is returned, measured in milliseconds. Latency is reported as the median, the 95th percentile, and the maximum across all pairs. Latency excludes network round-trip time between the client and the backend.

**Per-call cost.** The marginal cost of a single tool invocation, expressed in US dollars. The blended mode incurs a Gemini 2.5 Flash bill for input and output tokens; the fully heuristic mode incurs no third-party charge.

### 4.1.3 Controls

Three controls were applied to ensure the comparison is sound.

The same content hash is used for both modes per pair, which prevents cache reuse from contaminating the latency numbers. Cache is otherwise disabled for the duration of the experimental run by setting `RESULT_CACHE_ENABLED=false`.

The same heuristic implementation (selected through the `HEURISTIC_VERSION` configuration) is used by both modes for the comparative run, so the only difference between the two runs is whether `complete_structured` is invoked. This isolates the LLM contribution rather than confounding it with an upstream change to the prepass.

The temperature of the LLM call is fixed at 0.0 for the blended-mode run, which removes sampling variance from the comparison. The remaining variability in the LLM output reflects only the model's deterministic decoding given the fixed input.

### 4.1.4 Threats to validity

Four threats to the validity of the comparative result reported in Section 4.3 are stated explicitly here so that the discussion in Section 4.4 and the limitation framing in Section 5.2 can refer back to them.

**T1 — Shared-vocabulary leakage between resume and job-description pools.** The synthesis script `scripts/synthesise_eval_dataset.py` populates resume bullet content and the "What you'll do" section of every job description from the *same* per-track responsibility list — the dictionary entry `track["responsibilities"]` (script lines 53–62 for the backend track, sampled at lines 365 and 425 for the resume and the job description respectively). In some pairs identical sentences appear on both sides; for example, the pair `r-backend-01__jd-backend-02` contains the literal sentence "designed and shipped REST APIs serving production traffic" in both the resume bullet list and the job-description responsibilities. The keyword-axis correlation reported in Section 4.3.1 (Pearson *r* = 0.941) is consistent with this construction: both scoring modes consume the same lexical surface that the synthesis injected on both sides. The headline correlation should therefore be read as agreement *within a benchmark whose construction shares phrasing across the two sides*, not as a representative measurement of cross-mode agreement on disjoint, real-world resume and job-description text.

**T2 — Self-correlation between the two compared modes.** The blended-mode overall score is computed as a weighted mean *0.40 × heuristic_score + 0.60 × llm_score* (Sections 3.2.3 and 4.2.7); the heuristic-only mode score is the *heuristic_score* alone. The Pearson correlation between the blended mode and the heuristic-only mode therefore contains a structural floor of agreement attributable to the 0.40 component the two share by construction, even before the language model contributes any signal. The chapter does not measure an LLM-only baseline that would isolate the genuine LLM-versus-heuristic correlation; that measurement is recorded as future work in Section 5.3.

**T3 — Non-independent paired observations.** The 100 paired observations are constructed by pairing 30 resumes with 20 job descriptions inside their respective tracks. Each resume contributes between three and four observations, and each job description contributes five observations, so the 100 pairs are not 100 independent draws. The correlations reported in Section 4.3.1 are point estimates; confidence intervals computed under an independent-and-identically-distributed assumption would understate uncertainty.

**T4 — Post-hoc heuristic design.** The strong heuristic v2 specified in Section 4.2 was designed *after* the blended pipeline already existed (disclosed in Section 1.4). Because the heuristic was tuned with knowledge of the language model's behaviour on the analytical tools, the agreement reported in Section 4.3.1 partially reflects the design coupling rather than an independent comparison. The thesis flags this disclosure as a partial mitigation; it does not claim that the coupling is dissolved.

The mitigations available within the scope of this thesis are the explicit sensitivity rerun of the score-combination weights reported in Section 4.3.5 and the disclosure above. Closing the four threats fully would require regenerating the dataset with disjoint resume- and job-description-side vocabularies, measuring an LLM-only baseline at the same input distribution, and computing a by-resume cluster-bootstrap confidence interval — these directions are recorded as future work in Section 5.3.


## 4.2 The strong heuristic (v2)

The heuristic prepass described in Chapter 3 was sufficient to support the system's fallback behaviour but is not, on its own, defendable as a serious comparison point against an LLM. Its keyword extraction is binary; its skill detection is a fixed list lookup; its score combination is an unweighted mean across five sub-scores. To support the comparative study, this section introduces the *strong heuristic v2*, which replaces each of those weak primitives with a published-method counterpart drawn from classical information-retrieval research. By construction, every component of v2 is non-neural; the line between "heuristic" and "language-model" therefore remains clean for the comparison reported in Section 4.3.

The decision to keep the heuristic strictly non-neural rather than to include a sentence-transformer–based component was made deliberately. A sentence-transformer baseline would have been a stronger numerical competitor to the blended mode but would have blurred the comparison: any positive result would have been attributable to the embedding model, and any negative result would have been blamed on it. By limiting v2 to classical-IR primitives, the comparison reported in Section 4.3 is between *language-model reasoning* and *non-language-model methods* in the strictest sense available, which is the comparison that the literature in Section 1.4 frames most clearly. A sentence-transformer intermediate tier is then proposed as future work in Section 5.3.

### 4.2.1 TF–IDF–weighted keyword evidence

The lightweight prepass described in Chapter 3 reports a binary match/miss for each keyword in a job description. Keywords are not all equally informative: the term "communication" appears in nearly every white-collar job description and contributes little to discriminating between roles, whereas "RAG" or "vector database" appears in a small fraction of postings and is highly discriminative when present. The strong heuristic weights keyword evidence by the inverse document frequency *idf* of each term, computed over the corpus of job descriptions in the evaluation set [5]. The keyword-alignment sub-score is then defined as

\[
\text{keywords}(R, J) \;=\; \frac{\sum_{t \in K(R) \cap K(J)} \text{idf}(t)}{\sum_{t \in K(J)} \text{idf}(t)} \;\times\; 100,
\]

where *R* is the resume, *J* is the job description, *K*(·) extracts the keyword set, and idf is the corpus-level inverse document frequency. This replaces a count ratio with a weighted-coverage ratio.

The full BM25 form [6] adds a saturation term that prevents very high keyword frequency in the resume from dominating the score. BM25 is implemented in `app/services/quality_signals_v2.py` as `_bm25_score`; the parameters *k₁* = 1.5 and *b* = 0.75 are taken from the BM25 defaults that have proven robust across decades of retrieval research. The IDF table is computed in two complementary ways: the production path uses a *bundled baseline IDF* derived once at import time from the ESCO knowledge base shipped with the application (each ESCO entry — canonical label plus surface variants — treated as a short document), while the evaluation harness recomputes IDF over the full set of evaluation job descriptions before scoring. Both paths share the same ranking formula; only the IDF source differs, which keeps absolute BM25 values comparable within a run while honestly reflecting the small size of the corpus available at module load time.

### 4.2.2 ESCO-aligned skill normalisation

The fixed skill list used by the lightweight prepass cannot reconcile surface variations of the same underlying skill. *Postgres*, *PostgreSQL*, and *postgres database* should map to a single ESCO skill identifier; the prior implementation treated them as three independent strings. The strong heuristic introduces a top-down ESCO normalisation layer [8, 9, 12]. A curated subset of the ESCO skill knowledge base — at the time of submission, approximately one hundred entries focused on the digital and creative-industry domains, with the data file structured for straightforward expansion to the roughly eight hundred entries needed for production-scale coverage — is bundled with the application as a JSON resource. Each entry contains a canonical label and a list of surface variants, drawn from the published ESCO multilingual dataset.

At analysis time, both the resume and the job description are scanned for occurrences of any ESCO surface variant; matches are normalised to the canonical label, and the two sets of canonical labels are intersected. The keyword-alignment sub-score is then computed against the normalised label sets, so that the three Postgres surface forms count as a single match against a job description that asks for "PostgreSQL".

### 4.2.3 Fuzzy matching

Even after ESCO normalisation, surface variation persists for skills that are not in the bundled ESCO subset and for non-skill keywords that the user has supplied informally. The strong heuristic applies an additional fuzzy-matching pass based on the Levenshtein-edit-distance similarity metric [7], implemented through Python's standard-library `difflib.SequenceMatcher` (which computes a normalised longest-common-subsequence ratio mathematically equivalent to a normalised edit distance for the cases that arise in resume keyword matching). A keyword from the job description is considered matched in the resume when either (i) the exact token appears, (ii) the canonical ESCO label appears after normalisation, or (iii) a token in the resume has SequenceMatcher ratio above a threshold *τ* with the keyword. The threshold *τ* = 0.85 was chosen empirically: values below 0.80 admit too many spurious matches (English plurals are at ~0.95 already; below 0.80, unrelated tokens begin to register), and values above 0.90 reject obvious typographic variants such as *Javacript* for *JavaScript*. Choosing the standard-library implementation rather than `rapidfuzz` keeps the heuristic dependency-free, which is a property that makes the fully-heuristic mode auditable in deployments where third-party libraries are restricted.

### 4.2.4 Section-weighted features

A skill listed in a dedicated *Skills* section carries different evidential weight from the same skill mentioned in a project description. Recruiters read the *Skills* section as a checklist and the *Experience* section as a narrative; the two should not contribute equally to a sub-score that is meant to reflect what a recruiter scans for [18]. The strong heuristic applies a per-section weight when computing the matched-keyword set: a match in *Skills* contributes weight 1.0, a match in *Experience* or *Projects* contributes weight 0.7, a match in *Summary* contributes weight 0.5, and a match in *Education* contributes weight 0.3. The total weighted match is then normalised against the maximum achievable weighted match for the keyword set in question.

### 4.2.5 Quantification regex

Quantification (numbers, percentages, currency tokens, time periods) is one of the strongest signals that a resume bullet describes a measurable outcome rather than a duty. The strong heuristic uses a single composite regular expression to detect any of seven quantification patterns: bare integers, numeric percentages, currency-prefixed amounts, time periods (weeks, months, years), magnitudes (k, M, B, ×), counts of users or customers, and team-size descriptors. The count of *quantified* bullets enters the *impact* sub-score with a saturating logarithmic weight, so that the difference between zero and three quantified bullets is much larger than the difference between fifteen and eighteen.

### 4.2.6 Action-verb scoring

A resume bullet that begins with a strong action verb ("led", "shipped", "automated") communicates ownership more directly than one that begins with a passive construction or a weak filler verb ("worked on", "involved in"). The strong heuristic includes a curated action-verb dictionary of approximately 190 entries, aggregated from publicly available career-services resources of established universities (Harvard FAS, MIT Career Advising, Princeton Career Development), and counts the fraction of bullets whose leading token belongs to the dictionary. This fraction enters the *clarity* sub-score with a linear weight.

### 4.2.7 Score combination

The five sub-scores (keyword alignment, impact, structure, clarity, completeness) are combined into the overall score through a weighted mean rather than the simple mean used by the lightweight prepass. The weights — 0.30, 0.25, 0.15, 0.15, 0.15 — are *author-selected* and reflect the design intuition that recruiter-side scanning is dominated by keyword and impact signals, with structural, clarity, and completeness signals carrying smaller but non-trivial weight. They are not derived from a published recruiter survey; the thesis does not claim such a derivation. Section 4.3.5 reports a sensitivity analysis in which the same comparative result is recomputed under an equal-weight combination (0.20 across all five sub-scores); the value-association result (Pearson *r*) stays above the 0.7 reference threshold under both weightings, while the rank-agreement result (Spearman ρ) drops below the threshold under equal weights — a partial-robustness finding rather than weight-independence.

### 4.2.8 Implementation notes

The strong heuristic v2 is implemented in `app/services/quality_signals_v2.py`, a new module added alongside the existing `quality_signals.py` so that the lightweight version remains available for the production fallback path. A configuration flag selects which version is active: `HEURISTIC_VERSION=v2` enables the strong heuristic for the analytical tools and is the default for the experimental run reported in Section 4.3. The corresponding admin toggle is described in Section 4.2.9.

### 4.2.9 The administrative toggle

Non-functional requirement N7 of Chapter 2 calls for runtime switchability between the two scoring modes. The implementation introduces three small surfaces.

A backend configuration flag `SCORING_MODE` accepts the values `blended` and `heuristic`; the default is `blended`. When the value is `heuristic`, the analytical services skip the LLM call entirely and return the response constructed from the strong heuristic v2.

A runtime-state module `app/services/runtime_settings.py` maintains an in-memory override of the configuration flag. The override is set by a POST request to `/api/v1/admin/scoring-mode` and is read by the analytical services on every request. The override survives a request but does not survive a process restart, on the principle that the configuration of record is the environment variable; the runtime override is for live demonstration during the diploma defence.

A frontend control on the existing `/admin` route is wired to the same endpoint, so an authenticated administrator can flip the scoring mode at runtime through the user interface during a live demonstration; the same operation can also be performed by issuing the POST request through any HTTP client (or via the auto-generated FastAPI documentation page at `/api/v1/docs`). The new mode is applied to the next analytical request without any further action from the operator. Direct visual capture of the administrative toggle interface is omitted from Appendix C; the runtime-toggle mechanism is documented through the source listing in Appendix A.3 and through the comparative study reported in Section 4.3, which exercises both scoring modes end-to-end on the synthetic evaluation set.


## 4.3 Results

The evaluation harness `scripts/eval_scoring.py` produced 100 paired observations on the synthetic evaluation set described in Section 4.1.1. Every (resume, JD) pair was scored under both modes; both modes succeeded on every pair. The numerical results in the tables below are emitted by `scripts/analyze_eval_results.py` from the persisted `thesis/eval-results.json` file. The reference value *r* ≈ 0.7 used by Robertson and Zaragoza [6] in their reliability discussion is taken as a literature anchor for what counts as "comparable" rather than as a research hypothesis to test.

### 4.3.1 Score agreement

Across the 100 (resume, job-description) pairs in the evaluation set, three rank- and value-agreement statistics are computed between the overall score in the blended mode and the overall score in the fully heuristic v2 mode: Pearson *r*, Spearman ρ, and Kendall τ.

| Statistic | Overall | Interpretation |
|-----------|---------|----------------|
| Pearson *r* | **0.727** | Linear association between mode scores. |
| Spearman ρ | **0.708** | Rank agreement; the property most relevant to screening use. |
| Kendall τ | **0.526** | Pairwise rank concordance. |

Both Pearson *r* and Spearman ρ sit just above the 0.7 reference anchor; Kendall τ is moderate at 0.526, consistent with Kendall's known property of being more conservative than Spearman on noisy ranks. The agreement on the overall score is therefore best read as *moderate-to-useful within this synthetic evaluation set* rather than as strong evidence of cross-mode equivalence — an interpretation that is qualified further by the validity threats listed in Section 4.1.4 (in particular T1 shared-vocabulary leakage, which inflates the keyword sub-score, and T2 self-correlation between the two compared modes).

The per-sub-score breakdown reveals where the agreement comes from and where the two modes diverge.

| Sub-score | Pearson *r* | Spearman ρ | Kendall τ |
|-----------|-------------|------------|-----------|
| keywords | 0.941 | 0.947 | 0.826 |
| impact | 0.561 | 0.561 | 0.412 |
| structure | 0.440 | 0.665 | 0.590 |
| clarity | 0.475 | 0.381 | 0.290 |
| completeness | 0.691 | 0.744 | 0.643 |

The *keywords* axis is the largest single contributor to agreement: both modes consume the same keyword-extraction evidence and agree at *r* = 0.941. This figure must be read together with threat T1 of Section 4.1.4 — the synthesis pipeline injects identical phrases into the resume and job-description sides of every in-track pair, so a substantial fraction of the keyword-axis agreement is structurally guaranteed by the dataset construction rather than discovered by the scoring methods. *Completeness* is also high (*r* = 0.691, ρ = 0.744), consistent with the fact that section coverage is largely deterministic. The *structure* axis shows the largest gap between Pearson and Spearman (0.440 vs 0.665), indicating that the two modes rank pairs similarly even when they assign different absolute scores — exactly the case in which Pearson alone would understate agreement and the rank statistics correct the picture. *Impact* and *clarity* are the two axes on which the language-model contribution is most distinct: clarity in particular drops to *r* = 0.475 / ρ = 0.381, consistent with the language model weighing prose-quality features the heuristic does not see.

**Self-correlation note.** Because the blended-mode overall score is by construction *0.40 × heuristic + 0.60 × llm* (Sections 3.2.3 and 4.2.7), the Pearson correlation between the blended mode and the heuristic-only mode contains a structural floor of agreement attributable to the 0.40 component the two share. This is threat T2 of Section 4.1.4. The chapter does not measure an LLM-only baseline that would isolate the genuine cross-mode correlation; that measurement is recorded as future work in Section 5.3.

**Unit structure.** The 100 paired observations are derived from 30 resumes × ~3.3 job descriptions per track; each resume contributes three or four observations, each job description contributes five. Reported correlations are therefore not based on 100 independent observations. Confidence intervals computed under an independent-and-identically-distributed assumption would understate uncertainty; the headline figures are presented here as point estimates, and a by-resume cluster-bootstrap interval is recorded in Section 5.3 as part of the same future-work bundle that proposes the LLM-only baseline.

### 4.3.2 Score distribution

Table 4.2 reports the mean, standard deviation, median, 5th and 95th percentiles, and Kolmogorov–Smirnov distance of the overall score across all 100 pairs.

| Statistic | Blended mode | Heuristic v2 mode |
|-----------|--------------|--------------------|
| Mean | 70.84 | 73.45 |
| Std. dev. | 7.54 | 6.36 |
| Median | 72.00 | 75.00 |
| 5th percentile | 57.90 | 63.00 |
| 95th percentile | 80.05 | 83.00 |
| KS distance | **0.200** | — |

Two effects are visible. First, the heuristic mode's mean and median are 2.6 and 3.0 score points above the blended mode's, so the heuristic is on average slightly more generous on this dataset; this is consistent with the score being a weighted sum of bounded sub-scores that rarely punish an aligned pair as harshly as the LLM does. Second, the heuristic distribution is narrower (standard deviation 6.36 vs 7.54, 5th-percentile 63 vs 58) — the LLM produces more extreme scores for the worst-aligned pairs, while the bounded sub-score additions of the heuristic compress the lower tail. The KS distance of 0.200 measures the maximum vertical gap between the two cumulative distributions and is a small-to-moderate value: the two distributions are visibly different on the lower tail but are not drawn from radically different populations. Figure 4.1 visualises both distributions on the same axes.

![Figure 4.1 — Distribution of overall scores across 100 (resume, JD) pairs, by scoring mode.](figures/figure-4-1-score-distribution.png)

*Figure 4.1: Distribution of overall scores across 100 synthetic (resume, JD) pairs. Top: heuristic-only mode (mean 73.45, median 75.0). Bottom: blended mode (mean 70.84, median 72.0). The dashed vertical line marks the mean and the dotted vertical line marks the median in each panel.*

### 4.3.3 Latency

Table 4.3 reports the wall-clock latency of a single tool invocation in each mode, measured by the evaluation harness from the moment the request enters the analytical service to the moment a complete response is returned.

| Latency | Blended mode | Heuristic v2 mode | Ratio |
|---------|--------------|--------------------|-------|
| Median | 17 252.8 ms | 36.5 ms | 473× |
| 95th percentile | 20 894.7 ms | 45.0 ms | 464× |
| Maximum observed | 45 192.7 ms | 48.4 ms | 934× |

The blended mode is dominated by the LLM call: median ≈ 17 seconds is consistent with a structured-output Gemini 2.5 Flash call against the *~2 282 input tokens* documented in Section 4.3.4 (system prompt + locked payload + prepass evidence + resume + job description, not resume + job description alone) and approximately 1 120 output tokens. The maximum observed of 45 seconds reflects a single retry-after-timeout case absorbed by the *retry-with-jitter* policy described in Section 3.1.1. The heuristic v2 mode runs in tens of milliseconds: the median is 36.5 ms and the 95th percentile is 45.0 ms, both inside the spec target stated in `heuristic-v2-design.md`. The blended cold-path 95th percentile of 20 894.7 ms is consistent with the split non-functional requirement N1b introduced in Section 2.1.2 (blended cold-path target ≤ 25 s, dominated by the upstream Gemini call); production cached-path latency is materially lower as reported in Section 3.9. The two-orders-of-magnitude latency advantage of the heuristic mode is consistent across the median, the 95th percentile, and the worst-case row.

### 4.3.4 Per-call cost

Per-call cost is computed from the Vertex AI billing schedule for Gemini 2.5 Flash at the rates in effect at the time of measurement (input $0.075 / 1 M tokens; output $0.30 / 1 M tokens). The heuristic v2 mode's marginal cost on the LLM side is zero by construction.

| Cost item | Blended mode | Heuristic v2 mode |
|-----------|--------------|--------------------|
| Input tokens (avg., est.) | 2 282 | 0 |
| Output tokens (avg., est.) | 1 120 | 0 |
| Per-call USD (avg.) | $0.00051 | $0.00000 |
| Per-call USD (95th pct.) | $0.00055 | $0.00000 |
| 1 000 calls / day projected monthly bill | $15.21 | $0.00 |

Token counts are approximations following the `~4 characters per token` rule of thumb that the Vertex AI documentation uses. The input-token figure counts the entire prompt that the runtime sends — the static system prompt (rules, banned-words list, response-schema description), the locked-payload block (the heuristic prepass output that the LLM is instructed to preserve), the prepass evidence summary, the resume itself, and the job description — not just the resume and JD as user-supplied content. The output-token figure is `len(json.dumps(result)) // 4` over the full structured response. Exact tokeniser-derived counts are deferred to future work; the headline cost claim in this section is an order-of-magnitude statement, not a billing-grade figure. The recomputation that produces this table is implemented in `scripts/recompute_eval_cost.py`, which rebuilds the prompt for every pair without a second LLM call.

The blended mode at one thousand analyses per day projects to roughly **$15.21 per month** in LLM-side spend on this evaluation set. The system-prompt overhead (~1 700 input tokens, regardless of resume/JD length) dominates the per-call cost: even a short resume incurs roughly the same input-token charge as a long one. At the same volume the heuristic mode is free on the LLM side and the only marginal cost is compute. The cost ratio is therefore unbounded as a multiple but small in absolute terms at thesis-scope traffic; the comparative discussion in Section 4.4 returns to this point when comparing the two modes' suitability for different deployment scenarios.

### 4.3.5 Sensitivity to the score-combination weights

The five-sub-score weights introduced in Section 4.2.7 are author-selected. To check that the comparative result is not an artefact of the specific weights, the score is recomputed offline from the same per-sub-score breakdown using equal weights (0.20 each), and the Pearson and Spearman correlations between modes are computed under both weight settings.

| Weighting | Pearson *r* | Spearman ρ |
|-----------|-------------|------------|
| Author-selected (0.30/0.25/0.15/0.15/0.15) | 0.727 | 0.708 |
| Equal (0.20 across all five) | 0.703 | 0.685 |

The Pearson correlation moves by Δ = −0.023 between the two weightings; the Spearman correlation moves by Δ = −0.023. The Pearson result is therefore robust to the weight choice and stays above the 0.7 reference threshold under both weightings. The Spearman result, however, weakens from 0.708 to 0.685 under equal weights, dropping below the same 0.7 reference; rank agreement — the property the chapter calls most relevant to screening use — is sensitive enough to weighting that the headline ρ of 0.708 cannot be presented as weighting-independent. The takeaway is therefore narrower than a robustness claim: the value-association result holds across the two weightings tested, but the rank-agreement result is contingent on the author-selected weights and would need a wider weight sweep before being reported as robust. The per-pair score recomputation is performed by `scripts/analyze_eval_results.py` from the persisted per-sub-score breakdown rather than from a second eval-harness run, so the cost of producing this analysis is zero.


## 4.4 Discussion and limitations

The evaluation reported in Section 4.3 supports the following defendable claim *within this synthetic evaluation set*: a strictly classical-IR heuristic, augmented with a curated ESCO subset and a fuzzy-matching layer, recovers most of the discriminative power of the blended mode on the overall score (Pearson *r* = 0.727, Spearman ρ = 0.708, both above the 0.7 reference threshold) at roughly two orders of magnitude lower latency (median 36.5 ms vs 17.3 s) and at zero LLM-side marginal cost. Per-sub-score, the agreement is strongest on *keywords* (*r* = 0.941) and weakest on *clarity* (*r* = 0.475), which is the axis on which the language model contributes prose-quality evidence the heuristic cannot see. Independently of the numbers, the blended mode produces qualitatively richer recommendations — the prose explanations, the role-fit narratives, the cover-letter-grade phrasing — that the heuristic mode does not attempt to produce; this qualitative dimension is not captured by the four metrics above and is a matter for separate user-research investigation.

Three limitations of the study deserve explicit statement.

**Single-language scope.** All resumes and job descriptions in the evaluation set are in English. The bundled ESCO subset is the multilingual ESCO published by the European Commission, but the deployed system uses only the English labels. Polish-language resumes — a relevant scope for a Wrocław-based deployment — are not exercised. Section 5.3 proposes the integration of the Polish-language ESCO labels as a near-term extension.

**Single-subject evaluation.** The 30 resumes were synthesised by a single author and may share a stylistic register that does not generalise to resumes drawn from a wider population. The result reported in Section 4.3.1 should therefore be read as a within-author baseline rather than as a cross-population claim. Replicating the evaluation against a larger multi-author resume corpus is left for future work.

**Single LLM provider.** The blended mode uses Gemini 2.5 Flash exclusively. The thesis does not establish that the heuristic baseline would correlate equally well with a different LLM (Claude 4.7, GPT-5.4, Llama 3.3 70B) on the same dataset. Section 5.3 argues that the system architecture supports adding an alternative provider as a configuration change rather than a code change, so this gap is straightforward to close in subsequent work.

**Bias and fairness.** A growing literature documents that automated hiring pipelines can encode and amplify bias against protected groups when historical hiring decisions, resume-content stylistic regularities, or third-party-model training distributions are correlated with demographic attributes [22, 23, 24]. The system described in this thesis does not yet incorporate the fairness instrumentation that this literature recommends — neither the disparate-impact diagnostics of [23] nor the discrimination-source taxonomy of [22] is currently exercised against the heuristic and blended scoring pipelines. The synthetic evaluation set used in Section 4.3 is not annotated with demographic attributes, so a fairness audit on the present benchmark is not possible without further dataset construction; for any production deployment beyond the controlled thesis scope, an audit aligned with [24] would be required as a separate work item.

Beyond the headline correlation number, the per-sub-score breakdown reported in Table 4.1 carries diagnostic value in its own right. The two modes do not disagree uniformly across the five sub-scores, and identifying *which* sub-scores converge tells the operator where the deterministic baseline is already sufficient, while identifying *which* sub-scores diverge points to the dimensions on which the language-model component is contributing evidence the heuristic cannot see. This per-axis view is — independently of the specific numerical result — the cleanest empirical argument the chapter offers for keeping the blended mode available in production even where the heuristic baseline turns out to be competitive on the aggregate score.

The next chapter summarises the contributions of the thesis and proposes three directions for future development.
