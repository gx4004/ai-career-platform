import { expect, test, type Page } from '@playwright/test'

const apiUrl = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8000'}/api/v1`
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

test('history filtering, favorites, detail, and labels work through the UI', async ({
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
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByLabel(/Label Resume Analyzer run/)).toHaveCount(2)

  const labelInput = page.getByLabel(/Label Resume Analyzer run/).first()
  await labelInput.fill('Backend application')
  await page.getByRole('button', { name: 'Save label' }).first().click()
  await expect(labelInput).toHaveValue('Backend application')

  await page.getByRole('button', { name: 'Add to favorites' }).first().click()
  await page.getByRole('button', { name: /Favorites/ }).click()
  await expect(page.getByLabel(/Label Resume Analyzer run/)).toHaveCount(1)

  await page.getByRole('link', { name: 'View →' }).click()
  await expect(page).toHaveURL(new RegExp(`/resume/result/${id1}|/resume/result/`))
})

test('workspace listing, labeling, and pinning work through the UI', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'WS Full')
  await submitResume(page)

  await gotoHydrated(page, '/history')
  const workspaceName = page.getByPlaceholder('Name this workspace').first()
  await workspaceName.fill('My labeled workspace')
  await page.getByRole('button', { name: 'Save name' }).first().click()
  await expect(workspaceName).toHaveValue('My labeled workspace')

  await page.getByRole('button', { name: 'Pin workspace' }).first().click()
  await expect(page.getByText('My labeled workspace').first()).toBeVisible()

  await page.getByRole('button', { name: 'Resume later' }).first().click()
  await expect(page).toHaveURL(/\/job-match$/)
  const status = page.locator('.tool-status-inline')
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
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page).toHaveURL(new RegExp(`/resume\\?parent_run_id=${id1}`))

  const status = page.locator('.tool-status-inline')
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
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page).toHaveURL(new RegExp(`/resume\\?parent_run_id=${firstId}`))
  await page.getByRole('button', { name: 'Review resume' }).click()
  await expect(page).toHaveURL(/\/resume\/result\/[^/]+$/)

  await gotoHydrated(page, '/history')
  await expect(page.getByRole('button', { name: 'Delete this saved run' })).toHaveCount(2)
  const originalRunCard = page.locator('.history-card').filter({
    has: page.locator(`a[href="/resume/result/${firstId}"]`),
  })
  await originalRunCard.getByRole('button', { name: 'Delete this saved run' }).click()
  await page.getByRole('button', { name: 'Delete run' }).click()
  await expect(page.getByRole('button', { name: 'Delete this saved run' })).toHaveCount(1)
  await expect(page.getByPlaceholder('Name this workspace')).toHaveCount(1)

  await gotoHydrated(page, `/resume/result/${firstId}`)
  await expect(page.getByRole('heading', { name: 'This saved result is no longer available' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to history' }).click()
  await expect(page.getByRole('button', { name: 'Delete this saved run' })).toHaveCount(1)

  await page.getByRole('button', { name: 'Delete this saved run' }).click()
  await page.getByRole('button', { name: 'Delete run' }).click()
  await expect(page.getByText(/no runs found/i)).toBeVisible()
  await expect(page.getByPlaceholder('Name this workspace')).toHaveCount(0)
})

test('empty state renders when no runs exist', async ({ page }) => {
  test.setTimeout(30_000)
  await register(page, 'Empty')
  await gotoHydrated(page, '/history')
  await expect(page.getByText(/no runs found/i)).toBeVisible()
})
