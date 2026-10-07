# 0011. CV PDFs and the live preview are HTML/CSS templates printed by headless Chromium

**Status:** accepted
**Date:** 2026-10-07

(Issue #471 asked for this as ADR 0007; that number already holds the campaigns
decision, so it takes the next free number. Decision log: D-132, superseding D-074.)

## Context

ADR 0006 made the CV a structured document that preview, DOCX and PDF render
deterministically from one source plus a declarative template. Its first build used
ReportLab for the PDF (five thin templates in `cv_rendering.py`) and a hand-synced
HTML renderer in the browser (`.cvp-*`) for the preview. Neither could produce the
colour blocks, sidebars, bands and type quality of the CVs people compare us with,
and the two renderers drifted, so the preview was not the PDF. The full product
contract is `docs/cv-templates-spec.md`.

## Decision

- A CV template is a directory `backend/app/cv_templates/<id>/` (`template.html.j2`,
  `template.css`, `manifest.json`) over the existing render model, sharing
  `_base.css`. The HTML is self-contained: CSS inlined, fonts as data URIs.
- One shared headless Chromium per worker (Playwright, private loop thread) prints
  it to PDF: a context per render, two render slots, a 15 s budget including the
  queue. Requests leave the page only for `data:`/`about:` URLs, so a render has no
  network. If Chromium cannot run the API answers 503 with a plain sentence and
  `/health` reports it; there is no fallback renderer. ReportLab stays only for
  cover letter and interview PDFs.
- The live preview is the same print pass: `POST /cv-documents/{id}/preview` renders
  the unsaved draft, rasterises each page to WebP with PyMuPDF and returns section
  rectangles for click-to-edit. The browser renders no CV HTML of its own.
- Fonts are static TTFs only (OFL, plus Apache 2.0 Roboto Slab and Ubuntu's UFL),
  with Cyrillic and Latin Extended. Every weight and style a template uses is a real
  file: variable or synthesised faces become Type 3 fonts, which ATS checkers
  penalise, and tests fail on any Type 3 or foreign family. A character no chosen
  face can draw is reported, never drawn in a fallback face.
- Each template is labelled: single-column templates are ATS-safe; sidebar, rail and
  two-column templates are "less ATS-safe" with a one-line warning. ATS mode offers
  only the safe set and forces Classic.
- Scope (owner, 2026-10-07): seven templates ship, `classic` (default), `scholar`,
  `frame` (ATS-safe) and `lagoon`, `rail`, `lilac`, `slate` (less safe). The other
  nine ids (`executive`, `academic`, `manuscript`, `meadow`, `almanac`, `violet`,
  `grotesk`, `panel`, `ledger`) are accepted by the schema and print as Classic until
  built; their recreations stay in `.claude/handoff/cv-studio/`.

## Alternatives Considered

- **Keep ReportLab and grow its templates** — rejected: no colour blocks, sidebars or
  repeated full-bleed strips without hand-placing every box, and the preview would
  still be a second renderer.
- **Paged.js (or another pagination library) in the browser for the preview** —
  rejected: a second engine paginates differently, so preview and PDF would disagree
  exactly where people look (page breaks); one engine gives identical pages for free.
- **WeasyPrint** — rejected: weaker modern CSS (grid, `color-mix`, `text-wrap`) than
  Chromium and the recreations were built and measured in Chromium.
- **Client-side PDF (browser print)** — rejected: output would vary by browser and
  fonts, and the server could not re-read the artifact it reports on.

## Consequences

- **Capacity (owner-visible risk).** Production is one Railway replica with no
  declared memory limit, and every worker now holds a browser. Measured locally on
  2026-10-07 (macOS, Chromium 149): a one-page preview takes about 0.18 s median
  (0.20 s worst of ten), a two-page one about 0.33 s, well inside the 1.5 s p95
  target; the browser's processes hold about 525 MB RSS after warm-up and peaked at
  about 780 MB with four concurrent callers queueing on the two slots (macOS RSS
  counts shared pages more than once, so the real figure is lower). The spec's
  estimate was 150 to 300 MB per render. The Docker-image load test planned in T1
  could not run locally (Docker is not installed on the development machine), so the numbers
  in the Railway container are still unmeasured; do that before any hosted launch
  and set a memory limit from it.
- Rate limits and caps bound the cost: preview 60/min, each artifact route 10/min,
  JSON body 1 MiB, two render slots, 15 s per render; fit to one page spends at most
  six renders inside the same budget.
- The PDF can be checked by the product itself: `validate_artifact` re-reads it,
  reports Type 3 or foreign fonts, and the quality check uses the same render.
- Templates are data, so adding one is a directory plus tests (fonts, read-back,
  contrast on every palette accent, golden page-one images); nothing else changes.
- DOCX (python-docx) follows the same model per template within Word's limits;
  sidebar templates degrade to one column and say so. A plain-text export exists.
- Chromium runs sandboxed as UID 10001; a host without user namespaces can set
  `CV_CHROMIUM_NO_SANDBOX=1`, which removes a defence layer and is documented in the
  threat model.
- Rollback: the templates and the preview are additive to the CV document model; a
  broken template can be removed by deleting its directory (its id then prints as
  Classic). Reverting to ReportLab would mean restoring the deleted renderer.
