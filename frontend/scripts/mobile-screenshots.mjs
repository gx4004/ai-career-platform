import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = path.resolve(process.cwd(), '.codex-previews/mobile')

const widths = [375, 414, 768]

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
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    for (const w of widths) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 812 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: w < 600,
      })
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('cw-cookie-consent', 'accepted')
        } catch {
          /* ignore */
        }
      })
      const page = await ctx.newPage()
      for (const [name, url] of routes) {
        try {
          await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 15000 })
        } catch {
          await page.goto(BASE + url, { timeout: 15000 })
        }
        await page.waitForTimeout(300)
        const out = path.join(OUT, `${name}-${w}.png`)
        await page.screenshot({ path: out, fullPage: true })
        console.log(`✔ ${name}-${w}.png`)
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
