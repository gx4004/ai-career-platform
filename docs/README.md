# Project Memory

The files in this directory are Career Workbench's compact, shared memory. They are
designed to help a new agent orient quickly without loading the whole repository.

## Memory Map

| File | Answers | Volatility | Update when |
|---|---|---:|---|
| `state.md` | What is true right now? | High | Focus, blocker, risk, or baseline changes |
| `roadmap.md` | What outcome comes next? | Medium | Priority or outcome status changes |
| `product-direction.md` | Where is the product going and what boundaries apply? | Low | Strategic direction or expansion boundary changes |
| `spec.md` | What product are we building? | Low | User-visible contract or scope changes |
| `architecture.md` | How is it built? | Low | Boundary, flow, or invariant changes |
| `decisions.md` | Why is it this way? | Append-only | A durable choice is accepted/superseded |
| `../design.md` | What should the UI look like? | Medium | Design tokens or visual language changes |

## Loading Strategy

Every agent reads `AGENTS.md` and `state.md`. Then load only the documents relevant
to the task. This keeps context small and reduces instruction collisions.

Examples:

- UI fix: state + roadmap item + design
- API behavior: state + spec + architecture
- Auth or data change: state + architecture + decisions
- Product planning: state + product direction + spec + roadmap + decisions

## Update Protocol

1. Code and tests are the operational truth.
2. Update a memory file in the same change when its contract changes.
3. Keep `state.md` as a snapshot, not a chronological log.
4. Track outcomes in the roadmap; track implementation tasks in issues or PRs.
5. Add decisions only after acceptance. Proposed choices belong in `state.md`.
6. Supersede decisions; do not erase them.
7. Put detailed history in commits, not these files.

## Status Vocabulary

- `proposed` — needs product confirmation
- `ready` — shaped and unblocked
- `in_progress` — actively being implemented
- `blocked` — cannot advance without a named dependency or decision
- `done` — acceptance gate verified
- `deferred` — intentionally outside the current horizon

## Maintenance Check

At each milestone, verify:

- the roadmap's `Now` section contains no completed work;
- `state.md` matches the checked-out product behavior;
- accepted decisions are reflected in spec and architecture;
- old plans are clearly historical;
- links and verification commands still work.
