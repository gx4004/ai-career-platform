import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const apiUrl = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8000'}/api/v1`
const password = 'correct-horse-battery-staple'
const resumeText = `
Morgan Chen
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python services.

Experience
- Led delivery of a FastAPI service used by 40 teams and reduced latency by 35 percent.
- Owned PostgreSQL migrations, monitoring, and incident response for a production workflow.
- Built CI pipelines that cut deployment time from 25 minutes to 8 minutes.
- Mentored four engineers across three quarterly releases.

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, Docker, CI/CD, AWS
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

async function signIn(page: Page, email: string) {
  await gotoHydrated(page, '/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'You are already signed in' })).toBeVisible()
}

async function submitResume(page: Page) {
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
  const payload = (await response.json()) as {
    history_id: string
    saved: boolean
    access_mode: string
  }
  expect(payload.saved).toBe(true)
  expect(payload.access_mode).toBe('authenticated')
  expect(payload.history_id).toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`/resume/result/${payload.history_id}$`))
  return payload.history_id
}

async function expectNoAuthTokensInStorage(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index) || ''
        return [key, localStorage.getItem(key)]
      }),
    ),
    session: Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index) || ''
        return [key, sessionStorage.getItem(key)]
      }),
    ),
  }))
  for (const [key, value] of Object.entries({ ...storage.local, ...storage.session })) {
    expect(key).not.toMatch(/(?:auth|access|refresh)[_-]?token/i)
    expect(value).not.toMatch(/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/)
  }
}

async function closeContexts(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close()))
}

test('cookie auth persists owner runs and isolates every protected run and workspace action', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const ownerContext = await browser.newContext()
  const otherContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  const otherPage = await otherContext.newPage()

  try {
    const ownerEmail = await register(ownerPage, 'R2 Owner')

    const cookies = await ownerContext.cookies()
    const accessCookie = cookies.find((cookie) => cookie.name === 'cw_access')
    const refreshCookie = cookies.find((cookie) => cookie.name === 'cw_refresh')
    expect(accessCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api' })
    expect(refreshCookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api/v1/auth/refresh',
    })
    await expectNoAuthTokensInStorage(ownerPage)

    const historyId = await submitResume(ownerPage)
    const ownerWorkspaces = await ownerPage.request.get(`${apiUrl}/history/workspaces`)
    expect(ownerWorkspaces.ok()).toBe(true)
    const workspacePayload = (await ownerWorkspaces.json()) as {
      items: Array<{ id: string; linked_run_ids: string[] }>
    }
    expect(workspacePayload.items).toHaveLength(1)
    expect(workspacePayload.items[0].linked_run_ids).toContain(historyId)
    const workspaceId = workspacePayload.items[0].id

    await gotoHydrated(ownerPage, '/account')
    await ownerPage.getByRole('button', { name: 'Sign out' }).click()
    await expect(ownerPage.getByRole('link', { name: 'Sign in' })).toBeVisible()
    expect((await ownerContext.cookies(apiUrl)).some((cookie) => cookie.name === 'cw_access')).toBe(
      false,
    )

    await signIn(ownerPage, ownerEmail)
    await gotoHydrated(ownerPage, `/resume/result/${historyId}`)
    await expect(ownerPage.locator('.result-hero')).toBeVisible()
    await expectNoAuthTokensInStorage(ownerPage)

    await register(otherPage, 'R2 Other')
    const otherHistory = await otherPage.request.get(`${apiUrl}/history?page=1&page_size=100`)
    expect(otherHistory.ok()).toBe(true)
    expect(await otherHistory.json()).toMatchObject({ items: [], total: 0 })

    const protectedAttempts = [
      otherPage.request.get(`${apiUrl}/history/${historyId}`),
      otherPage.request.patch(`${apiUrl}/history/${historyId}/favorite`, {
        data: { is_favorite: true },
      }),
      otherPage.request.patch(`${apiUrl}/history/${historyId}`, {
        data: { label: 'Stolen run' },
      }),
      otherPage.request.get(`${apiUrl}/history/${historyId}/export/pdf`),
      otherPage.request.delete(`${apiUrl}/history/${historyId}`),
      otherPage.request.patch(`${apiUrl}/history/workspaces/${workspaceId}`, {
        data: { label: 'Stolen workspace', is_pinned: true },
      }),
    ]
    for (const response of await Promise.all(protectedAttempts)) {
      expect(response.status()).toBe(404)
    }

    const ownerRun = await ownerPage.request.get(`${apiUrl}/history/${historyId}`)
    expect(ownerRun.ok()).toBe(true)
    const ownerWorkspace = await ownerPage.request.get(`${apiUrl}/history/workspaces`)
    expect(ownerWorkspace.ok()).toBe(true)
    expect(await ownerWorkspace.json()).toMatchObject({
      items: [{ id: workspaceId }],
      total: 1,
    })
  } finally {
    await closeContexts(ownerContext, otherContext)
  }
})

test('invalid optional auth downgrades tool execution but never protected history', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await context.addCookies([
      {
        name: 'cw_access',
        value: 'not-a-valid-jwt',
        domain: '127.0.0.1',
        path: '/api',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])

    const toolResponse = await page.request.post(`${apiUrl}/resume/analyze`, {
      data: { resume_text: resumeText },
    })
    expect(toolResponse.ok()).toBe(true)
    expect(await toolResponse.json()).toMatchObject({
      history_id: null,
      saved: false,
      access_mode: 'guest_demo',
    })

    const protectedResponse = await page.request.get(`${apiUrl}/history`)
    expect(protectedResponse.status()).toBe(401)
  } finally {
    await context.close()
  }
})
