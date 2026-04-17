import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const MIN = 44

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
  '/reset-password',
]

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('cw-cookie-consent', 'accepted')
      } catch {}
    })
    const page = await ctx.newPage()
    const report = []
    for (const route of routes) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 15000 })
      } catch {
        await page.goto(BASE + route, { timeout: 15000 })
      }
      await page.waitForTimeout(300)
      const findings = await page.evaluate((min) => {
        const selector = 'button, a[href], [role="button"], [role="link"], [role="tab"], input[type="button"], input[type="submit"], label[for], summary, [tabindex]:not([tabindex="-1"])'
        const results = []
        const els = document.querySelectorAll(selector)
        for (const el of els) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          if (r.width < min || r.height < min) {
            const visibleText = (el.textContent || '').trim().slice(0, 40)
            const aria = el.getAttribute('aria-label') || ''
            const klass = el.className?.toString?.() || ''
            const cssPath = (() => {
              const parts = []
              let n = el
              for (let i = 0; i < 3 && n && n.nodeType === 1; i++, n = n.parentElement) {
                const t = n.tagName.toLowerCase()
                const c = n.className?.toString?.().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
                parts.unshift(c ? `${t}.${c}` : t)
              }
              return parts.join(' > ')
            })()
            results.push({
              tag: el.tagName,
              label: visibleText || aria,
              classes: klass.slice(0, 100),
              path: cssPath,
              w: Math.round(r.width),
              h: Math.round(r.height),
            })
          }
        }
        return results
      }, MIN)

      if (findings.length > 0) {
        report.push({ route, findings })
        console.log(`\n${route} — ${findings.length} small target(s):`)
        for (const f of findings.slice(0, 10)) {
          console.log(`  ${f.w}×${f.h}  <${f.tag.toLowerCase()}> "${f.label}"  [${f.path}]`)
        }
        if (findings.length > 10) console.log(`  …and ${findings.length - 10} more`)
      } else {
        console.log(`${route} — ok`)
      }
    }
    await ctx.close()
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
