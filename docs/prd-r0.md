# PRD — R0 Release Charter & Baseline

## Objective
Create a reproducible release candidate baseline for Career Workbench: decide release mode, verify build/test/migration, and establish a clean branch for product work.

## Scope
- Decide release mode (private beta / public MVP / showcase)
- Establish reproducible install and build instructions
- Run frontend typecheck/tests/build and backend tests/migrations
- Verify guest tool E2E flows and authenticated persistence
- Produce a checklist and acceptance gates in `docs/state.md`

## Acceptance
- Frontend: pnpm typecheck && pnpm test && pnpm build
- Backend: pytest && alembic upgrade head
- Manual smoke for 3 connected workflows

