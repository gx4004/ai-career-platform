import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const ARTIFACT = path.resolve(process.cwd(), '.codex-previews/axe-report.json')
const ONLY_BLOCKERS = process.env.BLOCKERS_ONLY !== '0'

const routes = [
  ['home', '/'],
  ['login', '/login'],
  ['dashboard', '/dashboard'],
  ['resume', '/resume'],
  ['job-match', '/job-match'],
  ['cover-letter', '/cover-letter'],
  ['interview', '/interview'],
  ['career', '/career'],
  ['portfolio', '/portfolio'],
  ['history', '/history'],
  ['account', '/account'],
  ['settings', '/settings'],
  ['imprint', '/imprint'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['cookies', '/cookies'],
  ['reset-password', '/reset-password'],
  ['admin', '/admin'],
]

async function main() {
  await mkdir(path.dirname(ARTIFACT), { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome' })
  const report = []
  let blocker = false
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('cw-cookie-consent', 'accepted')
      } catch {}
    })
    const page = await ctx.newPage()

    for (const [name, url] of routes) {
      try {
        await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 15000 })
      } catch {
        await page.goto(BASE + url, { timeout: 15000 })
      }
      await page.waitForTimeout(300)
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const shown = ONLY_BLOCKERS
        ? result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
        : result.violations
      const blockers = result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
      if (blockers.length > 0) blocker = true

      report.push({
        route: url,
        name,
        total: result.violations.length,
        blockers: blockers.length,
        violations: shown.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.slice(0, 5).map((n) => ({
            html: n.html.slice(0, 200),
            target: n.target,
            failureSummary: n.failureSummary?.slice(0, 220),
          })),
        })),
      })

      const emoji = blockers.length === 0 ? (result.violations.length === 0 ? '✓' : '·') : '✗'
      console.log(
        `${emoji} ${name.padEnd(18)} total=${String(result.violations.length).padStart(2)} blockers=${blockers.length}`,
      )
      for (const v of blockers) {
        console.log(`    [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`)
      }
    }
    await ctx.close()
  } finally {
    await browser.close()
  }
  await writeFile(ARTIFACT, JSON.stringify(report, null, 2))
  console.log(`\nReport → ${ARTIFACT}`)
  if (blocker) {
    console.log('\nBlockers (critical/serious) found — exit 2')
    process.exit(2)
  } else {
    console.log('\nNo critical/serious violations.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
