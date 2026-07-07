# Career Workbench — Decision Log

**Status:** append-only canonical record
**Last reviewed:** 2026-07-05

Use this log for durable product or architecture choices. New entries get the next
ID. To reverse a decision, add a new entry and mark the old one `superseded`; do not
erase history.

| ID | Status | Decision | Rationale |
|---|---|---|---|
| D-001 | accepted | Build one connected workspace around six tools, not six standalone generators. | Context reuse and workflow continuity are the product advantage. |
| D-002 | accepted | Use React 19 with TanStack Start/Router for the frontend and FastAPI for the API. | Matches the existing implementation and team familiarity. |
| D-003 | accepted | Keep tool metadata centralized in `frontend/src/lib/tools/registry.ts`. | Prevents ordering, routing, and capability drift. |
| D-004 | accepted | Use a shared execution pipeline for all six tool endpoints. | Centralizes sanitization, caching, persistence, response shape, and observability. |
| D-005 | accepted | Blend deterministic and model scoring only for Resume Analyzer and Job Match. | Generative tools do not have an honest universal score. |
| D-006 | accepted | Use Vertex AI Gemini as the V1 generation provider. | Reduces abstraction and operational scope before product validation. |
| D-007 | accepted | Resume and Job Match may fall back to deterministic analysis; generative tools fail explicitly. | A fake generated artifact is worse than a clear failure. |
| D-008 | accepted | Keep access and refresh tokens in HttpOnly cookies. | Reduces token exposure to browser script. |
| D-009 | accepted | Allow guest tool runs but persist only authenticated runs. | Delivers value before signup without creating anonymous server data. |
| D-010 | accepted | Make `ToolRun` revisions append-only via `parent_run_id`. | Preserves history, comparison, and auditability. |
| D-011 | accepted | Keep workflow context tab-scoped in `sessionStorage`. | Simple continuity without cross-tab synchronization complexity. |
| D-012 | accepted | Use BeautifulSoup first and Playwright as a bounded fallback for job import. | Provides a fast common path and graceful support for rendered sites. |
| D-013 | accepted | Use an in-process result cache for the initial single-instance posture. | Avoids infrastructure before scale requires distributed caching. |
| D-014 | accepted | Ship English-only for V1. | Keeps product and QA scope realistic. |
| D-015 | accepted | Use a responsive web product; do not build native mobile apps in V1. | One surface covers the validation stage. |
| D-016 | accepted | Keep the admin experience inside the main frontend under `/admin/*`. | Avoids a second frontend and duplicated auth/session logic. |
| D-017 | accepted | Use Railway as the intended initial hosting platform. | Existing deployment configuration and integrated PostgreSQL reduce ops work. |
| D-018 | accepted | Keep Sentry payloads scrubbed and disable default PII collection. | Resume and application content are sensitive. |
| D-019 | accepted | Keep monetization gates disabled during thesis/demo mode. | Unrestricted evaluation is more important than revenue validation in this mode. |
| D-020 | proposed | Treat public monetization as a post-activation experiment, not a launch blocker. | Requires confirmation of the next release goal and business model. |
| D-021 | accepted | Perfect and freshly verify the existing product before major feature expansion. | New scope should build on reliable, accessible, privacy-safe, and visually verified workflows. |
| D-022 | accepted | Make a premium, browser-editable, ATS-aware CV Studio the flagship expansion. | CV creation, scoring, job-specific tailoring, versioning, and DOCX/PDF export deepen the existing Resume and Job Match foundation. |
| D-023 | accepted | Introduce a user-confirmed Evidence Profile as the factual source for generated application materials. | Shared provenance improves continuity and prevents fabricated employers, skills, metrics, credentials, and achievements. |
| D-024 | accepted | Evolve workspaces into Application Campaigns and pursue lawful, source-aware job discovery. | A role-specific campaign connects matching, materials, interview prep, tracking, tasks, and follow-up without becoming a generic CRM. |
| D-025 | accepted | Treat application automation as progressive trust levels: Copilot, Approval Queue, then source-specific Trusted Autopilot. | Automation is valuable, but ambiguous answers and unsupported sources require human approval and legal/terms controls. |
| D-026 | accepted | Prohibit unauthorized scraping, CAPTCHA/access-control circumvention, credential or session extraction, and unattended mass auto-apply. | These behaviors create platform, privacy, account, quality, and trust risks inconsistent with the product promise. |
| D-027 | accepted | Use `chapter2` as the long-lived experimentation branch while `main` and `deploy` remain stable promotion branches. | Product hardening and expansion need room to iterate without destabilizing the release and Railway deployment branches. |
| D-028 | accepted | Treat the eventual first release as a free private beta, while deferring launch operations and acquisition planning until engineering quality gates pass. | Engineering excellence is the immediate objective; billing and growth work would distract from measuring and improving the existing product. |
| D-029 | accepted | Use ephemeral distributed abuse counters with independent HMAC-pseudonymized account and source-IP dimensions; prefer bounded progressive login delay over account lockout, and add route-specific CAPTCHA only after the documented sustained-limit or provider-cost trigger. | Multi-instance enforcement must not store raw identifiers, let account rotation erase source limits, or create an attacker-controlled account-lockout denial of service. |
| D-030 | accepted | Preserve SameSite=Lax and reject logout requests whose explicit Origin is outside the configured frontend/CORS allowlist, while allowing non-browser clients with no Origin. | This prevents forced cross-site logout with a narrow compatibility-tested control instead of introducing a broader CSRF token protocol. |
| D-031 | accepted | Accept indefinite retention of primary account/content data while an account exists; deletion (single run or full account) is user-initiated and immediate with no grace period; no automatic dormant-account purge in V1. | User-initiated erasure already satisfies GDPR/RODO right-to-erasure; an automatic dormant-account purge needs a cron job and a user-notification flow disproportionate to thesis-demo/solo-dev scale. Resolves D-UNK-6 (primary data) and D-NEXT-3. |
| D-032 | accepted | Accept no database backups during the thesis-demo phase. Before public beta launch (R5), enable Railway's managed automated PostgreSQL backup add-on at its platform-default retention window, and rehearse a restore procedure as part of the R5 staging rehearsal in `docs/launch-checklist.md`. | Demo data is reproducible and non-critical, so backup infrastructure is deferred until real user data exists, consistent with D-021 (perfect the current product first) and R5's migration/rollback acceptance gate. Resolves D-UNK-7. |
| D-033 | accepted | Accept Railway's platform-managed log retention for application logs; no custom log persistence, export pipeline, or extended retention in V1. Logs must remain free of resume/JD/generated content and other sensitive fields per the existing scrubbing controls. | Structured, privacy-safe logs already avoid sensitive content (#78); a bespoke log-retention/export system is unwarranted operational overhead before user-scale evidence exists, consistent with the R10 deferred-scaling triggers. Resolves the logs portion of D-UNK-6. |
| D-034 | accepted | When Sentry is activated (`SENTRY_DSN` set), accept Sentry's platform-managed event retention as sufficient; no custom retention override or export is required. Sentry stays inactive by default. | Sentry SDKs already scrub PII/content (D-018); event retention duration is a processor-side setting that does not need product-level enforcement at this scale. Resolves the Sentry-events portion of D-UNK-6. |
| D-035 | accepted | Accept the single structured log line already emitted by `delete_all_user_data()` as the minimal deletion-audit record; no persisted audit-log table is required in V1. | Cascading account deletion is already transactional and logged; a dedicated audit table is speculative infrastructure without a demonstrated compliance requirement. Revisit only if legal/processor reconciliation (#82) demands durable audit evidence. Resolves the audit-records portion of D-UNK-6. |

## Decisions Needed

These are deliberately not accepted yet:

- D-NEXT-2: launch market and primary segment;
- D-NEXT-6: measurable launch and activation targets.

When one is decided, replace its placeholder with the next numbered entry and update
the affected spec, architecture, state, and roadmap sections.
