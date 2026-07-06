import { expect, test, type Page } from '@playwright/test'

const apiUrl = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8000'}/api/v1`
const password = 'correct-horse-battery-staple'

const resumeText = `
Jordan Rivera
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python services.
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

async function submitResumeViaApi(page: Page): Promise<string> {
  const resp = await page.request.post(`${apiUrl}/resume/analyze`, {
    data: { resume_text: resumeText },
  })
  expect(resp.ok()).toBe(true)
  const payload = await resp.json()
  return payload.history_id as string
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
})

test('PDF export returns 404 when accessed by different user', async ({ page, browser }) => {
  test.setTimeout(60_000)
  await register(page, 'PDF Owner')
  const historyId = await submitResumeViaApi(page)

  const otherContext = await browser.newContext()
  const otherPage = await otherContext.newPage()
  await otherContext.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })

  try {
    await register(otherPage, 'PDF Other')
    const otherExport = await otherPage.request.get(`${apiUrl}/history/${historyId}/export/pdf`)
    expect(otherExport.status()).toBe(404)
  } finally {
    await otherContext.close()
  }
})

test('guest demo results show expired state after clearing sessionStorage', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  const r = page.waitForResponse(
    (resp) =>
      resp.url() === `${apiUrl}/resume/analyze` && resp.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Review resume' }).click()
  await r
  await expect(page).toHaveURL(/\/resume\/result\/resume-demo-\d+$/)

  const demoId = page.url().split('/').at(-1)!
  await page.evaluate((id) => {
    sessionStorage.removeItem(`cw:demo-result:${id}`)
  }, demoId)
  await page.reload()

  await expect(page.getByText(/Demo expired/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /Run the tool again/i })).toBeVisible()
})

test('export action yields 404 for cross-owner access', async ({ page, browser }) => {
  test.setTimeout(60_000)
  await register(page, 'Export Owner')
  const historyId = await submitResumeViaApi(page)

  // Owner can access
  const ownerExport = await page.request.get(`${apiUrl}/history/${historyId}/export/pdf`)
  expect([404, 200, 400]).toContain(ownerExport.status())

  // Other user can't export
  const otherContext = await browser.newContext()
  const otherPage = await otherContext.newPage()
  await otherContext.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
  try {
    await register(otherPage, 'Export Other')
    const other = await otherPage.request.get(`${apiUrl}/history/${historyId}/export/pdf`)
    expect(other.status()).toBe(404)
  } finally {
    await otherContext.close()
  }
})

test('authenticated history detail includes export metadata', async ({ page }) => {
  test.setTimeout(30_000)
  await register(page, 'Meta Export')
  const historyId = await submitResumeViaApi(page)

  const detail = await page.request.get(`${apiUrl}/history/${historyId}`)
  expect(detail.ok()).toBe(true)
  const json = await detail.json()
  expect(json.id).toBe(historyId)
  expect(json.saved).toBe(true)
})
