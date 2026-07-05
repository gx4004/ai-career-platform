# PRD — R0 Engineering Baseline

## Objective

Establish a reproducible, evidence-backed engineering baseline for Career Workbench
before feature perfection or expansion begins. R0 measures the current product; it
does not launch it or change product behavior.

## Branch Contract

- `chapter2` is the long-lived product experimentation and hardening branch.
- `main` and `deploy` remain stable and receive only deliberate promotions.
- `r0-setup` is a short-lived branch targeting `chapter2`.
- Existing thesis files, generated assets, and unrelated worktree changes are not
  part of R0 and must not be staged, rewritten, or removed.

## Prerequisites

- Node and `pnpm` matching `frontend/package.json`.
- Python 3.11 or newer with `backend/requirements.txt` installed.
- A disposable PostgreSQL 16 database for migration verification. SQLite is
  supported for local application development but not for replaying the full
  migration history.
- Environment variables derived from the frontend and backend example files; no
  real credentials or private career content in recorded evidence.
- GitHub CLI authentication for issues and the R0 pull request.

## Verification

Run against the exact R0 commit:

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build

cd ../backend
pytest -q
DATABASE_URL=postgresql+psycopg2://<user>:<password>@<host>/<disposable_db> \
  alembic upgrade head
```

Then exercise three representative guest submissions without private data:

1. Resume Analyzer.
2. Job Match.
3. One generative planning or application tool.

Connected next-step actions are intentionally locked for guests. Their authenticated
context-carry behavior belongs to the R2 end-to-end audit.

For every check, record the UTC date, commit, environment, exact command, duration,
pass/fail result, and concise failure summary. Put the durable matrix in
`docs/state.md` and the pull request. Keep complete raw output in CI or PR artifacts,
not committed timestamped logs.

## Failure Policy

- Fix only trivial setup or configuration defects on `r0-setup` when verification
  cannot otherwise run.
- When local PostgreSQL is unavailable, generate PostgreSQL migration SQL locally
  and require the pull-request CI PostgreSQL migration job to pass before R0 closes.
- Create focused issues and branches for behavioral defects, risky dependency
  changes, migrations, API/schema changes, or architectural work.
- Do not weaken tests, bypass failures, or alter product contracts to make R0 pass.
- Classify each unresolved failure with an owner, issue, and next action.

## Out of Scope

- Feature changes, visual redesign, monetization, user acquisition, or beta launch.
- Product API, schema, authentication, persistence, or migration-policy changes.
- Evidence Profile, CV Studio, job discovery, and application automation.
- Full authenticated and administrative journey auditing, which belongs to R2.

## Completion Gate

R0 is complete when:

- `chapter2` exists on origin and stable branches are unchanged;
- skill and issue-tracker configuration is internally consistent;
- frontend install, typecheck, tests, and production build have recorded outcomes;
- backend tests and migration from an empty disposable database have recorded
  outcomes;
- three guest workflow checks have recorded outcomes;
- environment examples are sufficient and contain no secrets;
- every failure is fixed within policy or linked to a focused issue;
- `docs/state.md` and the R0 pull request match the verified repository state;
- standards and PRD reviews contain no unresolved blocking finding.
