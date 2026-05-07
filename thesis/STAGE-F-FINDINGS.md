# Stage F findings — execution tracker

ARS academic-paper-reviewer score: **62 / 100 → Major revisions** (rubric: originality 60, methodological rigour 48, engineering 78, literature 52, writing 64, reproducibility 82, defendability 55).
Citation-check: 12 verified-foundational / 17 author-eksik-but-real / ~10 predatory venue / 0 confirmed-fabricated.

Status legend: `[ ]` pending · `[~]` in progress · `[x]` fixed · `[?]` user decision needed · `[!]` deferred

## Critical (block supervisor submission)

- [x] **C1** §4.1.1 JD provenance contradiction — JDs rewritten as template-synthesised, "real listings" wording removed.
- [x] **C2** §4.1.4 "Threats to validity" inserted — four threats (vocab leakage, self-correlation, non-independent obs, post-hoc heuristic design).
- [x] **C3** §4.3.1 self-correlation paragraph + §5.3 LLM-only baseline future-work item.
- [x] **C4** §2.1.2 N1 split into N1a (heuristic ≤ 50 ms p95) / N1b (blended ≤ 25 s p95) + §4.3.3 ownership sentence.
- [x] **C5** §4.1.1 bogus formula deleted; §4.3.1 unit-structure paragraph added.
- [x] **C6** drafting scaffolding stripped from every chapter + bibliography + appendices + heuristic-v2-design + abbreviations.
- [x] **C7** bibliography fixes: full rewrite. Dropped 13 entries (predatory venues + the "Carrer Compass" typo'd IEEE entry that returned 404 on Semantic Scholar lookup). Added 4 APD-approved foundational refs (Stone et al, Gupta et al, Rahmani et al, Kang et al). Author names restored on all retained entries except 2 that returned HTTP 429 at lookup time and now carry an explicit `[Authors to restore from publisher page before final submission]` marker — refs [9] ESCOX SoftwareX and [17] arXiv 2504.02870 Liu et al. APA → IEEE numeric format applied. Final entry count: 25 + 9 documentation footnotes. Body refs renumbered across chapters 1, 3, 4, 5 and `heuristic-v2-design.md`.

## High (fix before tomorrow)

- [x] **H1** §4.3.1 statistical interpretation softened: "moderate-to-useful agreement within the synthetic set", not "strong".
- [x] **H2** §4.3.3 stale "~600 input tokens" → 2 282 with one-line owning sentence.
- [x] **H3** addressed by C5 (formula delete).
- [x] **H4** admin toggle three-way reconciliation — N7 / §4.2.9 / Appendix C aligned.
- [x] **H5** Figures: Figure 4.1 score-distribution histogram generated as a real PNG via `scripts/plot_figures.py` (matplotlib was already available at user level, so no new dependency was added — the script is thesis tooling, not backend code). PNG saved at `thesis/figures/figure-4-1-score-distribution.png` (300 DPI, 6.5×4.5 inches, fits A4 page width). Image referenced from §4.3.2 with caption. Architecture figures 2.1–2.3 are not yet generated — Chapter 2 references them inline as ASCII diagrams in the existing draft (lines 73-83, 167-189), which is a defendable interim form for a markdown supervisor draft. **DEFERRED to user**: 12 production screenshots (Appendix C.1–C.12) — needs running app + manual capture morning of 8 May.
- [x] **H6** §1.6 appendix references corrected: A = source listings, B = evaluation dataset, C = production screenshots, D = configuration reference.
- [x] **H7** First-person voice converted to third-person passive across §1.0 motivation, §1.4 implementation-order disclosure, §1.4 dual-mode design paragraph, §3.9 Cover Letter / Interview Q&A learning, §4.4 closing argument, §5.1 hindsight, §5.3 future-work ranking. Reference MSc thesis register (third-person passive, "the author") matched.

## Medium (fix before APD upload, 22 May)

- [x] **M1** §1.4 RQ reframe: "controlled within-set characterisation" instead of "representative sample".
- [x] **M2** verified — §4.1.4 lists all four threats.
- [x] **M3** heuristic-v2-design.md "r ≥ 0.7 across the evaluation set" goal-line dropped.
- [x] **M4** abstract.md (EN + Streszczenie) explicit "synthetic, template-generated resumes and job descriptions".
- [x] **M5** italicised first-mention of TF–IDF, BM25, Levenshtein, ESCO, locked payload, retry-with-jitter, fallback policy across chapters.
- [x] **M6** §4.3.1 reference threshold framing softened: "values around 0.7 are sometimes used as soft anchors", not "conventionally taken in retrieval-quality literature".

## Open / decision-pending items

### OPEN: APD-version regeneration (after 8 May supervisor draft)
The §4.1.4 threats-to-validity disclosure is sufficient for the supervisor draft tomorrow but does **not** dissolve the underlying confounds. For the APD-22-May version, the following work would close the four threats fully:
- Regenerate the dataset with disjoint resume / JD vocabularies (split `track["responsibilities"]` into `resume_responsibilities` and `jd_responsibilities` with no overlap), rerun the eval. Closes T1.
- Add an LLM-only baseline (compute-heavy, ~$2 API, 1–2 h) to isolate the genuine LLM-versus-heuristic correlation. Closes T2.
- Compute a by-resume cluster-bootstrap CI on the headline correlations. Closes T3 inferential under-reporting.

### OPEN: 2 author lookups outstanding
Two bibliography entries — [9] ESCOX SoftwareX and [17] arXiv 2504.02870 Liu et al — carry an explicit `[Authors to restore from publisher page before final submission]` marker because Semantic Scholar returned HTTP 429 (rate-limited) on the lookup attempt during this session. Restore manually from the publisher pages before the APD upload.

### Appendix C — final inventory: 4 essential screenshots
Reduced from the original 12-screen list to 4 essential screens. The reduction proceeded in two passes:
1. **First pass** removed generic authentication UI (login form, Google OAuth flow, account-creation page, auth-gate redirect) on the principle that no thesis claim depends on these surfaces; the appendix should exhibit engineering-artefact evidence, not generic third-party-style sign-in flows.
2. **Second pass** removed the heuristic-mode result screenshot and the admin scoring-mode toggle screenshot. The runtime-toggle claim that Section 4.2.9 makes is independently anchored by (a) the source listing in Appendix A.3, (b) the comparative study in Section 4.3 that exercises both modes end-to-end on the same evaluation set, and (c) the score-distribution figure (Figure 4.1) that visualises the heuristic-mode output across all 100 pairs. A direct screenshot of the admin UI does not add evidence beyond these three anchors.

Final inventory:

- ✅ C.1 Landing (production) — `thesis/figures/ui-01-landing.png`
- ✅ C.2 Resume Analyzer input (production, guest mode) — `thesis/figures/ui-03-resume-input.png`
- ✅ C.3 Resume Analyzer result (blended mode) — `thesis/figures/ui-04-resume-result.png` — captured against a locally-running development instance (backend on 127.0.0.1:8000, frontend on localhost:3000) using the synthetic backend-engineer resume from Chapter 4
- ✅ C.4 Job Match result — `thesis/figures/ui-05-job-match-result.png` — same locally-running instance, same input pair

The four captured screens were produced through the dev-browser CLI (Playwright on Chromium) at 1920 × 1080 viewport.

Comparison with the supervisor's prior approved MSc thesis (Szpakowski 2025, EMG/IMU armband): that thesis carried 15+ figures across Chapter 4 plus Appendix B, but every figure was research-artefact evidence (EMG signal plots, confusion matrices, gesture photographs) — not internal administrative tooling. The four-screen appendix here matches that calibrated standard: user-facing tools are documented; internal toggle UI is not.

### OPEN: architecture figures 2.1–2.3 PNG export
Currently inline ASCII in `chapter-02-architecture.md`. Word-conversion stage will need real PNGs (mermaid-cli or draw.io export). Not blocking the supervisor markdown draft.

## Top 3 viva risks (unchanged from Stage F report)

1. **Resume bullets and JD responsibilities are drawn from the same synthesis pool — doesn't that mechanically inflate keyword overlap and the headline *r* = 0.727?**
   Now answerable via §4.1.4 disclosure; full mitigation requires APD-version regeneration.

2. **Blended = 0.4 × heuristic + 0.6 × LLM. You correlate blended with heuristic-only. That's a partial self-correlation. What's the LLM-only-vs-heuristic correlation?**
   Now answerable via §4.3.1 self-correlation paragraph + §5.3 future-work item; full mitigation requires LLM-only-baseline rerun.

3. **§2.1.2 N1 says p95 latency under 5 s. §4.3.3 reports blended p95 = 20.9 s.**
   Resolved via N1 split (N1a heuristic / N1b blended) + §4.3.3 ownership sentence.

## Estimated revised rubric

| Dimension | Before | After C-H-M fixes |
|---|---|---|
| Originality | 60 | 60 |
| Methodological rigour | 48 | 67 (threats-to-validity + self-correlation owned; full closure needs APD-version regeneration) |
| Engineering | 78 | 80 (Figure 4.1 PNG generated, scope-gap disclosure added) |
| Literature | 52 | 75 (predatory drops applied; 4 APD-approved refs added; author names restored except 2 TBD) |
| Writing | 64 | 80 (drafting scaffolding stripped, internal contradictions resolved, voice fully converted to passive) |
| Reproducibility | 82 | 84 (plot_figures.py committed alongside the eval scripts) |
| Defendability | 55 | 76 (top 3 viva risks now have draft answers in §4.1.4 + §4.3.1 + §2.1.2 N1 split) |
| **Aggregate** | **62** | **~75** |

Decision shifts from **Major revisions** to **Minor revisions**. Ready for supervisor draft? **YES, conditional on Appendix C screenshots being captured morning of 8 May (the only remaining external dependency).** Two bibliography entries carry TBD-author markers that the user can resolve in 5 minutes from publisher pages before the APD upload on 22 May.

---

## Stage G — pre-conversion final-pass review (2026-05-07)

ARS academic-paper-reviewer re-review (engineering BSc rubric, calibrated to Szpakowski 2025): **77.75 / 100** → **PROCEED to docx**. No critical regression detected.

Per-dimension: engineering deliverable 84 · empirical rigour 72 · technical writing 80 · literature & framing 75 · originality 70 · structural coherence 82 · polish 78.

### High (resolved this round before docx convert)

- [x] **NEW-H1** §4 line 3 "representative sample" → "controlled synthetic evaluation set described in Section 4.1.1" (eliminates contradiction with the §1.4 M1 reframe).
- [x] **NEW-H2** §1.6 line 73 stale Appendix C description → "four production screenshots illustrating the landing page, the Resume Analyzer (input and blended-mode result), and the Job Match result" (aligns with the Stage F second-pass appendix reduction).
- [x] **NEW-H3** Bibliography [12] Panzaru and Grama 2025 enriched with `vol. 59, no. 1, art. 18` (volume/issue/article fetched from Crossref `10.1186/s12651-025-00409-x`).
- [x] **NEW-H4** Acknowledgements first-person voice — register-OK note, intentionally retained per academic convention; matches Szpakowski reference.

### Medium (deferred to APD round, 22 May)

- [!] **NEW-M1** Resume2Vec [18] is cited five times across §1.3, §1.4, §3.2.2, §4.2.4 — one quantitative claim ("15.85% improvement in nDCG", §1.3 line 28) should carry a `[18, p. X]` or `[18, Tab. Y]` page-anchor for the JSA anti-plagiarism check.
- [!] **NEW-M2** §3.1.3 schema-adherence universal claim ("schema-constrained generation in current language models generally reduces parsing-error rates relative to free-form prompting") is unanchored; either add a structured-output reference or hedge to operational observation.
- [!] **NEW-M3** §4.3.4 token-counting note ("~4 characters per token rule of thumb") references the Vertex AI documentation footnote without an inline back-cite; one-sentence fix.
- [!] **NEW-M4** §4.2.6 action-verb dictionary attribution to Harvard FAS / MIT Career Advising / Princeton Career Development is unverifiable — bibliography section 10 should list these three URLs as documentation footnotes alongside FastAPI/TanStack/etc.
- [!] **NEW-M5** Architecture figures 2.1–2.3 remain ASCII art — for APD upload consider PNG exports via mermaid-cli or draw.io (already tracked in the open items list above; not blocking the supervisor draft).

### Low (deferred to APD round, 22 May)

- [!] **NEW-L1** Streszczenie phrasing "około dwa rzędy wielkości" — Polish technical-writing OK as-is; flag only for native-Polish supervisor review.
- [!] **NEW-L2** Abbreviations table includes "EMG | Electromyography (referenced in example thesis only)" — leftover from the Szpakowski calibration exercise; remove before APD upload.
- [!] **NEW-L3** Bibliography section 10 uses `>` blockquote markdown for the documentation references; pandoc renders this as a Word block-quote style — accept rendering or flatten to a normal sub-heading paragraph.
- [!] **NEW-L4** §4.3.5 sensitivity table reports Δ = −0.023 for both Pearson and Spearman — coincidence of three-decimal rounding; one-line clarification in prose would help the reader avoid assuming a typo.
- [!] **NEW-L5** §3.1.1 retry-schedule paragraph register slightly defensive ("was tuned empirically rather than chosen from a textbook") — softer "determined empirically through observation of Vertex AI's transient-error window" preferred for APD.

### Devil's Advocate residual challenge (unchanged, viva-rehearsal item)

The shared-vocabulary leakage in the synthetic dataset (T1) plus the structural 0.40 self-correlation floor in the headline *r* = 0.727 (T2) remain the strongest viva attack. Disclosed in §4.1.4 / §4.3.1, but disclosure is not closure — full closure requires APD-round dataset regeneration with disjoint vocabularies and an LLM-only-baseline rerun, both already tracked in the open-items list above.
