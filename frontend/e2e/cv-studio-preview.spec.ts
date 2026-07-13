import { expect, test, type Page } from '@playwright/test'

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('html[data-hydrated="true"]').waitFor({ timeout: 15_000 })
}

test('CV artifact preview fits 320/375px and has a clean print surface', async ({ page }) => {
  const email = `cv-preview-${Date.now()}@example.com`
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
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
      expect(metrics.document).toBeLessThanOrEqual(metrics.viewport)
      await expect(page.getByRole('link', { name: /DOCX/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /^PDF/ })).toBeVisible()
    }
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.studio-preview')).toBeHidden()
    await expect(page.getByLabel('CV sections')).toBeVisible()
    await page.emulateMedia({ media: 'screen' })
  }
})
