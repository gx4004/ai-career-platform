# 0003. Server-authoritative access decisions for R9 Monetization Experiment

**Status:** accepted
**Date:** 2026-07-10

## Context

The historical monetization path wraps an already-delivered result in
`AdGatedLock` and records `ad-unlocked:{runId}` in browser `sessionStorage`.
Removing its thesis-demo early return would therefore hide content only after the
complete payload had reached user-controlled code, and a user could manufacture the
unlock flag. A subscription provider's client state would have the same problem if
treated as the source of truth.

R9 has not selected ads, subscription, or hybrid because the activation baseline and
launch-market decision do not exist yet. Those candidates differ at the vendor edge,
but all require one durable boundary: the server decides which capability and payload
the current request may receive.

## Decision

All R9 access decisions are server-authoritative. The selected candidate may supply
verified facts to a backend adapter (for example, an idempotently processed payment
webhook or a server-verified ad completion), but only a backend access-policy seam may
issue an entitlement and shape a tool result or export. Restricted fields are withheld
at that boundary rather than shipped and visually obscured. Browser state renders the
decision and may cache non-authoritative presentation state; it never creates or
proves access.

## Alternatives Considered

- **Revive the historical client unlock** — rejected because the payload and unlock
  proof are both under user control, and the dormant ad hook can run before explicit
  consent.
- **Trust provider SDK state directly in the browser** — rejected because client SDK
  callbacks are not an authorization boundary and would couple core access semantics
  to whichever candidate is selected.
- **Build separate authorization paths for ads and subscriptions** — rejected because
  it would duplicate result/export enforcement and make a later candidate change
  expensive and error-prone.

## Consequences

- Result and export contracts need an explicit access decision and a backward-
  compatible representation for withheld content before any treatment can go live.
- Guest and authenticated eligibility may differ by the selected candidate, but both
  use the same backend policy boundary.
- Provider selection stays deferred without weakening the future enforcement model.
- The current client-only ad path is cleanup work, not reusable R9 infrastructure.
