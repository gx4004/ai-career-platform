import { expect, test, type Page } from '@playwright/test'

/**
 * R3 #77(d) — sensitive browser storage must actually be empty after sign-out.
 *
 * The existing coverage (`lib/privacy/__tests__/browserData.test.ts`,
 * `components/auth/__tests__/AuthDialog.test.tsx`) runs in jsdom and *mocks*
 * `clearSensitiveBrowserData`, so it proves the function is called — not that a
 * real browser's sessionStorage ends up empty. Anything between the call and the
 * storage (a key renamed in one place, a store added without a clear hook, a
 * write racing the clear) would pass every existing test.
 *
 * So this asserts on real storage in a real browser: populate it by using the
 * product, sign out, and read the keys back.
 */

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

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, Docker, CI/CD, AWS
`.trim()

const SENSITIVE_KEY_PREFIXES = [
  'career-workbench:draft:',
  'career-workbench:workflow-context',
  'cw:demo-result:',
  'cw:resume-carry',
]

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

function readSessionStorage(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key) ?? '']),
    ),
  )
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
})

test('signing out empties sensitive session storage in a real browser', async ({ page }) => {
  test.setTimeout(90_000)
  await register(page, 'Privacy Clear')
  await runResumeAnalyzer(page)

  // Guard the guard: if the run stored nothing, the post-logout assertion would
  // pass against an already-empty store and prove nothing.
  const before = await readSessionStorage(page)
  const populated = Object.keys(before).filter((key) =>
    SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
  )
  expect(
    populated.length,
    `expected the resume run to populate sensitive session storage, saw keys: ${Object.keys(before).join(', ')}`,
  ).toBeGreaterThan(0)
  expect(JSON.stringify(before)).toContain('Jordan Rivera')

  await gotoHydrated(page, '/account')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)

  const after = await readSessionStorage(page)
  const leftBehind = Object.keys(after).filter((key) =>
    SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
  )

  expect(leftBehind, 'sensitive keys survived sign-out').toEqual([])
  // The residue check matters independently: a key could be cleared while the
  // same content lingers under a name this list does not know about.
  expect(JSON.stringify(after)).not.toContain('Jordan Rivera')
})

test('signing out preserves the cookie-consent choice', async ({ page }) => {
  test.setTimeout(60_000)
  await register(page, 'Privacy Consent')

  await gotoHydrated(page, '/account')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)

  // Consent is a user preference, not session data. Clearing it would re-prompt
  // every returning visitor and quietly discard a recorded choice.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('cw-cookie-consent')))
    .toBe('accepted')
})
