# Career Workbench — Current State

**Snapshot date:** 2026-07-05
**Confidence:** code-informed, release environment not re-verified

## Current Posture

Career Workbench is feature-rich and appears closer to release hardening than initial
MVP construction. All six tools, guest runs, authentication, history/workspaces,
admin, exports, telemetry, and deployment configuration exist.

The repository is currently checked out on `thesis-review-local`. Recent commits are
thesis-focused, and the working tree already contains unrelated thesis and generated
asset changes. Agents must preserve those changes.

The next product release is not yet defined. The roadmap therefore treats release
positioning and baseline verification as the first gate rather than assuming a public
launch.

The long-term direction is now accepted: perfect the current product first, then
expand through an Evidence Profile, premium CV Studio, Application Campaigns, lawful
job discovery, an Application Approval Queue, and source-specific trusted
application automation. `docs/product-direction.md` owns this direction. These
features are not current implementation claims.

## Known Working Product Shape

- React/TanStack frontend and FastAPI backend.
- Six tools registered and guest-enabled.
- Shared backend tool pipeline.
- Cookie-based auth plus Google OAuth and password reset.
- Authenticated history, workspaces, favorites, labels, deletion, and revision chains.
- Guest results cached transiently in browser session state.
- Vertex AI generation and bounded job scraping fallback.
- Sentry, structured telemetry, rate limiting, and admin routes.
- Railway/Docker/Alembic deployment assets.
- Monetization UI exists historically, but the result gate is intended to remain
  bypassed in thesis/demo mode.

## Immediate Objective

**Status: proposed**

Turn the existing implementation into a measured, reproducible release candidate
without adding major product scope. Use that verified foundation for the CV Studio
and application-workflow expansion.

The first session should decide:

1. release mode (public MVP, private beta, or showcase);
2. target user/market;
3. whether thesis work and product launch work remain on separate branches;
4. whether monetization is excluded from the first release;
5. the environment that will serve as staging.

## Risks and Drift to Resolve

| Risk | Why it matters | Next action |
|---|---|---|
| Documentation drift | Old roadmap, frontend overhaul plan, `design.md`, and source code disagree in places. | Use canonical docs going forward; verify disputed behavior against code/UI. |
| Dirty thesis branch | Product edits can collide with active thesis/generated files. | Create product work from an agreed clean branch before implementation. |
| Release environment unverified | Railway topology, variables, migrations, domain, and deploy branch may have changed. | Run a deployment inventory and staging smoke test. |
| No fresh quality baseline | Historical test counts and bundle sizes are stale. | Record current frontend/backend/build/migration results. |
| Privacy retention unspecified | Resume text and generated output are sensitive. | Accept a retention/deletion decision before public launch. |
| Design contract conflict | `design.md` says light heroes while older context describes dark tool heroes. | Visually audit current product and accept one direction. |
| Browser storage contains workflow content | Useful for guests, but sensitive and easy to overlook. | Audit minimum data, expiry behavior, and clear-local-data UX. |
| In-process cache | Multi-instance behavior may be inconsistent. | Confirm production instance count; document or replace when needed. |
| Monetization intent unclear | Ad gate, CMP, subscriptions, and legal copy affect launch scope. | Decide launch posture before integration work. |

## Baseline Still Needed

- current frontend typecheck, tests, production build, and bundle report;
- current backend tests and migration-to-head from a clean database;
- smoke test of all six guest tools;
- authenticated workflow and ownership checks;
- export verification;
- mobile and keyboard walkthrough;
- staging health, telemetry, error scrubbing, OAuth, email, and rollback checks;
- current production/staging database revision and backup posture.

## Constraints Until Decided

- Do not re-enable the ad gate.
- Do not implement subscriptions, affiliates, i18n, native apps, or LLM streaming.
- Do not change tool order or persistence semantics.
- Do not merge thesis and product-release work accidentally.
- Do not treat historical “complete” checkboxes as present-day verification.
- Do not begin CV Studio, job discovery, or application automation before a clean
  product branch and quality baseline exist.
- Do not implement unauthorized scraping, CAPTCHA bypass, credential/session
  extraction, or unattended mass auto-apply.

## Handoff Format

At the end of a material work session, update this snapshot only if needed:

- **Objective:** one sentence
- **Changed:** durable reality, not file-by-file activity
- **Verified:** exact commands or manual checks
- **Blocked:** dependency plus owner/decision
- **Next:** one highest-value action

Remove obsolete state instead of appending a daily log.
