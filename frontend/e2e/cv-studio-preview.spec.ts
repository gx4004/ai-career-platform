import { expect, test, type Page } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('html[data-hydrated="true"]').waitFor({ timeout: 15_000 })
}

async function measureOverflow(page: Page) {
  return page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(element).position !== 'fixed')
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return `${element.tagName}.${element.className} rect=${rect.left.toFixed(1)}/${rect.width.toFixed(1)}/${rect.right.toFixed(1)} css=${style.display}/${style.width}/${style.minWidth}/${style.maxWidth}`
      })
      .slice(0, 8),
  }))
}

test('CV Studio live preview fits 320/375px, follows the template and has a clean print surface', async ({ page }) => {
  // Initialize the application in its mobile shell. Resizing from Playwright's
  // desktop default and measuring immediately can sample the outgoing desktop
  // SidebarInset before React's breakpoint hook commits the mobile tree.
  await page.setViewportSize({ width: 320, height: 812 })
  await page.addInitScript(() => localStorage.setItem('cw-cookie-consent', 'accepted'))
  const email = uniqueEmail('cv-preview')
  // Register through the API (shares the page's cookie jar); the sign-up UI has
  // its own coverage, and this spec is about the studio surface.
  const registered = await page.request.post('/api/v1/auth/register', {
    data: { email, password: 'Password123!', full_name: 'Preview Tester', tos_accepted: true },
  })
  expect(registered.ok()).toBe(true)
  const created = await page.request.post('/api/v1/cv-documents', { data: {
    name: 'Mobile Preview CV', sections: [
      { id: 'summary', kind: 'summary', title: 'Summary', visible: true, position: 0,
        entries: [{ id: 'entry', evidence_item_id: null, body: 'Synthetic mobile preview content.', position: 0 }] },
      { id: 'experience', kind: 'experience', title: 'Experience', visible: true, position: 1,
        entries: [{ id: 'role', evidence_item_id: null, body: 'Shipped the thing.', position: 0, heading: 'Engineer', subheading: 'Example Ltd', start_date: '2020', end_date: 'Present', bullets: ['Shipped the thing.'] }] },
    ],
  } })
  expect(created.ok()).toBe(true)
  await gotoHydrated(page, '/cv-studio')
  await expect(page.locator('.app-main--mobile')).toBeVisible()
  const views = page.getByRole('tablist', { name: 'Studio view' })

  for (const template of ['ATS Essential', 'Professional Editorial', 'Modern Two-Column']) {
    await views.getByRole('tab', { name: 'Design' }).click()
    await page.getByRole('radio', { name: new RegExp(template) }).check({ force: true })
    await views.getByRole('tab', { name: 'Preview' }).click()
    await expect(page.getByTestId('cv-paper')).toBeVisible()
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 })
      // AppShell selects its mobile structure through a reactive breakpoint
      // hook. Wait for that structure before measuring.
      await expect(page.locator('.app-main--mobile')).toBeVisible()
      const metrics = await measureOverflow(page)
      expect(metrics.document, metrics.offenders.join(', ')).toBeLessThanOrEqual(metrics.viewport)
    }
  }

  // The exact server PDF for the saved template stays one click away.
  await expect(page.getByTestId('save-status')).toContainText('Saved')
  await page.getByRole('button', { name: /View exact PDF/ }).click()
  await expect(page.getByTitle('Modern Two-Column PDF preview')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')

  await views.getByRole('tab', { name: 'Edit' }).click()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.cvs-preview-col')).toBeHidden()
  await expect(page.getByLabel('CV sections')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
})
