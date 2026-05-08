# Thesis Finalization Plan — Stage O

**STATUS**: Stage M complete on commit `438ba9e0`. v3_FINAL.docx exists with parity fixes (black academic headings, Roman/Arabic page numbering, Polish lang tags, bibliography hanging indents, book-style tables, larger figure labels, 83 pages). A Codex Stage N readiness audit was dispatched but its commit may or may not have landed — the Stage O agent below checks for it and runs an inline audit if Stage N didn't commit.

**Stage O is the final session.** It produces two `.docx` deliverables:
- `thesis/build/thesis_full_FINAL.docx` — all 5 chapters, for APD upload (deadline 22 May 2026)
- `thesis/build/thesis_first4_supervisor.docx` — chapters 1-4 only, for supervisor email (tomorrow)

After Stage O the user does a 5-minute visual `.docx` check, writes an English email, attaches the first-4 file, and sends.

---

## Timeline

| Stage | Work | Status | Commit |
|---|---|---|---|
| G | T1/T2/T3 mitigations + viva prep + arch PNGs | ✅ DONE | 163948df |
| H | Heuristic v3 ablation (controlled null) | ✅ DONE | 75bf7a85 |
| I-AUTO | Pandoc regen + python-docx layout | ✅ DONE | a78b6afa |
| H-fix | Live corpus-IDF override in v3 BM25 | ✅ DONE | 3e1775ce |
| J | Anti-AI prose polish (em-dash 138 → 6) | ✅ DONE | 9dd93560 |
| J-codex-pass | Codex final-review findings applied | ✅ DONE | 537c9064 |
| L | Comprehensive docx + figure visual overhaul | ✅ DONE | 5dabb6ae |
| M | Final visual parity pass against MSc reference | ✅ DONE | 438ba9e0 |
| N | Claim-vs-truth readiness audit | ⏳ dispatched (status unclear) | — |
| **O** | **Full finalization + dual deliverables** | **EXECUTE NOW** | pending |

---

## Stage O prompt — paste into NEW Opus chat

```
You are the FULL THESIS FINALIZATION agent. Stage M is the latest commit
(438ba9e0); a Codex Stage N readiness audit was dispatched but its result
may or may not have landed yet. This session brings the thesis from
"polished draft" to "APD-ready full final" with TWO deliverables:

  (1) thesis/build/thesis_full_FINAL.docx — all 5 chapters, ready for
      APD upload by 22 May 2026
  (2) thesis/build/thesis_first4_supervisor.docx — chapters 1-4 only,
      ready to email dr Błędowski tomorrow morning

Source of truth: the markdown in thesis/. The .docx is regenerated at
the end. The code in backend/ and frontend/ is read-only ground truth.

═══════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════
Author:        Egemen Goncu
Field:         BSc Electronic and Computer Engineering, WEFiM
Supervisor:    dr inż. Michał Błędowski
Repo:          /Users/goncuegemen/Documents/trials/ai-career-platform
Branch:        thesis-review-local (PUBLIC repo — NEVER push)
Latest commit: 438ba9e0 thesis(stageM): comprehensive docx + figure visual overhaul
Calibration:   ~/Downloads/W12N_259352_W12-AIR-MIN_W12-AIRP-AERA-OSMW3.pdf
               (supervisor's prior approved MSc — Szpakowski 2025)

═══════════════════════════════════════════════════════════════════
PRE-FLIGHT — CHECK STAGE N STATUS
═══════════════════════════════════════════════════════════════════
git log --oneline -25
Look for any commit with "stageN" in the message. If found, read its diff
to absorb whatever audit fixes Codex applied. If not found:
  - Codex Stage N either failed (auth/rate limit) or didn't commit
  - Run a leaner inline audit yourself in Phase 1 below

═══════════════════════════════════════════════════════════════════
PHASE 1 — INLINE READINESS AUDIT (only if Stage N didn't commit)
═══════════════════════════════════════════════════════════════════
Mechanical claim-vs-truth checks. Stream findings, fix as you go.

1.1 Numerical claims
   - Re-run python scripts/analyze_eval_results.py; verify Pearson r,
     Spearman ρ, Kendall τ values across abstract + chapter 4 + §4.3 etc.
   - Re-run scripts/verify_disjoint_pools.py; verify disjoint-pool numbers
   - cd backend && pytest --collect-only -q | tail -3 — verify any test
     count claims (e.g. "188/188") match
   - python -c "import json; print(len(json.load(open('backend/app/data/esco_skills.json'))))"
     and the same for esco_skills_expanded.json — verify ESCO entry counts
   - Count resumes / JDs / pairs in thesis/eval-dataset.json — verify "30 × 100"
   - Stage H ablation table values vs thesis/eval-results-v3-summary.md

1.2 Technical claims
   - FastAPI / SQLAlchemy / Alembic / PostgreSQL / React / TanStack /
     Vite / Tailwind versions vs backend/requirements.txt + frontend/package.json
   - LLM provider claims (Vertex AI Gemini 2.5 Flash) vs backend/app/services/llm_*
   - Auth claims vs backend/app/auth/*
   - BM25 k1, b, fuzzy threshold vs backend/app/services/quality_signals_v2.py
   - SBERT model name + threshold vs backend/app/services/quality_signals_v3.py

1.3 Cross-references
   - Every "Figure X.Y" reference resolves to thesis/figures/v2/ or thesis/figures/
   - Every "Table X.Y" reference resolves
   - Every "[N]" citation has a matching bibliography entry
   - Every bibliography entry is cited at least once (orphan check)

1.4 File path references
   grep -rEn "backend/[a-z_/]+\\.py|frontend/[a-z_./]+|scripts/[a-z_/]+\\.py" thesis/
   Verify each path exists.

1.5 Forbidden phrases
   grep -rn "tomorrow morning|Target length|TBD|Authors to restore|moderate-to-useful" thesis/
   Should be empty.

Fix every CRITICAL mismatch. Log Medium/Low to STAGE-F-FINDINGS.md.

═══════════════════════════════════════════════════════════════════
PHASE 2 — CHAPTER 5 PARITY CHECK
═══════════════════════════════════════════════════════════════════
Chapters 1-4 went through Stage J anti-AI polish + voice conversion.
Chapter 5 may not have received the same attention. Run quality checks
ONLY on chapter-05-conclusion.md:

  - Em-dash count → ≤ 3 (replace with comma/semicolon/break)
  - Throat-clearing strip ("It is important to note that...", etc.)
  - First-person scan: grep -nE '\b(I|my|we|our|me|us)\b' chapter-05-conclusion.md
    Convert to passive or "the author" nominal third-person, matching
    the style applied in chapters 1-4
  - Sentence-length variance: stddev/mean > 0.55
  - Synonym-cycling kill
  - Verify §5.3 future work paragraph reflects post-Stage-G + post-Stage-H findings:
    - Honest LLM-only baseline result (r=0.627)
    - Heuristic-v3 controlled-null (no improvement, residual gap is genuine LLM signal)
    - Real-applicant evaluation as the obvious next step

Apply fixes inline to chapter-05-conclusion.md.

═══════════════════════════════════════════════════════════════════
PHASE 3 — DUAL DELIVERABLE GENERATION
═══════════════════════════════════════════════════════════════════
Generate TWO .docx files from the same markdown source:

3.1 Full thesis (all 5 chapters) — for APD round
   pandoc \
     thesis/title-page.md thesis/abstract.md thesis/acknowledgements.md \
     thesis/abbreviations.md thesis/chapter-01-introduction.md \
     thesis/chapter-02-architecture.md thesis/chapter-03-tools.md \
     thesis/chapter-04-studies.md thesis/chapter-05-conclusion.md \
     thesis/bibliography.md thesis/appendices.md \
     --reference-doc=$HOME/Downloads/engineer_en.docx \
     --toc --toc-depth=2 \
     --resource-path=.:thesis:thesis/figures:thesis/figures/v2 \
     --from=markdown+raw_html+yaml_metadata_block+fenced_divs \
     --to=docx \
     --metadata title="An AI-Based System for Personalized Career Recommendation" \
     --metadata author="Egemen Goncu" --metadata lang=en \
     -o thesis/build/thesis_full_pandoc.docx

   python scripts/polish_docx_v3.py \
     --in  thesis/build/thesis_full_pandoc.docx \
     --out thesis/build/thesis_full_FINAL.docx

3.2 First-4-chapters thesis (no chapter 5) — for tomorrow's supervisor email
   Same pandoc invocation but OMIT thesis/chapter-05-conclusion.md.

   If thesis/abstract.md contains explicit references to "Chapter 5" or
   "the conclusion", create a temporary thesis/abstract_first4.md with
   those references softened to "future work" without specifying chapter,
   OR leave abstract intact if references are generic.

   Output: thesis/build/thesis_first4_pandoc.docx
   Then python scripts/polish_docx_v3.py
     --in thesis/build/thesis_first4_pandoc.docx
     --out thesis/build/thesis_first4_supervisor.docx

═══════════════════════════════════════════════════════════════════
PHASE 4 — VALIDATION
═══════════════════════════════════════════════════════════════════
For EACH of the two .docx files:

python - <<'PY'
from docx import Document
import sys
path = sys.argv[1]
d = Document(path)
print(f"=== {path} ===")
print(f"paragraphs: {len(d.paragraphs)}")
print(f"tables:     {len(d.tables)}")
print(f"sections:   {len(d.sections)}")
print(f"images:     {sum(1 for s in d.inline_shapes)}")
word_count = sum(len(p.text.split()) for p in d.paragraphs)
print(f"word count: {word_count}")
PY

Expected:
  thesis_full_FINAL.docx:
    paragraphs > 460 ; tables ≥ 6 ; sections ≥ 2 ; images ≥ 7 ; words 18k-22k
  thesis_first4_supervisor.docx:
    paragraphs > 380 ; tables ≥ 5 ; sections ≥ 2 ; images ≥ 6 ; words 14k-17k

Try LibreOffice headless render to PDF for visual check (skip if it
aborts on this machine):
  /usr/bin/soffice --headless --convert-to pdf --outdir thesis/build/ \
    thesis/build/thesis_full_FINAL.docx
  /usr/bin/soffice --headless --convert-to pdf --outdir thesis/build/ \
    thesis/build/thesis_first4_supervisor.docx

═══════════════════════════════════════════════════════════════════
PHASE 5 — COMMIT + REPORT
═══════════════════════════════════════════════════════════════════
git add thesis/ scripts/
git commit -m "thesis(stageO): full finalization — dual deliverables (full + first-4)"
DO NOT push.

Final message structure:

  # Stage O — Full Finalization Report

  ## Phase 1 inline audit
  [X numerical, Y technical, Z cross-ref, W file-path checks; mismatches fixed]

  ## Phase 2 chapter 5 parity
  [em-dash before/after, first-person count fixed, etc.]

  ## Phase 3 deliverables
  - thesis/build/thesis_full_FINAL.docx (path, size, word count)
  - thesis/build/thesis_first4_supervisor.docx (path, size, word count)

  ## Phase 4 validation
  [docx structural QA pass/fail per file; LibreOffice PDF result if applicable]

  ## Final go/no-go
  - Ready to email dr Błędowski (first-4): YES / NO
  - Ready for APD upload (full): YES / NO
  - User action remaining:
    - 5-min visual check on the docx (open + scroll + verify)
    - Email writing in user's own English (do NOT generate template)
    - Submission

═══════════════════════════════════════════════════════════════════
CONSTRAINTS
═══════════════════════════════════════════════════════════════════
- NEVER push thesis-review-local
- Do NOT modify backend/ or frontend/ application code
- Do NOT regenerate eval-dataset, eval-results, or v2 figures
- Do NOT generate supervisor email body — user writes English
- If you find a Critical issue requiring > 30-line rewrite, log + flag
  for user review rather than silent rewrite
- Speak Turkish in conversation; thesis content stays English; Streszczenie Polish

When ready, start with the pre-flight git log check, then proceed.
```

---

## Pre-send checklist (after Stage O completes)

Open `thesis/build/thesis_first4_supervisor.docx` in Word/Pages. Verify visually:

- [ ] Title page renders correctly (university + faculty + BACHELOR THESIS + title + author + supervisor + Wrocław 2026)
- [ ] TOC populated with all chapter + section headings
- [ ] Polish Streszczenie diacritics render (ą ę ł ó ś ż ź ć ń)
- [ ] Page numbers present (Roman in front matter, Arabic in body)
- [ ] All figures embedded inline with captions
- [ ] All tables formatted, not broken
- [ ] Bibliography numeric IEEE format with hanging indent
- [ ] No "TBD" / "tomorrow morning" / draft markers anywhere
- [ ] Save as `thesis_first4_supervisor_draft.docx` (drop _FINAL suffix)

Then write English email in own words, attach `.docx`, send to dr Błędowski.

For APD round (later, after supervisor feedback): use `thesis_full_FINAL.docx` as the base.

---

## What NOT to do

- ❌ Push `thesis-review-local` to GitHub. Repo is public.
- ❌ Modify backend/ or frontend/ application code. Code is ground truth.
- ❌ Run more automated polish rounds after Stage O. Diminishing returns hit hard rounds ago.
- ❌ Send to supervisor without the 5-minute visual check.
- ❌ Generate the supervisor email body via AI. User writes own English.
- ❌ Wait for ARS / Codex external review unless rate limit allows. Stage O is sufficient.
- ❌ Touch v3_FINAL.docx (Stage M output). Stage O produces NEW files (full + first-4).

---

## Cumulative cost (all stages combined)

| Stage | Cost |
|---|---|
| G | $0.04 |
| H | $0 (post-hoc identity, no LLM rerun) |
| I-AUTO / J / L / M | $0 |
| Codex pass + review rounds | ~$8-12 cumulative |
| **Stage O** | **$0** (no LLM API, just pandoc + python-docx) |

Total ARS rubric trajectory: 62 (Stage F) → ~83 (post-G) → ~85 (post-H/J) → ~88-92 projected (post-O with Stage N audit applied).
