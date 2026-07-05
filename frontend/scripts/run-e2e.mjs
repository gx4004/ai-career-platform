import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const frontendDir = fileURLToPath(new URL('../', import.meta.url))
const repositoryDir = fileURLToPath(new URL('../../', import.meta.url))
const composeArgs = ['compose', '-f', 'compose.e2e.yml']
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql+psycopg2://cw:cw@127.0.0.1:55432/cw_e2e'
const usesManagedDatabase = !process.env.E2E_DATABASE_URL

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? frontendDir,
    env: options.env ?? process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
  return result.status === 0
}

try {
  if (
    usesManagedDatabase &&
    !run('docker', [...composeArgs, 'up', '-d', '--wait'], { cwd: repositoryDir })
  ) {
    throw new Error(
      'Unable to start disposable PostgreSQL. Start Docker or set E2E_DATABASE_URL.',
    )
  }

  run('pnpm', ['exec', 'playwright', 'test'], {
    env: { ...process.env, E2E_DATABASE_URL: databaseUrl },
  })
} finally {
  if (usesManagedDatabase) {
    run('docker', [...composeArgs, 'down', '--volumes'], { cwd: repositoryDir })
  }
}
