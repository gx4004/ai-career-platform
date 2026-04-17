import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

const routes = [
  '/',
  '/login',
  '/dashboard',
  '/resume',
  '/job-match',
  '/cover-letter',
  '/interview',
  '/career',
  '/portfolio',
  '/history',
  '/account',
  '/settings',
  '/imprint',
  '/privacy',
  '/terms',
  '/cookies',
]

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const ctx = await browser.newContext({
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    })
    const page = await ctx.newPage()
    let failures = 0
    for (const route of routes) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 15000 })
      } catch {
        await page.goto(BASE + route, { timeout: 15000 })
      }
      await page.waitForTimeout(200)
      const result = await page.evaluate(() => {
        const b = document.body
        const de = document.documentElement
        return {
          scrollWidth: Math.max(b.scrollWidth, de.scrollWidth),
          clientWidth: Math.max(b.clientWidth, de.clientWidth),
        }
      })
      const overflow = result.scrollWidth - result.clientWidth
      const status = overflow > 1 ? 'OVERFLOW' : 'ok'
      if (overflow > 1) failures++
      console.log(`${status.padEnd(9)} ${route.padEnd(20)} sw=${result.scrollWidth} cw=${result.clientWidth} (+${overflow})`)
    }
    await ctx.close()
    if (failures > 0) {
      console.log(`\n${failures} route(s) overflow at 320px`)
      process.exit(2)
    } else {
      console.log('\nAll routes fit within 320px viewport')
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
