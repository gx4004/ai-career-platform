# CODEX Adversarial Review

Scope: thesis package and strong heuristic v2 implementation reviewed on 2026-05-07. This is intentionally severity-first. Anything below can embarrass the student at defence if left as-is.

## 1. Methodological credibility

### CRITICAL — Chapter 4 reports results that do not exist

- Evidence: `thesis/chapter-04-studies.md:108` — "only the cells marked pending value are pending."
- Evidence: `thesis/chapter-04-studies.md:112` — "the Pearson correlation ... is *r* = pending value (95% CI: \[pending value, pending value]). This is well above the 0.7 threshold"
- Evidence: `scripts/eval_scoring.py:72-75` — "ERROR: evaluation dataset missing at ... thesis/eval-dataset.json"
- Why this is a problem: this is not a draft wording issue; it is a false result section. The script cannot run because the dataset does not exist. A jury only has to ask "where is the dataset?" and the empirical contribution collapses.
- Minimum fix: remove all "well above" / "confirms" language until actual results exist. Generate the dataset, run the harness, and write Chapter 4 as measured results, not expected results.

### CRITICAL — The evaluation harness cannot test the claimed v2 mode

- Evidence: `scripts/eval_scoring.py:19-22` — "Open items before running: ... Wire the runtime mode check into resume_analyzer.py and job_matcher.py."
- Evidence: `backend/app/services/resume_analyzer.py:298-300` — "prepass = build_resume_prepass(...)" and "heuristic_breakdown = compute_resume_breakdown(prepass)"
- Evidence: `backend/app/services/job_matcher.py:184-185` — "prepass = build_resume_prepass(...)" and "match_score = compute_match_score(...)"
- Why this is a problem: Chapter 4 says it evaluates "strong heuristic v2"; the live services still call v1. Running the harness today would compare blended-v1 against fallback-v1, not v2. That is fatal because the thesis' research contribution is specifically v2.
- Minimum fix: wire `quality_signals_v2` into both services behind one explicit mode switch, then include a smoke-test log proving the heuristic run bypasses the LLM and uses v2 fields.

### CRITICAL — "Recruiter-survey-informed" weights are a placeholder citation masquerading as evidence

- Evidence: `thesis/chapter-04-studies.md:89` — "were chosen to reflect the relative emphasis recruiters self-report in survey research [reference: ATS user-research surveys 2023]"
- Evidence: `thesis/heuristic-v2-design.md:154` — "ATS user-research surveys (placeholder citation, replace with real survey reference at format pass)."
- Evidence: `backend/app/services/quality_signals_v2.py:464-465` — "# Weighted overall (recruiter-survey-informed weights, sum to 1.00)" and `_OVERALL_WEIGHTS = {"keywords": 0.30, ...}`
- Why this is a problem: the weights are core to the headline score. If the citation is fake or missing, the weighting becomes arbitrary. "Survey-informed" is exactly the phrase a sceptical examiner will attack.
- Minimum fix: either replace the placeholder with a real source that supports the relative weights, or admit these are author-selected heuristic weights and report sensitivity analysis as the justification.

### HIGH — The "published-method baseline" overclaims weak primitives

- Evidence: `thesis/chapter-04-studies.md:49` — "replaces each of those weak primitives with a published-method counterpart drawn from classical information-retrieval research."
- Evidence: `backend/app/services/quality_signals_v2.py:420-421` — `keywords_score = clamp(0.7 * ... + 0.3 * min(100.0, prepass.bm25_keyword_score * 4))`
- Evidence: `backend/app/services/quality_signals_v2.py:423-453` — impact, structure, clarity, and completeness are hand-built constants: `20 +`, `25 +`, `15 +`, `14 * len(...)`.
- Why this is a problem: BM25, IDF, and Levenshtein are published methods; the actual scoring system is a pile of manually tuned constants around them. Calling the whole v2 a published-method baseline is dressing up a heuristic as literature-grade methodology.
- Minimum fix: call v2 a "classical heuristic baseline using published IR components" and explicitly label the score-combination formulas as author-designed.

### HIGH — Pearson correlation is not enough for the ranking claim

- Evidence: `thesis/chapter-04-studies.md:28` — "A high correlation indicates that the heuristic preserves the *ranking* the blended mode produces"
- Evidence: `scripts/analyze_eval_results.py:25-33` — only `pearson(...)` is implemented.
- Why this is a problem: Pearson measures linear association, not rank agreement. A monotonic nonlinear transform can preserve ranking with bad Pearson; outliers can inflate Pearson while top-k recommendations change. The missing sanity checks are Spearman, Kendall tau, and top-k overlap by role track.
- Minimum fix: add Spearman rho, Kendall tau, and top-5/top-10 overlap. If staying stdlib-only, implement rank correlation directly.

### HIGH — Synthetic, single-author, English-only data is admitted but then overpowered by conclusion language

- Evidence: `thesis/chapter-04-studies.md:16-20` — "The dataset consists of *N* = 30 resumes..." and "The resumes are *synthetic*..."
- Evidence: `thesis/chapter-04-studies.md:174` — "single author and may share a stylistic register"
- Evidence: `thesis/chapter-04-studies.md:168` — "recovers the majority of the discriminative ranking power"
- Why this is a problem: the limitations section is honest, but the result claim is too strong for synthetic resumes authored by the same person who authored the heuristic. The evaluation mostly tests whether the heuristic matches the author's synthetic style.
- Minimum fix: weaken the claim to "within this synthetic evaluation set" everywhere, including the abstract and conclusion.

### MEDIUM — The pair-count derivation looks mathematically performative

- Evidence: `thesis/chapter-04-studies.md:22` — "yielding 30 × ⌈20 / 6⌉ ≈ 100"
- Why this is a problem: it is arithmetically fine if tracks contain uneven JDs, but it reads like a formula invented to reach "approximately 100." The actual design is per-track pairing: 5 resumes × 3-4 JDs × 6 tracks.
- Minimum fix: state the per-track construction directly and give the exact count after the manifest exists.

## 2. Code correctness

### CRITICAL — BM25 IDF is computed from the current resume and JD, not the evaluation JD corpus

- Evidence: `thesis/chapter-04-studies.md:55` — "idf ... computed over the corpus of job descriptions in the evaluation set"
- Evidence: `backend/app/services/quality_signals_v2.py:385` — `idf = _idf_from_corpus([tokens, jd_tokens])  # tiny in-pair IDF`
- Verification output: `IDF_two_docs_selected {'engineer': 0.182, 'python': 0.182, 'postgresql': 0.182, 'fastapi': 0.182, 'kubernetes': 0.693, 'experience': 0.693}`
- Why this is a problem: this is not corpus IDF. It rewards terms absent from the resume but present in the JD as "rare" in a two-document universe, and it makes BM25 values incomparable across pairs. The thesis description and code contradict each other.
- Minimum fix: build IDF from all evaluation JDs before scoring, or remove the corpus-IDF claim and explain the in-pair approximation honestly.

### CRITICAL — Runtime scoring mode is documented but not parsed or used

- Evidence: `thesis/chapter-04-studies.md:99` — "`SCORING_MODE` accepts the values `blended` and `heuristic`"
- Evidence: `backend/app/config.py:26-28` — settings include `RESULT_CACHE_TTL_SECONDS`, `RESULT_CACHE_ENABLED`, `BLENDED_SCORING_ENABLED`; no `SCORING_MODE`.
- Evidence: `backend/app/services/runtime_settings.py:26` — `configured = getattr(settings, "SCORING_MODE", "blended")`
- Why this is a problem: because `Settings` ignores unknown env vars (`backend/app/config.py:47` — `extra: "ignore"`), `SCORING_MODE` is never loaded as a first-class setting. The toggle module defaults to blended and the services never read it anyway.
- Minimum fix: add `SCORING_MODE` to settings, have services call `get_scoring_mode()`, and test both paths.

### HIGH — The claimed admin scoring endpoints do not exist

- Evidence: `thesis/chapter-04-studies.md:101` — "POST request to `/api/v1/admin/scoring-mode`"
- Evidence: `thesis/appendices.md:191-192` — "`GET /api/v1/admin/scoring-mode`" and "`POST /api/v1/admin/scoring-mode`"
- Evidence: `backend/app/routers/admin.py:36`, `backend/app/routers/admin.py:122`, `backend/app/routers/admin.py:144` — implemented admin routes are `/users`, `/users/{user_id}/admin`, and `/runs`; no scoring-mode route.
- Why this is a problem: N7 live demonstrability is claimed as implemented, but the backend has no endpoint. This is a live-demo failure waiting to happen.
- Minimum fix: implement the two endpoints and include their response in Appendix D only after they exist.

### HIGH — The design claims rapidfuzz and a fuzzy cap; code uses difflib with no cap

- Evidence: `thesis/chapter-04-studies.md:73` — "implemented through the `rapidfuzz` library"
- Evidence: `thesis/heuristic-v2-design.md:72-74` — "`rapidfuzz.fuzz.token_set_ratio` ... Cap fuzzy matches at 30%"
- Evidence: `backend/app/services/quality_signals_v2.py:19-20` — "Stdlib only — no rapidfuzz"
- Evidence: `backend/app/services/quality_signals_v2.py:214-225` — `_fuzzy_match` uses `SequenceMatcher`; no 30% cap.
- Verification output: `FUZZY_java_javascript 0.5714285714285714 False`; `FUZZY_javacript_javascript 0.9473684210526315 True`
- Why this is a problem: the Java/JavaScript false-positive worry is okay in this test, but the paper still describes a different algorithm. A jury comparing thesis to code will see a method mismatch.
- Minimum fix: align the thesis with difflib or install/use rapidfuzz. Remove the cap claim unless implemented.

### HIGH — Section detection misses ordinary headings and silently lowers scores

- Evidence: `backend/app/services/quality_signals_v2.py:95-101` — section headers are exact-line regexes like `experience|work experience|employment|professional experience`.
- Verification output: `SECTIONS_EXACT {'summary': (0, 256), 'education': (256, 287)}` for a resume using "Profile", "Work History", "Technologies", "Education".
- Verification output: `SECTIONS_NO_HEADERS {}` for a normal one-paragraph resume.
- Why this is a problem: v1 recognised "work history" and "technologies"; v2 does not. The tiny resume's "Work History" and "Technologies" were missed, causing matched keywords to be treated as summary/default evidence. This makes the section-weight feature brittle.
- Minimum fix: add common synonyms from v1 and test non-standard headers explicitly in the evaluation manifest.

### HIGH — ESCO subset is not approximately 800 entries

- Evidence: `thesis/chapter-04-studies.md:67` — "approximately 800 entries"
- Evidence: `backend/app/data/esco_skills.json:6` — "v0.1 — bootstrapped sample ... expand to ~800 entries before publication"
- Verification output: `ESCO_VARIANTS 348 ESCO_CANONICALS 107`
- Why this is a problem: the thesis inflates the corpus size by about 7.5x. This is a simple factual contradiction, easy for a reviewer to find.
- Minimum fix: either expand the file or state "107 canonical skills / 348 variants" everywhere.

### HIGH — The <50 ms latency claim is false for larger input in the current implementation

- Evidence: `thesis/heuristic-v2-design.md:11` — "Run in < 50 ms per analysis at the 95th percentile."
- Evidence: `backend/app/services/quality_signals_v2.py:242-245` — loops every ESCO variant and runs a regex search over the whole text.
- Verification output: `LONG_PREPASS_MS_MIN_MED_MAX 106.8 107.49 111.05`
- Why this is a problem: on a repeated-text stress input, v2 takes ~107 ms after cache warm-up. The claim may pass for toy inputs, but the implementation is not bounded enough to defend <50 ms p95 without measured production data.
- Minimum fix: replace per-variant regex scanning with a compiled alternation/trie/Aho-Corasick style matcher, or report measured latencies honestly.

### MEDIUM — Tiny sanity example produces a mediocre score despite obvious alignment

- Evidence: `backend/app/services/quality_signals_v2.py:420-421` — keywords score is damped by `0.7 * weighted + 0.3 * min(... bm25 * 4)`.
- Verification output: matched 5 of 6 skills but `keywords` = 34, `overall` = 49, `match` = 59.
- Why this is a problem: a resume matching Python, FastAPI, PostgreSQL, Docker, and REST APIs against a backend JD should not look borderline because the section detector missed headings and BM25 scaling is arbitrary. This is a non-degenerate output, but not obviously recruiter-plausible.
- Minimum fix: calibrate on labelled examples or stop presenting the numeric scale as meaningful beyond relative comparison.

### MEDIUM — Action verb corpus count is overstated

- Evidence: `thesis/chapter-04-studies.md:85` — "approximately 250 entries"
- Evidence: `backend/app/data/action_verbs.txt:4` — "Roughly 250 entries"
- Verification output: `ACTION_VERBS 183`
- Why this is a problem: less severe than ESCO, but still an inflated corpus claim.
- Minimum fix: say 183 entries or expand the file.

## 3. Internal consistency

### CRITICAL — Conclusion claims completed empirical results with pending values

- Evidence: `thesis/chapter-05-conclusion.md:17` — "Section 4.3 reported four metrics..." and "The Pearson correlation ... was *r* = pending value, well above the 0.7 threshold"
- Why this is a problem: a conclusion cannot report placeholders. This is the most obvious "AI-generated unfinished draft" marker in the package.
- Minimum fix: do not send Chapter 5 with pending values. Replace with measured values or remove the result claim.

### HIGH — Chapter 2 claims dependencies not used by the actual v2 code

- Evidence: `thesis/chapter-02-architecture.md:62` — "rapidfuzz for fuzzy matching, scikit-learn for TF–IDF and cosine similarity"
- Evidence: `backend/app/services/quality_signals_v2.py:19-20` — "Stdlib only — no rapidfuzz, no scikit-learn"
- Why this is a problem: this makes the architecture rationale look retrofitted. The code does not need the libraries used to justify Python over Node.
- Minimum fix: rewrite the rationale around actual dependencies or implement the library-based design.

### HIGH — Figures/tables are referenced as if present, but no figure files or eval files exist

- Evidence: `thesis/chapter-02-architecture.md:3` — "Figures 2.1–2.5; PNG sources will be exported the next working session"
- Evidence: `thesis/chapter-04-studies.md:134` — "Figure 4.1, exported during the eval run"
- Evidence: repository check: `find thesis ... eval-dataset/eval-results/figures` returned only `thesis`; no figure or eval files.
- Why this is a problem: the draft references visual evidence and datasets that are absent. Defence embarrassment: "Please show Figure 4.1 / dataset manifest."
- Minimum fix: export the figures and dataset files before supervisor draft, or remove forward references.

### HIGH — Appendix says source listings are "pasted as-is" but contains ellipses

- Evidence: `thesis/appendices.md:9` — "Pasted as-is from the repository"
- Evidence: `thesis/appendices.md:31-32` — "# ... (full body in the source file; see Section 4.2...)"
- Why this is a problem: "pasted as-is" and "..." cannot both be true. This is a cheap catch for any examiner.
- Minimum fix: either include complete listings or label Appendix A as excerpts.

### MEDIUM — Abstract and Chapter 4 conclusion are not aligned with current evidence

- Evidence: `thesis/abstract.md:17` — "Results indicate that the heuristic-only configuration recovers the majority..."
- Evidence: `thesis/chapter-04-studies.md:108` — "only the cells marked pending value are pending"
- Why this is a problem: the abstract states a result before data exists. This is dangerous because the abstract is uploaded to APD and may become harder to change.
- Minimum fix: change "Results indicate" to a neutral future/aim statement until metrics exist.

### MEDIUM — N7 is satisfied in prose, not in implementation

- Evidence: `thesis/chapter-02-architecture.md:37` — "must be switchable at runtime through an administrative interface"
- Evidence: `thesis/chapter-03-tools.md:152` — "adds an administrative toggle that bypasses the LLM call unconditionally"
- Evidence: `backend/app/services/resume_analyzer.py:330-331` — always calls `complete_structured(...)` before fallback.
- Why this is a problem: the text says the toggle bypasses the LLM; the code still calls the LLM unconditionally in Resume Analyzer.
- Minimum fix: implement the bypass and add a log line/test that proves no Vertex call happens in heuristic mode.

## 4. Citation accuracy

### CRITICAL — Multiple bibliography entries are weak or unverifiable bootstrap citations

- Evidence: `thesis/bibliography.md:118` — "Replace `*Title.*` placeholders with concrete paper titles where missing"
- Evidence: `thesis/MORNING-CHECKLIST.md:90` — "A few references in `bibliography.md` are bootstrap entries..."
- Why this is a problem: the bibliography itself confesses it is unfinished. Do not let the jury discover that from a hidden note or from dead URLs.
- Minimum fix: remove internal notes from the final thesis and verify every entry through DOI, publisher, ACL, arXiv, IEEE, or official docs.

### HIGH — [6] is mis-cited by year, authors, and title

- Evidence: `thesis/bibliography.md:22` — "Alghieth, M., & Yahya, A. E. (2024). CareerRec..."
- External check: the ETASR page identifies the paper as "A Machine Learning Approach to Career Path Choice for Information Technology Graduates", published Dec. 2020, by H. Al-Dossari, F. A. Nughaymish, Z. Al-Qahtani, M. Alkahlifah, and A. Alqahtani; DOI `10.48084/etasr.3821`.
- Why this is a problem: Chapter 1 relies on [6] for CareerRec details (`thesis/chapter-01-introduction.md:25`). The content is real, but the citation metadata is wrong enough to look fabricated.
- Minimum fix: replace entry [6] with the real title/authors/year/DOI.

### HIGH — [1] looks fabricated or misidentified

- Evidence: `thesis/bibliography.md:9` — "Sonkar, S., Liu, N., Mallick, D., & Baraniuk, R. (2024). *A multi-task deep learning model for resume segmentation and named entity recognition*. Proceedings of RANLP 2025."
- External check: direct title search did not resolve this entry; the closest visible result was a different "Fast and Accurate Resume Parsing Method Based on Multi-task Learning" by Tencent authors.
- Why this is a problem: a 2024 paper in "Proceedings of RANLP 2025" with a non-resolving title is a fabrication smell. Do not cite it unless the PDF actually matches the entry.
- Minimum fix: open the URL, verify authors/title/venue, and replace with exact metadata or delete.

### HIGH — [34] is used to justify a 99% schema-adherence claim but is a weak preprint entry

- Evidence: `thesis/chapter-03-tools.md:28` — "Recent research [34] reports that JSON-schema-constrained generation adheres to the supplied schema in over 99% of calls"
- Evidence: `thesis/bibliography.md:96` — "*Prompt engineering for structured data: A comparative evaluation of styles and LLM performance.* (2025). *Preprints.org*. https://www.preprints.org/manuscript/202506.1937"
- Why this is a problem: a broad operational claim about Gemini reliability is hung on a generic preprint entry. This is weak citation practice and may not even apply to Vertex structured output.
- Minimum fix: either cite official Vertex/OpenAI structured-output documentation plus local error logs, or remove the exact 99% claim.

### MEDIUM — Foundational references are mostly real, but formatting should be corrected

- Evidence: `thesis/bibliography.md:76-80` — Robertson & Zaragoza 2009, Salton & McGill 1983, Levenshtein 1966.
- External checks: Robertson & Zaragoza DOI `10.1561/1500000019` resolves; Salton & McGill is a real McGraw-Hill 1983 book; Levenshtein 1966 is real; Reimers & Gurevych 2019 has DOI `10.18653/v1/D19-1410`.
- Why this is a problem: these are recognisable references, but [23] should include ACL DOI/pages and [17] should include DOI `10.1109/MC.2014.283` for polish. The problem is not fabrication here; it is incomplete scholarly formatting.
- Minimum fix: import the four into Zotero/Crossref and use consistent numeric style.

### MEDIUM — [20] is a future-dated arXiv preprint relative to the thesis topic and weak for core ESCO claims

- Evidence: `thesis/bibliography.md:56` — "*Enhancing job matching...* (2025). *arXiv:2512.03195*"
- External check: the paper exists as a Dec. 2025 arXiv/CoRR preprint, not peer-reviewed.
- Why this is a problem: it is acceptable as recent context, not as a pillar. Chapter 1 uses [20] among "recent work" (`thesis/chapter-01-introduction.md:34`), which is fine only if labelled as preprint-level evidence.
- Minimum fix: keep it as "recent preprint" or replace with older peer-reviewed ESCO/skill-extraction sources.

## 5. Voice and AI-detection risk

### HIGH — The draft still contains visible authoring instructions and placeholders

- Evidence: `thesis/abstract.md:1` — "paste into engineer_en.docx"
- Evidence: `thesis/acknowledgements.md:13` — "[OPTIONAL] I would also like to thank [name(s)...]"
- Evidence: `thesis/title-page.md:3` — "Confirm before format-pass."
- Why this is a problem: these are not thesis text. If any survive into the supervisor draft, the package screams machine-generated assembly.
- Minimum fix: strip all process notes, optional blocks, and Markdown-only instructions from final thesis files.

### HIGH — The "personal voice" insertions sound engineered, not naturally human

- Evidence: `thesis/chapter-01-introduction.md:11` — "the part that stayed with me was not any single tool's output but the friction..."
- Evidence: `thesis/chapter-01-introduction.md:47` — "a sequencing detail worth flagging because it shaped the heuristic..."
- Evidence: `thesis/chapter-02-architecture.md:102` — "the duplication was painful enough to motivate the refactor..."
- Evidence: `thesis/chapter-05-conclusion.md:43` — "I do not yet have a single ranking that holds across all the criteria I would use."
- Why this is a problem: these are fluent, balanced, reflective paragraphs with perfect structure. For a non-native Turkish speaker writing a Bachelor thesis, they may read less like authentic voice and more like generated "humanising" inserts.
- Minimum fix: replace with shorter, rougher, more specific observations only the student would know: dates, concrete bugs, exact implementation failures, one supervisor comment.

### HIGH — Claude/ChatGPT prose tics are dense

- Evidence: `thesis/chapter-01-introduction.md:41` — "The defendable claim, supported by decades..."
- Evidence: `thesis/chapter-02-architecture.md:7` — "Where a decision could plausibly have been made differently, the rationale is stated explicitly so that the reasoning is auditable rather than implicit."
- Evidence: `thesis/chapter-03-tools.md:24` — "This pattern stabilises the LLM's output against prompt-perturbation noise and aligns..."
- Evidence: `thesis/chapter-04-studies.md:49` — "By construction, every component of v2 is non-neural"
- Evidence: `thesis/chapter-05-conclusion.md:45` — "an empirical characterisation of how that baseline compares..."
- Why this is a problem: "defendable", "auditable", "by construction", "characterisation", "grounded", "curated", and repeated em-dash sentence architecture are strong AI-fingerprint patterns.
- Minimum fix: cut the rhetoric. Prefer plain claims, shorter sentences, and fewer meta-justifications.

### MEDIUM — First-person paragraphs are too convenient and too polished

- Evidence: `thesis/chapter-03-tools.md:20` — "The specific retry schedule ... was tuned empirically rather than chosen from a textbook."
- Evidence: `thesis/chapter-03-tools.md:150` — "The Cover Letter tool produced the opposite kind of surprise..."
- Evidence: `thesis/chapter-04-studies.md:178` — "The result that surprised me most was not the headline correlation number..."
- Why this is a problem: these are exactly the kind of "authenticity" anecdotes LLMs generate: reflective contrast, clean lesson, neatly tied back to thesis structure. Line 178 is also impossible before results exist.
- Minimum fix: keep only observations backed by logs, commits, or real eval results.

### MEDIUM — Prose is too uniformly high-register for an engineering thesis draft

- Evidence: `thesis/abstract.md:17` — "fully heuristic mode grounded in classical information-retrieval methods"
- Evidence: `thesis/chapter-02-architecture.md:194` — "maintenance overhead is out of proportion to a thesis-scoped project"
- Evidence: `thesis/chapter-04-studies.md:168` — "qualitatively richer recommendations ... separate user-research investigation"
- Why this is a problem: the style is not merely polished; it is uniformly polished across all chapters, including personal anecdotes. That uniformity is an AI-detection risk.
- Minimum fix: vary sentence length, add concrete project-specific details, and remove generic academic connective tissue.

## 6. Defence questions the jury will ask

### CRITICAL — "Where is the evaluation dataset and can we inspect it?"

- Evidence: `thesis/appendices.md:124` — "scripts/synthesise_resumes.py (to be added in the morning...)"
- Evidence: `scripts/eval_scoring.py:72-75` — dataset missing error.
- Current defensible answer: no. The dataset, synthesis script, and results file are absent.
- Minimum fix: create the dataset manifest, keep redacted JD sources, and be ready to show several raw examples.

### CRITICAL — "Why should we trust Pearson correlation as ranking preservation?"

- Evidence: `thesis/chapter-04-studies.md:28` — "Pearson ... preserves the ranking"
- Evidence: `scripts/analyze_eval_results.py:25-33` — only Pearson implemented.
- Current defensible answer: weak. Pearson alone is the wrong statistic for a ranking claim.
- Minimum fix: add Spearman/Kendall/top-k overlap and explain Pearson as score-scale agreement only.

### CRITICAL — "Did the live system actually use strong heuristic v2?"

- Evidence: `backend/app/services/resume_analyzer.py:298-300` — v1 functions called.
- Evidence: `backend/app/services/job_matcher.py:184-185` — v1 functions called.
- Current defensible answer: no, not in the current code.
- Minimum fix: integrate v2 before any demo or remove "implemented/live" language.

### HIGH — "How were the 0.30/0.25/... weights chosen?"

- Evidence: `thesis/chapter-04-studies.md:89` — placeholder recruiter-survey citation.
- Current defensible answer: no, unless reframed as author-defined heuristic weights.
- Minimum fix: source the weights or stop claiming survey basis.

### HIGH — "Why is BM25 IDF built from two documents?"

- Evidence: `backend/app/services/quality_signals_v2.py:385` — `idf = _idf_from_corpus([tokens, jd_tokens])`
- Current defensible answer: no, because the thesis says evaluation corpus IDF.
- Minimum fix: precompute real corpus IDF or call this a pair-local approximation.

### HIGH — "Is the ESCO subset really ESCO and really 800 skills?"

- Evidence: `backend/app/data/esco_skills.json:6` — bootstrapped sample, expand to ~800.
- Current defensible answer: weak. It is 107 canonical entries, not 800, and the generation pipeline is absent.
- Minimum fix: provide source processing script and exact counts.

### MEDIUM — "Can the heuristic handle Polish resumes?"

- Evidence: `thesis/chapter-04-studies.md:172` — "Polish-language resumes ... are not exercised."
- Current defensible answer: yes, as a limitation only. Do not imply it works.
- Minimum fix: say English-only v1 repeatedly and clearly.

## 7. Other embarrassments

### CRITICAL — The thesis includes "pending value" as an abbreviation

- Evidence: `thesis/abbreviations.md:78` — "| pending value | To Be Determined |"
- Why this is a problem: this is practically an admission that placeholders are expected to survive. It will look absurd in a submitted thesis.
- Minimum fix: remove `pending value` from abbreviations and eliminate every pending value from body text.

### HIGH — Acknowledgements still contain raw placeholders

- Evidence: `thesis/acknowledgements.md:13` — "[OPTIONAL] I would also like to thank [name(s)...]"
- Evidence: `thesis/acknowledgements.md:15` — "[OPTIONAL] My thanks..."
- Why this is a problem: supervisor draft embarrassment. It tells the reader the document is assembled from prompts.
- Minimum fix: delete optional paragraphs or replace with real names.

### HIGH — The "production-grade" claim is risky against demo-mode admissions

- Evidence: `thesis/abstract.md:17` — "deployed as a production-grade web application"
- Evidence: `thesis/chapter-05-conclusion.md:29` — "currently a thesis demonstration mode rather than a sustainable commercial product"
- Why this is a problem: "production-grade" invites questions about monitoring, scale, privacy, backups, CI, legal terms, and commercial readiness. The thesis later admits it is demo mode.
- Minimum fix: use "deployed web application" or "production-style architecture"; avoid "production-grade" unless the operational evidence is real.

### HIGH — Appendix commands reference outputs that cannot exist yet

- Evidence: `thesis/appendices.md:198-203` — run eval and redirect analyzer output to `chapter-04-results.md`
- Evidence: `scripts/analyze_eval_results.py:63-65` — "ERROR: results file missing"
- Why this is a problem: appendices present an operational recipe for a missing pipeline. A reader following it today hits an error.
- Minimum fix: only include the recipe after the dataset and results are committed.

### MEDIUM — Public-source screenshots are promised but not present

- Evidence: `thesis/appendices.md:142` — "Save as `thesis/figures/ui-<tool>.png`"
- Why this is a problem: screenshot appendix is a common defence anchor. Empty promise means the system may not look demonstrable.
- Minimum fix: capture the screenshots or remove Appendix C.

### MEDIUM — The title page has unresolved official metadata

- Evidence: `thesis/title-page.md:12` — "Speciality: — *(none assigned in APD; confirm with supervisor)*"
- Why this is a problem: administrative formatting errors are low-intellectual but high-annoyance. They can delay submission.
- Minimum fix: confirm speciality line with supervisor before Word formatting.

## Top 5 actions before sending to supervisor

1. Generate and commit `thesis/eval-dataset.json`, run `scripts/eval_scoring.py`, run `scripts/analyze_eval_results.py`, and replace every `pending value`.
2. Wire `quality_signals_v2` and `runtime_settings.get_scoring_mode()` into Resume Analyzer and Job Match; add `/api/v1/admin/scoring-mode` endpoints or remove all live-toggle claims.
3. Fix the methodology claims: Pearson is not ranking agreement; add Spearman/Kendall/top-k overlap and stop calling arbitrary weights "recruiter-survey-informed" without a real citation.
4. Align thesis text to code: no rapidfuzz, no scikit-learn, no 800-entry ESCO subset, no <50 ms p95 unless measured.
5. Strip all drafting residue: pending value, OPTIONAL, "paste into docx", "to be added in the morning", placeholder references, and over-polished AI voice paragraphs that are not backed by real project evidence.

External checks used for citation sanity: ETASR CareerRec page (`https://etasr.com/index.php/ETASR/article/view/3821`), BM25 DOI page/search result (`https://doi.org/10.1561/1500000019`), SBERT ACL DOI (`https://doi.org/10.18653/v1/D19-1410`), ESCO 2014 DOI (`https://doi.org/10.1109/MC.2014.283`), and arXiv/DBLP metadata for `2512.03195`.

## Round 2 — verification (2026-05-07 evening)

### Round-1 findings revisited (severity-first, one bullet per finding, prefixed with Resolved / Partial / Unresolved)

- Partial — CRITICAL, Chapter 4 reports results that do not exist. The false "well above" result is gone: `thesis/chapter-04-studies.md:108` now says "the chapter deliberately does not commit to a specific numerical claim before the run produces the numbers." Still not submission-safe: `thesis/chapter-04-studies.md:3` says Section 4.3 "reports the measured results" and `thesis/chapter-04-studies.md:116-118` still contains "*to be filled by eval harness*".
- Partial — CRITICAL, evaluation harness cannot test claimed v2 mode. Services now short-circuit before the LLM: `backend/app/services/resume_analyzer.py:311-321` and `backend/app/services/job_matcher.py:196-232`. But `backend/app/config.py:38` defaults `HEURISTIC_VERSION: str = "v1"`, and `scripts/eval_scoring.py:12-13` documents only `SCORING_MODE=blended python ../scripts/eval_scoring.py`, so the harness still runs heuristic mode as v1 unless an unmentioned env var is set.
- Partial — CRITICAL, recruiter-survey-informed weights. Chapter 4 and design doc are fixed: `thesis/chapter-04-studies.md:89` says weights are "*author-selected*" and "not derived from a published recruiter survey"; `thesis/heuristic-v2-design.md:157` says the same. Still regressed in code and conclusion: `backend/app/services/quality_signals_v2.py:523` says "# Weighted overall (recruiter-survey-informed weights, sum to 1.00)" and `thesis/chapter-05-conclusion.md:15` says "section-weighted feature extraction informed by recruiter-survey research".
- Partial — HIGH, published-method baseline overclaims weak primitives. The constants are still in code: `backend/app/services/quality_signals_v2.py:480-512` uses `0.7`, `0.3`, `20 +`, `25 +`, and `14 * len(...)`. Current thesis still overclaims: `thesis/chapter-04-studies.md:49` says v2 "replaces each of those weak primitives with a published-method counterpart".
- Resolved — HIGH, Pearson alone is not enough in thesis prose. `thesis/chapter-04-studies.md:28` now distinguishes Pearson from "Spearman rank correlation ρ and Kendall τ" and frames `r ≥ 0.7` as "a reference point, not as a hypothesis". New code gap is listed below.
- Partial — HIGH, synthetic single-author data overpowered by conclusion language. Chapter 4 is scoped: `thesis/chapter-04-studies.md:174` says "*within this synthetic evaluation set*"; abstract is scoped: `thesis/abstract.md:17` says the same. Still overbroad in places: `thesis/chapter-01-introduction.md:58` says the study uses "a curated dataset" without the synthetic/single-author caveat, and `thesis/chapter-05-conclusion.md:45` says "the system is in active use on its public deployment".
- Partial — CRITICAL, BM25 IDF computed from current pair. The two-document IDF is removed: `backend/app/services/quality_signals_v2.py:210-231` builds `_baseline_idf()` over bundled ESCO entries, and `backend/app/services/quality_signals_v2.py:392` adds `corpus_idf`. But the eval harness does not pass it: `scripts/eval_scoring.py:46-50` calls `analyze_resume(resume_text, jd_text)` only.
- Partial — CRITICAL, runtime scoring mode not parsed or used. Parsed and used: `backend/app/config.py:33` adds `SCORING_MODE`, `backend/app/services/runtime_settings.py:35-45` exposes get/set, and services branch at `backend/app/services/resume_analyzer.py:311` / `backend/app/services/job_matcher.py:196`. Still partial because `HEURISTIC_VERSION` defaults to v1 at `backend/app/config.py:38`.
- Resolved — HIGH, admin scoring endpoints do not exist. Routes now exist at `backend/app/routers/admin.py:265-295`, use admin auth at `backend/app/routers/admin.py:269` and `backend/app/routers/admin.py:284`, and are mounted under `/api/v1/admin` at `backend/app/main.py:147`.
- Partial — HIGH, rapidfuzz/fuzzy-cap mismatch. Chapter 4 is fixed: `thesis/chapter-04-studies.md:73` says `difflib.SequenceMatcher`; design doc says current stdlib at `thesis/heuristic-v2-design.md:71-74`. Still partial because the design doc retains a future rapidfuzz/cap note at `thesis/heuristic-v2-design.md:87`.
- Resolved — HIGH, section detection misses ordinary headings. `_SECTION_HEADERS` now includes "profile", "work history", and "technologies" at `backend/app/services/quality_signals_v2.py:95-128`. Smoke result for "Profile / Work History / Technologies / Education" returned `['summary', 'experience', 'skills', 'education']`.
- Resolved — HIGH, ESCO subset not approximately 800. Thesis now says "approximately one hundred entries" at `thesis/chapter-04-studies.md:67`; design doc says "Bundled at submission: ~100 entries" at `thesis/heuristic-v2-design.md:57`.
- Resolved — HIGH, <50 ms latency claim false. The hard claim is gone; `thesis/chapter-04-studies.md:152` now says heuristic v2 is "tens to low hundreds of milliseconds depending on resume length" and no longer commits to "< 50 ms".
- Resolved — CRITICAL, conclusion claims completed empirical results with pending values. `thesis/chapter-05-conclusion.md:17` now says "The exact numerical conclusion is given in Section 4.3 and is not duplicated here". It no longer contains `r = pending value`.
- Resolved — HIGH, Chapter 2 claims dependencies not used. `thesis/chapter-02-architecture.md:62` now frames `rapidfuzz` and `scikit-learn` as "optional ... ecosystems available if the heuristic is later extended"; code remains stdlib at `backend/app/services/quality_signals_v2.py:19-21`.
- Unresolved — HIGH, figures/tables/eval files referenced but absent. Current text still promises figures: `thesis/chapter-02-architecture.md:3` says "PNG sources will be exported the next working session"; `thesis/chapter-04-studies.md:140` says "Figure 4.1 (exported once the harness has run)". Files are still absent: `thesis/eval-dataset.json`, `thesis/eval-results.json`, `scripts/synthesise_resumes.py`, and `thesis/figures/` were missing in this run.
- Resolved — HIGH, Appendix says listings are pasted as-is but contains ellipses. `thesis/appendices.md:9` now says "Excerpted listings" and admits unreproduced helpers; ellipses remain but no longer contradict the label (`thesis/appendices.md:31-32`).
- Partial — CRITICAL, bibliography has weak/bootstrap citations. [1] and [6] are fixed at `thesis/bibliography.md:9` and `thesis/bibliography.md:22`. But the preamble still has a dangerous audit note: `thesis/bibliography.md:121` says "Working note for the author, removed before final submission".
- Resolved — HIGH, [6] mis-cited. `thesis/bibliography.md:22` now cites Al-Dossari et al. 2020 with DOI `10.48084/etasr.3821`.
- Resolved — HIGH, [1] fabricated/misidentified. `thesis/bibliography.md:9` now cites Yu, Guan, & Zhou (2005), ACL '05, `https://aclanthology.org/P05-1062/`.
- Unresolved — HIGH, [34] weak 99% schema-adherence claim. `thesis/chapter-03-tools.md:28` still says "Recent research [34] reports that JSON-schema-constrained generation adheres to the supplied schema in over 99% of calls"; `thesis/bibliography.md:96` is still a generic Preprints.org entry.
- Unresolved — HIGH, visible authoring instructions/placeholders. Still present: `thesis/abstract.md:1` says "paste into engineer_en.docx"; `thesis/acknowledgements.md:13-15` still contains `[OPTIONAL]`; `thesis/title-page.md:3` says "Confirm before format-pass."
- Unresolved — HIGH, personal voice insertions sound engineered. Examples remain: `thesis/chapter-01-introduction.md:11` says "the part that stayed with me"; `thesis/chapter-02-architecture.md:102` says "the duplication was painful"; `thesis/chapter-05-conclusion.md:43` is still a polished reflective paragraph.
- Unresolved — HIGH, Claude/ChatGPT prose tics dense. Examples remain: `thesis/chapter-01-introduction.md:41` says "The defendable claim"; `thesis/chapter-02-architecture.md:7` says "auditable rather than implicit"; `thesis/chapter-03-tools.md:24` says "stabilises the LLM's output against prompt perturbations".
- Partial — CRITICAL defence question, "Where is the evaluation dataset?" Still not defensible. `thesis/appendices.md:124` says "`scripts/synthesise_resumes.py` (to be added in the morning together with the user)", and the dataset/result/script/figures paths were missing in this run.
- Partial — CRITICAL defence question, "Why trust Pearson as ranking preservation?" Chapter 4 prose is fixed at `thesis/chapter-04-studies.md:28`, but the analyzer is not: `scripts/analyze_eval_results.py:25-33` implements only `pearson(...)`, and `scripts/analyze_eval_results.py:93-112` prints only Pearson tables.
- Partial — CRITICAL defence question, "Did the live system actually use strong heuristic v2?" Services can use v2 at `backend/app/services/resume_analyzer.py:312-316` and `backend/app/services/job_matcher.py:197-200`, but only if `settings.HEURISTIC_VERSION == "v2"`. The default is still v1 at `backend/app/config.py:38`.
- Partial — HIGH defence question, "How were weights chosen?" Thesis answer is now author-selected at `thesis/chapter-04-studies.md:89`; code/comment and conclusion still contradict it at `backend/app/services/quality_signals_v2.py:523` and `thesis/chapter-05-conclusion.md:15`.
- Partial — HIGH defence question, "Why is BM25 IDF built from two documents?" Two-document IDF is gone (`backend/app/services/quality_signals_v2.py:210-231`), but the claimed eval-corpus override is not wired into `scripts/eval_scoring.py:46-50`.
- Resolved — HIGH defence question, "Is the ESCO subset really 800?" Chapter 4 now says "approximately one hundred entries" at `thesis/chapter-04-studies.md:67`; actual count in this run was 107 canonical entries.
- Unresolved — CRITICAL, thesis includes "pending value" as an abbreviation. `thesis/abbreviations.md:78` still says "| pending value | To Be Determined |".
- Unresolved — HIGH, acknowledgements raw placeholders. `thesis/acknowledgements.md:13-15` still contains two `[OPTIONAL]` blocks.
- Unresolved — HIGH, production-grade claim risky. `thesis/abstract.md:17` still says "production-grade web application"; `thesis/chapter-05-conclusion.md:29` still says "thesis demonstration mode rather than a sustainable commercial product."
- Unresolved — HIGH, appendix commands reference outputs that cannot exist yet. `thesis/appendices.md:198-203` still shows the eval/analyzer commands; `scripts/analyze_eval_results.py:63-65` still errors when `thesis/eval-results.json` is missing.

### New issues introduced by the fixes

- CRITICAL — Prose promises Spearman/Kendall, analyzer still cannot compute them. `thesis/chapter-04-studies.md:112-118` requires Pearson, Spearman, and Kendall, but `scripts/analyze_eval_results.py:25-33` only defines Pearson and `scripts/analyze_eval_results.py:93-112` only prints Pearson.
- CRITICAL — Eval harness will not run strong heuristic v2 by default. `scripts/eval_scoring.py:46-50` toggles only mode, while `backend/app/config.py:38` defaults `HEURISTIC_VERSION` to `"v1"`. The documented command at `scripts/eval_scoring.py:12-13` omits `HEURISTIC_VERSION=v2`.
- HIGH — Evaluation-corpus IDF claim is not implemented. `thesis/chapter-04-studies.md:63` says the "evaluation harness recomputes IDF over the full set of evaluation job descriptions", but `scripts/eval_scoring.py:77-94` never builds an IDF table and never passes `corpus_idf` into `build_resume_prepass_v2`.
- HIGH — Blended path was not broken, but it remains v1-only. `backend/app/services/resume_analyzer.py:333-384` and `backend/app/services/job_matcher.py:266-312` still use `build_resume_prepass` / v1 in blended mode. This preserves production behaviour, but conflicts with `thesis/chapter-04-studies.md:42`, which says "The same heuristic prepass output is used as the locked payload for both modes."
- HIGH — Admin endpoint response shape is richer than Appendix D documents. Schema returns `mode`, `heuristic_version`, `blended_weight_heuristic`, and `blended_weight_llm` at `backend/app/schemas/admin.py:55-70`; Appendix D documents only `{ "mode": ... }` at `thesis/appendices.md:191-192`.
- MEDIUM — No frontend admin toggle found. `rg "scoring-mode|scoringMode"` found backend only, while `thesis/chapter-04-studies.md:103` says "A frontend toggle is exposed in the existing `/admin` route."
- MEDIUM — BM25 baseline behaves reasonably for known ESCO terms but has a blunt OOV fallback. `_baseline_idf()` over ESCO docs is at `backend/app/services/quality_signals_v2.py:210-231`; `_bm25_score` gives OOV terms a default IDF at `backend/app/services/quality_signals_v2.py:251`. Smoke: baseline size 382 terms; `python/fastapi/postgresql/communication` IDF all `4.277`; OOV `zzzoov` still scored `2.515`, so non-ESCO repeated terms can still get non-trivial credit.
- MEDIUM — Section regex false-positive concern appears addressed for mid-sentence words. Patterns are line-anchored at `backend/app/services/quality_signals_v2.py:95-128`; smoke with "This profile shows ownership." and "I used these technologies in production." returned no sections. No regression found there.
- MEDIUM — Reported smoke scores did not reproduce on the inspected sample. For a Python/FastAPI backend resume with "Work History", detected sections and matched keywords passed, but current v2 returned overall `67` and match `88`, not the reported `74`/`96`. This may be input-dependent, but it is not a reproducible invariant from the current code path (`backend/app/services/quality_signals_v2.py:474-544`).

### Top 5 still-blocking items before supervisor handoff

1. CRITICAL — Create the evaluation artefacts and remove fake result scaffolding: `thesis/eval-dataset.json`, `thesis/eval-results.json`, `scripts/synthesise_resumes.py`, and `thesis/figures/` are still absent; `thesis/chapter-04-studies.md:116-163` is still all "*to be filled*".
2. CRITICAL — Make the eval harness actually test v2 and the promised metrics: set/document `HEURISTIC_VERSION=v2` (`backend/app/config.py:38`, `scripts/eval_scoring.py:12-13`), implement eval-corpus IDF (`backend/app/services/quality_signals_v2.py:392`, `scripts/eval_scoring.py:46-50`), and add Spearman/Kendall to `scripts/analyze_eval_results.py:25-112`.
3. HIGH — Remove remaining contradiction on weights: fix `backend/app/services/quality_signals_v2.py:523` and `thesis/chapter-05-conclusion.md:15` so nothing says recruiter-survey-informed.
4. HIGH — Strip submission-visible drafting residue: `thesis/abstract.md:1`, `thesis/acknowledgements.md:13-15`, `thesis/title-page.md:3`, `thesis/abbreviations.md:78`, and `thesis/bibliography.md:121`.
5. HIGH — Align admin/demo claims with implementation: either add the frontend toggle promised at `thesis/chapter-04-studies.md:103` or remove that claim; update Appendix D response shape at `thesis/appendices.md:191-192`; decide whether blended mode should stay v1 or use v2 consistently with `thesis/chapter-04-studies.md:42`.

## Round 3 — full validation (2026-05-07)

Validation scope: branch `thesis-review-local` at `df77082d`, against `main` + commits `348e6d68`, `b1a47f45`, `df77082d`.

### 1. Round-1 / round-2 fixes

All explicitly requested smoke checks passed in this workspace.

- BM25 duplicate-query-token dedup: `python3 /tmp/round3_smoke.py` printed `{'unique_query': 5.99902, 'duplicate_query': 5.99902, 'equal': True}`.
- Tokenizer punctuation collapse: same run printed `['fastapi', 'fastapi']`.
- ESCO false positives: same run printed `[]` for `go to market`, `lambda expressions`, `elastic load balancer`, `bash script`, `linear regression`, `sketch out`.
- Section detection: same run detected inline/capitalised `Summary`, `Skills`, `EXPERIENCE`, `EDUCATION`.
- Kendall tau-b: `HEURISTIC_VERSION=v2 python3 /tmp/round3_smoke2.py` printed `{'textbook_case': 1.0}` and `{'scipy_tau': np.float64(1.0), 'matches': True}`.
- Cache invalidation: `HEURISTIC_VERSION=v2 python3 /tmp/round3_smoke3.py` printed `{'clear_cache_called': True, 'call_count': 1}` on mode change and no call on same-mode POST.
- v2 confidence gap: same run printed `{'gap_note_same': None}`.
- Runtime short-circuit: `HEURISTIC_VERSION=v2 python3 /tmp/round3_smoke3.py` and `HEURISTIC_VERSION=v2 python3 - <<'PY' ... match_job ... PY` both succeeded with `complete_structured` patched to raise, proving Resume Analyzer and Job Match skip the LLM in heuristic mode.

### 2. Chapter 4.3 comparative-study runnability

- Severity: Critical
- Title: The Chapter 4.3 pipeline still cannot produce the cost and sensitivity sections the thesis promises
- Evidence: `scripts/eval_scoring.py:88-104` writes only `pair_id`, `mode`, `overall_score`, `score_breakdown`, `latency_ms`, `ok`; no token counts, no cost fields, no alternate-weight rerun. `scripts/analyze_eval_results.py:161-217` prints only Sections 4.3.1-4.3.3 and exits after latency. `python3 /tmp/round3_eval_pipeline.py` ran the synthetic pipeline end-to-end and its analyzer output stopped at `## 4.3.3 Latency (milliseconds)` with no cost table and no 4.3.5 sensitivity output.
- Impact: Section 4.3.4 and 4.3.5 are not just unfilled; they are not computable from the committed tooling. A careful supervisor can ask “where did the cost numbers and equal-weight robustness numbers come from?” and the student has no runnable answer.
- Suggested action: Either implement token/cost capture plus the equal-weight rerun in the harness/analyzer, or cut 4.3.4/4.3.5 from the thesis before sending the draft.

- Severity: Medium
- Title: The analyzer only gives Kendall for the overall score, not for the “full numerical results” wording around the per-sub-score breakdown
- Evidence: `thesis/chapter-04-studies.md:112` says “The full numerical results — including the per-sub-score breakdown — will be produced by the evaluation harness”. But `scripts/analyze_eval_results.py:175-189` prints a per-sub-score table with only `Pearson r` and `Spearman ρ` columns; no Kendall column exists there. The synthetic analyzer run in `python3 /tmp/round3_eval_pipeline.py` printed exactly that two-column sub-score table.
- Impact: The thesis currently overstates what the analyzer emits. Even if the student fills the tables by hand, the “produced by the harness” claim is not fully true.
- Suggested action: Either add Kendall to the sub-score table or narrow the prose so it only claims overall Kendall and per-sub-score Pearson/Spearman.

### 3. Chapter 4 / design-doc drift against code

- Severity: High
- Title: `heuristic-v2-design.md` still describes an obsolete BM25/IDF pipeline
- Evidence: `thesis/heuristic-v2-design.md:29-30` says IDF is built from a “bundled corpus of evaluation job descriptions (one-time, at module load)”; `thesis/heuristic-v2-design.md:48` says BM25 is normalised by a “maximum-achievable BM25”. The code at `backend/app/services/quality_signals_v2.py:281-301` builds the baseline IDF from bundled ESCO entries, `backend/app/services/quality_signals_v2.py:591-597` optionally overrides it with eval-corpus IDF, and `backend/app/services/quality_signals_v2.py:639-642` uses BM25 only as a soft additive boost inside `keywords_score = 0.7 * weighted + 0.3 * min(100, bm25 * 4)`.
- Impact: The design spec is no longer an engineering bridge to the implementation. A supervisor comparing the thesis package against code will see an old algorithm described as current.
- Suggested action: Rewrite the BM25/IDF subsection of the design doc to match the shipped code exactly, including the ESCO baseline path and the soft-boost formula.

- Severity: Medium
- Title: The design spec still documents resource sizes and files that the shipped branch does not contain
- Evidence: `thesis/heuristic-v2-design.md:135` says the action-verb list is “~250”; the shipped file is smaller (`python3 - <<'PY' ... print(sum(...)) ... PY` counted 183 non-comment entries). `thesis/heuristic-v2-design.md:171-173` lists `backend/app/data/stop_words.txt`, but no such file exists in the repository.
- Impact: This reads like a spec frozen before the implementation stabilised. It weakens confidence in the rest of the methodological documentation.
- Suggested action: Update the design doc to the exact shipped artifact set and exact shipped counts, or remove counts entirely where they are not analytically important.

### 4. Regressions introduced around the v2 path

- Severity: High
- Title: `HEURISTIC_VERSION=v2` breaks an existing backend test and misclassifies a strong resume as “too thin”
- Evidence: `HEURISTIC_VERSION=v2 pytest backend/tests` failed with `FAILED backend/tests/test_quality_services.py::test_resume_analyze_heuristic_fallback_emits_celebratory_action`, while plain `pytest backend/tests` passed `168 passed`. The failing assertion is at `backend/tests/test_quality_services.py:188-223`. Reproduction: `HEURISTIC_VERSION=v2 python3 - <<'PY' ... build_resume_prepass_v2(strong_resume, None) ... _heuristic_issues(...) ... PY` printed `{'word_count': 125}` and then `The resume may be too thin to communicate your scope clearly`. The trigger is `backend/app/services/resume_analyzer.py:124-135`, which hard-flags resumes with `word_count < 140`; under v2 that same “strong” resume still scores well elsewhere (`backend/app/services/quality_signals_v2.py:645-674`) but falls into the thin-resume issue path.
- Impact: In heuristic fallback or demo mode, a visibly strong resume can surface the wrong top action and lose the celebratory “Resume reads strong” state. This is both a user-facing regression and an objective branch-stability problem because the full backend suite is not green under v2.
- Suggested action: Recalibrate the v2 word-count/clarity heuristic against the actual v2 tokeniser and score scale, then make `backend/tests` pass under both `HEURISTIC_VERSION=v1` and `v2` before the draft is sent.

### 5. Parts previous passes missed

- Severity: High
- Title: The deployment story contradicts itself inside Chapter 2
- Evidence: `thesis/chapter-02-architecture.md:36` says the thesis deployment runs “on a single Railway service”. `thesis/chapter-02-architecture.md:115` says the frontend is served “from the same Railway service as the backend”. But `thesis/chapter-02-architecture.md:167-179` then describes “a single Railway project containing three services” and diagrams separate frontend and backend services.
- Impact: This is the kind of contradiction a supervisor catches in one read. It makes the architecture chapter look assembled from multiple drafts rather than settled.
- Suggested action: Choose one truthful deployment description and make N6, Section 2.4, and Section 2.7 say the same thing.

- Severity: High
- Title: The promised admin interface for scoring-mode switching still does not exist in the frontend
- Evidence: `thesis/chapter-02-architecture.md:37` requires runtime switching “through an administrative interface”. `thesis/chapter-04-studies.md:103` retreats to “the same operation is performed by issuing the POST request through any HTTP client”. Frontend search found no scoring-mode client or page: `rg -n "scoring-mode|getScoringMode|setScoringMode|AdminScoringMode" frontend/src -S` returned no matches, and `find frontend/src/pages/admin -maxdepth 2 -type f | sort` listed only `admin-dashboard-page.tsx`, `admin-layout.tsx`, `admin-runs-page.tsx`, and `admin-users-page.tsx`.
- Impact: The live-demo story is backend-only. A supervisor reading “administrative interface” and then opening `/admin` will not find the feature the thesis foregrounds.
- Suggested action: Either build the actual `/admin` scoring toggle before the draft goes out, or revise the thesis everywhere to say the mode is toggled via authenticated API call / Swagger, not via the admin UI.

- Severity: Medium
- Title: A sampled bibliography entry still points to the wrong paper title
- Evidence: `thesis/bibliography.md:45` cites [16] as “AI-driven resume analysis and enhancement using natural language models.” The fetched PDF at `https://aclanthology.org/2025.clicit-1.51.pdf` opens to title lines `AI-Driven Resume Analysis and Enhancement Using Semantic Modeling and Large Language Feedback Loops` (`turn2view0`, lines `L0-L3`). Other sampled URLs resolved cleanly, including [1], [6], [14], [18], [27], [30], [33].
- Impact: This is exactly the kind of citation sloppiness that makes a supervisor doubt the rest of the bibliography audit, especially because the bibliography header at `thesis/bibliography.md:3` claims the bootstrap notes “have been resolved”.
- Suggested action: Re-verify every non-foundational citation against the landing page or PDF title and fix exact metadata, not just the URL.

- Severity: Medium
- Title: Working-draft/process instructions are still visible in front matter
- Evidence: `thesis/acknowledgements.md:3` still contains “Personalise before submission — replace placeholders...”. `thesis/title-page.md:10` still says “confirm with supervisor”. `thesis/title-page.md:39` still says “Do not insert it unless asked”.
- Impact: These are high-visibility draft artefacts. They make the package look like a generated assembly workspace rather than a supervisor-ready thesis draft.
- Suggested action: Remove all process notes from front matter before the draft leaves the repository and keep them in a private checklist file instead.

- Severity: Medium
- Title: Several first-person implementation anecdotes are still hard to defend from the package itself
- Evidence: `thesis/chapter-03-tools.md:36` states that a “Vertex AI regional outage” produced the first hard failure visible to a real user. `thesis/chapter-01-introduction.md:47` and `thesis/chapter-01-introduction.md:62` make concrete sequencing and failure-history claims. The package contains no supporting logs, dates, screenshots, or commit references for those anecdotes.
- Impact: These passages invite viva-style follow-up questions that the student may answer from memory, but the thesis package itself does not substantiate them. They also read more like narrative colour than engineering evidence.
- Suggested action: Keep only autobiographical details that can be defended concretely in conversation, or trim them so they do not become unnecessary attack surfaces.

### 6. Production-readiness

No new code-level production-readiness defect was found beyond the missing admin UI above.

- Verified: `backend/app/main.py:128-147` includes the admin router.
- Verified: admin endpoints are rate-limited at `backend/app/routers/admin.py:31-34`.
- Verified: `get_current_admin` gates on `is_admin` at `backend/app/auth/security.py:166-174`, the user model has `is_admin` at `backend/app/models/user.py:20-21`, and the migration exists at `backend/alembic/versions/d1e2f3a4b5c6_add_is_admin_to_users.py:16-18`.
- Verified: `result_cache.clear_cache()` exists and empties the in-memory cache at `backend/app/services/result_cache.py:70-72`.
- Verified: `pnpm typecheck` passed in `frontend/`.
- Verified: importing `app.main` succeeded, though the local environment logged `VERTEX_PROJECT_ID is empty`, which is an environment/config state rather than a branch bug.

### Top 5 things the supervisor will catch first

1. Chapter 4 promises cost and sensitivity-analysis results that the committed eval tooling cannot generate at all.
2. Chapter 2 contradicts itself on deployment shape, and the touted scoring-mode admin interface is missing from the frontend.
3. The branch is not actually stable under `HEURISTIC_VERSION=v2`: the full backend suite fails and strong resumes can be flagged as “too thin”.
4. `heuristic-v2-design.md` still documents an older BM25/IDF algorithm than the code now ships.
5. The package still contains obvious draft artefacts: front-matter instructions and at least one bibliography entry whose title does not match the fetched paper.
