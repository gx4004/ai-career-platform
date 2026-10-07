# CV Studio templates: spec

Status: draft for owner review, 2026-10-07. Supersedes `.claude/handoff/cv-studio/draft-decisions-2026-10-06.md`.
Evidence: `.claude/handoff/cv-studio/` (research file, 25 references, 25 recreations, boards, prototype source).

## 1. Outcome

CV Studio produces CVs people would send. Today the PDF/DOCX come from ReportLab with five thin templates
(`cv_rendering.py`) and the preview is a hand-synced HTML renderer (`.cvp-*`). Neither looks like the CVs on
Enhancv, Novoresume or Reactive Resume. The outcome is 16 designed templates, a preview that is the real PDF, and
exports that parse.

## 2. Decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | Templates are HTML/CSS (Jinja) over the existing render model, printed to PDF by headless Chromium. ReportLab is removed for CV PDFs only (cover letter and interview PDFs untouched). | The 25 recreations were built this way; ReportLab cannot do colour blocks, sidebars, bands or the type quality. |
| D2 | 16 templates (section 4). "Classic" (from reference 22) is the default and the quality bar. | Owner picks, 2026-10-07. |
| D3 | The live preview is server-rendered page images of the unsaved draft, produced by the same Chromium print pass as the PDF, plus section rectangles for click-to-edit. No Paged.js. `.cvp-*` renderer is deleted. | Preview equals the PDF in every browser. One engine means identical pagination without a pagination library. |
| D4 | Single-column templates are labelled ATS-safe. Sidebar, rail and two-column templates are labelled "less ATS-safe" with a one-line warning. ATS mode offers only the ATS-safe set and forces Classic. | Research: multi-column layouts read out of order in extraction (reproduced with pdftotext). |
| D5 | Any template can run to several pages. "Fit to one page" is an option on every template, never forced. A nudge appears when a one-page-norm CV (under about 8 years) runs just over a page. | Recruiter evidence favours two pages for mid and senior; one page is a junior norm. |
| D6 | No photo upload. Templates with a photo slot show a monogram placeholder in the editor preview; the export collapses the slot. | Owner decision. No legal requirement for photos in DE/FR/NL. |
| D7 | Static OFL TTFs only, every family with Cyrillic and Latin Extended. | Variable fonts and unloaded weights become Type 3 PDF fonts, which ATS checkers penalise. Lato, Quicksand, Oswald, Fraunces, Newsreader and Bricolage lack Cyrillic or static files. |
| D8 | DOCX comes from the same render model with per-template fonts and accent, within Word's limits; sidebar templates degrade to one column and say so. A plain-text export is added. | Draft decisions 11 and 12, kept. |
| D9 | Template names are our own. Reference names (Enhancv, Novoresume, Typst...) never appear in product or code ids. | Section 9 risk. |

## 3. Architecture

### 3.1 Render pipeline

1. `build_render_model(document, style)` stays the single source (header, sections, entries). Add NFC normalisation of all text, and expose structured header fields (email, phone, location, links) alongside the flat contact list so templates can lay them out.
2. A template is a directory `backend/app/cv_templates/<id>/` with `template.html.j2`, `template.css`, and a manifest (id, name, description, `ats_safe`, `photo_slot`, `columns`, default typeface pair, accent role, which section kinds go to the sidebar).
3. `cv_render_html(model, template, style)` returns a self-contained HTML string (inlined CSS, `@font-face` pointing at bundled TTFs through `file://` or data URIs, `@page` size from style).
4. `cv_pdf(html)` prints it with a shared Chromium (one browser per worker, context per render, semaphore of 2, 15s timeout). If Chromium is unavailable: 503 with a plain sentence; `/health` reports it. No fallback renderer.
5. `validate_artifact` read-back stays and runs on the new PDFs; add checks: no Type 3 fonts, only the template's fonts embedded, extraction order matches section order for ATS-safe templates.

### 3.2 Preview

`POST /cv-documents/{id}/preview` takes the unsaved draft (document body, style, header), renders the PDF, rasterises each page with PyMuPDF (already a dependency) to WebP at about 110 dpi, and returns `{pages: [url or base64], page_count, sections: [{id, page, x, y, w, h}], warnings}`. Section rectangles come from `getBoundingClientRect` on `[data-section-id]` elements in the same Chromium page, so click-to-edit keeps working. Debounced about 400ms in the client; the previous images stay dimmed until the new ones arrive. Auth, 60/min rate limit, body size cap, and the render semaphore bound the cost. "View exact PDF" stays.

### 3.3 Multi-page sidebars

Sidebar content flows on page 1; later pages are main-column only (matches today's `cv-continued`). The sidebar background strip is a `position: fixed` element so it repeats on every printed page. Spike first (ticket T6); fall back to a full-width tinted band on page 1 only if repeat fixed elements misbehave.

*T6 spike finding (Chromium 149, 2026-10-07):* five variants printed on a three-page document. A root
(`html`) background and a `position: fixed` strip both repeat on every page but are clipped to the page
content box, so with non-zero `@page` margins the strip stops short of the top and bottom edges;
`@page { background }` is not painted at all. What works: `@page { margin: 0 }`, a `position: fixed;
top: 0; bottom: 0` strip (full bleed on every page), and the vertical page margins as padding on the
main column with `box-decoration-break: clone`, so each page fragment of the column gets its own top and
bottom inset. The manifest's top/bottom margins are those insets (the read-back's page-gap check uses
them). Sidebar content flows on page 1 only; later pages keep the main column in its column (the strip
stays, so the page stays balanced). DOM order is header, sidebar sections, then main sections: PDF
text is extracted page by page, so a main-first DOM splits a main section that runs onto page 2 around
the page-1 sidebar text; sidebar-first keeps every section's text whole (the read-back reports
`order_only`, which is what "less ATS-safe" means). The monogram follows the header in the DOM, so
its letters read after the contact lines and never inside a section.

### 3.4 Style model

- `CvStyle.template_id`: the 16 new ids. A tolerant validator maps the five legacy ids (`ats-essential` to `classic`, `professional-editorial` and `minimal-serif` to `executive`, `technical-portfolio` to `slate`, `modern-two-column` to `lagoon`) so stored JSON never fails to parse. A data migration rewrites stored rows; the validator covers anything in flight.
- `font_id` becomes an optional typeface override from six Cyrillic-capable families (Inter, Source Sans 3, IBM Plex Sans, Source Serif 4, Lora, EB Garamond). Null means the template's own pairing. Legacy ids map to the nearest family.
- `accent_color`: palette grows to about 10 print-safe colours. Templates derive tints and pick text colour by luminance, so any accent keeps white-on-fill text at or above 4.5:1.
- `density`: compact, normal, spacious, implemented as CSS custom property scales.
- New `page_size`: `a4` (default) or `letter`.
- New `fit_one_page`: boolean. The service tries scales from 1.0 down to a floor (body 9pt, margins 12mm) and reports "fits" or "runs to N pages".
- Catalog (`GET /style-catalog`) stays the single source for the picker; add `ats_safe`, `columns`, `photo_slot`, `group`.

### 3.5 Frontend

- Design tab: template gallery with thumbnails rendered server-side from the sample CV (cached by template and style), grouped "ATS-safe" and "More designs", with the less-safe warning on selection. Typeface, accent, density, page size and fit controls.
- *Built (2026-10-08, #471):* the template section is a gallery of kit `RadioGroup variant="tile"` tiles (picture, name,
  ATS badge, column count; ATS-safe group first; skeletons in the page's aspect ratio while loading; a text-only tile
  when a picture fails). The pictures come from `GET /cv-documents/template-thumbnails` (style fields as query
  parameters, no CV): page 1 of a built-in, fictional, English sample CV (`app/services/cv_sample.py`) in each template,
  in the person's accent, typeface, spacing and page size, labelled "Sample content". The sample is trimmed per layout
  (binary search over `TRIM_ORDER`) so it fills one page in every template without spilling. 320 px WebP, about 7 KB
  each, under 50 KB for all seven; in-process LRU (256) keyed by template, accent, typeface, spacing, page size and
  `SAMPLE_VERSION`, so repeat requests never touch Chromium; `private, max-age=3600`; 30/minute. Fetched only when the
  Design panel opens, ATS-safe group first, aborted on close. The live preview asks for page images sized to its own
  width times the pixel ratio (`?width=`, 320-1600 px), so phones get phone-sized pages.
- Remove `.cvp-*` CSS and `CvPaperPreview` HTML rendering; replace with the page-image viewer plus section overlays. Update the three template-id lists (Zod schema, catalog schema, fixtures).

## 4. Templates

Ids are final; reference column is for traceability only (never shown in product).

| Id | Name | From | Layout | ATS |
|----|------|------|--------|-----|
| `classic` | Classic | ref 22 | single column, centred header, pipe tagline, thin rules | safe, **default** |
| `scholar` | Scholar | ref 1 | single column, small-caps rules, serif | safe |
| `academic` | Academic | ref 6 | single column, dense serif, caps name | safe |
| `manuscript` | Manuscript | ref 23 | single column, cream, centred italic summary, Garamond | safe |
| `executive` | Executive | ref 25 | single column, light serif name, airy | safe |
| `frame` | Frame | ref 9 | boxed name card, dark contact band, icon-box headings | safe |
| `lagoon` | Lagoon | ref 24 | teal sidebar + monogram | less safe |
| `lilac` | Lilac | ref 15 | tinted sidebar, colour-block split | less safe |
| `meadow` | Meadow | ref 14 | narrow right sidebar | less safe |
| `rail` | Rail | ref 20 | black left rail with section labels | less safe |
| `almanac` | Almanac | ref 16 | header + two columns, slab headings, gold rules | less safe |
| `slate` | Slate | ref 5 | slate header band, two-column body, chips | less safe |
| `violet` | Violet | ref 4 | coloured name, underlined headings, monogram | less safe |
| `grotesk` | Grotesk | ref 3 | grotesque sans, right rail, chips | less safe |
| `panel` | Panel | ref 10 | main column + blue panel cards | less safe |
| `ledger` | Ledger | ref 21 | two columns, bold caps name, heavy rules | less safe |

The recreation files in `.claude/handoff/cv-studio/recreations/` and `prototype-src/` are the starting point for each template's HTML/CSS. Where a reference shows ratings (stars, dots, bars) we render chips or text: the data model has no skill levels.

## 5. Quality bar and tests

1. Fixtures: short (Maya), long (three jobs plus projects, 2 pages), accented (`Zoë Åström-Nuñez`), Cyrillic, and a long-name header. Every template renders every fixture.
2. Automated, per template and fixture: page count within expectation; embedded fonts are TrueType and only from the template's families (no Type 3, no fallback); every glyph covered; text extracts with Cyrillic intact; for ATS-safe templates the extraction order equals section order; no clipped or overflowing text; entries do not split across pages and headings keep with their entry.
3. Golden images: rasterised page 1 per template and fixture, with a tolerance, rebuilt only deliberately.
4. Preview parity: preview page 1 equals the PDF page 1 raster pixel for pixel (same engine).
5. Existing render, quality, style and e2e tests are updated to the new ids.
6. Human review: I look at every template with all fixtures. **Classic gets a dedicated perfection pass** (type scale, spacing, widows, contact line wrapping, long entries, two-page behaviour) before any other template is signed off.

## 6. Risks

- **Chromium cost on one Railway replica** (no memory limit is declared; a render is roughly 150 to 300 MB for the browser). Mitigation: shared browser, semaphore of 2, timeout, rate limits, 503 path, load test in T1.
- **Preview latency.** Target under 1.5s p95 for a one-page CV. If missed, render only the changed page range or lower dpi while typing.
- **Multi-page sidebars** (3.3).
- **Third-party likeness.** Reactive Resume (MIT) and Typst (open source) references are low risk. Enhancv, Novoresume and Kickresume are commercial. Templates 9, 10, 20, 21, 22, 23, 24, 25 are recreations rated 4/5 similar. Before launch each of those gets a distinctness pass (own name, palette and type tweaks, no reference text or imagery) so they read as inspired by common CV conventions, not as copies. Owner call on how far to go.
- **Variable fonts creeping back.** Test fails the build on Type 3.

## 7. Out of scope

Photo upload, skill ratings, LLM-generated design, template marketplace, i18n, cover letter and interview PDFs, DOCX fidelity for sidebar templates beyond one-column fallback.

## 8. Tickets

1. **T1 Render foundation**: Chromium PDF service, pool, 503, health; `classic` end to end (export, read-back, golden test); load test on the Railway-like container. Replaces ReportLab for CV PDFs.
   *T1 notes (as built):* the Chromium service runs Playwright's async API on a private loop thread so sync endpoints and
   `run_in_threadpool` share one browser; fonts are inlined as data URIs (HTML is about 2 MB); list bullets are a text `•`
   (Chromium draws native markers as vectors, invisible to extraction); PDF dates are patched to a fixed value so output is
   byte-stable; every legacy template id prints as `classic` until T2; `font_id` and accent do not affect the PDF until T4;
   `validate_artifact` reports `font_problems` (Type 3, unembedded, foreign family) in the evidence.
2. **T2 Catalog, style schema and migration**: 16 ids, legacy mapping, new fields, Zod, picker grouped by ATS status, ATS mode.
3. **T3 Preview pipeline**: preview endpoint, page images, section rectangles, client viewer, delete `.cvp-*`, update e2e.
4. **T4 Fonts and style controls**: bundled TTFs with Cyrillic, typeface override, accent derivation, density, page size, NFC, glyph coverage.
   *T4 notes (as built):* `cv_fonts.TYPEFACES` registers 15 static families (Roboto Slab is Apache 2.0 and Ubuntu is UFL; the
   rest OFL) built by `backend/scripts/build_cv_fonts.py` (variable upstreams are instanced to static files). The six overrides
   replace the body family, and the heading family only when it is the same category (serif/sans) as the override; each role
   keeps the (weight, style) pairs the template's manifest uses and the override supplies its nearest real face under that pair.
   Templates read `--font-body`, `--font-heading`, `--accent`, `--accent-tint` (12% accent in white), `--on-accent`, `--type`,
   `--gap` and the `--space-*` scale from `cv_templates/_base.css`. Legacy font ids map in `CvStyle` (lato, the old always-stored default, to null; pt-sans to
   source-sans-3, pt-serif to source-serif-4, crimson-text to lora, ibm-plex-mono to ibm-plex-sans). There is no fallback face:
   characters the chosen faces lack are reported (`unsupported_characters`) and print as spaces; a Greek name under Lora is reported,
   not drawn in another font. `tests/test_cv_fonts.py` audits every rendered (family, weight, style) against the loaded faces.
5. **T5 Classic perfection**: the review loop on the default across all fixtures.
6. **T6 Sidebar spike and column templates**: repeat-fixed sidebar, then `lagoon`, `lilac`, `meadow`, `rail`.
7. **T7 Safe batch**: `scholar`, `academic`, `manuscript`, `executive`, `frame`.
8. **T8 Remaining designs**: `almanac`, `slate`, `violet`, `grotesk`, `panel`, `ledger`.
9. **T9 Fit to one page and nudges.**
10. **T10 DOCX per template and plain-text export.**
11. **T11 Importer quality**: company, location and dates parsed cleanly; empty sections never exported.
12. **T12 Sign-off and docs**: full matrix review, ADR 0007, `CONTEXT.md` (five becomes sixteen templates), threat model (new endpoints), roadmap.

Order: T1, T2, T4, T3, T5, then T6 to T8 in parallel, then T9 to T12.

## 9. Scope cut (owner, 2026-10-07)

The first release ships 7 templates, not 16: three ATS-safe, `classic` (default), `scholar`, `frame`, and four colourful, eye-catching ones, `lagoon`, `rail`, `lilac`, `slate` (less ATS-safe, labelled). The other nine (`executive`, `academic`, `manuscript`, `meadow`, `almanac`, `violet`, `grotesk`, `panel`, `ledger`) stay in the schema as accepted ids, with recreations kept in `.claude/handoff/cv-studio/`, but are not built. T6 builds `lagoon`, `lilac` and `rail`, T7 builds `scholar` and `frame`, T8 builds `slate`.
