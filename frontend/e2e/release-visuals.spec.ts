import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

/** Production-ready geometry and screenshot coverage; fake external AI only. */
test('release visual matrix: core pages, six results and result sections at six widths', async ({ page }) => {
  test.setTimeout(600_000)
  const output = fileURLToPath(new URL('./screenshots/release-matrix/', import.meta.url))
  await mkdir(output, { recursive: true })
  await page.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
    localStorage.setItem('cw:onboarding', JSON.stringify({ completed: true }))
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const email = uniqueEmail('release-visual')
  const registered = await page.request.post('/api/v1/auth/register', {
    data: { email, password: 'Readiness-test-123!', full_name: 'Alex Rivera', tos_accepted: true },
  })
  expect(registered.ok(), await registered.text()).toBe(true)
  const resume = 'Alex Rivera. Backend Engineer. Experience: Built Python and PostgreSQL APIs at Acme, reduced latency by 35 percent. Mentored four engineers. Skills: Python, React, TypeScript, Docker, AWS, SQL. Education: BSc Computer Science.'
  const job = 'Acme is hiring a Senior Backend Engineer. Requirements: Python, PostgreSQL, Docker and AWS. Build reliable APIs, own migrations, mentor engineers and collaborate with product teams. The role is remote in Europe.'
  const routes: Array<{ name: string; path: string }> = [
    ...['dashboard', 'resume', 'job-match', 'career', 'cover-letter', 'interview', 'portfolio',
      'history', 'settings', 'account', 'cv-studio', 'profile', 'discovery', 'campaigns',
      'privacy', 'terms', 'cookies', 'imprint', 'reset-password', 'this-page-does-not-exist']
      .map((name) => ({ name, path: `/${name}` })),
  ]
  for (const [tool, endpoint] of [
    ['resume', 'resume/analyze'], ['job-match', 'job-match/match'], ['career', 'career/recommend'],
    ['cover-letter', 'cover-letter/generate'], ['interview', 'interview/questions'], ['portfolio', 'portfolio/recommend'],
  ]) {
    const response = await page.request.post(`/api/v1/${endpoint}`, {
      data: { resume_text: resume, job_description: job, target_role: 'Senior Backend Engineer' },
    })
    expect(response.ok(), `${tool}: ${await response.text()}`).toBe(true)
    const result = await response.json()
    routes.push({ name: `${tool}-result`, path: `/${tool}/result/${result.history_id}` })
  }
  const created = await page.request.post('/api/v1/cv-documents', { data: {
    name: 'Primary CV', header: { name: 'Alex Rivera', email: 'alex@example.com' },
    sections: [{ id: 'experience', kind: 'experience', title: 'Experience', visible: true, position: 0,
      entries: [{ id: 'engineer', evidence_item_id: null, body: 'Built Python APIs', heading: 'Backend Engineer', subheading: 'Acme',
        bullets: ['Reduced latency by 35 percent'], position: 0 }] }],
  } })
  expect(created.ok(), await created.text()).toBe(true)
  const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url))
  execFileSync(process.env.E2E_PYTHON ?? 'python3', ['-m', 'tests.seed_discovery_listings', email], {
    cwd: backendDir, env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe',
  })
  execFileSync(process.env.E2E_PYTHON ?? 'python3', ['-m', 'tests.seed_campaigns', email], {
    cwd: backendDir, env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe',
  })
  const apps = await (await page.request.get('/api/v1/applications')).json()
  if (apps.items[0]) routes.push({ name: 'application-detail', path: `/campaigns/${apps.items[0].id}` })
  const captures: Array<{ route: string; width: number; file: string }> = []
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of routes) {
      await page.goto(route.path)
      await page.locator('html[data-hydrated="true"]').waitFor()
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect.soft(overflow, `${route.path} at ${width}px`).toBeLessThanOrEqual(1)
      const file = `${output}/${width}-${route.name}.png`
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
      captures.push({ route: route.path, width, file })
      if (route.name.endsWith('-result') && [390, 1440].includes(width)) {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const links = page.getByRole('navigation', { name: 'On this page' }).getByRole('link')
        expect(await links.count(), `${route.name} result navigation`).toBeGreaterThan(0)
        for (let i = 0; i < await links.count(); i++) {
          const link = links.nth(i)
          const href = await link.getAttribute('href')
          expect(href).toMatch(/^#/)
          await link.click()
          await expect(page.locator(href!)).toBeInViewport()
          const sectionFile = `${output}/${width}-${route.name}-section-${i}.png`
          await page.screenshot({ path: sectionFile, animations: 'disabled' })
          captures.push({ route: `${route.path}${href}`, width, file: sectionFile })
        }
        await page.emulateMedia({ reducedMotion: 'no-preference' })
      }
    }
  }
  await writeFile(`${output}/manifest.json`, JSON.stringify({ captures, pageErrors: errors }, null, 2))
  expect(errors).toEqual([])
})
