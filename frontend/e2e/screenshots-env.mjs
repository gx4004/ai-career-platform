/** Shared port/DB/interpreter resolution for the screenshots harness.
 *
 * Both playwright.screenshots.config.ts (which boots the servers) and
 * screenshots.spec.ts (which seeds data and needs the same backend dir/DB
 * URL for the DB-level admin promotion) import this so the two never drift.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function resolveScreenshotsEnv() {
  const frontendDir = fileURLToPath(new URL('../', import.meta.url))
  const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url))

  // Distinct from the default e2e suite (3000/8000) and from a developer's
  // own dev servers, so `pnpm screenshots` can run alongside either.
  const frontendPort = process.env.E2E_FRONTEND_PORT ?? '3510'
  const backendPort = process.env.E2E_BACKEND_PORT ?? '8510'

  // Same default as playwright.config.ts's docker-managed database (see
  // compose.e2e.yml) so the harness works out of the box with `pnpm
  // screenshots`. Point E2E_DATABASE_URL at a dedicated local database (for
  // example `createdb cw_e2e_screens`) to skip Docker entirely.
  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    'postgresql+psycopg2://cw:cw@127.0.0.1:55432/cw_e2e'

  // Prefer a project-local venv (what a developer or CI checkout would
  // have); fall back to a bare `python3` on PATH. Set E2E_PYTHON to point at
  // an interpreter that lives outside this checkout (for example a worktree
  // that has no venv of its own).
  const defaultVenvPython = fileURLToPath(
    new URL('../../backend/.venv/bin/python', import.meta.url),
  )
  const pythonBin =
    process.env.E2E_PYTHON ?? (existsSync(defaultVenvPython) ? defaultVenvPython : 'python3')

  return {
    frontendDir,
    backendDir,
    databaseUrl,
    frontendPort,
    backendPort,
    frontendUrl: `http://127.0.0.1:${frontendPort}`,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    pythonBin,
  }
}
