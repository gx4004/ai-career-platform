# 0005. Evidence Profile is a persisted user-scoped entity with per-item trust state

**Status:** accepted
**Date:** 2026-07-10

## Context

Career Workbench has no durable structured career record. Resume upload produces
flat extracted text; the frontend carries that text in tab-scoped `sessionStorage`
(resume carry, per-tool drafts, workflow context with a four-hour TTL); every tool
request re-supplies `resume_text` inline; and the only persisted artifacts are
immutable `ToolRun` result snapshots. The fields named "evidence" in today's
schemas (`ResumeEvidence`, `evidence_used`, `resume_evidence`) are per-run derived
model output, not verified user facts.

R11's outcome — one inspectable, correctable source of verified career evidence
that all tools reuse, which downstream generation cannot silently promote
unverified claims from — needs a home. R12 CV Studio and R13 Application Campaigns
both build on that home, so its shape is a durable architectural commitment even
though R11 implementation is deferred behind the R1–R4 gate.

## Decision

The Evidence Profile is a persisted, server-side entity scoped to one
authenticated user: a collection of typed evidence items (experience, achievement,
skill, education, project, certification, preference, reusable interview
evidence). Every item carries provenance (`imported`, `inferred`, `user-entered`)
and a confirmation state (`unconfirmed`, `confirmed`, `rejected`). Confirmation is
reachable only through an explicit user action; automated paths may write items
only as `unconfirmed`. The profile ships as its own table(s) with an Alembic
migration, a matched Pydantic/Zod schema pair, membership in the account-deletion
cascade, and a self-serve machine-readable export. Tools consume the profile only
through the shared pipeline seam, where confirmed items become locked prompt facts
and unconfirmed items are at most explicit gaps or suggestions.

## Alternatives Considered

- **Extend the existing `sessionStorage` workflow carry** — rejected: tab-scoped,
  device-bound, TTL-expiring state cannot be a canonical record, cannot carry
  per-claim trust state across sessions, and cannot serve R12/R13.
- **Derive the profile from the latest `ToolRun` payloads** — rejected: run
  payloads are unverified model output and immutable snapshots; deriving a
  "verified" profile from them would promote unverified claims by construction and
  entangle profile correctness with result-history semantics.
- **Store one freeform structured-resume document per user** — rejected: a single
  document cannot express per-claim provenance, confirmation, selective rejection,
  or selective deletion, which are the properties the profile exists to provide.
- **Add profile columns to `User`** — rejected: evidence is a variable-length,
  typed collection with its own lifecycle; flattening it onto the identity row
  would conflate authentication data with sensitive career content.

## Consequences

- A new sensitive-data store exists and must join the deletion cascade, export
  surface, threat model, and backup/retention reasoning before implementation.
- The Pydantic/Zod mirror obligation grows by one schema family that R12/R13 will
  extend rather than replace.
- `run_tool_pipeline()` remains the single trust boundary: the profile version
  joins the cache key, and no tool router gains its own profile access path.
- Rollback posture: until the R1–R4 gate closes nothing ships; after
  implementation, the profile is additive — disabling injection returns tools to
  today's inline-input behavior without data loss.
