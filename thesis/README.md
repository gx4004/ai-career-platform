# Thesis writing folder

> Working folder for the diploma thesis at WEFiM, PWr. All chapters drafted here as Markdown; converted to Word at final-format pass once the supervisor confirms the WEFiM Word template.

## Files in this folder

| File | Purpose |
|------|---------|
| `title-page.md` | Final title-page layout with APD-confirmed metadata. |
| `abstract.md` | English abstract (v0 draft). Polish abstract is a placeholder for the second pass. |
| `chapter-01-introduction.md` | Introduction. Domain → AI recommendation systems → resume parsing → heuristic vs LLM → purpose → structure. |
| `chapter-02-architecture.md` | System architecture. Requirements, stack, backend, frontend, data, deployment. |
| `chapter-03-tools.md` | Tool implementations. Six tools, cross-cutting design, persistence and reliability. |
| `chapter-04-studies.md` | Comparative study (heuristic vs blended). Methodology, strong heuristic v2, results, discussion. |
| `chapter-05-conclusion.md` | Conclusions, limitations, future work. |
| `bibliography.md` | ~30 academic references organised by topic. |
| `heuristic-v2-design.md` | Engineering spec for the strong heuristic v2 — bridge between Chapter 4.2 and code. |

## Confirmed metadata (from APD application)

- Author: **Egemen Goncu**
- Supervisor: **dr inż. Michał Błędowski**
- Faculty: **Electronics, Photonics and Microsystems**
- Field of Study: **Electronic and Computer Engineering**
- Cycle: **First-cycle (engineering)**, full-time
- Title (EN): **An AI-Based System for Personalized Career Recommendation**
- Title (PL): System oparty na sztucznej inteligencji do spersonalizowanego doradztwa zawodowego
- Language: English
- Type: Engineering, Experimental
- Topic approved: 3 February 2026
- APD submission deadline: **22 May 2026**
- Defence window: 13–17 July 2026

## Outstanding work

| # | Item | Owner | When |
|---|------|-------|------|
| 1 | Confirm WEFiM Word template (or use friend's format) | User | Tomorrow morning |
| 2 | Implement `quality_signals_v2.py` per `heuristic-v2-design.md` | Together | Tomorrow |
| 3 | Implement `runtime_settings.py` + admin endpoints + frontend toggle | Together | Tomorrow |
| 4 | Build ESCO subset + action-verb list + evaluation dataset | Together | Tomorrow |
| 5 | Run `scripts/eval_scoring.py` and fill pending-value cells in Ch4.3 | Together | Following session |
| 6 | Convert all chapters to Word using the confirmed template | Together | Tomorrow evening |
| 7 | Polish abstract (EN) and translate to Polish | Together | Tomorrow evening |
| 8 | Export figures (architecture diagram, score-distribution plot, etc.) | Together | Tomorrow evening |
| 9 | Send draft to supervisor by EOD tomorrow | User | Tomorrow night |

## Word counts (drafts)

| Chapter | Target words | Drafted |
|---------|-------------|---------|
| Abstract | 250 | ~280 |
| Chapter 1 | 3000 | ~3400 |
| Chapter 2 | 5000 | ~3800 |
| Chapter 3 | 5500 | ~4100 |
| Chapter 4 | 5000 | ~4200 |
| Chapter 5 | 1500 | ~1100 |
| **Total** | ~20,250 | ~16,880 |

The drafts are slightly under target because the figures, tables, and page-breaking that Word will introduce add roughly 10–15% to the rendered word count. Final page count target: 50–70 pages including bibliography and appendices.

## Conversion to Word

When the WEFiM Word template arrives:

1. Open the template and save a copy as `thesis/AI-career-recommendation-egemen-goncu.docx`.
2. For each chapter, paste the markdown body into the corresponding template chapter heading. Word will preserve paragraph breaks; lists and tables need a manual styling pass.
3. Set up the bibliography using Word's *References → Manage Sources* if Zotero is not installed; otherwise import the `bibliography.md` entries via the Zotero Word plug-in.
4. Insert figures from `thesis/figures/` as they are exported.
5. Replace the `[N]` placeholders in the body text with Word's automatic citation markers.

## Notes for the diploma defence

- The administrative scoring-mode toggle (Chapter 4.2.9) is operable live; demonstrate switching from blended to heuristic during the answer to the methodology question.
- The numerical results in Chapter 4.3 are the strongest empirical contribution; have the score-distribution plot ready as a slide.
- The ESCO subset and the action-verb list are bundled with the application — show the JSON file briefly when discussing the heuristic.
- Anticipated jury question: *"Why not Sentence-BERT in the heuristic?"* Answer in Section 5.3: it is a deliberate scope decision to keep the heuristic strictly non-neural for a clean comparison; sentence-transformers are proposed as the next-tier addition in future work.
