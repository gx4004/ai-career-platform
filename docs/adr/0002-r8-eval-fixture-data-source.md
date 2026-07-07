# 0002. Eval fixture data source for R8 Output Quality Program

**Status:** accepted
**Date:** 2026-07-07

## Context

R8's acceptance gate needs "representative, privacy-safe evaluation sets" for all
six tools (`docs/roadmap.md` R8). Two realistic sources exist for that data:

- Sample real, anonymized/de-identified content from existing `ToolRun` rows
  (guest runs aren't persisted per D-009, but authenticated runs are).
- Hand-author small synthetic resume/job-description fixtures that never
  touched a real user.

The PostHog incident (`docs/decisions.md` D-036, `docs/adr/0001-r6-instrumentation-backend-choice.md`)
already established that this project's real user content — resumes, job
descriptions, generated application text — carries higher privacy risk than
this team initially planned around, and that "de-identified" is not the same
guarantee as "never collected." That lesson applies to internal dev tooling
just as much as it applied to product analytics: an eval corpus is a durable,
repo-adjacent artifact that would sit around indefinitely if built from real
user content, exactly the pattern that made the PostHog leftover data
concerning in the first place.

## Decision

Build R8's evaluation sets exclusively from small, hand-authored synthetic
resume/job-description fixtures. Never sample, anonymize, or otherwise derive
eval fixtures from real `ToolRun` content, even with names/emails stripped.

## Alternatives Considered

- **Sample and de-identify real authenticated `ToolRun` rows** — rejected.
  De-identification of free-text resumes/cover letters is unreliable (career
  history itself is often identifying), and it would create a second durable
  store of real user content whose retention/deletion obligations (D-031)
  would need to be re-litigated for a dataset that exists purely for internal
  tooling convenience.
- **Generate fixtures with the LLM itself, on demand, no repo storage** —
  rejected for the *primary* corpus. Non-reproducible; calibration bands
  (D-042) and fabrication checks need a fixed, human-reviewable corpus so eval
  runs are comparable across prompt-version bumps. (Nothing prevents using the
  LLM as a drafting aid when hand-authoring a fixture — the fixture still gets
  committed and reviewed as fixed text before use.)

## Consequences

- The eval corpus is small, fully synthetic, and safe to commit to the
  repository in plain text — no access control or retention job needed for it.
- Fixture authoring is manual, bounded work (target ~10-12 pairs, reused across
  all six tools) rather than an automated pipeline; growing the corpus later is
  a deliberate, reviewable act, not a side effect of production traffic.
- Eval results measure how tools perform against a fixed, known corpus, not
  the true diversity of real user input — an accepted directional-signal
  limitation, not a completeness claim.
