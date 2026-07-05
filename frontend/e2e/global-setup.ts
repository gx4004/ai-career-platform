import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export default function globalSetup() {
  const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url))
  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    'postgresql+psycopg2://cw:cw@127.0.0.1:55432/cw_e2e'

  execFileSync('alembic', ['upgrade', 'head'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })
}
