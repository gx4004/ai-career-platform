# Thesis Upgrade Plan — Stage G / H / I + Polish

End-to-end plan for getting the thesis from "supervisor draft ready" (Stage G complete, ARS 77.75/100, Minor revisions) to "defence-grade APD upload" (target ARS 88+, Accept territory). All work stays on `thesis-review-local`, never pushed (repo is public).

---

## Timeline

| Stage | Work | Duration | Cost | Chat |
|---|---|---|---|---|
| G | T1/T2/T3 mitigations + viva prep + arch PNGs | ~4-5 h | ~$0.05 | current (running) |
| H | Heuristic enhancement (SBERT + STAR + coherence + n-gram + ESCO expansion + ablation) | ~9 h | ~$3 | NEW chat |
| I | Final docx regen + Word polish checklist | ~1 h agent + 1-2 h manual | $0 | NEW chat |
| J (optional) | Anti-AI text polish | ~2 h | $0 | NEW chat — defer until post-supervisor-feedback |
| Send | Email + .docx attachment | 10 min | $0 | manual |

**Today's compressed timeline**: Stage G runs in current chat. After completion → new chat → Stage H. After Stage H → new chat → Stage I. After Stage I → user does Word polish (1-2 h). Email supervisor.

**Honest note**: G + H + I + polish in one day = ~16 hours of agent + manual work. If you've been at this since morning, consider sleeping after Stage G and doing Stage H tomorrow. Diminishing-returns risk on perfectionism is real.

---

## Current state (as of plan creation)

- Branch: `thesis-review-local`, ~6 commits, never pushed
- ARS Stage F final pass: **77.75 / 100, PROCEED**
- Bibliography: 25 IEEE numeric entries, all author-complete, all peer-reviewed
- Appendix C: 4 production screenshots (landing, resume input, resume result blended, job match result blended)
- `.docx` exists at `thesis/build/thesis_first4_draft.docx` (3.9 MB, ~16 656 words)
- Stage G running in this session: Phase 1 disjoint-pool dataset done, Phase 2 LLM-only baseline in progress, Phases 3-7 to follow

---

## Stage H — Heuristic Enhancement (paste into NEW chat after Stage G completes)

**Goal**: Lift heuristic-mode performance with SBERT semantic fallback, STAR detection, cross-axis coherence, n-gram phrase matching, and ESCO taxonomy expansion. Frame as a controlled ablation reportable in Chapter 4. Target: Pearson(LLM-only, heuristic-v3) substantially closer to Pearson(blended, LLM-only).

**Why valuable**: Engineering depth signal for defence committee. Strongest possible answer to "why use LLM if heuristic works?" — because we measured both, and here's the residual the LLM contributes.

### Prompt to paste (NEW CHAT)

```
You are the STAGE H — HEURISTIC ENHANCEMENT agent. Stage G (T1/T2/T3
mitigations + viva prep + architecture PNGs) is complete on
thesis-review-local. This session upgrades the classical-IR heuristic
from v2 to v3 with focused additions that close the gap to LLM-only mode
without replacing it.

GOAL: Improve Pearson(heuristic, LLM-only) over the post-Stage-G value
by adding SBERT semantic fallback, STAR-format detection, cross-axis
coherence checks, bigram/trigram matching, and expanded ESCO taxonomy.
Report as a controlled ablation study in a new Chapter 4 subsection.

═══════════════════════════════════════════════════════════════════
PRECONDITION — READ STAGE G STATE FIRST
═══════════════════════════════════════════════════════════════════
Read in this order before writing any code:
  thesis/STAGE-F-FINDINGS.md       (Stage G section — what changed, new numbers)
  thesis/eval-results.json         (3 tracks now: heuristic / llm_only / blended)
  thesis/eval-dataset.json         (disjoint-pool version)
  thesis/chapter-04-studies.md     (updated headline numbers + §4.1.4 + §4.3.X)
  backend/app/services/quality_signals_v2.py  (current heuristic implementation)
  backend/app/data/esco_skills.json            (current 107-entry taxonomy)
  scripts/eval_scoring.py
  scripts/analyze_eval_results.py

Extract these BASELINE numbers (record them; you'll compare deltas against them):
  - Pearson(blended, heuristic)        post-disjoint =  ?
  - Pearson(llm_only, heuristic)       post-disjoint =  ?  ← MAIN BASELINE
  - Pearson(blended, llm_only)         post-disjoint =  ?
  - Per-axis Pearson(LLM, heuristic) for keywords / impact / structure / clarity / completeness

═══════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════
Author:        Egemen Goncu
Repo:          /Users/goncuegemen/Documents/trials/ai-career-platform (PUBLIC — never push)
Branch:        thesis-review-local (continue, do not create new branch)
APD deadline:  22 May 2026
Defence:       13–17 July 2026

═══════════════════════════════════════════════════════════════════
SCOPE — NO TOUCH ZONES
═══════════════════════════════════════════════════════════════════
- Do NOT modify backend/app/services/quality_signals_v2.py — v2 stays
  for ablation comparison.
- Create a NEW file backend/app/services/quality_signals_v3.py.
- 168/168 backend tests must continue to pass under HEURISTIC_VERSION=v2.
- Add tests for v3 components in backend/tests/services/test_quality_signals_v3.py
  (≥ 30 unit tests).
- New eval-time deps go to backend/requirements-thesis-eval.txt — NOT
  backend/requirements.txt — to keep production deps clean.
- Do NOT touch frontend/.
- Do NOT push.
- Document every change in thesis/STAGE-F-FINDINGS.md "Stage H — heuristic
  enhancement" section.
- Commit per phase: "thesis(stageH): <step> <one-line>"

═══════════════════════════════════════════════════════════════════
STEP H.1 — SBERT SEMANTIC LAYER (KEYWORDS AXIS)
═══════════════════════════════════════════════════════════════════
Current cascade: exact → fuzzy (difflib 0.85) → ESCO canonical → OOV skip.
Add SBERT as the fourth fallback BEFORE OOV skip:
  exact → fuzzy → ESCO → SBERT(threshold=0.65) → OOV skip

Implementation:
- Use sentence-transformers all-MiniLM-L6-v2 (~80 MB, fast on CPU).
- Lazy load via module-level singleton:
    _SBERT = None
    def _get_sbert():
        global _SBERT
        if _SBERT is None:
            from sentence_transformers import SentenceTransformer
            _SBERT = SentenceTransformer('all-MiniLM-L6-v2')
        return _SBERT
- For each JD keyword that fails the first three fallbacks:
  encode the keyword + each resume token n-gram (1–3 grams),
  compute cosine similarity, accept match at max sim ≥ 0.65.
- Cache encodings per pair (resume + JD) to avoid recomputation across axes.
- Add `sentence-transformers>=2.7.0` and `torch>=2.0.0` to
  backend/requirements-thesis-eval.txt with a comment block:
  "thesis evaluation extras — NOT a production dependency".

ASK USER before pip install (the torch package is large, ~2 GB on disk).

═══════════════════════════════════════════════════════════════════
STEP H.2 — STAR-FORMAT DETECTION (IMPACT AXIS)
═══════════════════════════════════════════════════════════════════
Augment the impact axis with STAR coverage scoring per resume bullet.

Detection patterns (regex-based, no LLM):
  S (Situation): context phrase ("when scaling traffic to X",
                  "after migration to Y", "during the rewrite of Z")
  T (Task): explicit goal ("to reduce A", "in order to migrate",
            "for the launch of")
  A (Action): action verb at start of bullet (leverage existing
              action_verb_count detection)
  R (Result): quantified outcome ("by X%", "in Y days", "from A to B",
              "saving Z hours/week")

Each bullet scores 0–4 STAR points based on detected components. Aggregate
star_score = mean(bullet STAR points) × 25, normalized to [0, 100].
Add as new sub-axis weight inside impact (alongside action_verb and
quantification components).

═══════════════════════════════════════════════════════════════════
STEP H.3 — CROSS-AXIS COHERENCE CHECKS
═══════════════════════════════════════════════════════════════════
Three coherence flags, each subtracts from completeness axis if violated:

C1 — Years-claimed vs date-supported:
  If resume claims "X+ years" anywhere, parse experience-section dates
  and verify cumulative duration ≥ X years. Mismatch penalty: −10.

C2 — Skill-vs-experience consistency:
  Each skill in skills section must appear in experience or projects
  section. Orphan skill penalty: −2 per orphan.

C3 — Education vs years-claimed:
  Graduation year + reasonable progression bracket. If "10+ years"
  claimed but graduated within 3 years, penalty: −10.

Implement as a post-pass after the five axes are computed. All-stdlib
(use `re` for date parsing, `datetime` for arithmetic).

═══════════════════════════════════════════════════════════════════
STEP H.4 — BIGRAM / TRIGRAM PHRASE MATCHING
═══════════════════════════════════════════════════════════════════
Current matching is unigram. Add 2-gram and 3-gram awareness:
- Pre-tokenize each side into n-grams (n = 1, 2, 3).
- A multi-word JD term ("machine learning") matches if the bigram
  appears in resume n-gram set, OR if both tokens appear within a
  5-word window in resume.
- Update _bm25_score and _normalise_skills to handle n-grams.
- Phrase weight: 1.5× of unigram weight for bigrams, 2× for trigrams.

Mandatory unit tests:
  test_machine_learning_matches_machine_learning_in_resume
  test_data_engineering_matches_data_engineering_pipeline
  test_machine_vision_does_not_match_machine_learning  (negative case)

═══════════════════════════════════════════════════════════════════
STEP H.5 — ESCO TAXONOMY EXPANSION
═══════════════════════════════════════════════════════════════════
Current taxonomy: ~107 hand-curated entries.
Expand to ≥ 1000 entries.

Path A (preferred): static ESCO export
  Download ESCO v1.1.1 skills CSV from the official ESCO portal.
  Filter to engineering / IT / data / management parent categories.
  Map each to: canonical_label + alternative_labels[].
  Save as backend/app/data/esco_skills_expanded.json.

Path B (fallback if download blocked): hand-curated expansion
  Use the existing 107 as seeds; expand each with 5–10 ESCO-style
  variants from public sources (Wikipedia engineering skill lists,
  O*NET parallels). Slower but no network risk.

Update _load_esco to switch on ESCO_VARIANT env var:
  ESCO_VARIANT=expanded → load esco_skills_expanded.json
  default                → load esco_skills.json (back-compat for v2 tests)

Eval scripts set ESCO_VARIANT=expanded for v3 runs.

═══════════════════════════════════════════════════════════════════
STEP H.6 — EVAL RERUN: 4 TRACKS
═══════════════════════════════════════════════════════════════════
Modify scripts/eval_scoring.py to compute four score columns per pair:
  heuristic_v2  (current shipped — for ablation baseline)
  heuristic_v3  (Stage H, all enhancements active)
  llm_only      (from Stage G Phase 2)
  blended       (current shipped)

Run on the disjoint-pool dataset from Stage G. Compute all six pairwise
correlations with cluster-bootstrap CIs (resample by resume_id, 2000
iterations, seed = 42).

Save: thesis/eval-results-v3.json (new file, do not overwrite Stage G's
eval-results.json — both archived for reproducibility).

ASK USER before LLM-only rerun (cost ~$0.05).

═══════════════════════════════════════════════════════════════════
STEP H.7 — CHAPTER 4 ABLATION SECTION
═══════════════════════════════════════════════════════════════════
Add new subsection §4.3.X "Heuristic enhancement ablation" to
thesis/chapter-04-studies.md.

Table 4.X — Pearson correlation of heuristic variants with LLM-only
(disjoint-pool eval, 100 pairs, cluster-bootstrap 95% CI):

| Variant                                  | r vs LLM-only | Δ vs v2 |
|------------------------------------------|---------------|---------|
| heuristic-v2 (BM25 + ESCO + fuzzy)       | 0.XXX         | —       |
| + bigram / trigram (H.4)                 | 0.XXX         | +0.XX   |
| + ESCO expansion (H.5)                   | 0.XXX         | +0.XX   |
| + STAR detection (H.2)                   | 0.XXX         | +0.XX   |
| + cross-axis coherence (H.3)             | 0.XXX         | +0.XX   |
| + SBERT semantic fallback (H.1)          | 0.XXX         | +0.XX   |
| heuristic-v3 (full)                      | 0.XXX         | +0.XX   |

Narrative (~2 paragraphs):
- Identify the largest single contribution.
- Note plateau effects (SBERT threshold sensitivity).
- Frame the residual gap to LLM-only as the genuine LLM contribution.

Update §1.4 (purpose) and §5 (conclusions, when written) to reflect:
"classical IR enhanced with sentence-embedding semantic fallback recovers
~Y% of LLM-only performance on the analytical scoring task; the residual
~Z% is the genuine LLM contribution that the hybrid mode preserves."

═══════════════════════════════════════════════════════════════════
STEP H.8 — STAGE F-STYLE QUICK REVIEW ON H
═══════════════════════════════════════════════════════════════════
Run /ars-review --quick on the updated chapter 4 + new ablation section.
Cost: ~$2-3. ASK user before running.

Surface any new findings; fix Critical immediately, log Medium / Low to
STAGE-F-FINDINGS.md.

═══════════════════════════════════════════════════════════════════
FINAL REPORT
═══════════════════════════════════════════════════════════════════
Update thesis/STAGE-F-FINDINGS.md "Stage H — heuristic enhancement"
section with:
  - Per-variant ablation deltas (the Table 4.X numbers)
  - Total improvement: heuristic-v2 → heuristic-v3 (Δ on Pearson)
  - SBERT threshold sensitivity (mention if 0.65 was tuned)
  - Tests added: count
  - New deps: list (sentence-transformers, torch)
  - Projected ARS rubric: 77.75 → ?

Final commit:
  git add backend/app/services/quality_signals_v3.py \
          backend/tests/services/test_quality_signals_v3.py \
          backend/app/data/esco_skills_expanded.json \
          backend/requirements-thesis-eval.txt \
          scripts/ thesis/
  git commit -m "thesis(stageH): heuristic-v3 ablation — SBERT + STAR + coherence + n-gram + ESCO expansion"

DO NOT push.

When ready, start by reading the precondition files and reporting:
  - Stage G baseline numbers (Pearson values you extracted)
  - 5-line architectural plan for v3 (which axes get which enhancements)
  - Any blockers you anticipate (e.g., ESCO download access)

Then await user confirmation before writing v3 code.
```

---

## Stage I — Final docx + Word polish (paste into NEW chat after Stage H completes)

**Goal**: Regenerate the .docx with Stage G + H content and produce a Word manual-polish checklist for the user. Agent does pandoc regen; user does Word manual polish.

### Prompt to paste (NEW CHAT)

```
You are the FINAL DOCX REGENERATION + POLISH-CHECKLIST agent. Stages G
and H are complete on thesis-review-local. This session produces the
supervisor-ready .docx and the manual Word-polish checklist.

═══════════════════════════════════════════════════════════════════
PRECONDITION — READ STAGE G + H STATE
═══════════════════════════════════════════════════════════════════
Read in this order:
  thesis/STAGE-F-FINDINGS.md   (Stage G + Stage H sections)
  thesis/chapter-04-studies.md (updated with v3 ablation)
  thesis/abstract.md            (potentially updated headline numbers)
  thesis/figures/               (verify all PNGs present, including
                                 figure-2-1, 2-2, 2-3 from Stage G)
  thesis/build/                 (existing draft for comparison)

Extract:
  - Final headline numbers (post-G + H)
  - Total figure count
  - Total table count

═══════════════════════════════════════════════════════════════════
PHASE I.1 — REGENERATE DOCX
═══════════════════════════════════════════════════════════════════
Run the same pandoc invocation used in the original supervisor draft
(see thesis/build/ commit history for the exact command). Output:

  thesis/build/thesis_first4_draft_v2.docx

Use the same files in the same order:
  title-page.md, abstract.md, acknowledgements.md, abbreviations.md,
  chapter-01..04, bibliography.md, appendices.md
Exclude chapter-05-conclusion.md.

═══════════════════════════════════════════════════════════════════
PHASE I.2 — PROGRAMMATIC VALIDATION
═══════════════════════════════════════════════════════════════════
python - <<'PY'
from docx import Document
d = Document("thesis/build/thesis_first4_draft_v2.docx")
print(f"paragraphs: {len(d.paragraphs)}")
print(f"tables:     {len(d.tables)}")
print(f"sections:   {len(d.sections)}")
print(f"images:     {sum(1 for s in d.inline_shapes)}")
word_count = sum(len(p.text.split()) for p in d.paragraphs)
print(f"approx word count: {word_count}")
PY

Expected (post G + H):
  paragraphs: > 450
  tables:     ≥ 7  (added: ablation table, STAR sub-axis table)
  images:     ≥ 7  (4 screenshots + Figure 4.1 + 3 architecture PNGs)
  word count: 14k–18k

═══════════════════════════════════════════════════════════════════
PHASE I.3 — GENERATE WORD-POLISH CHECKLIST
═══════════════════════════════════════════════════════════════════
Create thesis/DOCX-POLISH-CHECKLIST.md with the following content
(verbatim, then user prints and follows in Word):

  # Word-Polish Checklist for thesis_first4_draft_v2.docx
  
  Open in Word (or Pages with Word compatibility). Apply each section
  in order. Save frequently.
  
  ## TITLE PAGE
  - [ ] University name centered, top of page, bold
  - [ ] Faculty name centered, below, slightly smaller
  - [ ] Horizontal rule between header and "BACHELOR THESIS" label
  - [ ] "BACHELOR THESIS" centered, capitalized, 18-22 pt
  - [ ] Title centered, bold, 16-20 pt
  - [ ] Author name + index number centered, 12-14 pt
  - [ ] Supervisor name centered with "Supervisor:" label, 12 pt
  - [ ] "WROCŁAW 2026" centered, bottom, 12 pt
  - [ ] NO page number on title page
  
  ## PAGE NUMBERS
  - [ ] Section break after title page
  - [ ] Front matter (abstract → TOC): lowercase Roman (i, ii, iii)
  - [ ] Section break before Chapter 1
  - [ ] Body (Chapter 1 onwards): Arabic, restart at 1
  
  ## HEADINGS
  - [ ] Chapter heading style: 16-20 pt, bold, centered or left
  - [ ] Each chapter starts on new page (Page Break Before)
  - [ ] Section headings (1.1, 1.2): 14 pt, bold, left
  - [ ] Subsection headings (1.1.1): 12-13 pt, bold or italic
  
  ## TOC
  - [ ] References → Update Field → Update Entire Table
  - [ ] All headings present with correct page numbers
  - [ ] Right-aligned numbers with leader dots
  - [ ] Hyperlinks active (Ctrl+Click should jump)
  
  ## FIGURES
  - [ ] All figures have captions: "Figure X.Y: <description>"
  - [ ] Use Insert → Caption for auto-numbering consistency
  - [ ] Figures centered horizontally
  - [ ] Optional: List of Figures page after TOC
  
  ## TABLES
  - [ ] All tables have captions: "Table X.Y: <description>"
  - [ ] Optional: List of Tables page after List of Figures
  
  ## BIBLIOGRAPHY
  - [ ] Heading: "Bibliography" or "References"
  - [ ] Numeric IEEE [1], [2] aligned with hanging indent
  - [ ] All entries present, no broken numbers
  
  ## POLISH CHARACTERS
  - [ ] Open Streszczenie section, select all
  - [ ] Right-click → Set Proofing Language → Polish
  - [ ] Verify ą ę ł ó ś ż ź ć ń render correctly
  - [ ] If using a non-Latin-Extended font, switch Streszczenie to
    Calibri / Times / Arial
  
  ## FINAL CHECKS
  - [ ] Open in both Word and Pages — cross-check rendering
  - [ ] Export to PDF, verify PDF identical
  - [ ] Print preview — no orphans, widows, or broken page breaks
  - [ ] Footer word count matches expectations
  - [ ] Save as: thesis_first4_supervisor_draft.docx (final)

═══════════════════════════════════════════════════════════════════
PHASE I.4 — COMMIT
═══════════════════════════════════════════════════════════════════
git add thesis/build/thesis_first4_draft_v2.docx \
        thesis/DOCX-POLISH-CHECKLIST.md \
        thesis/STAGE-F-FINDINGS.md
git commit -m "thesis: regenerate docx post-Stage-H + Word polish checklist"

DO NOT push.

═══════════════════════════════════════════════════════════════════
FINAL REPORT
═══════════════════════════════════════════════════════════════════
Send the user a single message containing:
  - .docx path (absolute)
  - Programmatic validation numbers (paragraphs / tables / images / words)
  - Headline numbers (post-G + H)
  - Path to DOCX-POLISH-CHECKLIST.md
  - One-liner: "Word polish is the user's task. After polish, save as
    thesis_first4_supervisor_draft.docx and email to dr Błędowski."

═══════════════════════════════════════════════════════════════════
CONSTRAINTS
═══════════════════════════════════════════════════════════════════
- Do NOT modify markdown source — Stage G + H content is final
- Do NOT generate supervisor email body (user writes in English)
- Do NOT attempt programmatic Word layout polish
- Speak Turkish in conversation
```

---

## Optional Stage J — Anti-AI text polish (DEFER until post-supervisor-feedback)

**Don't run before sending to supervisor.** Reasons:
- Supervisor's edits may revert anti-AI changes
- Save effort for the post-feedback round when content is locked

When you do run it (post-supervisor-feedback, pre-APD):

### Prompt to paste (NEW CHAT, only when ready)

```
You are the ANTI-AI TEXT POLISH agent. The thesis content is locked
(supervisor feedback applied). This session does targeted prose polish
to break AI-detector signature patterns while preserving the academic
3rd-person register and reference-thesis calibration.

DO NOT change content, claims, numbers, citations, or structure.
DO NOT re-introduce first-person.

═══════════════════════════════════════════════════════════════════
TARGETS PER CHAPTER (1-4)
═══════════════════════════════════════════════════════════════════

1. Em-dash audit. Limit to ≤ 3 per chapter. Replace with comma,
   semicolon, or sentence break. (AI overuses em-dashes.)

2. Throat-clearing strip:
   "It is important to note that...", "Furthermore", "Moreover",
   "Additionally", "In other words" → replace with direct claim.

3. Rule-of-three audit. Detect "X, Y, and Z" triplets ≥ 2 in same
   paragraph. Break at least one per chapter into a different shape
   (pair + single, or single + elaboration).

4. Sentence-length variance check.
   Per chapter: stddev(words_per_sentence) / mean must be > 0.55.
   If too uniform, insert 3+ short punchy sentences (5-10 words) per
   long paragraph.

5. Synonym-cycling kill. AI cycles "method / approach / technique /
   strategy" within a paragraph. Pick ONE term per concept; stick.

6. Add 2-3 natural register anchors per chapter:
   - Hedge with specifics: "in our setup", "for the configurations
     reported in Table X"
   - Causal language with accountability: "this happened because
     [specific reason], not because [generic reason]"
   - Honest scope: "this section reports X; Y is out of scope and is
     addressed in §Z"

7. Repetitive-transition kill. Audit "thus" / "therefore" / "hence"
   counts. Replace 50% with sentence-restart.

═══════════════════════════════════════════════════════════════════
QUALITY CHECK
═══════════════════════════════════════════════════════════════════
After pass, report per chapter:
  - Em-dash count (target ≤ 3)
  - Throat-clearing count (target 0)
  - Sentence-length stddev / mean (target > 0.55)
  - Synonym-cycle count (target 0)

Commit: "thesis(antiAI): chapter prose polish for register variation"

DO NOT push.
```

---

## Pre-send checklist (after Stage I, before emailing supervisor)

Print this and physically check off:

- [ ] `.docx` opens in Word/Pages without rendering errors
- [ ] Title page exact format matches WUST template (or supervisor's prior approved MSc)
- [ ] Polish Streszczenie diacritics render correctly (ą ę ł ó ś ż ź ć ń)
- [ ] TOC populated, all chapter + subsection headings present
- [ ] All 7+ figures embedded inline with captions
- [ ] All 7+ tables formatted, captions consistent
- [ ] Bibliography numeric IEEE format, hanging indent applied
- [ ] Page numbers: Roman for front matter, Arabic for body
- [ ] No "TBD", "tomorrow morning", "[Authors to restore]" markers anywhere
- [ ] PDF export tested (identical to .docx)
- [ ] File saved as `thesis_first4_supervisor_draft.docx`
- [ ] Email written in English (your own words, no AI template)
- [ ] `.docx` attached
- [ ] Supervisor's email address verified
- [ ] Send

---

## Cost estimate (cumulative)

| Stage | Agent time | API cost | Cumulative |
|---|---|---|---|
| G | 4-5 h | $0.05 | $0.05 |
| H | 9 h | $3.00 | $3.05 |
| I | 1 h | $0 | $3.05 |
| Word polish | 1-2 h manual | $0 | $3.05 |
| J (defer) | 2 h | $0 | $3.05 |

**Total**: ~$3.05 + ~16-18 hours of agent + manual work.

---

## What NOT to do

- ❌ Replace Gemini for generative tools (Cover Letter, Interview, Career Path, Portfolio). Generative requires LLM. Heuristic enhancement applies to analytical tools only (Resume, Job Match).
- ❌ Push `thesis-review-local` to GitHub. Repo is public. Defence after-the-fact is fine for private fork.
- ❌ Modify the existing supervisor draft `.docx` (the v1). Pandoc regen is faster than manual edits.
- ❌ Run anti-AI polish before supervisor feedback. Wasted effort.
- ❌ Send to supervisor without Word manual polish. Pandoc output looks unfinished without it.
- ❌ Try to programmatically polish Word layout (python-docx is unreliable for this).
- ❌ Add backend dependencies for thesis-eval-only purposes. Use `requirements-thesis-eval.txt`.

---

## Final orientation

After Stage H completes you will have the engineering depth signal the defence committee will appreciate: a measured ablation showing exactly how much of LLM-only performance classical IR + sentence embeddings recover, and what residual the LLM genuinely contributes. That answers "why use LLM?" cleanly and turns the comparative study from a lift-test into an ablation contribution.

After Stage I and Word polish you have a .docx that visually reads at the same density as the supervisor's prior approved MSc. That answers "is this a serious thesis?" before they read a single word.

After supervisor feedback returns, Stage J anti-AI polish + feedback application produces the APD-final version.

Send to supervisor when you have:
- Stage G: ✓
- Stage H: ✓
- Stage I + Word polish: ✓
- Pre-send checklist: ✓

Don't send before. Don't perfectionism-loop after.
