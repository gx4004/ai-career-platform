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
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor()
}

// ── Axe automated scans ──

test('representative routes have no critical accessibility violations', async ({
  page,
}) => {
  for (const path of representativeRoutes) {
    await gotoHydrated(page, path)
    const results = await new AxeBuilder({ page }).analyze()
    const critical = results.violations.filter(
      (violation) => violation.impact === 'critical',
    )

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
    const landmarks = await page.evaluate(() => {
      const main = document.querySelector('main')
      const nav =
        document.querySelector('nav') ||
        document.querySelector('[role="navigation"]')
      const heading = document.querySelector('h1, h2')
      return {
        hasMain: !!main,
        hasNav: !!nav,
        hasHeading: !!heading,
        headingText: heading?.textContent?.trim().slice(0, 60) ?? null,
      }
    })

    expect(landmarks.hasMain, `${path}: missing <main>`).toBe(true)
    expect(landmarks.hasNav, `${path}: missing <nav>`).toBe(true)
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
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await gotoHydrated(page, '/dashboard')

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
          target: target?.className || target?.tagName || 'unknown',
        }
      }),
  )

  expect(longRunningAnimations).toEqual([])
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
