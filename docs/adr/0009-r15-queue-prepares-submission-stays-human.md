# 0009. The approval queue prepares packets; submission stays human

**Status:** accepted (dark prerequisite implementation restored under #185; activation remains gated)
**Date:** 2026-07-10

## Context

R15 requires the system to discover suitable jobs (via the R14 registry-gated
pipeline) and prepare complete application packets for explicit user review. The
product direction defines progressive automation trust levels: Copilot (user
submits), Approval Queue (system prepares, user reviews and submits), and
source-specific Trusted Autopilot (system submits under strict authorization,
R16). The pressure to blur the queue into submission is predictable — a reviewed
packet is one click from sent — and the prohibited-automation list (unattended
mass submission, unauthorized platform automation, circumvention, credential use,
uncertain answers without approval) is already accepted product law (D-026,
Pillar 7).

## Decision

R15's approval queue is preparation-only. A packet is a composition referencing
existing entities — the campaign, its canonical or discovered listing, the selected
CV variant, an optional cover letter, screening-answer drafts, the match rationale,
and an explicit list of unresolved questions. The queue filters candidates through
user-defined rules, prepares packets within user-set volume caps and cost ceilings,
and stops. Sensitive, legal, eligibility, relocation, demographic, salary,
work-authorization, and uncertain fields are mandatory stops that only explicit
user input can resolve; an unresolved question blocks approval. Approval freezes an
immutable packet snapshot and hands the user to the official destination to submit
themselves. No R15 code path performs, schedules, or retries a submission;
submission automation exists only behind R16's per-source authorization contract.

## Alternatives Considered

- **"Approve = submit" in one step** — rejected: collapses Level B into Level C
  without R16's per-source legal approval, granular revocable authorization,
  idempotency, and incident controls; one ambiguous click would perform an outward
  legal act.
- **Auto-filling sensitive/uncertain answers from inference with a review flag** —
  rejected: the accepted trust model (D-062, D-073) forbids unverified claims
  entering user-facing materials by default; demographic and eligibility answers
  are exactly where inference errors do the most harm.
- **Preparing packets without user-defined rules (rank-everything)** — rejected:
  packet preparation spends generation cost and user attention; unbounded
  preparation becomes spam pressure and cost exposure with no user mandate.
- **Mutable packets after approval** — rejected: the approved snapshot is the
  user's record of what they reviewed; later edits would erase it (consistent with
  D-079's snapshot posture).

## Consequences

- The R15/R16 boundary is structural: R16 can build submission on top of approved
  packet snapshots without reworking the queue.
- Mandatory stops make packet completeness measurable: a packet is either fully
  user-resolved or visibly blocked.
- Preparation cost is bounded and user-governed before any automation exists.
- Rollback posture: nothing ships until R14 lands and quality evidence supports
  packet generation; afterward disabling the queue leaves campaigns, discovery,
  and manual flows untouched.
