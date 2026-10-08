import { expect, test, type Page } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

const apiPort = process.env.E2E_PRODUCTION === '1'
  ? (process.env.E2E_FRONTEND_PORT ?? '3000')
  : (process.env.E2E_BACKEND_PORT ?? '8000')
const apiUrl = `http://127.0.0.1:${apiPort}/api/v1`
const password = 'correct-horse-battery-staple'

const resumeText = `
Jordan Rivera
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python services,
data pipelines, and internal platforms for distributed product teams.
Skills
Python, FastAPI, PostgreSQL, Docker, CI/CD, AWS
`.trim()

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor()
  await page.evaluate(() => localStorage.setItem('cw-cookie-consent', 'accepted'))
}

async function register(page: Page, identity: string) {
  const email = uniqueEmail(identity.toLowerCase().replaceAll(' ', '-'))
  await gotoHydrated(page, '/login')
  await page.getByRole('tab', { name: 'Create account' }).click()
  await page.locator('#register-name').fill(identity)
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-tos').check()
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/auth/register` && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Create free account' }).click()
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  // A new account is welcomed, then the page moves on by itself to the dashboard (no pending destination here).
  await expect(page.getByRole('heading', { name: 'Your account is ready' })).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
  return email
}

async function submitResume(page: Page): Promise<string> {
  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/resume/analyze` && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Review resume' }).click()
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  const payload = await response.json()
  expect(payload.history_id).toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`/resume/result/${payload.history_id}$`))
  return payload.history_id as string
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
})

test('history filtering, favorites, rename and open work through the UI', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await register(page, 'Hist Full')

  const id1 = await submitResume(page)

  const id2Resp = await page.request.post(`${apiUrl}/resume/analyze`, {
    data: { resume_text: resumeText },
  })
  expect(id2Resp.ok()).toBe(true)

  await gotoHydrated(page, '/history')
  const runs = page.getByRole('list', { name: 'Saved runs' })
  // Sign-off (History toolbar): the six-option segmented filter needs about 66rem of toolbar; at the e2e viewport
  // (1280 with the sidebar open) the toolbar is narrower, so the shipped filter there is the "Filter by tool" Select.
  await page.getByRole('combobox', { name: 'Filter by tool' }).selectOption({ label: 'Resume Analyzer' })
  await expect(page).toHaveURL(/[?&]tool=resume\b/)
  await expect(runs.getByRole('link')).toHaveCount(2)

  await page.getByRole('button', { name: /^Rename / }).first().click()
  await page.getByRole('textbox', { name: /^Rename / }).fill('Backend application')
  await page.getByRole('textbox', { name: /^Rename / }).press('Enter')
  await expect(page.getByText('Backend application')).toBeVisible()

  // consistency-F11: one word app-wide, "Star" / "Starred" (the row's star names its run; the filter reads Starred).
  await page.getByRole('button', { name: /^Star / }).first().click()
  await page.getByRole('button', { name: 'Starred', exact: true }).click()
  await expect(runs.getByRole('link')).toHaveCount(1)

  await runs.getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`/resume/result/${id1}|/resume/result/`))
})

test('continuing a run from history carries its context to the next tool', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'WS Full')
  await submitResume(page)

  await gotoHydrated(page, '/history')
  await page.getByRole('button', { name: /^Continue: / }).first().click()
  await expect(page).toHaveURL(/\/job-match$/)
  const status = page.getByRole('list', { name: 'Resume source' })
  await expect(status).toBeVisible()
  await status.getByRole('button', { name: 'Change' }).click()
  await expect(page.locator('#job-match-resumeText')).toHaveValue(resumeText)
})

test('regeneration through the UI creates a new ToolRun linked by parent_run_id', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'Reg Full')
  const id1 = await submitResume(page)

  await page.getByRole('button', { name: 'Re-generate' }).click()
  await page.getByPlaceholder(/describe what you'd like changed/i).fill('Emphasize impact')
  // The re-generate panel's action was renamed Submit -> Continue (it opens the form; the run starts there).
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/resume\\?parent_run_id=${id1}`))

  const status = page.getByRole('list', { name: 'Resume source' })
  await expect(status).toBeVisible()
  await page.getByRole('button', { name: 'Review resume' }).click()
  await expect(page).toHaveURL(/\/resume\/result\/[^/]+$/)
  const id2 = page.url().split('/').at(-1)!
  expect(id2).not.toBe(id1)

  const detail2 = await page.request.get(`${apiUrl}/history/${id2}`)
  expect(detail2.ok()).toBe(true)
  expect((await detail2.json()).parent_run_id).toBe(id1)

  const detail1 = await page.request.get(`${apiUrl}/history/${id1}`)
  expect(detail1.ok()).toBe(true)
})

test('deleting one run preserves its workspace and deleting the final run removes it', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await register(page, 'Del Full')
  const firstId = await submitResume(page)
  await page.getByRole('button', { name: 'Re-generate' }).click()
  // The re-generate panel's action was renamed Submit -> Continue (it opens the form; the run starts there).
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/resume\\?parent_run_id=${firstId}`))
  await page.getByRole('button', { name: 'Review resume' }).click()
  await expect(page).toHaveURL(/\/resume\/result\/[^/]+$/)

  await gotoHydrated(page, '/history')
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(2)
  const originalRunRow = page.getByRole('list', { name: 'Saved runs' }).getByRole('listitem').filter({
    has: page.locator(`a[href="/resume/result/${firstId}"]`),
  })
  await originalRunRow.getByRole('button', { name: /^Delete / }).click()
  await page.getByRole('button', { name: 'Delete run' }).click()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(1)

  await gotoHydrated(page, `/resume/result/${firstId}`)
  await expect(page.getByRole('heading', { name: 'This saved result is no longer available' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to history' }).click()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(1)

  await page.getByRole('button', { name: /^Delete / }).click()
  await page.getByRole('button', { name: 'Delete run' }).click()
  await expect(page.getByText(/no runs yet/i)).toBeVisible()
})

test('empty state renders when no runs exist', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'Empty')
  await gotoHydrated(page, '/history')
  await expect(page.getByText(/no runs yet/i)).toBeVisible()
})
