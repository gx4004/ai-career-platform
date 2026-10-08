# Release readiness review — 2026-10-07

The local readiness pass found and fixed concrete defects. Production deployment approval remains open: no staging environment, live provider credentials, or container evidence was available. This report does not certify an absence of bugs.

## Scope and comparison

The frozen candidate is `f3164de36abebfa659663b9e812126579b70d249`. At the start, `chapter2` and `polish/wow-pass` pointed to that commit, so the requested merge-base comparison was empty. The screenshot's +163,355 / −37,750 matches the 1,074-file comparison against thesis-era `main` (`6a00a61`). That cumulative product body was the readiness scope.

Work is isolated in `codex/release-readiness`, based on the frozen candidate. The owner's subsequent `cv-studio/templates` changes are outside this review and have not been modified or verified by this pass.

The complete changed-file inventory is [release-readiness-2026-10-07-files.tsv](release-readiness-2026-10-07-files.tsv). It records coverage and its limits. **All 1,074 files were inventoried; every changed line was not manually reviewed.** Typechecking, full test suites, migration checks and browser journeys provide broad executable coverage; manual inspection focused on UI, auth/privacy, persistence, exports, discovery scoring, tool execution, uploads, and production serving. Documentation, historical thesis material and every asset were not individually audited.

## Defects corrected

| Area | Faulty behavior | Correction |
| --- | --- | --- |
| [Pending tool runs: useToolMutation](../../frontend/src/hooks/useToolMutation.ts) | A response arriving after logout could restore private results and workflow context | Capture the privacy generation and owner; reject stale responses before storage/cache writes and navigation |
| [CV autosave: persist](../../frontend/src/components/cv-studio/useCvDraft.ts) | GET-before-PATCH left a race where another tab's save could be overwritten | Send `expected_updated_at` for ordinary, queued and keepalive saves using the latest accepted revision |
| [CV owner changes: reloadNewer / openDocument](../../frontend/src/components/cv-studio/CvStudio.tsx) | Deferred saves, reloads and document creation could restore cache after the owner was cleared | Guard queued requests, unmount/pagehide flushes, reloads and cache writes by privacy generation |
| [Application PDF: build_materials](../../backend/app/services/autopilot/materials.py) | Frozen application CV export omitted the candidate header and could render the version name instead | Freeze the header in new snapshots via [application_content](../../backend/app/services/applications.py) and pass it to the PDF renderer |
| [Interview practice: handleSubmit](../../frontend/src/components/tooling/InterviewPracticeMode.tsx) | Answers and feedback remained in tab storage after logout/clear | Clear both practice prefixes and discard late feedback after privacy clearing |
| [Cover letter edits: useLetterAutosave](../../frontend/src/components/tooling/ResultParts.tsx) | Local edits and module-level export/flush caches survived privacy clearing | Clear storage and shared maps; prevent retired saves from restoring private data or deleting a newer session draft |
| [Application review: _flatten_sections](../../backend/app/services/campaign_reviewer.py) | Structured CV headings, companies, dates and bullets were absent from review grounding | Project the same visible fields used by rendering and omit hidden/stale bodies |
| [Discovery ranking: _scores](../../backend/app/services/discovery_recommendations.py) | Warm scores retained outdated location/remote preferences after ingestion updated metadata | Include mutable scoring fields in cache keys while preserving the query budget |

Regression tests cover these failures, including text extracted from an actual generated PDF and repeated CV save revisions. Existing immutable snapshots without a header are retained as legacy data; this change does not retroactively rewrite them.

## Verification

Verification used Node 22.23.3, pnpm 10.30.3, Python 3.12.14 and an isolated PostgreSQL 16 instance with synthetic data. Both dependency environments are isolated from the owner's active checkout.

- Backend: `python -m pytest -q` — **1,536 passed**, no skips; five PyMuPDF deprecation warnings.
- Backend lint: `python -m ruff check app` — passed.
- Frontend: final full Vitest suite — **2,363 passed** across 193 files, with `--maxWorkers=2 --testTimeout=120000 --hookTimeout=120000` because host contention exceeded the normal 20-second gallery ceiling. Node server tests — **32 passed**. Final `pnpm typecheck`, `pnpm build` and `pnpm test:production-smoke` — passed. The smoke test exercises production SSR/security headers, built assets, hydration and credentialed cross-origin API requests against a fixture backend.
- Production browser suite: `E2E_PRODUCTION=1 pnpm exec playwright test` — **164 passed** (7.0 minutes). Uses the built server and same-origin API proxy; AI output is deterministic fake-provider data, not a real provider exercise. The final two-line letter completion guard was added during this run; after rebuilding, the auth/ownership and browser-data-clearing specs passed **4 tests** on the final candidate. Layout markup was unchanged by that guard.
- Screenshots harness: 38 captures, no failed or skipped captures, against the production build.
- Visual matrix: 27 pages × six widths (320, 390, 768, 1024, 1440, 1920) = 162 base captures; hydration, document overflow and uncaught page errors checked. 60 result-section captures additionally exercised at 390 and 1440 widths; 222 total captures and no uncaught page errors. Screenshots are in `frontend/e2e/screenshots/release-matrix/` with a capture manifest.
- Fresh database migration: passed. Seeded upgrade from legacy revision `e4a7b2d918f3` to head `f3b8d1c6a9e2`: passed; user identity/token version and workspace identity/ownership/name survived, with intended email normalization.
- Production dependency audits: frontend reports no known vulnerabilities; backend reports no known vulnerabilities after documented exceptions. Patched [Seroval](https://github.com/advisories/GHSA-jp82-f5mq-hwhp) to 1.6.3, [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) to 1.2.2 and [urllib3](https://github.com/urllib3/urllib3/releases/tag/2.8.0) to 2.8.0. Existing unpatched ECDSA and python-jose findings are excluded because decoding is constrained to HS256 with a private symmetric secret; reassess these exceptions if algorithms or key sources change.

Manual screenshot inspection covered representative phone, tablet, laptop and wide desktop pages, forms, results, CV preview, application detail, empty/error states and legal pages. No obvious major layout defect was observed in those captures. This is Chromium evidence; Safari, Firefox, physical devices, every content length and every possible state are not certified.

Logs are retained locally under `/private/tmp/cw-readiness-*.log`. The final clean logs take precedence over earlier exploratory runs that exposed stale test expectations, shared-dependency setup failures, host-load timeouts or an interrupted worker process. Browser harness corrections preserve assertions while aligning API origins, PDF filenames, minified duration spelling, landing title and the session-read fixture with the current production contract.

## Remaining release requirements

1. Build and inspect the actual frontend/backend deployment containers on a Docker-capable host. Docker is unavailable here; no container verification was run.
2. Identify the hosting target and deploy this exact reviewed candidate to staging. Confirm TLS, secure cookies, API/CORS configuration, frontend asset delivery, health checks, secret injection and database connectivity using that host's configuration.
3. On staging, exercise a real AI provider, upload/parse a synthetic PDF and DOCX, export PDFs, and run signup/login/refresh/logout plus reset-email and OAuth flows if enabled. Local fake-provider success does not establish provider credentials, email delivery or callback correctness.
4. Confirm production database backup/restore and perform the additive migrations on a staging copy before promotion. Local synthetic legacy-upgrade preservation is useful evidence, not a production backup rehearsal.
5. Review phone Safari and desktop Firefox rendering and the new CV template work separately if that work is included in the merge.
6. Resolve the public-launch posture in the roadmap: deployment and production/legal setup were explicitly deferred there. Readiness work does not silently authorize promotion.

## Documentation drift

`docs/state.md` and the supplied root operating guide describe a runtime/container preflight and two guarded database URLs. At the frozen candidate, `scripts/local-release.sh` accepts only `--database-url` and explicitly excludes deployment images. Its whole-run success would not supply the documented container or authorization-concurrency evidence. This pass ran feasible checks individually and does not claim the canonical complete release gate passed.

`design.md` still describes earlier navy/Geist styling while executable UI uses the Sticker design with Bricolage/Onest. The review followed the current implementation and visual tests; it did not silently restore the historical design.
