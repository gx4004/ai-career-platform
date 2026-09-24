# Career Workbench — Roadmap

**Reset:** 2026-09-24 (supersedes the R0–R18 outcome roadmap).

The owner reset direction after a months-long pause. The product runs **locally
only** for now; deployment, production-evidence gates, launch-market, legal, and
monetization decisions are deferred until the product is finished. The R-series
issues were closed as superseded; their built code is carried forward.

## Direction

- For everyone looking for a job.
- Keep every built feature, but make each one real and visually consistent with
  the original (thesis) design language — dashboard, tool input heroes, and
  result pages are the reference.
- CV Studio is the flagship: import an existing CV, rebuild it into structured
  entries, customise it (templates, fonts, colours, density, section order), keep
  an ATS-safe mode, tailor it to a job, export PDF/DOCX.
- Job Discovery shows real listings from public employer job boards
  (Greenhouse, Lever, Ashby — public GET APIs only). The Approval Queue prepares
  an application and hands off to the employer's apply page.
- Autopilot is an experiment: local browser-assisted form filling that always
  stops before submit. It never submits on its own.
- AI provider is pluggable: `fake` for local demo, `anthropic` (Claude Haiku 4.5)
  with an API key, or Vertex when configured.

## Phases

Tracked on GitHub: umbrella #319.

| Phase | Issue | Outcome |
|---|---|---|
| 0 Consolidate | #320 | One integration branch, providers, held bugs fixed, screenshot harness |
| 1 Simplify foundations | #321 | Independent feature flags; simpler Evidence with Development folded in |
| 2 CV Studio | #322 | Structured editor, customisation, ATS mode, live preview, redesign |
| 3 Discovery + Queue | #323 | Real ingestion from public job boards; redesigned discovery and queue |
| 4 Campaigns + Evidence | #324 | Redesigned tracker and profile; grouped navigation |
| 5 Autopilot experiment | #325 | Browser-assisted fill — experimental, off by default, stops before submit |
| 6 Polish and finish | #326 | Consistency, e2e journeys, local release gate, final review |

## Autopilot experiment (#325)

Off by default: `AUTOPILOT_EXPERIMENT_ENABLED` (backend) and
`VITE_AUTOPILOT_EXPERIMENT_ENABLED` (frontend). On an approved queue card, "Fill
the form for me (experimental)" opens the listing's Greenhouse, Lever, or Ashby
form in a browser on the machine running the backend, so it only makes sense
locally. It fills name, email, phone, links, the tailored CV PDF, the cover
letter, and screening answers whose labels match, highlights the rest, and
stops. It never presses submit; the owner reviews the open window and submits.
Only https pages on those three hosts are opened. Tests use local fixture forms
only, never live employer sites.

## Deferred (not in this run)

Deployment and release evidence, payments/premium tier, launch market and legal
review, production analytics baselines, multilingual support.
