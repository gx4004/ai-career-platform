# 0004. Result cache remains fail-open acceleration for R10

**Status:** accepted
**Date:** 2026-07-10

## Context

`run_tool_pipeline()` checks an in-process TTL cache before calling a tool service.
The cache is scoped by a content hash that includes the authenticated user or shared
guest scope; authenticated persistence still creates a new `ToolRun` after either a
hit or miss. A second API replica would reduce hit rate and can duplicate model cost,
but it would not make the database or response contract incorrect.

Moving cached result payloads to Redis or another shared system would improve reuse
across replicas, but it would also place sensitive generated career content in another
store and could turn a disposable optimization into a new service dependency.

## Decision

The result cache remains an optional, fail-open acceleration layer. Cache lookup,
write, expiry, or backend failure must fall through to normal tool execution and must
never affect ownership, authorization, persistence, regeneration, or response
validation. A distributed cache may be selected only after R10 observes multiple API
instances plus sustained duplicate-cost or cache-efficiency harm. Its keys may contain
only non-reversible scoped hashes; its values receive the same access, encryption,
retention, and deletion assessment as `ToolRun.result_payload`, with a bounded TTL and
configuration-first rollback to cache-disabled operation.

## Alternatives Considered

- **Adopt Redis immediately because multi-instance deployment is plausible** — rejected
  because the current deployment runs one Uvicorn process and no measured miss/cost
  evidence exists.
- **Use the cache for cross-request coordination or authorization** — rejected because
  expiry or outage would then change correctness and availability rather than only
  performance.
- **Share cached results across authenticated users with identical inputs** — rejected
  because it weakens the current defense-in-depth user scope and complicates future
  personalization and deletion reasoning.

## Consequences

- A cache outage can increase latency and provider cost but cannot block correct tool
  execution.
- Multi-instance rollout may initially tolerate lower hit rate while evidence is
  collected.
- Any distributed backend needs explicit sensitive-data and lifecycle review; it is
  not “just coordination.”
- `run_tool_pipeline()` remains the single cache integration seam.
