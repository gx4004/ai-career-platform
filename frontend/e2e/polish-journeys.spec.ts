import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

/**
 * End-to-end journeys for the #326 polish pass, covering the three
 * cross-feature flows the task calls out: CV Studio's editor loop, Discovery
 * handing off to CV Studio and Campaigns, and the Queue's approve-to-apply
 * loop. Runs against the same deterministic-AI backend as the rest of
 * `frontend/e2e/` (see `backend/tests/e2e_server.py`); `playwright.config.ts`
 * turns on every R11-R15 outcome flag so CV Studio, Discovery, Campaigns and
 * Queue are all reachable here.
 */

const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url))
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg2://cw:cw@127.0.0.1:55432/cw_e2e'
const pythonBin = process.env.E2E_PYTHON ?? 'python3'

const SECTIONS = [
  {
    id: 'sec-summary',
    kind: 'summary',
    title: 'Summary',
    visible: true,
    position: 0,
    entries: [{ id: 'ent-summary', evidence_item_id: null, position: 0, body: 'Backend engineer with six years of experience.' }],
  },
  {
    id: 'sec-exp',
    kind: 'experience',
    title: 'Experience',
    visible: true,
    position: 1,
    entries: [
      {
        id: 'ent-role',
        evidence_item_id: null,
        position: 0,
        heading: 'Engineer',
        subheading: 'Example Ltd',
        start_date: '2020',
        end_date: 'Present',
        bullets: ['Shipped the thing.'],
        body: 'Shipped the thing.',
      },
    ],
  },
]

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('html[data-hydrated="true"]').waitFor({ timeout: 15_000 })
}

async function registerAndSeedCv(page: Page, prefix: string) {
  await page.addInitScript(() => localStorage.setItem('cw-cookie-consent', 'accepted'))
  const email = uniqueEmail(prefix)
  const registered = await page.request.post('/api/v1/auth/register', {
    data: { email, password: 'Password123!', full_name: 'Journey Tester', tos_accepted: true },
  })
  expect(registered.ok(), await registered.text()).toBe(true)
  const created = await page.request.post('/api/v1/cv-documents', {
    data: { name: 'Journey CV', sections: SECTIONS },
  })
  expect(created.ok(), await created.text()).toBe(true)
  return email
}

test.describe('CV Studio editor loop', () => {
  test('import a CV, edit a bullet, change template and font, export a PDF', async ({ page }) => {
    await registerAndSeedCv(page, 'cv-journey')
    await gotoHydrated(page, '/cv-studio')

    // Edit a bullet on the seeded (imported) role.
    const bullet = page.getByLabel('Highlight 1 for Engineer')
    await expect(bullet).toBeVisible()
    await bullet.fill('Cut deploy time from 40 to 8 minutes.')
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 15_000 })

    // Switch template.
    await page.locator('#cvs-tab-design').click()
    await page.getByRole('radio', { name: /Modern Two-Column/ }).check({ force: true })
    // Switch font — the fixed template/font catalog always has more than one entry.
    const fontRadios = page.locator('.cvs-font input[type="radio"]')
    await expect(fontRadios.nth(1)).toBeAttached()
    await fontRadios.nth(1).check({ force: true })
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 15_000 })

    // Export PDF — disabled while dirty, so the prior "Saved" wait matters.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
  })
})

test.describe('Discovery hand-offs', () => {
  test('Tailor my CV opens the CV Studio tailor dialog prefilled', async ({ page }) => {
    const email = await registerAndSeedCv(page, 'disc-tailor')
    execFileSync(pythonBin, ['-m', 'tests.seed_discovery_listings', email], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    })
    await gotoHydrated(page, '/discovery')
    const firstCard = page.locator('.disc-card').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    const jobTitle = (await firstCard.locator('h3, .disc-card__title').first().textContent())?.trim() ?? ''
    expect(jobTitle.length).toBeGreaterThan(0)

    await firstCard.getByRole('button', { name: 'Tailor my CV' }).click()
    await page.waitForURL(/\/cv-studio$/)
    const dialog = page.getByRole('dialog', { name: 'Tailor to a job' })
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByLabel('Job title')).toHaveValue(jobTitle)
  })

  test('Add to campaign creates a campaign that appears on /campaigns', async ({ page }) => {
    const email = await registerAndSeedCv(page, 'disc-adopt')
    execFileSync(pythonBin, ['-m', 'tests.seed_discovery_listings', email], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    })
    await gotoHydrated(page, '/discovery')
    const firstCard = page.locator('.disc-card').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    const jobTitle = (await firstCard.locator('h3, .disc-card__title').first().textContent())?.trim() ?? ''

    await firstCard.getByRole('button', { name: 'Add to campaign' }).click()
    await page.waitForURL(/\/campaigns\/[^/]+$/, { timeout: 15_000 })

    await gotoHydrated(page, '/campaigns')
    await expect(page.getByText(jobTitle, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Queue approve-to-apply loop', () => {
  test('an approved application has a safe apply link and can be marked applied', async ({ page }) => {
    const email = await registerAndSeedCv(page, 'queue-apply')
    execFileSync(pythonBin, ['-m', 'tests.seed_queue_packets', email], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    })
    await gotoHydrated(page, '/queue')

    // The seed leaves exactly one approved-and-not-yet-applied packet — it's
    // the only card with a live "Mark as applied" action. Re-locating this
    // card by heading text (rather than keeping the "has: Mark as applied"
    // filter live) matters: that filter stops matching anything the moment
    // the button it looks for is gone, which is the very state the
    // post-click assertions need to inspect.
    const approvedCardByAction = page.locator('.queue-card', { has: page.getByRole('button', { name: 'Mark as applied' }) })
    await expect(approvedCardByAction).toBeVisible({ timeout: 15_000 })
    const heading = (await approvedCardByAction.locator('h3').first().textContent())?.trim() ?? ''
    expect(heading.length).toBeGreaterThan(0)
    const approvedCard = page.locator('.queue-card', { hasText: heading })

    const applyLink = approvedCard.getByRole('link', { name: /Apply on company site/ })
    await expect(applyLink).toBeVisible()
    await expect(applyLink).toHaveAttribute('target', '_blank')
    await expect(applyLink).toHaveAttribute('rel', 'noopener noreferrer')
    const href = await applyLink.getAttribute('href')
    expect(href).toBeTruthy()
    expect(href).not.toBe('#')

    await approvedCard.getByRole('button', { name: 'Mark as applied' }).click()
    await expect(approvedCard.getByText('Applied', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(approvedCard.getByRole('button', { name: 'Mark as applied' })).toHaveCount(0)
  })
})
