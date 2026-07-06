import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const frontendDir = fileURLToPath(new URL('.', import.meta.url))
const backendDir = fileURLToPath(new URL('../backend/', import.meta.url))
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql+psycopg2://cw:cw@127.0.0.1:55432/cw_e2e'
const frontendPort = process.env.E2E_FRONTEND_PORT ?? '3000'
const backendPort = process.env.E2E_BACKEND_PORT ?? '8000'
const frontendUrl = `http://127.0.0.1:${frontendPort}`
const backendUrl = `http://127.0.0.1:${backendPort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // E2E files use isolated browser contexts/users and the dedicated backend
  // disables request limiting, so CI can safely run two files concurrently.
  // Keep local execution serial for easier debugging and lower laptop load.
  workers: process.env.CI ? 2 : 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: frontendUrl,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'python3 -m tests.e2e_server',
      cwd: backendDir,
      url: `${backendUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        SECRET_KEY: 'e2e-only-secret-key-that-is-not-used-outside-tests',
        ENVIRONMENT: 'development',
        CORS_ORIGINS: frontendUrl,
        FRONTEND_URL: frontendUrl,
        RESULT_CACHE_ENABLED: 'false',
        E2E_BACKEND_PORT: backendPort,
      },
    },
    {
      command: `pnpm dev --host 127.0.0.1 --port ${frontendPort}`,
      cwd: frontendDir,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        // TanStack Start's Vite dev server suppresses client hydration when
        // GitHub Actions injects CI=true. The test runner remains in CI mode;
        // only the interactive app server needs normal development semantics.
        CI: '',
        VITE_API_URL: `${backendUrl}/api/v1`,
      },
    },
  ],
})
