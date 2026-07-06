import { expect, test, type Page } from '@playwright/test'

const apiUrl = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8000'}/api/v1`
const password = 'correct-horse-battery-staple'

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

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, Docker, CI/CD, AWS
`.trim()

const jobDescription = `
Senior Backend Engineer

Build and operate Python and FastAPI services backed by PostgreSQL.
`.trim()

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor()
  await page.evaluate(() => localStorage.setItem('cw-cookie-consent', 'accepted'))
}

async function register(page: Page, identity: string) {
  const email = `${identity.toLowerCase().replaceAll(' ', '-')}-${Date.now()}@example.com`
  await gotoHydrated(page, '/login')
  await page.getByRole('tab', { name: 'Create Account' }).click()
  await page.locator('#register-name').fill(identity)
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-tos').check()
  await page.getByRole('button', { name: 'Create free account' }).click()
  await expect(page.getByRole('heading', { name: 'You are already signed in' })).toBeVisible()
  return email
}

async function runResumeAnalyzer(page: Page) {
  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/resume/analyze` && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Review resume' }).click()
  await responsePromise
  await expect(page).toHaveURL(/\/resume\/result\/[^/]+$/)
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
})

test('workflow context carries resume through Resume → Job Match → Cover Letter chain', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await register(page, 'WF Chain')
  await runResumeAnalyzer(page)

  // Job Match exposes the carried resume in the public form.
  await gotoHydrated(page, '/job-match')
  await expect(page.locator('#job-match-resumeText')).toHaveValue(resumeText)

  // Run Job Match
  const pasteBtn = page.getByRole('button', { name: 'Paste text instead' })
  if (await pasteBtn.isVisible({ timeout: 1000 }).catch(() => false)) await pasteBtn.click()
  await page.locator('#job-match-jobDescription').fill(jobDescription)
  const jmResponse = page.waitForResponse(
    (r) => r.url() === `${apiUrl}/job-match/match` && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Compare to role' }).click()
  await jmResponse
  await expect(page).toHaveURL(/\/job-match\/result\/[^/]+$/)

  // Cover Letter exposes both carried fields in the public form.
  await gotoHydrated(page, '/cover-letter')
  await expect(page.locator('#cover-letter-resumeText')).toHaveValue(resumeText)
  await expect(page.locator('#cover-letter-jobDescription')).toHaveValue(jobDescription)
})

test('Resume → Career Path carries the resume into the visible form', async ({ page }) => {
  await register(page, 'WF Career')
  await runResumeAnalyzer(page)

  await gotoHydrated(page, '/career')
  await expect(page.locator('#career-resumeText')).toHaveValue(resumeText)
})

test('Resume → Portfolio carries the resume into the visible form', async ({ page }) => {
  await register(page, 'WF Portfolio')
  await runResumeAnalyzer(page)

  await gotoHydrated(page, '/portfolio')
  await expect(page.locator('#portfolio-resumeText')).toHaveValue(resumeText)
})

test('workflow context is tab-scoped via sessionStorage', async ({
  context,
  browser,
}) => {
  test.setTimeout(60_000)
  const page = await context.newPage()
  await register(page, 'WF Tab')
  await runResumeAnalyzer(page)

  await gotoHydrated(page, '/job-match')
  await expect(page.locator('#job-match-resumeText')).toHaveValue(resumeText)

  // New context (different tab) should have no context
  const otherContext = await browser.newContext()
  const otherPage = await otherContext.newPage()
  await otherContext.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })

  try {
    await gotoHydrated(otherPage, '/job-match')
    await expect(otherPage.getByRole('button', { name: 'Paste text instead' })).toBeVisible()
    await expect(otherPage.locator('#job-match-resumeText')).toHaveCount(0)
  } finally {
    await otherContext.close()
  }

  // Original tab still has context
  await gotoHydrated(page, '/job-match')
  await expect(page.locator('#job-match-resumeText')).toHaveValue(resumeText)
})

test('clearing context resets downstream', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'WF Clear')
  await runResumeAnalyzer(page)

  await page.evaluate(() => sessionStorage.removeItem('career-workbench:workflow-context'))

  await gotoHydrated(page, '/job-match')
  await expect(page.getByRole('button', { name: 'Paste text instead' })).toBeVisible()
  await expect(page.locator('#job-match-resumeText')).toHaveCount(0)
})
