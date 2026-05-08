# Chapter 5 — Conclusions

This thesis presented the design, implementation, and empirical evaluation of a system for personalised career recommendation, scoped as a Bachelor-level engineering thesis at the Faculty of Electronics, Photonics and Microsystems of Wrocław University of Science and Technology.

## 5.1 Results

Three results were obtained.

**A deployed integrated system.** The system is deployed on Railway as a single application surface and integrates six tools: Resume Analyzer, Job Match, Career Path, Cover Letter, Interview Q&A, and Portfolio Planner. Chapters 2 and 3 documented the architecture, the shared pipeline, and the tool implementations. The system supports authenticated accounts, guest demonstrations, persisted tool history, regeneration chains, and runtime switching between scoring modes.

**A defendable heuristic baseline.** Chapter 4 introduced strong heuristic v2, a strictly non-neural scoring pipeline based on TF–IDF and BM25 [5, 6], ESCO-aligned skill normalisation [8, 9, 12], Levenshtein-style fuzzy matching [7], section-weighted evidence [18], quantification detection, and action-verb scoring. The score-combination weights are author-selected but were checked through the sensitivity analysis in Section 4.3.5.

**A characterisation of the heuristic-versus-blended trade-off.** On 100 post-mitigation synthetic resume/job-description pairs, heuristic mode tracks blended mode at Pearson *r* = 0.836 [95% CI 0.762, 0.896] and Spearman ρ = 0.847, while running much faster (median 25.5 ms versus 18.2 s) and incurring zero LLM-side marginal cost. The post-hoc LLM-only-versus-heuristic correlation is *r* = 0.627 [95% CI 0.476, 0.765], showing that the headline agreement includes the structural 0.40 heuristic component in the blended score. Agreement is strongest on keywords (*r* = 0.937) and weakest on clarity (*r* = 0.395), which explains why the heuristic is useful as a deterministic baseline while the blended mode remains valuable for prose-quality judgement.

The main engineering lesson is that the shared `run_tool_pipeline` should have been introduced earlier. The first analytical tools were initially implemented with duplicated cache, persistence, and observability logic; refactoring them into one pipeline reduced later implementation risk and made the comparative study easier to run.

The main research lesson is that a deterministic baseline should be measured rather than treated as a fallback of last resort. Before the comparison, heuristic mode existed mainly as a reliability mechanism. After the study, it can be described more precisely: weaker on prose-quality judgement, but strong enough on aggregate scoring to justify its place in the deployed system.

## 5.2 Limitations

The empirical claim is bounded by the evaluation design. The dataset is **single-language** (English) and **single-author** (all 30 resumes were synthesised by one author), so the result is a within-author baseline rather than a cross-population hiring claim. The blended mode uses a **single LLM provider**, Google Vertex AI Gemini 2.5 Flash, and should not be assumed to behave identically with Claude, GPT, Llama, or another hosted model.

Two operational limits also remain. First, the in-memory cache is not shared between processes; this is acceptable for thesis-scope traffic but not for larger production scale. Second, the implemented system covers skills and experience but does not yet model temporal job-market trends such as posting-frequency shifts, regional demand changes, or hiring-rate dynamics.

Finally, the system is a thesis demonstration rather than a sustainable commercial product. The monetisation strategy described in `docs/spec.md` is deliberately deferred to a post-thesis V1.1 release and is not evaluated here.

The fairness limitation is separate from those operational issues. Automated hiring tools can reproduce or amplify bias when resume content, model training data, or historical decisions correlate with protected attributes [22, 23, 24]. The present benchmark has no demographic labels, so disparate-impact diagnostics cannot be computed.

A further methodological limitation is that the evaluation measures score agreement rather than downstream user outcomes. The study shows how closely two scoring modes track each other on the synthetic benchmark, but it does not measure whether candidates rewrite better resumes, receive more interviews, or make better career decisions after using the system. Those outcomes would require a longitudinal user study with consented participants, which is outside the thesis schedule.

## 5.3 Future development

Future work follows directly from these limitations.

**Polish-language coverage.** ESCO is multilingual, but the current bundled subset uses English labels. Adding Polish labels would make the system more relevant to a Wrocław-based deployment. The required change is contained: language detection, Polish-aware preprocessing in `quality_signals_v2.py`, and locale-specific prompt branches.

This extension would also test whether the top-down ESCO strategy remains robust when resumes mix Polish headings, English technical skills, and hybrid phrasing common in local technology roles. The architecture separates preprocessing, prompt construction, and scoring, so the work is mainly data and language handling rather than a new system design.

The Polish extension should not be treated as a translation-only task. Resume section labels, education terminology, contract types, and local job-title conventions differ from English examples, and technical resumes often mix languages in one document. A useful implementation would therefore combine ESCO label expansion with Polish section detection and bilingual prompt evaluation.

**Sentence-transformer intermediate tier.** A third scoring mode could sit between strict classical IR and full LLM inference: a sentence-transformer semantic matcher such as `all-MiniLM-L6-v2` [20, 21]. Stage H tested this idea as an ablation, but on the synthetic benchmark the SBERT-only variant reached *r* = 0.623 (Δ = −0.004 versus v2) and the full v3 stack reached *r* = 0.590 (Δ = −0.036). These results suggest that promotion to production should wait for evaluation on real-world resumes and job descriptions with more prose variation than the synthetic templates expose.

**Retrieval-augmented blended mode.** The blended mode could retrieve curated labour-market documents, ESCO occupation descriptions, salary surveys, or role-progression standards before invoking the LLM [25]. This would make recommendations more source-attributed without changing the persistence model or response contracts.

This direction is the most product-facing one. It addresses the limitation that current recommendations are reasoned from the resume and job description but are not grounded in external labour-market evidence. A retrieval stage would let the system cite recent documents while preserving the existing LLM response shape.

The retrieval layer would also help with the approved-topic phrase "current job-market trends". Instead of asking the LLM to infer market context from its pretraining, the system could retrieve recent, source-attributed evidence and attach it to the recommendation. This would make the trend dimension auditable in a way that the present static job-description comparison is not.

**Redis-backed cache.** Replacing the in-memory cache with Redis would allow cache sharing across backend processes and is the smallest operational upgrade once traffic exceeds a single-instance deployment.

This change would preserve the current cache-key design while moving storage out of process memory. It would also make latency measurements easier to interpret in a scaled deployment because cache hits would not depend on which backend worker received the request.

The thesis contributions are therefore an integrated deployed career-support system, a transparent non-neural heuristic baseline, and a measured comparison of that baseline against a language-model-augmented mode on score agreement, latency, and cost. The live deployment and administrative scoring-mode endpoint remain available for diploma-defence demonstration.

The work is ready for supervisor review once the final document build passes page-count, citation, cross-reference, and visual checks. If the project continues after submission, the strongest next step is a broader evaluation set: real resumes, real job descriptions, multilingual inputs, and fairness-relevant annotations.

That broader evaluation set would be the natural bridge from a Bachelor-level engineering thesis to a Master's-level research project. It would allow the same architecture and scoring modes to be tested under less synthetic language variation, with demographic safeguards and real user outcomes added to the evaluation design.
