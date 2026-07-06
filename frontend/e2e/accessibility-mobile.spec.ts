import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const representativeRoutes = ['/', '/login', '/dashboard', '/resume']

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor()
}

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

test('keyboard navigation exposes a visible focus indicator', async ({ page }) => {
  await gotoHydrated(page, '/login')
  await page.keyboard.press('Tab')

  const focus = await page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement) || element === document.body) return null
    const style = getComputedStyle(element)
    return {
      tag: element.tagName,
      text: element.textContent?.trim().slice(0, 80) ?? '',
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    }
  })

  expect(focus).not.toBeNull()
  expect(
    focus?.outlineStyle !== 'none' ||
      focus?.outlineWidth !== '0px' ||
      focus?.boxShadow !== 'none',
  ).toBe(true)
})

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
