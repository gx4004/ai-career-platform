import { expect, test, type Page } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('html[data-hydrated="true"]').waitFor({ timeout: 15_000 })
}

test('CV artifact preview fits 320/375px and has a clean print surface', async ({ page }) => {
  // Initialize the application in its mobile shell. Resizing from Playwright's
  // desktop default and measuring immediately can sample the outgoing desktop
  // SidebarInset before React's breakpoint hook commits the mobile tree.
  await page.setViewportSize({ width: 320, height: 812 })
  await page.addInitScript(() => localStorage.setItem('cw-cookie-consent', 'accepted'))
  const email = uniqueEmail('cv-preview')
  await gotoHydrated(page, '/login')
  await page.getByRole('tab', { name: 'Create Account' }).click()
  await page.locator('#register-name').fill('Preview Tester')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill('Password123!')
  await page.locator('#register-tos').check()
  await page.getByRole('button', { name: 'Create free account' }).click()
  await expect(page.getByRole('heading', { name: 'You are already signed in' })).toBeVisible()
  const created = await page.request.post('/api/v1/cv-documents', { data: {
    name: 'Mobile Preview CV', sections: [{ id: 'summary', kind: 'summary', title: 'Summary', visible: true, position: 0,
      entries: [{ id: 'entry', evidence_item_id: null, body: 'Synthetic mobile preview content.', position: 0 }] }],
  } })
  expect(created.ok()).toBe(true)
  await gotoHydrated(page, '/cv-studio')
  for (const template of ['ATS Essential', 'Professional Editorial', 'Technical / Portfolio']) {
    await page.getByLabel('Template').selectOption({ label: template })
    await expect(page.getByTitle(`${template} PDF preview`)).toBeVisible()
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 })
      // AppShell selects its mobile structure through a reactive breakpoint
      // hook. Wait for that structure before measuring; otherwise this can
      // sample the transient desktop SidebarInset immediately after resize.
      await expect(page.locator('.app-main--mobile')).toBeVisible()
      const metrics = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const parentRect = element.parentElement?.getBoundingClientRect()
            const style = getComputedStyle(element)
            return `${element.tagName}.${element.className} rect=${rect.left.toFixed(1)}/${rect.width.toFixed(1)}/${rect.right.toFixed(1)} parent=${parentRect ? `${parentRect.left.toFixed(1)}/${parentRect.width.toFixed(1)}/${parentRect.right.toFixed(1)}` : 'none'} css=${style.display}/${style.width}/${style.minWidth}/${style.maxWidth}`
          })
          .slice(0, 8),
      }))
      expect(metrics.document, metrics.offenders.join(', ')).toBeLessThanOrEqual(metrics.viewport)
      await expect(page.getByRole('link', { name: /DOCX/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /^PDF/ })).toBeVisible()
    }
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.studio-preview')).toBeHidden()
    await expect(page.getByLabel('CV sections')).toBeVisible()
    await page.emulateMedia({ media: 'screen' })
  }
})
