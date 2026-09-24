/**
 * Screenshots harness: visually reviewable full-page PNGs of the
 * authenticated app, captured without a human ever logging in.
 *
 * Run with `pnpm screenshots` (see scripts/run-screenshots.mjs), not through
 * the normal e2e suite — playwright.screenshots.config.ts's `testMatch`
 * scopes it to this file alone.
 *
 * Shape: one long-running test, not one test per page. A human reviewing a
 * batch of screenshots wants every page that *could* be captured, so a
 * failure on one page (a flaky animation, a route that 500s while a flag is
 * still stabilizing) must not cost every page after it. Every navigation and
 * screenshot goes through `capturePage`, which never throws — it records a
 * 'captured' | 'failed' | 'skipped' result and moves on — and the summary is
 * written in a `finally` so a mid-run crash still leaves a readable report.
 * The test only fails outright when nothing at all was captured.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

import { uniqueEmail } from './helpers/identity'
import { STATIC_PAGES, VIEWPORTS, buildSummary, outputPath } from './screenshot-utils.mjs'
import { resolveScreenshotsEnv } from './screenshots-env.mjs'

type Viewport = 'desktop' | 'mobile'
type CaptureResult = {
  name: string
  viewport: Viewport
  status: 'captured' | 'failed' | 'skipped'
  path?: string
  error?: string
}

const env = resolveScreenshotsEnv()
const outDir = fileURLToPath(new URL('./screenshots', import.meta.url))
const password = 'Screenshots-Harness-1!'

const resumeText = `
Alex Rivera
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python
services, data pipelines, and internal platforms for distributed teams.

Experience
- Led delivery of a FastAPI service used by 40 internal teams and reduced
  request latency by 35 percent through query tuning and cache design.
- Owned PostgreSQL schema changes, migration rehearsals, monitoring, and
  incident response for a workflow processing 2 million events a month.
- Built CI pipelines that cut deployment time from 25 minutes to 8 minutes
  while preserving rollback and audit controls.
- Mentored four engineers and coordinated delivery with product, design,
  security, and support partners across three quarterly releases.

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, AWS

Education
BSc Computer Science
`.trim()

const jobDescription = `
Senior Backend Engineer (Platform)

We're hiring a backend engineer to own our FastAPI services and PostgreSQL
data layer. You'll lead schema migrations, build CI/CD pipelines, and
mentor engineers across product teams. Required: Python, FastAPI,
PostgreSQL, SQLAlchemy, Docker, and CI/CD experience. AWS a plus.
`.trim()

const cvStudioSeed = {
  name: 'Alex Morgan',
  sections: [
    {
      id: 'summary', kind: 'summary', title: 'Summary', visible: true, position: 0,
      entries: [{
        id: 'summary-1', evidence_item_id: null, position: 0,
        body: 'Backend engineer with six years of experience building reliable Python services, data pipelines, and internal platforms for distributed teams.',
      }],
    },
    {
      id: 'experience', kind: 'experience', title: 'Experience', visible: true, position: 1,
      entries: [
        {
          id: 'exp-1', evidence_item_id: null, position: 0,
          heading: 'Senior Backend Engineer', subheading: 'Northwind Labs', location: 'Berlin',
          start_date: 'Mar 2022', end_date: 'Present',
          bullets: [
            'Led the move of 14 services to FastAPI and PostgreSQL, cutting p95 latency by 38%.',
            'Built the CI/CD pipeline that took releases from weekly to several times a day.',
            'Mentored four engineers through their first on-call rotations.',
          ],
          body: 'Led the move of 14 services to FastAPI and PostgreSQL, cutting p95 latency by 38%.\nBuilt the CI/CD pipeline that took releases from weekly to several times a day.\nMentored four engineers through their first on-call rotations.',
        },
        {
          id: 'exp-2', evidence_item_id: null, position: 1,
          heading: 'Backend Engineer', subheading: 'Brightline Data', location: 'Remote',
          start_date: 'Jun 2019', end_date: 'Feb 2022',
          bullets: [
            'Designed SQLAlchemy data models for a billing platform serving 2M invoices a month.',
            'Automated schema migrations with Alembic and zero-downtime deploys on AWS.',
          ],
          body: 'Designed SQLAlchemy data models for a billing platform serving 2M invoices a month.\nAutomated schema migrations with Alembic and zero-downtime deploys on AWS.',
        },
      ],
    },
    {
      id: 'education', kind: 'education', title: 'Education', visible: true, position: 2,
      entries: [{
        id: 'edu-1', evidence_item_id: null, position: 0,
        heading: 'BSc Computer Science', subheading: 'University of Leeds', start_date: '2015', end_date: '2019',
        body: 'BSc Computer Science', bullets: [],
      }],
    },
    {
      id: 'skills', kind: 'skills', title: 'Skills', visible: true, position: 3,
      entries: [{
        id: 'skills-1', evidence_item_id: null, position: 0,
        body: 'Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, AWS, CI/CD',
      }],
    },
  ],
}

// Framer-motion `whileInView` sections (mostly on the landing page) never
// mount if the viewport never scrolls past them; a full-page screenshot
// still renders past the fold, but only after the browser has scrolled
// there once. A quick scroll-down-then-back-up is cheap insurance.
async function warmScrollAnimations(page: Page) {
  await page.mouse.wheel(0, 6000).catch(() => {})
  await page.waitForTimeout(150)
  await page.mouse.wheel(0, -6000).catch(() => {})
  await page.waitForTimeout(150)
}

async function settle(page: Page, waitForMobileShell: boolean) {
  await page
    .locator('html[data-hydrated="true"]')
    .waitFor({ timeout: 20_000 })
    .catch(() => {})
  if (waitForMobileShell) {
    // AppShell picks its mobile layout through a reactive breakpoint hook;
    // shooting immediately after navigation can catch the transient
    // desktop layout on first paint (see cv-studio-preview.spec.ts).
    await page
      .locator('.app-main--mobile')
      .first()
      .waitFor({ timeout: 5_000 })
      .catch(() => {})
  }
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  await warmScrollAnimations(page)
}

/** Screenshot whatever `page` currently shows — no navigation. */
async function shootCurrentPage(
  page: Page,
  viewport: Viewport,
  name: string,
  results: CaptureResult[],
  opts: { waitForMobileShell?: boolean } = {},
) {
  try {
    await settle(page, Boolean(opts.waitForMobileShell))
    const path = outputPath(outDir, viewport, name)
    await page.screenshot({ path, fullPage: true, animations: 'disabled', timeout: 20_000 })
    results.push({ name, viewport, status: 'captured', path })
  } catch (error) {
    results.push({ name, viewport, status: 'failed', error: describeError(error) })
  }
}

/** Navigate to `path`, then screenshot it. Never throws. */
async function capturePage(
  page: Page,
  viewport: Viewport,
  name: string,
  path: string,
  results: CaptureResult[],
  opts: { waitForMobileShell?: boolean } = {},
) {
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    results.push({ name, viewport, status: 'failed', error: describeError(error) })
    return
  }
  await shootCurrentPage(page, viewport, name, results, opts)
}

function skip(results: CaptureResult[], name: string, viewport: Viewport, reason: string) {
  results.push({ name, viewport, status: 'skipped', error: reason })
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Best-effort DB promotion to admin (there is no self-promotion HTTP path by design). */
async function tryPromoteToAdmin(page: Page, email: string): Promise<boolean> {
  try {
    execFileSync(env.pythonBin, ['-m', 'tests.promote_admin', email], {
      cwd: env.backendDir,
      env: { ...process.env, DATABASE_URL: env.databaseUrl },
      stdio: 'pipe',
    })
  } catch (error) {
    console.warn('[screenshots] admin promotion unavailable, skipping admin captures:', describeError(error))
    return false
  }

  const me = await page.request.get('/api/v1/auth/me').catch(() => null)
  if (!me || !me.ok()) return false
  const body = await me.json().catch(() => null)
  return body?.is_admin === true
}

test('capture authenticated + guest pages for visual review', async ({ page, browser }) => {
  test.setTimeout(10 * 60_000)

  await mkdir(`${outDir}/desktop`, { recursive: true })
  await mkdir(`${outDir}/mobile`, { recursive: true })

  const results: CaptureResult[] = []
  const guestPages = STATIC_PAGES.filter((p) => p.auth === 'guest')
  // resume-input and cv-studio are captured explicitly below (after the
  // resume submission and the CV Studio seed, respectively), so excluding
  // them here avoids shooting each twice.
  const userPages = STATIC_PAGES.filter(
    (p) => p.auth === 'user' && p.name !== 'resume-input' && p.name !== 'cv-studio',
  )
  let summary = buildSummary(results)

  try {
    await page.addInitScript(() => localStorage.setItem('cw-cookie-consent', 'accepted'))

    // --- Desktop guest pages -------------------------------------------------
    for (const p of guestPages) {
      await capturePage(page, 'desktop', p.name, p.path, results)
    }

    // --- Register a fresh test user via the API (shares the page's cookie jar) ---
    const email = uniqueEmail('screenshots')
    const register = await page.request.post('/api/v1/auth/register', {
      data: { email, password, full_name: 'Screenshot Harness User', tos_accepted: true },
    })
    if (!register.ok()) {
      throw new Error(`could not register the screenshots test user: ${register.status()}`)
    }
    // Confirm the session cookie actually reached the browser (same check
    // every other e2e spec uses) before relying on it for every page below.
    await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page
      .getByRole('heading', { name: 'You are already signed in' })
      .waitFor({ timeout: 10_000 })
      .catch((error) => console.warn('[screenshots] auth cookie check inconclusive:', describeError(error)))

    // Job Discovery seed: the harness DB has no ingested listings and must not
    // hit the network, so ~20 listings + confirmed skills go straight into the DB.
    try {
      execFileSync(env.pythonBin, ['-m', 'tests.seed_discovery_listings', email], {
        cwd: env.backendDir,
        env: { ...process.env, DATABASE_URL: env.databaseUrl },
        stdio: 'pipe',
      })
    } catch (error) {
      console.warn('[screenshots] discovery seed skipped (page shows its empty state):', describeError(error))
    }

    // --- Desktop authenticated pages -----------------------------------------
    for (const p of userPages) {
      await capturePage(page, 'desktop', p.name, p.path, results)
    }

    // Resume: paste-and-submit doubles as the "resume tool input" capture and
    // produces the one seeded result page the task asks for.
    let resumeResultPath: string | null = null
    try {
      await page.goto('/resume', { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await settle(page, false)
      await shootCurrentPage(page, 'desktop', 'resume-input', results)
      await page.getByRole('button', { name: 'Paste text instead' }).click()
      await page.locator('#resume-resumeText').fill(resumeText)
      await page.getByRole('button', { name: 'Review resume' }).click()
      await page.waitForURL(/\/resume\/result\/[^/]+$/, { timeout: 45_000 })
      resumeResultPath = new URL(page.url()).pathname
      await shootCurrentPage(page, 'desktop', 'resume-result', results)
    } catch (error) {
      results.push({ name: 'resume-result', viewport: 'desktop', status: 'failed', error: describeError(error) })
    }

    // Job Match seed: any successful run creates a workspace ("campaign") —
    // this is the cheapest way to get a real campaign detail page to shoot.
    let campaignPath: string | null = null
    try {
      const matched = await page.request.post('/api/v1/job-match/match', {
        data: { resume_text: resumeText, job_description: jobDescription },
      })
      if (!matched.ok()) throw new Error(`job-match seed returned ${matched.status()}`)
      const workspaces = await page.request.get('/api/v1/history/workspaces')
      if (!workspaces.ok()) throw new Error(`workspace list returned ${workspaces.status()}`)
      const { items } = await workspaces.json()
      const campaignId = items?.[0]?.id
      if (campaignId) campaignPath = `/campaigns/${campaignId}`
    } catch (error) {
      console.warn('[screenshots] campaign seed skipped:', describeError(error))
    }

    // CV Studio seed: structured entries + a non-default style so the editor,
    // design gallery and live paper preview all have something real to show.
    try {
      const created = await page.request.post('/api/v1/cv-documents', { data: cvStudioSeed })
      if (!created.ok()) throw new Error(`cv-document seed returned ${created.status()}`)
      const { id } = await created.json()
      const styled = await page.request.patch(`/api/v1/cv-documents/${id}`, {
        data: {
          style: {
            template_id: 'professional-editorial', font_id: 'pt-serif', accent_color: '#075985',
            density: 'normal', ats_mode: false,
          },
        },
      })
      if (!styled.ok()) throw new Error(`cv-document style seed returned ${styled.status()}`)
      await page.request.post(`/api/v1/cv-documents/${id}/variants`, {
        data: { name: 'Platform roles', target_role: 'Senior Backend Engineer' },
      })
    } catch (error) {
      console.warn('[screenshots] cv-studio seed skipped (page still renders its empty state):', describeError(error))
    }
    await capturePage(page, 'desktop', 'cv-studio', '/cv-studio', results)

    if (campaignPath) {
      await capturePage(page, 'desktop', 'campaign-detail', campaignPath, results)
    } else {
      skip(results, 'campaign-detail', 'desktop', 'no workspace/campaign could be seeded')
    }

    // Admin: no self-promotion HTTP path exists by design (D-048), so this is
    // the "cheaply via DB" branch the task allows; skip (not fail) otherwise.
    const isAdmin = await tryPromoteToAdmin(page, email)
    if (isAdmin) {
      await capturePage(page, 'desktop', 'admin', '/admin', results)
    } else {
      skip(results, 'admin', 'desktop', 'user could not be promoted to admin')
    }

    const storageState = await page.context().storageState()

    // --- Mobile guest pages (fresh, unauthenticated context) -----------------
    const mobileGuestContext = await browser.newContext({
      viewport: VIEWPORTS.mobile,
      reducedMotion: 'reduce',
    })
    try {
      const mobileGuestPage = await mobileGuestContext.newPage()
      await mobileGuestPage.addInitScript(() => localStorage.setItem('cw-cookie-consent', 'accepted'))
      for (const p of guestPages) {
        await capturePage(mobileGuestPage, 'mobile', p.name, p.path, results)
      }
    } finally {
      await mobileGuestContext.close()
    }

    // --- Mobile authenticated pages (reuses the session from above) ----------
    const mobileContext = await browser.newContext({
      viewport: VIEWPORTS.mobile,
      reducedMotion: 'reduce',
      storageState,
    })
    try {
      const mobilePage = await mobileContext.newPage()
      await mobilePage.addInitScript(() => localStorage.setItem('cw-cookie-consent', 'accepted'))

      for (const p of userPages) {
        await capturePage(mobilePage, 'mobile', p.name, p.path, results, { waitForMobileShell: true })
      }
      await capturePage(mobilePage, 'mobile', 'resume-input', '/resume', results, { waitForMobileShell: true })

      if (resumeResultPath) {
        await capturePage(mobilePage, 'mobile', 'resume-result', resumeResultPath, results, {
          waitForMobileShell: true,
        })
      } else {
        skip(results, 'resume-result', 'mobile', 'desktop seed did not produce a result page')
      }

      if (campaignPath) {
        await capturePage(mobilePage, 'mobile', 'campaign-detail', campaignPath, results, {
          waitForMobileShell: true,
        })
      } else {
        skip(results, 'campaign-detail', 'mobile', 'no workspace/campaign could be seeded')
      }

      await capturePage(mobilePage, 'mobile', 'cv-studio', '/cv-studio', results, { waitForMobileShell: true })

      if (isAdmin) {
        await capturePage(mobilePage, 'mobile', 'admin', '/admin', results, { waitForMobileShell: true })
      } else {
        skip(results, 'admin', 'mobile', 'user could not be promoted to admin')
      }
    } finally {
      await mobileContext.close()
    }
  } finally {
    summary = buildSummary(results)
    await writeFile(`${outDir}/summary.json`, JSON.stringify(summary, null, 2))
    console.log(
      `[screenshots] captured ${summary.capturedCount}, failed ${summary.failedCount}, skipped ${summary.skippedCount} (of ${summary.total})`,
    )
    if (summary.failed.length > 0) {
      console.log('[screenshots] failed pages:', summary.failed.map((f) => `${f.name}/${f.viewport}`).join(', '))
    }
  }

  expect(summary.capturedCount, 'the harness must capture at least one page').toBeGreaterThan(0)
})
