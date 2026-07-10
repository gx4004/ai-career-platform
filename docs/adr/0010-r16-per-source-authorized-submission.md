# 0010. Submission is a per-source authorized act on approved packet snapshots

**Status:** accepted
**Date:** 2026-07-10

## Context

R16 allows explicitly authorized applications to be submitted through supported
integrations — automation trust Level C. Everything before it is preparation: R15
freezes approved, fully user-resolved packet snapshots and hands the user to the
official destination. The accepted prohibitions are absolute: no unattended mass
submission across arbitrary sites, no unauthorized LinkedIn or job-board
automation, no CAPTCHA or access-control circumvention, no stored third-party
passwords or copied session cookies, no uncertain answers submitted without user
approval (D-026, Pillar 7). Submission is also qualitatively different from every
prior feature: it is an outward act on third-party infrastructure in the user's
name that cannot be taken back.

## Decision

Submission exists only as a per-source integration behind four independent gates.
First, the source: a maintained compatibility contract plus accepted legal/terms
approval, extending its R14 registry entry. Second, the user: granular, explicit,
revocable authorization per source — never inferred from queue usage, never
implemented with stored third-party credentials or copied session state; only
authentication mechanisms the source explicitly provides for this purpose. Third,
the packet: only an approved R15 snapshot with zero unresolved questions and zero
unsupported claims may submit, and any challenge, CAPTCHA, uncertainty, or
contract mismatch at submission time stops the attempt and returns the packet to
the user — the fallback is always the Level B handoff, never a workaround. Fourth,
the envelope: per-user and per-source volume and rate limits, anomaly detection,
immediate pause and kill switches, and a rehearsed incident procedure precede
activation. Every submission is idempotent, retains the exact user-visible packet
snapshot and per-field record in an append-only audit log, and produces a user
confirmation with every submitted field inspectable.

## Alternatives Considered

- **Generic browser automation across arbitrary career sites** — rejected:
  explicitly prohibited (D-026); arbitrary-site automation cannot honor terms,
  access controls, or idempotency.
- **Acting as the user with stored credentials or copied session cookies** —
  rejected: explicitly prohibited; it converts the product into an account-takeover
  liability and violates source terms by construction.
- **Retry-until-success submission semantics** — rejected: retries without
  idempotency keys duplicate applications, the worst user-visible failure an
  autopilot can produce.
- **One global autopilot toggle** — rejected: authorization, terms, compatibility,
  and risk are per-source facts; a global switch erases exactly the granularity
  the trust model requires.
- **Silent fallback from failed automation to headless workarounds** — rejected:
  a challenge or block is the source saying no; the only correct fallback is
  returning control to the human (Level B).

## Consequences

- Each supported source is a maintained product: compatibility monitoring,
  contract tests, terms reviews, and a kill switch — supporting few sources well
  beats supporting many badly.
- The four gates make "can it submit?" a checkable conjunction rather than a
  judgment call at submission time.
- Duplicate applications are prevented structurally (idempotency keys per packet
  and source), not procedurally.
- Rollback posture: nothing ships until R15 demonstrates quality and demand;
  afterward revoking authorization, tripping a source kill switch, or disabling
  R16 entirely degrades to the R15 human-submission flow with no data loss.
