# docs/ — Canonical Memory System

This directory is the canonical product and engineering memory for Career
Workbench. `AGENTS.md` (repo root) is the universal entry point; this file defines
which document owns which kind of fact and how updates happen.

## Ownership Map

| Document | Owns | Update trigger |
|---|---|---|
| `state.md` | Current posture, active objective, risks, blockers, verification snapshots | Reality changed: status, blockers, or newly discovered drift |
| `roadmap.md` | Outcomes, priorities, acceptance gates (R0–R18) | An outcome changes state or a gate is accepted/deferred |
| `spec.md` | Product contract and scope: what the product promises users | The product contract changes |
| `architecture.md` | System boundaries, data flow, engineering invariants | The system contract or an invariant changes |
| `threat-model.md` | Trust boundaries, assets, data flows, attack surface, abuse cases, privacy failure modes, open production unknowns (D-UNK) | Security/privacy posture changes or an unknown is resolved |
| `decisions.md` | Accepted durable decisions (append-only D-### log) | A durable decision is accepted or superseded |
| `adr/` | Architectural decision records not already owned by `decisions.md` | A durable architectural fork is decided (see `adr/README.md`) |
| `product-direction.md` | Long-term strategic direction (Evidence Profile, CV Studio, Campaigns, automation trust levels) | The accepted strategy changes |
| `launch-checklist.md` | Staging and release runbook (R5) | Release operations change |
| `../design.md` (root) | UI tokens and visual rules | The shipped visual contract changes |
| `../CONTEXT.md` (root) | Shared domain terminology | A domain term is added or corrected |
| `agents/` | Agent workflow conventions (issue tracker, triage labels, domain docs) | The agent workflow changes |

Historical documents (`spec-legacy.md`, `qa-checklist.md`, root
`QA-VISUAL-PASS.md`, root `FRONTEND_OVERHAUL_PLAN.md`, thesis files) carry explicit
HISTORICAL banners. They are evidence, never authority.

## Source-of-Truth Precedence

When sources disagree (mirrors `AGENTS.md`):

1. User instruction for the current task
2. Executable code, schemas, migrations, and tests
3. Accepted entries in `decisions.md`
4. `threat-model.md` for security, privacy, and abuse concerns
5. `spec.md` and `architecture.md`
6. `state.md` and `roadmap.md`
7. Historical plans, checklists, thesis files, and old comments

Do not guess through a meaningful contradiction. Record it in `state.md` and ask
for a decision when it changes product behavior, data, security, or scope.

## Update Protocol

- Update memory only when reality changed, in the owning document above; never use
  these files as a diary — git history owns detailed implementation history.
- `decisions.md` is append-only: reversing a decision means adding a new entry and
  marking the old one `superseded`, never erasing it.
- Remove obsolete state from `state.md` instead of appending a daily log; follow
  its Handoff Format section.
- Keep each fact in exactly one owner. Cross-reference instead of duplicating —
  a fact copied into two documents will eventually contradict itself.
- Documentation changes only where the source of truth changed; a code-only change
  with no contract impact needs no memory update.
