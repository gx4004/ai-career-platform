# 0007. Workspaces evolve in place into Application Campaigns

**Status:** accepted
**Date:** 2026-07-10

## Context

R13 requires each target role to have one coherent campaign: canonical listing,
selected materials, preparation, tracking, and quality review. Today's `Workspace`
is a bare container — label, pin, timestamps, and a one-to-many link to `ToolRun`
rows — created implicitly by the persistence path (`resolve_workspace` reuses an
explicit id, infers one from linked runs, or auto-creates with a generic label).
Nothing about a job listing is persisted at all: URL import returns title, company,
description, and source URL to the client and stores nothing, with no retrieval
date anywhere. The product direction says an existing workspace "should evolve into
an application campaign," and the roadmap gate demands defined workspace migration
and backward compatibility.

## Decision

The campaign is the `Workspace` entity evolved in place, not a new parallel
container. An additive migration extends workspaces with optional campaign fields
(company, role, canonical listing reference, status, deadlines) and adds dependent
owner-scoped tables (campaign events, tasks, notes, contacts, listing). Every
existing workspace remains valid as a label-only campaign with all new fields
empty; `ToolRun.workspace_id` keeps its nullable SET NULL semantics, and the
existing implicit-creation path keeps working before a user adds campaign detail.
Campaign history is append-only events (status changes, notes, task actions,
material selections) from which the activity timeline derives; the
submitted-application snapshot is an immutable bundle referencing the exact
material versions at applied time.

## Alternatives Considered

- **A new `Campaign` entity beside `Workspace`** — rejected: two containers for the
  same mental object ("my application to X") force a migration/adoption split,
  duplicate the run-linking machinery, and contradict the accepted direction that
  workspaces evolve.
- **Campaign state as `_workspace_meta` payload metadata** — rejected: campaign
  attributes are queryable durable state (status, deadlines, contacts), not
  derived per-run display metadata inside immutable result JSON.
- **Frontend-only grouping over existing workspaces** — rejected: tracking,
  reminders, export, deletion, and owner isolation are server obligations; browser
  state cannot satisfy the acceptance gate.
- **Mutable campaign columns updated in place for history** — rejected for the
  timeline: overwriting status/deadline fields would erase the activity history the
  gate requires; append-only events preserve it (consistent with D-010).

## Consequences

- One additive Alembic migration plus dependent tables; no data backfill is needed
  and old workspaces need no user action.
- The campaign becomes the product's first store of third-party personal data
  (contacts) and needs its own threat-model, export, and deletion coverage.
- The listing gains persistence (title, company, description, source URL,
  retrieval date) as owner-isolated user content; operational telemetry stays
  source-family only per D-059.
- Rollback posture: nothing ships until R12 lands; afterward campaign fields are
  additive — ignoring them returns workspaces to today's behavior without data
  loss.
