import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

/**
 * End-to-end journeys for the #326 polish pass, covering the three
 * cross-feature flows the task calls out: CV Studio's editor loop, Discovery
 * handing off to CV Studio and Applications, and the Applications apply loop
 * (#360: the Queue merged into Applications). Runs against the same deterministic-AI backend as the rest of
 * `frontend/e2e/` (see `backend/tests/e2e_server.py`).
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
  // Preparing an application drafts from a saved CV version.
  const { id } = await created.json()
  const variant = await page.request.post(`/api/v1/cv-documents/${id}/variants`, {
    data: { name: 'Journey version', target_role: 'Engineer' },
  })
  expect(variant.ok(), await variant.text()).toBe(true)
  return email
}

test.describe('CV Studio editor loop', () => {
  test('import a CV, edit a bullet, change template and font, export a PDF', async ({ page }) => {
    await registerAndSeedCv(page, 'cv-journey')
    await gotoHydrated(page, '/cv-studio')

    // Open the role from the paper and edit a bullet on the seeded (imported) role.
    await page.getByRole('button', { name: 'Edit Experience' }).click()
    const bullet = page.getByLabel('Highlight 1 for Engineer')
    await expect(bullet).toBeVisible()
    await bullet.fill('Cut deploy time from 40 to 8 minutes.')
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 15_000 })

    // Open the design panel (the catalog lists only Classic until T6-T8) and pick Letter.
    await page.getByRole('tablist', { name: 'Studio tools' }).getByRole('tab', { name: /^Design/ }).click()
    await page.getByRole('radio', { name: 'Letter' }).check({ force: true })
    // Switch font — the fixed template/font catalog always has more than one entry.
    const fonts = page.getByRole('radiogroup', { name: 'Font' }).getByRole('radio')
    await fonts.nth(1).check({ force: true })
    await expect(fonts.nth(1)).toBeChecked()
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
    const firstCard = page.getByRole('list', { name: 'Jobs' }).getByRole('listitem').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    const jobTitle = (await firstCard.getByRole('heading').first().textContent())?.trim() ?? ''
    expect(jobTitle.length).toBeGreaterThan(0)

    await firstCard.getByRole('button', { name: /^More actions for / }).click()
    await page.getByRole('menuitem', { name: 'Tailor my CV' }).click()
    await page.waitForURL(/\/cv-studio$/)
    const dialog = page.getByRole('dialog', { name: 'Tailor to a job' })
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByLabel('Job title')).toHaveValue(jobTitle)
  })

  test('Add to applications opens a new application that can be prepared and shows on the board', async ({ page }) => {
    const email = await registerAndSeedCv(page, 'disc-adopt')
    execFileSync(pythonBin, ['-m', 'tests.seed_discovery_listings', email], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    })
    await gotoHydrated(page, '/discovery')
    const firstCard = page.getByRole('list', { name: 'Jobs' }).getByRole('listitem').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    const jobTitle = (await firstCard.getByRole('heading').first().textContent())?.trim() ?? ''

    await firstCard.getByRole('button', { name: 'Add to applications' }).click()
    // Add keeps you on Discover (consistency-F20, as on the dashboard): the row flips to "View application".
    await firstCard.getByRole('link', { name: `View application for ${jobTitle}` }).click({ timeout: 15_000 })
    await page.waitForURL(/\/campaigns\/[^/]+$/, { timeout: 15_000 })

    // Prepare drafts through the shared pipeline (deterministic AI in E2E).
    await page.getByRole('button', { name: 'Prepare application' }).click()
    await expect(page.getByRole('heading', { name: 'Ready to apply' })).toBeVisible({ timeout: 30_000 })

    await gotoHydrated(page, '/campaigns')
    const saved = page.locator('section', { has: page.getByRole('heading', { name: 'Saved', level: 2 }) })
    await expect(saved.getByText(jobTitle, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    await expect(saved.getByText('Ready to apply')).toBeVisible()
  })
})

test.describe('Applications apply loop', () => {
  test('answer the open question, apply through a safe link, mark applied, and the card moves to Applied', async ({ page }) => {
    const email = await registerAndSeedCv(page, 'apply-loop')
    execFileSync(pythonBin, ['-m', 'tests.seed_campaigns', email], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    })
    // The seed leaves exactly one prepared application with an unanswered question.
    const board = await page.request.get('/api/v1/applications')
    expect(board.ok(), await board.text()).toBe(true)
    const { items } = (await board.json()) as { items: Array<{ id: string; title: string; open_question_count: number }> }
    const target = items.find((item) => item.open_question_count > 0)
    expect(target).toBeTruthy()
    await gotoHydrated(page, `/campaigns/${target!.id}`)

    const markApplied = page.getByRole('button', { name: 'Mark as applied' })
    await expect(markApplied).toBeDisabled({ timeout: 15_000 })
    await page.getByLabel('What are your salary expectations?').fill('€80–90k')
    await page.getByRole('button', { name: 'Save answers' }).click()
    await expect(page.getByRole('heading', { name: 'Ready to apply' })).toBeVisible({ timeout: 15_000 })

    // The employer link opens in a new tab without leaking the opener; it is never followed here.
    const applyLink = page.getByRole('link', { name: /Apply on company site/ })
    await expect(applyLink).toHaveAttribute('target', '_blank')
    await expect(applyLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(await applyLink.getAttribute('href')).toMatch(/^https:\/\//)

    await markApplied.click()
    await expect(page.getByRole('heading', { name: /You applied on/ })).toBeVisible({ timeout: 15_000 })

    await gotoHydrated(page, '/campaigns')
    const applied = page.locator('section', { has: page.getByRole('heading', { name: 'Applied', level: 2 }) })
    await expect(applied.getByRole('link', { name: target!.title })).toBeVisible({ timeout: 15_000 })
  })
})
