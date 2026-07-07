# Architecture Decision Records

This directory holds ADRs for durable architectural decisions that need more
context than a one-line entry in `docs/decisions.md` can carry: considered
alternatives, consequences, and rollback posture.

Per `docs/agents/domain.md`: create an ADR **only** for a decision not already
owned by `docs/decisions.md` — never duplicate a decision across both systems.
New entries belong here when a future decision needs the longer form (considered
alternatives, consequences, rollback posture); give it either an ADR or a D-###
entry, not both, and cross-reference from the other system if needed.

## Conventions

- Filename: `NNNN-short-kebab-title.md` (e.g. `0001-adopt-redis-cache.md`),
  numbered sequentially.
- Status flows: `proposed` → `accepted` → (`superseded by NNNN` | `deprecated`).
- Keep each record short; link supporting evidence instead of inlining it.
- List new ADRs in the index below.

## Template

```markdown
# NNNN. Title

**Status:** proposed | accepted | superseded by NNNN
**Date:** YYYY-MM-DD

## Context
What forces are at play; why a decision is needed now.

## Decision
The change we are making, stated in full sentences.

## Alternatives Considered
What else was evaluated and why it lost.

## Consequences
What becomes easier, what becomes harder, rollback posture.
```

## Index

- [0001. Instrumentation backend for R6 Activation Instrumentation](0001-r6-instrumentation-backend-choice.md) — accepted 2026-07-07
- [0002. Eval fixture data source for R8 Output Quality Program](0002-r8-eval-fixture-data-source.md) — accepted 2026-07-07
