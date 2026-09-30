# 0009. Applications prepare materials; submission stays human

**Status:** accepted; amended 2026-09 (Sept 2026 reset, #319/#360): the separate
approval queue and approval step described in the original decision were removed
**Date:** 2026-07-10 (amended 2026-09-30)

## Context

The original R15 decision separated the system's job (discover jobs and prepare
complete application materials) from the user's job (review and submit). The
pressure to blur the two is predictable: a prepared application is one click from
sent, and the prohibited-automation list (unattended mass submission,
unauthorized platform automation, circumvention, credential use, uncertain
answers without user input) is accepted product law (D-026, Pillar 7).

R15 originally implemented that boundary as a second surface, an approval queue of
"packets" with queue rules, caps, a per-packet approval decision, and an
immutable approval snapshot. In the Sept 2026 reset the owner merged the queue
into Campaigns, now called **Applications** (#360), and removed the separate
approval step. The submission boundary itself was not weakened.

## Decision

The boundary is now: **the product prepares; the owner applies.**

- An Application (a `Workspace` row that has a status or a job posting) holds the
  posting, the chosen CV variant and cover letter, prepared drafts, open
  questions, answers, tasks, notes and an activity log. Materials are references
  to existing entities, not copies.
- "Prepare" (one application, or "prepare for me" across adopted discovery
  listings, capped at `MAX_PREPARE_PER_RUN` = 10 per click and filtered by the
  owner's keywords, locations and remote preference) produces a cover letter and
  screening-answer drafts through the shared tool pipeline, from the CV text and
  confirmed Evidence Profile items only.
- Sensitive, legal, eligibility, relocation, demographic, salary,
  work-authorization and uncertain fields are mandatory stops, classified by one
  server-side function (`stop_classifier`). They are never drafted; they become
  open questions only the owner's typed answer resolves. The owner's standing
  answers (application details) count as that explicit input.
- There is no approval step. Marking an application **applied** is the single
  freeze point: it writes one immutable snapshot (`application_snapshot`) of
  exactly what was sent, with a SHA-256 digest, and later CV or cover-letter
  edits never change it. The status move itself is the owner's own act; nothing in
  the product performs, schedules or retries a submission.
- The experimental Autopilot (`AUTOPILOT_EXPERIMENT_ENABLED`, development only)
  may fill a form in a browser on the owner's machine, but never clicks, presses
  or submits; the owner reviews the open window and submits. Its behavior is
  documented with the Autopilot work, not here.

## Alternatives Considered

- **"Prepare = submit" in one step** - rejected: one ambiguous click would perform
  an outward legal act on the owner's behalf, with no per-source terms review or
  revocable authorization.
- **Auto-filling sensitive/uncertain answers from inference** - rejected: the
  trust model (D-062, D-073) forbids unverified claims in user-facing materials.
- **A separate approval queue with per-packet approval snapshots** - built first
  (R15), then rejected in the reset: it duplicated the Applications tracker, made
  the owner approve the same materials twice, and was the largest single source of
  code for no extra safety, since the freeze at "applied" records what was sent.
- **Mutable materials after applying** - rejected: the snapshot is the owner's
  record of what was sent (consistent with D-079).

## Consequences

- One surface (Applications) instead of two; the `/queue` route only redirects.
- The R15 packet, queue-rule, approval-snapshot, audit-event and pipeline-halt
  tables and the R16 trusted-submission tables no longer exist. Submission
  automation is not a roadmap item; if it is ever revisited it needs a new
  decision with per-source legal review.
- Mandatory stops remain structural: an application with unresolved open
  questions is visibly not ready.
- Rollback posture: disabling preparation leaves tracking, discovery and manual
  flows untouched.
