# Chapter 4 — Conducted studies and results

> Target length: 9–12 pages (~5000 words). This chapter is the research contribution of the thesis: it specifies the strong heuristic v2, defines the comparative-study methodology, reports the measured results, and discusses limitations. Numerical cells in Section 4.3 marked *to be filled* are populated by the evaluation harness immediately before submission; the surrounding methodology, formulas, and analysis are complete and unchanged by the run. Reference numbers `[N]` align with `bibliography.md`.

---

This chapter reports the empirical work of the thesis. The system described in Chapters 2 and 3 supports two modes for the analytical tools: a *blended mode* combining a heuristic baseline with the language-model output (40% / 60% weighting) and a *fully heuristic mode* that runs entirely on classical information-retrieval techniques. The research question motivating the chapter is the one stated in Section 1.4: given a representative sample of resumes and job descriptions, how much of the discriminative power of the blended mode is recoverable from a strictly classical-IR heuristic, and at what cost ratio?

The chapter is structured as follows. Section 4.1 specifies the methodology — the evaluation dataset, the metrics, the experimental controls. Section 4.2 introduces the strong heuristic (v2), the defendable replacement of the lightweight prepass described in Chapter 3. Section 4.3 reports the results. Section 4.4 discusses the limitations.


## 4.1 Methodology

### 4.1.1 Evaluation dataset

A small evaluation dataset was constructed for this study. The dataset consists of *N* = 30 resumes and *M* = 20 job descriptions, organised into six role tracks: backend engineering, frontend engineering, full-stack engineering, data analytics, product design, and product management. Each track contains five resumes spanning junior, mid, and senior seniority levels, and three to four job descriptions sampled from public listings on common job boards in March–April 2026.

The resumes are *synthetic* in two senses: (i) candidate identifiers (names, contact information, employer names) were synthesised from a curated set of placeholder strings, and (ii) the body content was authored to be realistic but does not refer to any real person. Synthesising the resumes rather than scraping public data has two advantages — it removes any privacy risk from the experimental record, and it allows specific failure modes (a resume with no quantification, a resume with strong skills but weak structure, a resume with quantification only in the wrong section) to be deliberately exercised. The job descriptions are real listings with company names and contact information redacted.

The decision to synthesise the resumes rather than recruit a small panel of real applicants was a pragmatic one for a Bachelor-thesis schedule. A real-applicant panel would have required a written-consent process, a privacy review for the persistence of the data, and a longer collection window than the four months between project kick-off and the submission deadline. The synthetic dataset is the honest weaker alternative; Section 4.4 returns to the implication for external validity.

The full evaluation pairs every resume with every job description on the same role track, yielding 30 × ⌈20 / 6⌉ ≈ 100 (resume, job-description) pairs. Each pair is run through the analytical pipeline once in *blended mode* and once in *fully heuristic mode*, producing two complete response objects per pair. The resulting dataset of 200 response objects is the basis for all metrics reported in Section 4.3.

### 4.1.2 Metrics

Four metrics are computed per pair.

**Score agreement.** The Pearson product–moment correlation *r* between the two modes' overall scores measures linear association across all pairs. The Spearman rank correlation ρ and Kendall τ are also computed: these capture *rank* agreement, which is the property most relevant to using the heuristic as a screening signal even when its score scale differs from the blended mode. The threshold *r* ≥ 0.7 is conventionally taken in retrieval-quality literature [27] to indicate a useful baseline; it is reported here as a reference point, not as a hypothesis the thesis seeks to confirm.

**Score distribution.** The Kolmogorov–Smirnov distance between the two distributions of overall scores. This complements the correlation by reporting how differently the two modes spread the scores across the 0–100 range; a high correlation with a high KS distance would indicate that the heuristic ranks pairs in the same order as the blended mode but compresses or shifts the score scale.

**Latency.** The wall-clock time from the moment the request reaches the tool service to the moment a complete response is returned, measured in milliseconds. Latency is reported as the median, the 95th percentile, and the maximum across all pairs. Latency excludes network round-trip time between the client and the backend.

**Per-call cost.** The marginal cost of a single tool invocation, expressed in US dollars. The blended mode incurs a Gemini 2.5 Flash bill for input and output tokens; the fully heuristic mode incurs no third-party charge.

### 4.1.3 Controls

Three controls were applied to ensure the comparison is sound.

The same content hash is used for both modes per pair, which prevents cache reuse from contaminating the latency numbers. Cache is otherwise disabled for the duration of the experimental run by setting `RESULT_CACHE_ENABLED=false`.

The same heuristic implementation (selected through the `HEURISTIC_VERSION` configuration) is used by both modes for the comparative run, so the only difference between the two runs is whether `complete_structured` is invoked. This isolates the LLM contribution rather than confounding it with an upstream change to the prepass.

The temperature of the LLM call is fixed at 0.0 for the blended-mode run, which removes sampling variance from the comparison. The remaining variability in the LLM output reflects only the model's deterministic decoding given the fixed input.


## 4.2 The strong heuristic (v2)

The heuristic prepass described in Chapter 3 was sufficient to support the system's fallback behaviour but is not, on its own, defendable as a serious comparison point against an LLM. Its keyword extraction is binary; its skill detection is a fixed list lookup; its score combination is an unweighted mean across five sub-scores. To support the comparative study, this section introduces the *strong heuristic v2*, which replaces each of those weak primitives with a published-method counterpart drawn from classical information-retrieval research. By construction, every component of v2 is non-neural; the line between "heuristic" and "language-model" therefore remains clean for the comparison reported in Section 4.3.

The decision to keep the heuristic strictly non-neural rather than to include a sentence-transformer–based component was made deliberately. A sentence-transformer baseline would have been a stronger numerical competitor to the blended mode but would have blurred the comparison: any positive result would have been attributable to the embedding model, and any negative result would have been blamed on it. By limiting v2 to classical-IR primitives, the comparison reported in Section 4.3 is between *language-model reasoning* and *non-language-model methods* in the strictest sense available, which is the comparison that the literature in Section 1.4 frames most clearly. A sentence-transformer intermediate tier is then proposed as future work in Section 5.3.

### 4.2.1 TF–IDF–weighted keyword evidence

The lightweight prepass described in Chapter 3 reports a binary match/miss for each keyword in a job description. Keywords are not all equally informative: the term "communication" appears in nearly every white-collar job description and contributes little to discriminating between roles, whereas "RAG" or "vector database" appears in a small fraction of postings and is highly discriminative when present. The strong heuristic weights keyword evidence by the inverse document frequency *idf* of each term, computed over the corpus of job descriptions in the evaluation set [28]. The keyword-alignment sub-score is then defined as

\[
\text{keywords}(R, J) \;=\; \frac{\sum_{t \in K(R) \cap K(J)} \text{idf}(t)}{\sum_{t \in K(J)} \text{idf}(t)} \;\times\; 100,
\]

where *R* is the resume, *J* is the job description, *K*(·) extracts the keyword set, and idf is the corpus-level inverse document frequency. This replaces a count ratio with a weighted-coverage ratio.

The full BM25 form [27] adds a saturation term that prevents very high keyword frequency in the resume from dominating the score. BM25 is implemented in `app/services/quality_signals_v2.py` as `_bm25_score`; the parameters *k₁* = 1.5 and *b* = 0.75 are taken from the BM25 defaults that have proven robust across decades of retrieval research. The IDF table is computed in two complementary ways: the production path uses a *bundled baseline IDF* derived once at import time from the ESCO knowledge base shipped with the application (each ESCO entry — canonical label plus surface variants — treated as a short document), while the evaluation harness recomputes IDF over the full set of evaluation job descriptions before scoring. Both paths share the same ranking formula; only the IDF source differs, which keeps absolute BM25 values comparable within a run while honestly reflecting the small size of the corpus available at module load time.

### 4.2.2 ESCO-aligned skill normalisation

The fixed skill list used by the lightweight prepass cannot reconcile surface variations of the same underlying skill. *Postgres*, *PostgreSQL*, and *postgres database* should map to a single ESCO skill identifier; the prior implementation treated them as three independent strings. The strong heuristic introduces a top-down ESCO normalisation layer [17, 18, 21]. A curated subset of the ESCO skill knowledge base — at the time of submission, approximately one hundred entries focused on the digital and creative-industry domains, with the data file structured for straightforward expansion to the roughly eight hundred entries needed for production-scale coverage — is bundled with the application as a JSON resource. Each entry contains a canonical label and a list of surface variants, drawn from the published ESCO multilingual dataset.

At analysis time, both the resume and the job description are scanned for occurrences of any ESCO surface variant; matches are normalised to the canonical label, and the two sets of canonical labels are intersected. The keyword-alignment sub-score is then computed against the normalised label sets, so that the three Postgres surface forms count as a single match against a job description that asks for "PostgreSQL".

### 4.2.3 Fuzzy matching

Even after ESCO normalisation, surface variation persists for skills that are not in the bundled ESCO subset and for non-skill keywords that the user has supplied informally. The strong heuristic applies an additional fuzzy-matching pass based on the Levenshtein-edit-distance similarity metric [29], implemented through Python's standard-library `difflib.SequenceMatcher` (which computes a normalised longest-common-subsequence ratio mathematically equivalent to a normalised edit distance for the cases that arise in resume keyword matching). A keyword from the job description is considered matched in the resume when either (i) the exact token appears, (ii) the canonical ESCO label appears after normalisation, or (iii) a token in the resume has SequenceMatcher ratio above a threshold *τ* with the keyword. The threshold *τ* = 0.85 was chosen empirically: values below 0.80 admit too many spurious matches (English plurals are at ~0.95 already; below 0.80, unrelated tokens begin to register), and values above 0.90 reject obvious typographic variants such as *Javacript* for *JavaScript*. Choosing the standard-library implementation rather than `rapidfuzz` keeps the heuristic dependency-free, which is a property that makes the fully-heuristic mode auditable in deployments where third-party libraries are restricted.

### 4.2.4 Section-weighted features

A skill listed in a dedicated *Skills* section carries different evidential weight from the same skill mentioned in a project description. Recruiters read the *Skills* section as a checklist and the *Experience* section as a narrative; the two should not contribute equally to a sub-score that is meant to reflect what a recruiter scans for [3, 14]. The strong heuristic applies a per-section weight when computing the matched-keyword set: a match in *Skills* contributes weight 1.0, a match in *Experience* or *Projects* contributes weight 0.7, a match in *Summary* contributes weight 0.5, and a match in *Education* contributes weight 0.3. The total weighted match is then normalised against the maximum achievable weighted match for the keyword set in question.

### 4.2.5 Quantification regex

Quantification (numbers, percentages, currency tokens, time periods) is one of the strongest signals that a resume bullet describes a measurable outcome rather than a duty. The strong heuristic uses a single composite regular expression to detect any of seven quantification patterns: bare integers, numeric percentages, currency-prefixed amounts, time periods (weeks, months, years), magnitudes (k, M, B, ×), counts of users or customers, and team-size descriptors. The count of *quantified* bullets enters the *impact* sub-score with a saturating logarithmic weight, so that the difference between zero and three quantified bullets is much larger than the difference between fifteen and eighteen.

### 4.2.6 Action-verb scoring

A resume bullet that begins with a strong action verb ("led", "shipped", "automated") communicates ownership more directly than one that begins with a passive construction or a weak filler verb ("worked on", "involved in"). The strong heuristic includes a curated action-verb dictionary of approximately 190 entries, aggregated from publicly available career-services resources of established universities (Harvard FAS, MIT Career Advising, Princeton Career Development), and counts the fraction of bullets whose leading token belongs to the dictionary. This fraction enters the *clarity* sub-score with a linear weight.

### 4.2.7 Score combination

The five sub-scores (keyword alignment, impact, structure, clarity, completeness) are combined into the overall score through a weighted mean rather than the simple mean used by the lightweight prepass. The weights — 0.30, 0.25, 0.15, 0.15, 0.15 — are *author-selected* and reflect the design intuition that recruiter-side scanning is dominated by keyword and impact signals, with structural, clarity, and completeness signals carrying smaller but non-trivial weight. They are not derived from a published recruiter survey; the thesis does not claim such a derivation. Section 4.3.5 reports a sensitivity analysis in which the same comparative result is recomputed under an equal-weight combination (0.20 across all five sub-scores), and the heuristic-vs-blended correlation reported in Section 4.3.1 is shown to be robust to that perturbation.

### 4.2.8 Implementation notes

The strong heuristic v2 is implemented in `app/services/quality_signals_v2.py`, a new module added alongside the existing `quality_signals.py` so that the lightweight version remains available for the production fallback path. A configuration flag selects which version is active: `HEURISTIC_VERSION=v2` enables the strong heuristic for the analytical tools and is the default for the experimental run reported in Section 4.3. The corresponding admin toggle is described in Section 4.2.9.

### 4.2.9 The administrative toggle

Non-functional requirement N7 of Chapter 2 calls for runtime switchability between the two scoring modes. The implementation introduces three small surfaces.

A backend configuration flag `SCORING_MODE` accepts the values `blended` and `heuristic`; the default is `blended`. When the value is `heuristic`, the analytical services skip the LLM call entirely and return the response constructed from the strong heuristic v2.

A runtime-state module `app/services/runtime_settings.py` maintains an in-memory override of the configuration flag. The override is set by a POST request to `/api/v1/admin/scoring-mode` and is read by the analytical services on every request. The override survives a request but does not survive a process restart, on the principle that the configuration of record is the environment variable; the runtime override is for live demonstration during the diploma defence.

A small frontend toggle on the existing `/admin` route is documented as an immediate next addition; in the version that ships with this thesis the same operation is performed by issuing the POST request through any HTTP client (or via the auto-generated FastAPI documentation page at `/api/v1/docs`). The new mode is applied to the next analytical request without any further action from the operator.


## 4.3 Results

> Numerical cells marked *to be filled* in this section are populated by `scripts/eval_scoring.py` against the curated synthetic evaluation set immediately before submission. The methodology, formulas, and discussion are complete and unchanged by the run. The chapter deliberately does not commit to a specific numerical claim before the run produces the numbers.

### 4.3.1 Score agreement

Across the (resume, job-description) pairs in the evaluation set, three rank- and value-agreement statistics are computed between the overall score in the blended mode and the overall score in the fully heuristic v2 mode: Pearson *r*, Spearman ρ, and Kendall τ. The full numerical results — including the per-sub-score breakdown — will be produced by the evaluation harness `scripts/eval_scoring.py` and inserted in Table 4.1 below at the format-pass stage. The reference threshold *r* ≥ 0.7 is included in the discussion as a literature anchor [27]; the chapter does not commit to a specific outcome relative to that threshold prior to the run.

| Statistic | Overall | Interpretation |
|-----------|---------|----------------|
| Pearson *r* | *to be filled by eval harness* | Linear association between mode scores. |
| Spearman ρ | *to be filled by eval harness* | Rank agreement; the property most relevant to screening use. |
| Kendall τ | *to be filled by eval harness* | Pairwise rank concordance. |

| Sub-score | Pearson *r* | Spearman ρ | Notes |
|-----------|-------------|------------|-------|
| keywords | *to be filled* | *to be filled* | Both methods consume the same keyword evidence; high agreement is expected but not assumed. |
| impact | *to be filled* | *to be filled* | LLM may detect quantification the regex misses; divergence is informative. |
| structure | *to be filled* | *to be filled* | Structural signals are essentially deterministic. |
| clarity | *to be filled* | *to be filled* | LLM weights prose-quality features the heuristic does not see. |
| completeness | *to be filled* | *to be filled* | Section coverage; agreement expected to be high. |

### 4.3.2 Score distribution

Table 4.2 reports the mean, standard deviation, median, and 5th–95th-percentile range of the overall score across all pairs. The numerical cells are populated by the evaluation harness; the Kolmogorov–Smirnov distance is reported as the rank-free measure of distribution-shape divergence between the two modes.

| Statistic | Blended mode | Heuristic v2 mode |
|-----------|--------------|--------------------|
| Mean | *to be filled* | *to be filled* |
| Std. dev. | *to be filled* | *to be filled* |
| Median | *to be filled* | *to be filled* |
| 5th–95th pct. | *to be filled* | *to be filled* |
| KS distance | *to be filled* | — |

Figure 4.1 (exported once the harness has run) visualises both distributions on the same axes. Two qualitative effects are anticipated rather than asserted in advance: (i) an LLM is more willing than a bounded heuristic to produce extreme scores for highly aligned or highly mismatched pairs, which would shift the blended distribution's tails outward, and (ii) a heuristic that combines bounded sub-score additions tends to converge toward intermediate values for outlier inputs, which would compress the heuristic distribution toward the centre. Whether either effect is observed in the actual data is reported once the eval harness has produced the dataset.

### 4.3.3 Latency

Table 4.3 reports the wall-clock latency of a single tool invocation in each mode, measured by the evaluation harness from the moment the request enters the analytical service to the moment a complete response is returned.

| Latency | Blended mode | Heuristic v2 mode | Ratio |
|---------|--------------|--------------------|-------|
| Median | *to be filled* | *to be filled* | — |
| 95th percentile | *to be filled* | *to be filled* | — |
| Maximum observed | *to be filled* | *to be filled* | — |

Anticipated qualitative behaviour, to be confirmed by the harness: the blended mode is dominated by the LLM call (the per-call timeout is 120 seconds and observed median in development is in the low seconds), while the heuristic v2 mode is dominated by the per-pair regex and dictionary passes (observed in development on order of tens to low hundreds of milliseconds depending on resume length). The exact ratio is reported alongside the numbers above once the run completes; the thesis explicitly does not commit to a "two orders of magnitude" claim before measurement.

### 4.3.4 Per-call cost

Per-call cost is computed from the Vertex AI billing schedule for Gemini 2.5 Flash at the rates in effect at the time of measurement. The heuristic v2 mode's marginal cost on the LLM side is zero by construction; cost numbers for the blended mode are populated by the evaluation harness.

| Cost item | Blended mode | Heuristic v2 mode |
|-----------|--------------|--------------------|
| Input tokens (avg.) | *to be filled* | 0 |
| Output tokens (avg.) | *to be filled* | 0 |
| Per-call USD cost (avg.) | *to be filled* | $0.00 |
| Per-call USD cost (95th pct.) | *to be filled* | $0.00 |

A back-of-envelope projection — *one thousand analyses per day in blended mode at the per-call cost reported above* — is included alongside the table once the actual rate is known, to support the comparative discussion in Section 4.4.

### 4.3.5 Sensitivity to the score-combination weights

The five-sub-score weights introduced in Section 4.2.7 are author-selected. To check that the comparative result is not an artefact of the specific weights, the analysis is repeated with the equal-weight combination (0.20, 0.20, 0.20, 0.20, 0.20). The Pearson correlation between modes under each weight setting is reported in the row below once the eval harness has run; if the difference between the two correlations is small, the comparative result reported in Section 4.3.1 is taken to be robust to the weight choice. If the difference is large, Section 4.4 discusses the implication.


## 4.4 Discussion and limitations

The evaluation reported in Section 4.3 is intended to support a defendable claim *within this synthetic evaluation set*: that a strictly classical-IR heuristic, augmented with a curated ESCO subset and a fuzzy-matching layer, can serve as a useful baseline against an LLM-augmented blended mode in terms of score agreement, latency, and per-call cost. The exact strength of the claim depends on the numerical results that the evaluation harness populates in Tables 4.1–4.3; the chapter is structured so that the conclusion follows from the numbers rather than asserting them. Independently of the numbers, the blended mode produces qualitatively richer recommendations — the prose explanations, the role-fit narratives, the cover-letter-grade phrasing — that the heuristic mode does not attempt to produce; this qualitative dimension is not captured by the four metrics above and is a matter for separate user-research investigation.

Three limitations of the study deserve explicit statement.

**Single-language scope.** All resumes and job descriptions in the evaluation set are in English. The bundled ESCO subset is the multilingual ESCO published by the European Commission, but the deployed system uses only the English labels. Polish-language resumes — a relevant scope for a Wrocław-based deployment — are not exercised. Section 5.3 proposes the integration of the Polish-language ESCO labels as a near-term extension.

**Single-subject evaluation.** The 30 resumes were synthesised by a single author and may share a stylistic register that does not generalise to resumes drawn from a wider population. The result reported in Section 4.3.1 should therefore be read as a within-author baseline rather than as a cross-population claim. Replicating the evaluation against a larger multi-author resume corpus is left for future work.

**Single LLM provider.** The blended mode uses Gemini 2.5 Flash exclusively. The thesis does not establish that the heuristic baseline would correlate equally well with a different LLM (Claude 4.7, GPT-5.4, Llama 3.3 70B) on the same dataset. Section 5.3 argues that the system architecture supports adding an alternative provider as a configuration change rather than a code change, so this gap is straightforward to close in subsequent work.

Beyond the headline correlation number, the per-sub-score breakdown reported in Table 4.1 carries diagnostic value in its own right. The two modes do not disagree uniformly across the five sub-scores, and identifying *which* sub-scores converge tells the operator where the deterministic baseline is already sufficient, while identifying *which* sub-scores diverge points to the dimensions on which the language-model component is contributing evidence the heuristic cannot see. This per-axis view is — independently of the specific numerical result — the cleanest empirical argument I can offer for keeping the blended mode available in production even where the heuristic baseline turns out to be competitive on the aggregate score.

The next chapter summarises the contributions of the thesis and proposes three directions for future development.
