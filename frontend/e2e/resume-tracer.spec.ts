import { expect, test } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

const resumeText = `
Jordan Rivera
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python services,
data pipelines, and internal platforms for distributed product teams.

Experience
- Led delivery of a FastAPI service used by 40 internal teams and reduced request
  latency by 35 percent through query tuning and cache design.
- Owned PostgreSQL schema changes, migration rehearsals, monitoring, and incident
  response for a customer workflow processing 2 million events each month.
- Built CI pipelines that cut deployment time from 25 minutes to 8 minutes while
  preserving rollback and audit controls.
- Mentored four engineers and coordinated delivery with product, design, security,
  and support partners across three quarterly releases.
- Improved service reliability from 99.5 to 99.95 percent by adding structured
  telemetry, actionable alerts, and capacity tests.

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, CI/CD, AWS

Education
BSc Computer Science
`.trim()

async function gotoHydrated(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor()
}

async function submitResume(page: import('@playwright/test').Page) {
  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  await page.getByRole('button', { name: 'Review resume' }).click()
  await expect(page).toHaveURL(/\/resume\/result\/[^/]+$/)
}

async function register(page: import('@playwright/test').Page, prefix: string) {
  await gotoHydrated(page, '/login')
  await page.getByRole('tab', { name: 'Create Account' }).click()
  await page.locator('#register-name').fill('R2 Test User')
  await page.locator('#register-email').fill(uniqueEmail(prefix))
  await page.locator('#register-password').fill('correct-horse-battery-staple')
  await page.locator('#register-tos').check()
  await page.getByRole('button', { name: 'Create free account' }).click()
  await expect(page.getByRole('heading', { name: 'You are already signed in' })).toBeVisible()
}

test('guest resume result stays transient after account creation', async ({ page }) => {
  await submitResume(page)
  await expect(page.getByText('Resume Analyzer · Guest demo')).toBeVisible()

  await register(page, 'guest-tracer')
  await page.goto('/history')

  await expect(page.getByText('No runs found')).toBeVisible()
})

test('authenticated resume result persists and can be revisited', async ({ page }) => {
  await register(page, 'auth-tracer')
  await submitResume(page)

  await expect(page.getByText('Resume Analyzer · Guest demo')).toHaveCount(0)
  const resultUrl = page.url()

  await page.goto('/history')
  await expect(page.getByText(/Resume Analysis/).first()).toBeVisible()

  await page.goto(resultUrl)
  await expect(page.getByRole('img', { name: /Resume score:/ })).toBeVisible()
})
