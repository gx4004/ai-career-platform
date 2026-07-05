import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const frontendDir = fileURLToPath(new URL('.', import.meta.url))
const backendDir = fileURLToPath(new URL('../backend/', import.meta.url))
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql+psycopg2://cw:cw@127.0.0.1:55432/cw_e2e'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
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
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        SECRET_KEY: 'e2e-only-secret-key-that-is-not-used-outside-tests',
        ENVIRONMENT: 'development',
        CORS_ORIGINS: 'http://127.0.0.1:3000',
        FRONTEND_URL: 'http://127.0.0.1:3000',
        RESULT_CACHE_ENABLED: 'false',
      },
    },
    {
      command: 'pnpm dev --host 127.0.0.1',
      cwd: frontendDir,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_URL: 'http://127.0.0.1:8000/api/v1',
      },
    },
  ],
})
