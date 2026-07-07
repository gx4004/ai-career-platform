# 0001. Instrumentation backend for R6 Activation Instrumentation

**Status:** accepted
**Date:** 2026-07-07

## Context

R6's acceptance gate needs an event taxonomy from landing through signup and
revisit/export, funnel/failure dashboards, per-tool latency and model-cost
observability, and a two-week baseline comparable by access mode and tool
(`docs/roadmap.md` R6).

Two live precedents already exist in this repo:

- A first-party telemetry pipe already ships:
  `frontend/src/lib/telemetry/client.ts` → `POST /api/v1/telemetry/events`
  (`backend/app/routers/telemetry.py`) → `backend/app/services/observability.py`.
  It uses a strict allowlist schema (`extra="forbid"`), respects cookie consent,
  and never carries resume/JD/generated content. It logs to stdout only — nothing
  is currently persisted in a queryable store.
- PostHog was genuinely live in production from 2026-04-13 to 2026-04-28
  (commit `6c166191` through `690479bd`), with session recording enabled
  (`maskAllInputs: false`) and an unconsented `posthog.identify(user.id, { email,
  name })` call. It was fully removed for exactly this reason. `docs/threat-model.md`
  gap #6 and issue #82 still frame PostHog as inert leftover config awaiting an
  activate-or-remove decision (D-UNK-5) — they predate the discovery that it was
  actually live and collecting real data for two weeks, which is tracked
  separately as a pending user follow-up, not resolved by this ADR.

## Decision

Extend the existing first-party telemetry pipe for R6 rather than reactivate
PostHog or adopt a new third-party analytics vendor. Persist events durably in a
new Postgres table (see `docs/decisions.md` D-037) instead of stdout-only logs,
and build the funnel/failure view as a minimal page inside the existing
`/admin/*` panel (D-016) rather than a vendor dashboard.

## Alternatives Considered

- **Reactivate PostHog with proper consent-gating and masking this time** —
  rejected. The unresolved question of what the vendor's cloud project already
  captured during the April window makes reopening that integration premature;
  doing so now would also reopen the exact processor-disclosure question issue
  #82 is meant to close, not complicate further.
- **Use Sentry's existing performance tracing (`traces_sample_rate: 0.1`) for
  latency** — rejected. Sentry is scoped to error/performance monitoring only
  (D-018) and the existing legal copy describes it that way; repurposing it for
  product funnel analytics would need its own privacy reassessment and doesn't
  give per-tool cost data regardless.
- **Aggregate directly from Railway stdout logs** — rejected. Logs aren't
  queryable/joinable for funnel or cost analysis, Railway's retention window is
  short, and D-033 already deliberately declined building a general log
  export/persistence pipeline.

## Consequences

- Keeps the analytics vendor surface at zero, simplifying rather than
  complicating issue #82's processor inventory.
- Reuses an already privacy-vetted pipe, schema discipline, and consent gate
  instead of re-litigating them.
- Requires new, bounded work: a persistence table, a couple of backend-computed
  metric fields, and a small admin view — not a new subsystem.
- Leaves the historical PostHog cloud-project cleanup (whether captured data
  needs purging or disclosure) as a still-open, separate item independent of
  this decision.
