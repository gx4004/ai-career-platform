import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const representativeRoutes = [
  '/',
  '/login',
  '/dashboard',
  '/resume',
  '/career',
  '/cover-letter',
  '/interview',
  '/job-match',
  '/portfolio',
  '/settings',
]

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('html[data-hydrated="true"]').waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
}

// ── Axe automated scans ──

test('routes batch A have no critical axe violations', async ({ page }) => {
  test.setTimeout(90_000)
  const routes = representativeRoutes.slice(0, 5)
  for (const path of routes) {
    await gotoHydrated(page, path)
    const results = await new AxeBuilder({ page }).analyze()
    const critical = results.violations.filter((v) => v.impact === 'critical')
    expect(critical, `${path}: ${JSON.stringify(critical, null, 2)}`).toEqual([])
  }
})

test('routes batch B have no critical axe violations', async ({ page }) => {
  test.setTimeout(90_000)
  const routes = representativeRoutes.slice(5)
  for (const path of routes) {
    await gotoHydrated(page, path)
    const results = await new AxeBuilder({ page }).analyze()
    const critical = results.violations.filter((v) => v.impact === 'critical')
    expect(critical, `${path}: ${JSON.stringify(critical, null, 2)}`).toEqual([])
  }
})

// ── Mobile overflow ──

for (const width of [320, 375]) {
  test(`${width}px routes have no blocking horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })

    for (const path of representativeRoutes) {
      await gotoHydrated(page, path)
      const layout = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }))

      expect(
        layout.documentWidth,
        `${path} is ${layout.documentWidth - layout.viewportWidth}px wider than ${width}px`,
      ).toBeLessThanOrEqual(layout.viewportWidth)
    }
  })
}

// ── Keyboard navigation ──

test('keyboard-navigable pages keep a visible focus ring', async ({ page }) => {
  const focusableRoutes = ['/', '/login', '/dashboard', '/resume', '/settings']

  for (const path of focusableRoutes) {
    await gotoHydrated(page, path)
    await page.keyboard.press('Tab')

    const focus = await page.evaluate(() => {
      const element = document.activeElement
      if (
        !(element instanceof HTMLElement) ||
        element === document.body
      )
        return null
      const style = getComputedStyle(element)
      return {
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 80) ?? '',
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      }
    })

    expect(focus, `${path}: no focusable element received focus`).not.toBeNull()
    expect(
      focus?.outlineStyle !== 'none' ||
        focus?.outlineWidth !== '0px' ||
        focus?.boxShadow !== 'none',
      `${path}: focused element has no visible indicator`,
    ).toBe(true)
  }
})

test('login→dashboard→resume flow is keyboard-navigable', async ({
  page,
}) => {
  await gotoHydrated(page, '/login')

  const emailInput = page.locator('input[type="email"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: 5000 })
  await emailInput.focus()
  await page.keyboard.type('test@example.com')
  await page.keyboard.press('Tab')
  await page.keyboard.type('password123')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)

  const url = page.url()
  if (!url.includes('/dashboard')) {
    await gotoHydrated(page, '/dashboard')
  }

  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)

  await page.keyboard.press('Tab')
  const focusAfterTool = await page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return null
    const style = getComputedStyle(el)
    return {
      tag: el.tagName,
      visible:
        style.outlineStyle !== 'none' ||
        style.outlineWidth !== '0px' ||
        style.boxShadow !== 'none',
    }
  })

  expect(focusAfterTool).not.toBeNull()
  expect(focusAfterTool?.visible).toBe(true)
})

// ── Semantic structure ──

test('app-shell pages have semantic landmarks', async ({ page }) => {
  const shellRoutes = ['/dashboard', '/resume', '/settings']

  for (const path of shellRoutes) {
    await gotoHydrated(page, path)
    if (path === '/resume') {
      await page.waitForTimeout(2000)
    }
    const landmarks = await page.evaluate(() => {
      const main = document.querySelector('main')
      const nav =
        document.querySelector('nav') ||
        document.querySelector('[role="navigation"]') ||
        document.querySelector('[data-sidebar="sidebar"]')
      const heading = document.querySelector('h1, h2')
      return {
        hasMain: !!main,
        hasNav: !!nav,
        hasHeading: !!heading,
        headingText: heading?.textContent?.trim().slice(0, 60) ?? null,
      }
    })

    expect(landmarks.hasMain, `${path}: missing <main>`).toBe(true)
    expect(landmarks.hasNav, `${path}: missing navigation landmark`).toBe(true)
    expect(landmarks.hasHeading, `${path}: missing heading`).toBe(true)
  }
})

test('interactive elements have accessible names', async ({ page }) => {
  for (const path of representativeRoutes) {
    await gotoHydrated(page, path)

    const unlabelled = await page.evaluate(() => {
      const violations: string[] = []
      const buttons = document.querySelectorAll(
        'button:not([aria-label]):not([aria-labelledby])',
      )
      const links = document.querySelectorAll(
        'a:not([aria-label]):not([aria-labelledby])',
      )

      for (const btn of buttons) {
        const text = btn.textContent?.trim() || ''
        const hasIconChild = !!btn.querySelector('svg')
        if (hasIconChild && !text && !btn.getAttribute('title')) {
          violations.push(
            `button.icon: "${btn.className?.slice(0, 60)}"`,
          )
        }
      }
      for (const link of links) {
        const text = link.textContent?.trim() || ''
        const hasIconChild = !!link.querySelector('svg')
        if (hasIconChild && !text && !link.getAttribute('title')) {
          violations.push(
            `link.icon: "${link.className?.slice(0, 60)}"`,
          )
        }
      }
      return violations
    })

    expect(
      unlabelled,
      `${path}: icon-only elements without accessible names: ${JSON.stringify(unlabelled)}`,
    ).toEqual([])
  }
})

// ── Reduced motion ──

test('reduced-motion preference leaves no long-running page animations', async ({
  page,
}) => {
  const motionAwareRoutes = ['/dashboard', '/', '/resume']

  await page.emulateMedia({ reducedMotion: 'reduce' })

  for (const path of motionAwareRoutes) {
    await gotoHydrated(page, path)
    if (path === '/resume') {
      await page.waitForTimeout(1500)
    }

    const longRunningAnimations = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => {
          const timing = animation.effect?.getComputedTiming()
          return (
            animation.playState === 'running' &&
            typeof timing?.duration === 'number' &&
            timing.duration > 100
          )
        })
        .map((animation) => {
          const target = (
            animation.effect as KeyframeEffect | null
          )?.target as HTMLElement | null
          return {
            duration: animation.effect?.getComputedTiming().duration,
            target: target?.className?.slice(0, 80) || target?.tagName || 'unknown',
          }
        }),
    )

    expect(
      longRunningAnimations,
      `${path} has ${longRunningAnimations.length} long-running animations`,
    ).toEqual([])
  }
})

// ── Performance baseline ──

test('landing page total JS transfer is under 540 kB', async ({ page }) => {
  const jsSizes: number[] = []
  page.on('response', (response) => {
    const url = response.url()
    const ct = response.headers()['content-type'] ?? ''
    if (ct.includes('javascript') && url.includes('/assets/')) {
      const cl = response.headers()['content-length']
      if (cl) jsSizes.push(Number(cl))
    }
  })

  await gotoHydrated(page, '/')

  const totalKB = jsSizes.reduce((sum, n) => sum + n, 0) / 1024
  expect(
    totalKB,
    `total JS transfer: ${totalKB.toFixed(0)} kB`,
  ).toBeLessThan(540)
})

test('landing page total CSS transfer is under 480 kB', async ({ page }) => {
  const cssSizes: number[] = []
  page.on('response', (response) => {
    const url = response.url()
    const ct = response.headers()['content-type'] ?? ''
    if (ct.includes('css') && url.includes('/assets/')) {
      const cl = response.headers()['content-length']
      if (cl) cssSizes.push(Number(cl))
    }
  })

  await gotoHydrated(page, '/')

  const totalKB = cssSizes.reduce((sum, n) => sum + n, 0) / 1024
  expect(
    totalKB,
    `total CSS transfer: ${totalKB.toFixed(0)} kB`,
  ).toBeLessThan(480)
})

test('dashboard route JavaScript heap is under 50 MB after hydration', async ({
  page,
}) => {
  await gotoHydrated(page, '/dashboard')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(3000)

  const heapMB = await page.evaluate(
    () =>
      ((performance as Performance & { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize ?? 0) /
      (1024 * 1024),
  )

  if (heapMB > 0) {
    expect(
      heapMB,
      `JS heap: ${heapMB.toFixed(1)} MB`,
    ).toBeLessThan(50)
  }
})

test('landing page LCP is under 4s and CLS is under 0.25', async ({
  page,
}) => {
  await gotoHydrated(page, '/')
  await page.waitForTimeout(3000)

  const metrics = await page.evaluate(async () => {
    let lcp = -1
    try {
      const entries = await new Promise<
        PerformanceEntry[]
      >((resolve) => {
        const observer = new PerformanceObserver((list) => {
          resolve(list.getEntries())
        })
        observer.observe({ type: 'largest-contentful-paint', buffered: true })
        setTimeout(() => resolve([]), 1000)
      })
      lcp = entries.length > 0 ? entries[0].startTime / 1000 : -1
    } catch {
      lcp = -1
    }

    let cls = 0
    try {
      const entries = await new Promise<
        PerformanceEntry[]
      >((resolve) => {
        const observer = new PerformanceObserver((list) => {
          resolve(list.getEntries())
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => resolve([]), 1000)
      })
      for (const entry of entries) {
        if (!(entry as any).hadRecentInput) {
          cls += (entry as any).value ?? 0
        }
      }
    } catch {
      cls = 0
    }

    return { lcp, cls }
  })

  if (metrics.lcp > 0) {
    expect(metrics.lcp, `LCP: ${metrics.lcp.toFixed(1)}s`).toBeLessThan(4)
  }
  expect(metrics.cls, `CLS: ${metrics.cls.toFixed(3)}`).toBeLessThan(0.25)
})

test('keyboard Tab does not trap focus on any route', async ({ page }) => {
  test.setTimeout(60_000)

  for (const path of representativeRoutes) {
    await gotoHydrated(page, path)

    let activeBefore = await page.evaluate(() => {
      const el = document.activeElement
      return el?.tagName ?? 'unknown'
    })

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
    }

    const activeAfter = await page.evaluate(() => {
      const el = document.activeElement
      return el?.tagName ?? 'unknown'
    })

    const tabShiftedFocus = activeBefore !== activeAfter || activeAfter === 'BODY'

    expect(tabShiftedFocus, `${path}: focus appears trapped after 20 Tabs`).toBe(true)
  }
})

test('320px mobile view does not hide primary actions behind missing affordances', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 })

  await gotoHydrated(page, '/login')
  let visible = await page.locator('input[type="email"], input[type="text"]').first().isVisible().catch(() => false)
  expect(visible, '/login: primary input not visible at 320px').toBe(true)

  await gotoHydrated(page, '/resume')
  await page.waitForTimeout(1500)
  visible = await page.locator('.dropzone-hero, [data-slot="button"], textarea').first().isVisible().catch(() => false)
  expect(visible, '/resume: no interactive element visible at 320px').toBe(true)

  await gotoHydrated(page, '/dashboard')
  visible = await page.locator('a[href="/resume"], .dash-hero-dark-drop-wrap').first().isVisible().catch(() => false)
  expect(visible, '/dashboard: primary link not visible at 320px').toBe(true)
})
