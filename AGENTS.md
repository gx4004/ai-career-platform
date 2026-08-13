# Career Workbench — Agent Operating Guide

This file is the universal entry point for humans and coding agents. Keep it short,
stable, and tool-agnostic.

## Start Here

Read only the context needed for the task:

1. `docs/state.md` — current branch posture, active objective, risks, and blockers.
2. `docs/roadmap.md` — priorities and completion gates.
3. `docs/spec.md` — product contract and scope.
4. `docs/architecture.md` — boundaries, data flow, and engineering invariants.
5. `docs/threat-model.md` — trust boundaries, assets, data flows, attack surface, abuse cases, and privacy failure modes.
6. `docs/decisions.md` — accepted decisions that must not be silently reversed.
7. `design.md` — UI tokens and visual rules, only for user-interface work.

`docs/README.md` explains ownership and the update protocol for this memory system.

## Source-of-Truth Precedence

When sources disagree, use this order:

1. User instruction for the current task
2. Executable code, schemas, migrations, and tests
3. Accepted entries in `docs/decisions.md`
4. `docs/threat-model.md` for security, privacy, and abuse concerns
5. `docs/spec.md` and `docs/architecture.md`
6. `docs/state.md` and `docs/roadmap.md`
7. Historical plans, checklists, thesis files, and old comments

Do not guess through a meaningful contradiction. Record it in `docs/state.md` and
ask for a decision when it changes product behavior, data, security, or scope.

## Repository Map

```text
frontend/              React 19 + TanStack Start application
  src/routes/          File-based route definitions
  src/pages/           Page assemblies
  src/components/      Reusable UI grouped by domain
  src/lib/tools/       Tool registry, workflows, drafts, and result definitions
  src/lib/api/         API client and Zod schemas
  src/styles/          Global plain-CSS design system and page styles
backend/               FastAPI application
  app/routers/         HTTP endpoints under /api/v1
  app/services/        Business logic, pipelines, LLM, scoring, and parsing
  app/schemas/         Pydantic API contracts
  app/models/          SQLAlchemy models
  app/prompts/         Tool-specific prompt builders
  alembic/             Database migrations
docs/                  Canonical product and engineering memory
thesis/                Academic deliverables; not product documentation
```

## Non-Negotiable Invariants

- Use `pnpm`, never `npm`, in `frontend/`.
- Tool order is Resume → Job Match → Career Path → Cover Letter → Interview Q&A
  → Portfolio.
- Tool metadata belongs in `frontend/src/lib/tools/registry.ts`.
- Frontend Zod contracts must mirror backend Pydantic contracts.
- Tool endpoints use `run_tool_pipeline()`; do not create a parallel execution path.
- Auth tokens stay in HttpOnly cookies, never browser storage.
- Authenticated runs persist; guest demo runs remain transient.
- Regeneration creates a new `ToolRun` linked by `parent_run_id`; it never overwrites.
- Workflow context is tab-scoped in `sessionStorage`.
- Migrations are additive and reviewed; never rewrite an applied migration.
- English is the only product language until the roadmap explicitly promotes i18n.
- Never commit secrets, real credentials, private resume content, or production data.
- Do not re-enable monetization gates or ship payment/ad integrations without an
  explicit roadmap decision.

## Working Contract

Before changing code:

- Inspect `git status` and preserve unrelated or in-progress work.
- Confirm the current branch and the relevant roadmap outcome.
- Read the nearest tests and surrounding implementation.
- Treat old plans (`FRONTEND_OVERHAUL_PLAN.md`, thesis checklists, audit artifacts)
  as historical evidence, not current authority.

While changing code:

- Keep the patch scoped to one outcome.
- Follow surrounding style and reuse existing abstractions.
- Add or update tests for changed behavior.
- For contract changes, update backend schema, frontend schema, and tests together.
- For security, auth, persistence, or migration changes, explicitly assess rollback
  and compatibility.

Before handing off:

- Run the smallest relevant checks, then the broader gate when risk warrants it.
- Report commands and results honestly; never claim a check that was not run.
- Update memory only when reality changed:
  - `docs/state.md` for current status, blockers, and newly discovered drift.
  - `docs/roadmap.md` when an outcome changes state.
  - `docs/decisions.md` when a durable decision is accepted or superseded.
  - `docs/spec.md` or `docs/architecture.md` when the product or system contract changes.
- Do not use memory files as a diary. Git history owns detailed implementation history.

## Verification

### Local-first CI policy

- Run every feasible quality gate locally. Pushes and pull-request updates are
  allowed, but they must not consume hosted Actions quota automatically.
- GitHub Actions workflows are manual-dispatch only. Do not add `push`,
  `pull_request`, scheduled, or other automatic triggers unless the owner
  explicitly reverses this policy.
- Do not dispatch or rerun GitHub Actions yourself. Preserve the checked-in jobs
  for an owner-triggered hosted gate when the owner decides it is needed.

```bash
# Frontend
cd frontend
pnpm typecheck
pnpm test
pnpm build

# Backend
cd backend
pytest
alembic upgrade head
```

Use focused test commands during iteration. A release candidate must satisfy the
quality gates in `docs/roadmap.md`.

## Definition of Done

A task is done when:

- acceptance criteria are met;
- relevant tests pass;
- user-visible failure and loading states are handled;
- security, privacy, and accessibility implications were considered;
- documentation changed only where the source of truth changed;
- remaining risks or deferred work are visible in `docs/state.md` or the roadmap.
