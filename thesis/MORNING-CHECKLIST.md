# Morning checklist — what's ready, what's open

> Drafted overnight (May 7, 2026). Read this first when you wake up.

---

## What's done

### Thesis drafts (all in `thesis/`)
- `title-page.md` — exact layout with APD-confirmed metadata
- `abstract.md` — English abstract draft (~280 words); Polish version is a placeholder
- `chapter-01-introduction.md` — full draft, ~3400 words
- `chapter-02-architecture.md` — full draft, ~3800 words
- `chapter-03-tools.md` — full draft, ~4100 words
- `chapter-04-studies.md` — full draft, ~4200 words; **pending-value cells** in Section 4.3 will be auto-filled by the eval harness
- `chapter-05-conclusion.md` — full draft (bonus, wasn't promised)
- `bibliography.md` — 30 references organised by topic, APA-style
- `heuristic-v2-design.md` — engineering spec for the strong heuristic
- `README.md` — folder index + outstanding work tracker

### Code (in `backend/` and `scripts/`)
- `backend/app/services/quality_signals_v2.py` — strong heuristic v2 implementation, stdlib only
- `backend/app/services/runtime_settings.py` — in-memory mode toggle
- `backend/app/data/esco_skills.json` — bootstrap ESCO subset (~100 entries; expand to ~800 if time)
- `backend/app/data/action_verbs.txt` — curated action-verb list (~250 entries)
- `scripts/eval_scoring.py` — evaluation harness (runs both modes per pair)
- `scripts/analyze_eval_results.py` — metrics computation, prints Chapter 4.3 tables

### What I did NOT touch (intentionally — review together)
- `backend/app/services/resume_analyzer.py` — still on v1 path
- `backend/app/services/job_matcher.py` — still on v1 path
- `backend/app/routers/admin.py` — no scoring-mode endpoint yet
- `backend/app/config.py` — no `SCORING_MODE` field yet
- `frontend/src/pages/admin/*` — no toggle UI yet

These are the integration points. They are small (one-line change in each service, ~30 lines of admin endpoint, one React page). I left them so we go through them together — the fail-mode of an autonomous code change is a broken production deploy.

---

## What you need to do this morning (in order)

### 1. Read Chapter 1 (~10 min)
Open `thesis/chapter-01-introduction.md`. Read it as if you were the supervisor. Tell me:
- Anything that doesn't match how you'd describe the project
- Anything that overstates the result (the abstract has a placeholder claim — replace it after eval runs)
- Any missing references you'd like me to find

### 2. Read Chapter 2 (~15 min)
Same exercise for `chapter-02-architecture.md`. Two things to verify in particular:
- The architecture diagram description matches the running code
- The technology rationale doesn't claim anything you'd be uncomfortable defending

### 3. Confirm the WEFiM Word format (~5 min)
Check whether your friend sent the format or whether the supervisor replied. Either way, paste me the result and we move to Word conversion.

### 4. Approve the heuristic v2 design (~10 min)
Read `thesis/heuristic-v2-design.md` and skim `backend/app/services/quality_signals_v2.py`. The defence-relevant claim is that every component is published-method-grounded:
- TF–IDF / BM25 → Salton & McGill 1983; Robertson & Zaragoza 2009
- ESCO normalisation → le Vrang et al. 2014
- Fuzzy matching → Levenshtein 1966 (via stdlib `difflib`)
- Section weights → recruiter-survey citation (need to nail the exact survey paper at format pass)
- Action verbs → Harvard FAS / MIT / Princeton career-services lists

If you spot anything you'd hesitate to defend, flag it.

### 5. Then we go in this order (together):
1. Wire `runtime_settings.get_scoring_mode()` into `resume_analyzer.py` and `job_matcher.py` — one-line change in each
2. Add `SCORING_MODE` field to `config.py`
3. Add `GET/POST /api/v1/admin/scoring-mode` endpoint
4. Add the React admin toggle page
5. Manual smoke test in dev: toggle from blended → heuristic, run Resume Analyzer, confirm no LLM call goes out (Sentry breadcrumb / log shows no Vertex request)
6. Build a small evaluation dataset (`thesis/eval-dataset.json`) — 30 resumes × 6 role tracks × ~3 JDs each. I can synthesise these from templates; you review for plausibility.
7. Run `python scripts/eval_scoring.py` (~10 min, ~$0.30 in LLM cost)
8. Run `python scripts/analyze_eval_results.py` and paste the output into Chapter 4.3
9. Convert all chapters to Word against the confirmed template
10. Polish abstract with real numbers from the eval run
11. Translate abstract to Polish
12. Send draft to supervisor

Estimated total: 6–8 hours. Submission to supervisor by end of day.

---

## Honest status of the drafts

The Markdown drafts are at *first-pass quality*. They are not at *submitted-to-supervisor quality* yet. Specifically:

- **Some claims are confidently stated but unverified.** The abstract claims "the majority of the discriminative power"; the actual eval run might tell a different story. Re-read the abstract and Section 4.3 with the post-run numbers in hand.
- **The "recruiter-survey-informed weights" citation in Section 4.2.7 is a placeholder.** I need a real survey paper to cite there. Add to the format-pass to-do.
- **A few references in `bibliography.md` are bootstrap entries with the title in italics-as-placeholder.** Verify each URL still resolves before final submission.
- **The Polish abstract is empty.** We translate after EN is locked.
- **Figures are described in the text but not exported.** We export PNGs for: architecture diagram (Ch2), tool-pipeline flow (Ch2), admin toggle screenshot (Ch4), score-distribution histogram (Ch4 — needs eval run first).
- **The "Appendix A — source listings" is referenced in Ch3 but not yet drafted.** Standard convention is to include the most important code files; we can pick which ones together.

---

## Risk register for the May 22 deadline

If we're at end of day tomorrow and the draft is in supervisor's hands, the residual risks for May 22 are:
- Supervisor returns substantive comments → revision cycle (1–2 days)
- WEFiM Word template has odd requirements → format pass (½–1 day)
- JSA anti-plagiarism flags something we wrote that overlaps a paper too closely → rewrite that section (½ day)
- The eval numbers come back weak (e.g., r < 0.5) → reframe Chapter 4 as a "characterisation" rather than a "comparable baseline" claim. Architectural support: Section 4.4 already includes the limitations framing.

---

## When you're ready, message me with one of these:

- "Read the chapters, here are my notes" + your notes
- "Looks good, let's start the integration step" → we begin Step 5 above
- "I want to change the framing of <chapter>" → we redraft together
- "<This claim> is wrong" → we fix it specifically

I'll be here.
