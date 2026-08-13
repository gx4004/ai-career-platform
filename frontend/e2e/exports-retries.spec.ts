import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

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
const jobDescription = `
Senior Backend Engineer

Build Python and FastAPI services backed by PostgreSQL. Improve reliability,
mentor engineers, and deliver measurable production outcomes.
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
  await expect(
    page.getByRole('heading', { name: 'You are already signed in' }),
  ).toBeVisible({ timeout: 15_000 })
  return email
}

async function submitCoverLetter(page: Page): Promise<string> {
  await gotoHydrated(page, '/cover-letter')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#cover-letter-resumeText').fill(resumeText)
  await page.locator('#cover-letter-jobDescription').fill(jobDescription)
  await page.getByRole('button', { name: 'Draft cover letter' }).click()
  await expect(page).toHaveURL(/\/cover-letter\/result\/[^/]+$/)
  return page.url().split('/').at(-1)!
}

async function submitInterview(page: Page): Promise<string> {
  await gotoHydrated(page, '/interview')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#interview-resumeText').fill(resumeText)
  await page.locator('#interview-jobDescription').fill(jobDescription)
  await page.getByRole('button', { name: 'Build interview prep' }).click()
  await expect(page).toHaveURL(/\/interview\/result\/[^/]+$/)
  return page.url().split('/').at(-1)!
}

async function readDownloadedPdfText(page: Page): Promise<{
  filename: string
  text: string
}> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByTitle('Export PDF').click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))

  const pdf = await getDocument({
    data: new Uint8Array(Buffer.concat(chunks)),
  }).promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber)
    const content = await pdfPage.getTextContent()
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '),
    )
  }

  return { filename: download.suggestedFilename(), text: pages.join(' ') }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
})

test('owner Cover Letter PDF download contains the generated fixture content', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'PDF Owner')
  const historyId = await submitCoverLetter(page)

  const detail = await page.request.get(`${apiUrl}/history/${historyId}`)
  expect(detail.ok()).toBe(true)
  const expectedOpening = (await detail.json()).result_payload.opening.text as string

  const pdf = await readDownloadedPdfText(page)
  expect(pdf.filename).toBe(`result-${historyId}.pdf`)
  expect(pdf.text).toContain('Cover Letter')
  expect(normalizeWhitespace(pdf.text)).toContain(normalizeWhitespace(expectedOpening))
})

test('owner Interview PDF download contains the generated fixture content', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'PDF Interview')
  const historyId = await submitInterview(page)

  const detail = await page.request.get(`${apiUrl}/history/${historyId}`)
  expect(detail.ok()).toBe(true)
  const expectedQuestion = (await detail.json()).result_payload.questions[0].question as string

  const pdf = await readDownloadedPdfText(page)
  expect(pdf.filename).toBe(`result-${historyId}.pdf`)
  expect(pdf.text).toContain('Interview Q&A')
  expect(normalizeWhitespace(pdf.text)).toContain(normalizeWhitespace(expectedQuestion))
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

test('PDF export returns 404 for cross-owner access', async ({ page, browser }) => {
  test.setTimeout(60_000)
  await register(page, 'Export Owner')
  const historyId = await submitCoverLetter(page)

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

test('retry recovers from a transient request failure without duplicating the run', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'Retry Run')
  let attempts = 0
  await page.route(`${apiUrl}/resume/analyze`, async (route) => {
    attempts += 1
    if (attempts <= 2) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Temporary service issue. Please try again.' }),
      })
      return
    }
    await route.continue()
  })

  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  await page.getByRole('button', { name: 'Review resume' }).click()
  await expect(page.getByText('Temporary service issue. Please try again.')).toBeVisible()

  await page.getByRole('button', { name: 'Review resume' }).click()
  await expect(page).toHaveURL(/\/resume\/result\/[^/]+$/)
  expect(attempts).toBe(3)

  await gotoHydrated(page, '/history')
  const totalRuns = page.locator('.h-stat-card').filter({ hasText: 'Total Runs' })
  await expect(totalRuns).toContainText('1')
})

test('malformed success responses explain that the service returned an unexpected result', async ({
  page,
}) => {
  await page.route(`${apiUrl}/resume/analyze`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    }),
  )

  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  await page.getByRole('button', { name: 'Review resume' }).click()

  await expect(page.getByText('Server returned an unexpected response')).toBeVisible()
})

test('terminal validation failures show a safe actionable message', async ({ page }) => {
  await page.route(`${apiUrl}/resume/analyze`, (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Check the resume text and try again.' }),
    }),
  )

  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  await page.getByRole('button', { name: 'Review resume' }).click()

  await expect(page.getByText('Check the resume text and try again.')).toBeVisible()
  await expect(page.getByText(/Vertex|Gemini|provider/i)).toHaveCount(0)
})
