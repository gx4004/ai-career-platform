import { defineConfig, devices } from '@playwright/test'

import { resolveScreenshotsEnv } from './e2e/screenshots-env.mjs'
import { VIEWPORTS } from './e2e/screenshot-utils.mjs'

// A separate config (not a second project in playwright.config.ts) because
// this harness needs its own webServer pair: distinct ports, a dedicated
// database. `testMatch` keeps it scoped to exactly one spec file, so
// `pnpm test:e2e` / `pnpm test:e2e:ci` never pick this up.
const env = resolveScreenshotsEnv()

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/screenshots.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 10 * 60_000,
  use: {
    baseURL: env.frontendUrl,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'screenshots',
      // devices['Desktop Chrome'] ships its own 1280x720 viewport; override
      // it after the spread so the default (desktop) page/context opens at
      // the task's required 1440x900. Mobile captures open their own
      // contexts with VIEWPORTS.mobile explicitly (see screenshots.spec.ts).
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.desktop },
    },
  ],
  webServer: [
    {
      // Chained so the server never starts serving against an unmigrated
      // schema; Playwright polls `url` for readiness, so this command must
      // finish the migration before uvicorn is listening.
      command: `"${env.pythonBin}" -m alembic upgrade head && "${env.pythonBin}" -m tests.e2e_server`,
      cwd: env.backendDir,
      url: `${env.backendUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: env.databaseUrl,
        SECRET_KEY: 'e2e-only-secret-key-that-is-not-used-outside-tests',
        ENVIRONMENT: 'development',
        CORS_ORIGINS: env.frontendUrl,
        FRONTEND_URL: env.frontendUrl,
        RESULT_CACHE_ENABLED: 'false',
        E2E_BACKEND_PORT: env.backendPort,
      },
    },
    {
      command: `pnpm dev --host 127.0.0.1 --port ${env.frontendPort}`,
      cwd: env.frontendDir,
      url: env.frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        // TanStack Start's Vite dev server suppresses client hydration when
        // GitHub Actions injects CI=true (see playwright.config.ts).
        CI: '',
        E2E_BACKEND_PORT: env.backendPort,
        VITE_API_URL: `${env.backendUrl}/api/v1`,
      },
    },
  ],
})
