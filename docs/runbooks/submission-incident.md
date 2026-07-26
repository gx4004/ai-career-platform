# Submission Incident Procedure

This runbook governs the dark R16 submission path. It does not authorize a real
source, adapter, credential flow, or production activation. The global submission
kill switch defaults on and may be cleared only after a completed rehearsal is
recorded through the admin safety control.

## Roles

- Incident commander: declares severity, owns the timeline, and authorizes recovery.
- Technical lead: trips controls, preserves content-free evidence, and verifies rollback.
- Source/legal owner: checks the affected source contract and terms approval.
- User communications owner: sends reviewed status and follow-up copy without exposing
  packet content, source credentials, or another user's activity.
- Privacy/security owner: assesses proxy abuse, credential exposure, and notification duties.

## Immediate response

1. Trip the global submission kill switch in Admin → Discovery Sources. This is the
   first action for unknown scope; it requires no deploy.
2. Keep or trip the affected source's submission kill switch. Do not clear discovery
   or submission controls merely to reproduce the incident.
3. Ask affected users to keep their queue paused. Revocation remains available per
   source and invalidates the exact grant immediately.
4. Record only bounded operational facts: source family, control transition, limit or
   anomaly class, timestamps, and aggregate counts. Never copy packet fields, URLs,
   provider responses, auth material, user IDs, or submitted values into telemetry.
5. Preserve append-only submission claims, records, and stop events. A product-side
   deletion cannot recall an employer's copy; communications must state that plainly.

## Investigation and rollback

- Determine whether the event is a rate/volume breach, anomaly stop, compatibility
  break, duplicate risk, authorization failure, or confirmed accepted submission.
- For ambiguous outward acts, retain the exact durable claim and use only the source's
  reviewed native idempotency reconciliation. Never invite a manual duplicate.
- Roll back by leaving the global/source kill switch on, revoking affected grants when
  appropriate, and reverting application code through the normal reviewed release
  path. Schema rollback is permitted only after lifecycle data has been exported or
  intentionally deleted; never rewrite an applied migration.
- A broken compatibility contract stays source-killed and degrades to the frozen
  official Level B handoff. #195 owns automatic breakage thresholds and actuation.

## Recovery gate

Recovery requires: incident scope understood; source terms and compatibility contract
revalidated; per-user/per-source limits reviewed; duplicate reconciliation complete;
user copy approved; rollback verified; and a fresh rehearsal recorded against this
playbook version. Clear the source switch before the global switch, monitor bounded
events, and re-trip globally on any unexplained signal.

## Dark rehearsal record — 2026-07-26

Development fixtures exercised the no-deploy global and source kills, owner pause,
per-user/per-source minute and 24-hour limits, content-free anomaly stop, migration
upgrade/downgrade, and concurrent dispatch serialization. This is implementation
evidence only, not production activation evidence. Every deployed environment still
starts globally killed and must record its own completed rehearsal before clearing.
