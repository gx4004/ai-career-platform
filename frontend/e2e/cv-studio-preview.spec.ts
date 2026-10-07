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

test('CV Studio page preview fits 320/375px, edits in a sheet, follows the draft and prints without chrome', async ({ page }) => {
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
  const galleryRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('/template-thumbnails')) galleryRequests.push(request.url()) })
  await gotoHydrated(page, '/cv-studio')
  await expect(page.locator('.app-main--mobile')).toBeVisible()
  const toolbar = page.getByRole('tablist', { name: 'Studio tools' })

  // The server-drawn pages first on a phone: they fit the screen, drawn for its width (not desktop-sized), and tapping a
  // section opens its editor in a sheet.
  await expect(page.getByAltText('Page 1 of your CV')).toBeVisible({ timeout: 30_000 })
  const natural = await page.getByAltText('Page 1 of your CV').evaluate((image: HTMLImageElement) => image.naturalWidth)
  expect(natural).toBeLessThanOrEqual(Math.ceil((320 * Math.min(await page.evaluate(() => devicePixelRatio), 2)) / 160) * 160)
  await expect(page.getByText('1 page', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit Summary' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Summary' })
  // The unsaved edit goes to the preview endpoint (debounced) and nothing else renders it.
  const previewed = page.waitForRequest((request) => request.url().includes('/preview') && (request.postData() ?? '').includes('Edited from the sheet.'))
  await sheet.getByLabel('Summary text').fill('Edited from the sheet.')
  await previewed
  await expect(page.getByTestId('cv-preview')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 })
  await sheet.getByRole('button', { name: 'Close panel' }).click()

  // The Design panel is a gallery: every template drawn with the built-in English sample CV (page 1, server-rendered,
  // in this CV's colour, typeface and spacing), fetched only when the panel opens and within the mobile budget, in a
  // sheet that fits the phone. Picking a picture picks the template, and the preview follows. Ends on Classic for the
  // PDF check.
  expect(galleryRequests).toHaveLength(0)
  for (const template of ['Lagoon', 'Classic']) {
    // The second opening is served from the client cache (the look has not changed): no request.
    const gallery = template === 'Lagoon' ? page.waitForResponse((response) => response.url().includes('/template-thumbnails')) : null
    await toolbar.getByRole('tab', { name: /^Design/ }).click()
    if (gallery) expect((await (await gallery).body()).length).toBeLessThanOrEqual(80 * 1024)
    const design = page.getByRole('dialog', { name: 'Design' })
    // The sheet slides in: let it settle before reaching into its scrolling body (lower templates sit below the fold).
    await design.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
    const picture = design.getByRole('img', { name: `Preview of the ${template} template` })
    await expect(picture).toBeVisible({ timeout: 30_000 })
    await expect(design.getByRole('img', { name: /^Preview of the .* template$/ })).not.toHaveCount(0)
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 })
      const metrics = await measureOverflow(page)
      expect(metrics.document, metrics.offenders.join(', ')).toBeLessThanOrEqual(metrics.viewport)
    }
    const previewed = page.waitForRequest((request) => request.url().includes('/preview') && (request.postData() ?? '').includes(`"template_id":"${template.toLowerCase()}"`))
    await picture.scrollIntoViewIfNeeded()
    await picture.click()
    await expect(design.getByRole('radio', { name: template })).toBeChecked()
    await previewed
    await design.getByRole('button', { name: 'Close panel' }).click()
    await expect(page.getByTestId('cv-pages')).toBeVisible()
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
  await expect(page.getByTitle('Classic PDF preview')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')

  // Printing the page prints the page images, without the studio chrome or the section buttons around them.
  await page.emulateMedia({ media: 'print' })
  await expect(toolbar).toBeHidden()
  await expect(page.getByTestId('cv-pages')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Summary' })).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
})
