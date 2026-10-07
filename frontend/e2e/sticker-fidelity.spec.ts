import { devices, expect, test, type Locator, type Page } from '@playwright/test'
import {
  FONT,
  HEX,
  RGB,
  SH,
  TRANSPARENT,
  angleOf,
  declineCookies,
  expectDisplayFont,
  expectFont,
  expectStill,
  expectStyles,
  expectUiFont,
  gapBetween,
  grow,
  horizontalOverflow,
  open,
  plateTilt,
  rectOf,
  resolveToken,
  styles,
  translationOf,
} from './helpers/sticker-fidelity'

/**
 * STICKER fidelity: the executable form of STICKER-SYSTEM section 1 (the contract the owner signed off
 * on: "do not build something that looks different at all from what you showed me").
 *
 * Everything runs without an account or any data: the hidden /_kit gallery shows every kit component in
 * every state, and the public pages (landing, login, 404, legal) and one guest Resume run cover the
 * finished screens. Expected values are written out from the contract, never read back from the tokens.
 *
 * Self-test: STICKER_FIDELITY_BREAK="--sh-2: 5px 5px 0 var(--ink)" (any :root declarations) must turn this
 * spec red; see applyBreak() in helpers/sticker-fidelity.ts.
 */

test.beforeEach(async ({ page }) => {
  await declineCookies(page)
})

const gallery = (page: Page) => open(page, '/_kit', '#composition')

/** The emulated preference really is what the test says it is, so a green run cannot be a no-op. */
async function expectMotionPreference(page: Page, preference: 'reduce' | 'no-preference') {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(preference === 'reduce')
}

/** A gallery specimen by its label (the small caption above it). */
function specimen(page: Page, label: string | RegExp, within = '.kit-gallery__section') {
  return page
    .locator(`${within} .kit-gallery__specimen`)
    .filter({ has: page.locator('.kit-gallery__label', { hasText: label }) })
}

/** The seal whose visually hidden name matches. */
function seal(page: Page, name: string | RegExp) {
  return page.locator('dl.kit-seal').filter({ has: page.locator('dt', { hasText: name }) })
}

async function box(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height, offsetWidth: (el as HTMLElement).offsetWidth, offsetHeight: (el as HTMLElement).offsetHeight }
  })
}

// ───────────────────────────────────────────────────────────────────────────
// 1.1 / 1.2 / 1.3 / 1.5  Tokens: the palette, the outline, the shadow, the radius ladder, the metrics
// ───────────────────────────────────────────────────────────────────────────

test.describe('tokens', () => {
  test('palette: every colour resolves to its contract value (1.1)', async ({ page }) => {
    await gallery(page)
    const palette: Array<[string, keyof typeof HEX]> = [
      ['--ink', 'ink'],
      ['--ink-2', 'ink2'],
      ['--ink-3', 'ink3'],
      ['--ink-4', 'ink4'],
      ['--line', 'line'],
      ['--ground', 'ground'],
      ['--surface', 'surface'],
      ['--stone', 'stone'],
      ['--stone-soft', 'stoneSoft'],
      ['--desk', 'desk'],
      ['--tangerine', 'tangerine'],
      ['--tangerine-soft', 'tangerineSoft'],
      ['--mint', 'mint'],
      ['--mint-soft', 'mintSoft'],
      ['--lilac', 'lilac'],
      ['--lilac-soft', 'lilacSoft'],
      ['--lemon', 'lemon'],
      ['--lemon-soft', 'lemonSoft'],
      ['--rose', 'rose'],
      ['--rose-soft', 'roseSoft'],
      ['--aqua', 'aqua'],
      ['--aqua-soft', 'aquaSoft'],
      ['--danger', 'danger'],
      ['--danger-ink', 'dangerInk'],
      ['--success-ink', 'successInk'],
      ['--warn-ink', 'warnInk'],
      ['--focus-fill', 'focusFill'],
    ]
    for (const [token, name] of palette) {
      expect(await resolveToken(page, token, 'color'), `${token} = ${HEX[name]}`).toBe(RGB[name])
    }
    // The semantic names the kit reads resolve to the same palette.
    expect(await resolveToken(page, '--primary', 'color')).toBe(RGB.tangerine)
    expect(await resolveToken(page, '--primary-on', 'color')).toBe(RGB.ink)
    expect(await resolveToken(page, '--accent', 'color'), '--accent is ink now (the forest accent is gone)').toBe(RGB.ink)
    // --ink-3 is the darkened value (the mockup's #6b6682 fails 4.5:1 on stone, desk and the soft tints).
    expect(await resolveToken(page, '--text-soft', 'color')).toBe(RGB.ink3)
  })

  test('the page is a cool light ground, light only, with a tangerine accent colour (1.1)', async ({ page }) => {
    await gallery(page)
    const root = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement)
      const body = getComputedStyle(document.body)
      return { scheme: html.colorScheme, accent: html.accentColor, bg: body.backgroundColor, color: body.color, family: body.fontFamily, size: body.fontSize }
    })
    expect(root.scheme).toBe('light')
    expect(root.accent).toBe(RGB.tangerine)
    expect(root.bg).toBe(RGB.ground)
    expect(root.color).toBe(RGB.ink)
    expectUiFont(root.family)
    expect(root.size).toBe('15px')
  })

  test('outline, shadow and radius tokens (1.2, 1.3)', async ({ page }) => {
    await gallery(page)
    expect(await resolveToken(page, '--bw', 'width')).toBe('2px')
    expect(await resolveToken(page, '--bw-thin', 'width')).toBe('1.5px')
    expect(await resolveToken(page, '--sh-1', 'box-shadow')).toBe(SH.sh1)
    expect(await resolveToken(page, '--sh-2', 'box-shadow')).toBe(SH.sh2)
    expect(await resolveToken(page, '--sh-3', 'box-shadow')).toBe(SH.sh3)
    expect(await resolveToken(page, '--sh-4', 'box-shadow')).toBe(SH.sh4)
    expect(await resolveToken(page, '--sh-ink', 'box-shadow')).toBe(`${RGB.surface} 4px 4px 0px 0px, ${RGB.ink} 4px 4px 0px 2px`)
    for (const [token, px] of [
      ['--r-xs', '8px'],
      ['--r-sm', '12px'],
      ['--r-md', '16px'],
      ['--r-lg', '24px'],
      ['--r-xl', '36px'],
    ] as const) {
      expect(await resolveToken(page, token, 'border-top-left-radius'), token).toBe(px)
    }
    // --r-pill is "999px"; the browser clamps nothing on a bare div, so it prints as given.
    expect(parseFloat(await resolveToken(page, '--r-pill', 'border-top-left-radius'))).toBeGreaterThanOrEqual(999)
  })

  test('layout metrics: sidebar 264, rail 76, 4px spacing scale, the type scale (1.4, 1.5)', async ({ page }) => {
    await gallery(page)
    expect(await resolveToken(page, '--sidebar-w', 'width')).toBe('264px')
    expect(await resolveToken(page, '--rail-w', 'width')).toBe('76px')
    for (const [token, px] of [
      ['--s1', '4px'],
      ['--s2', '8px'],
      ['--s3', '12px'],
      ['--s4', '16px'],
      ['--s5', '20px'],
      ['--s6', '24px'],
      ['--s7', '32px'],
      ['--s8', '40px'],
      ['--s9', '56px'],
      ['--s10', '80px'],
    ] as const) {
      expect(await resolveToken(page, token, 'width'), token).toBe(px)
    }
    expect(await resolveToken(page, '--font-display', 'font-family')).toContain(FONT.display)
    expect(await resolveToken(page, '--font-ui', 'font-family')).toContain(FONT.ui)
    // Weights 400 / 500 / 600 / 700 / 800: the black weight is 800 (Bricolage tops out there).
    expect(await resolveToken(page, '--fw-black', 'font-weight')).toBe('800')
  })

  test('both families are real files, not the fallback stack (7)', async ({ page }) => {
    await gallery(page)
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return {
        display800: document.fonts.check('800 20px "Bricolage Grotesque Variable"'),
        ui400: document.fonts.check('400 15px "Onest Variable"'),
        ui700: document.fonts.check('700 15px "Onest Variable"'),
        families: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', '')),
      }
    })
    expect(loaded.display800).toBe(true)
    expect(loaded.ui400).toBe(true)
    expect(loaded.ui700).toBe(true)
    expect(loaded.families.join(' ')).toContain('Bricolage Grotesque')
    expect(loaded.families.join(' ')).toContain('Onest')
  })

  test('a bare heading is NOT the display face: the CV paper inherits it (trap 1)', async ({ page }) => {
    await gallery(page)
    const family = await page.evaluate(() => {
      const heading = document.createElement('h2')
      heading.textContent = 'CV section title'
      document.body.append(heading)
      const value = getComputedStyle(heading).fontFamily
      heading.remove()
      return value
    })
    expectUiFont(family)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Invariants over every kit component in the gallery
// ───────────────────────────────────────────────────────────────────────────

test.describe('gallery invariants', () => {
  test('one shadow style: hard, offset, never blurred; no gradients, no backdrop blur, no all-caps (1.1, 1.2, 1.4)', async ({ page }) => {
    await gallery(page)
    const found = await page.evaluate(() => {
      const bad: string[] = []
      const label = (el: Element, extra = '') =>
        `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}${extra}`
      const splitShadows = (value: string) => value.split(/,(?![^(]*\))/).map((s) => s.trim())
      let checked = 0
      for (const el of document.querySelectorAll('.kit-gallery__section *')) {
        for (const pseudo of [null, '::before', '::after'] as const) {
          const cs = getComputedStyle(el, pseudo)
          if (pseudo && cs.content === 'none') continue
          if (cs.boxShadow !== 'none') {
            for (const shadow of splitShadows(cs.boxShadow)) {
              checked += 1
              const lengths = shadow.replace(/rgba?\([^)]*\)/g, '').replace('inset', '').trim().split(/\s+/)
              if (parseFloat(lengths[2] ?? '0') !== 0) bad.push(`blurred shadow "${shadow}" on ${label(el, pseudo ?? '')}`)
            }
          }
          if (!pseudo) {
            if (cs.textShadow !== 'none') bad.push(`text-shadow on ${label(el)}`)
            if (cs.backgroundImage.includes('gradient') && !el.closest('.kit-segmented, .kit-jump-nav')) bad.push(`gradient on ${label(el)}`)
            if (cs.backdropFilter && cs.backdropFilter !== 'none') bad.push(`backdrop-filter on ${label(el)}`)
            if (cs.textTransform !== 'none') bad.push(`text-transform ${cs.textTransform} on ${label(el)}`)
            if (cs.filter !== 'none' && cs.filter.includes('blur')) bad.push(`blur filter on ${label(el)}`)
          }
        }
      }
      return { bad, checked }
    })
    expect(found.checked).toBeGreaterThan(150)
    expect(found.bad).toEqual([])
  })

  test('shadow colour is ink (or the ink button underlay), never grey, never coloured (1.2)', async ({ page }) => {
    await gallery(page)
    const { odd, checked } = await page.evaluate(
      ({ ink, surface, lemon }) => {
        const bad: string[] = []
        let count = 0
        for (const el of document.querySelectorAll('.kit-gallery__section *')) {
          for (const pseudo of [null, '::before', '::after'] as const) {
            const cs = getComputedStyle(el, pseudo)
            if (pseudo && cs.content === 'none') continue
            if (cs.boxShadow === 'none') continue
            for (const shadow of cs.boxShadow.split(/,(?![^(]*\))/)) {
              count += 1
              const colour = /rgba?\([^)]*\)/.exec(shadow)?.[0] ?? ''
              // The highlighter marker (inset lemon) and the ink button's white underlay are the two specified exceptions.
              if (![ink, surface, lemon].includes(colour)) bad.push(`${el.tagName}.${[...el.classList][0]} ${shadow}`)
            }
          }
        }
        return { odd: bad, checked: count }
      },
      { ink: RGB.ink, surface: RGB.surface, lemon: RGB.lemon },
    )
    expect(checked).toBeGreaterThan(150)
    expect(odd).toEqual([])
  })

  test('type: only Onest and Bricolage, mono only in code detail, no serif samples leak (1.4)', async ({ page }) => {
    await gallery(page)
    const { odd, checked } = await page.evaluate(
      ({ display, ui }) => {
        const bad = new Set<string>()
        let count = 0
        for (const el of document.querySelectorAll('.kit-gallery__section *')) {
          if (el.closest('[style*="font-family"]')) continue // a deliberate font specimen
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())
          if (!hasText) continue
          count += 1
          const stack = getComputedStyle(el).fontFamily
          const family = stack.split(',')[0]!.replaceAll('"', '').trim()
          if (family === display || family === ui) continue
          // Keyboard keys draw only the key symbols (unicode-range) from a system face; their letters stay in Onest.
          if (el.matches('.kit-kbd') && family.startsWith('Kit Key Symbols') && stack.includes(ui)) continue
          if (family === 'ui-monospace' && (el.closest('code, pre, [data-mono], .kit-error__detail, .kit-kv__value') || el.matches('p, span, dd'))) continue
          bad.add(`${family} on ${el.tagName.toLowerCase()}.${[...el.classList][0] ?? ''}`)
        }
        return { odd: [...bad], checked: count }
      },
      { display: FONT.display, ui: FONT.ui },
    )
    expect(checked).toBeGreaterThan(1000)
    expect(odd).toEqual([])
  })

  test('outline weight: 2px everywhere, 1.5px on the thin marks; radii stay on the ladder (1.2, 1.3)', async ({ page }) => {
    await gallery(page)
    const found = await page.evaluate(() => {
      const widths = new Set(['2px', '1.5px'])
      const radii = new Set(['3px', '6px', '8px', '9px', '12px', '14px', '16px', '22px', '24px', '26px', '28px', '36px'])
      const bad: string[] = []
      let framed = 0
      for (const el of document.querySelectorAll('.kit-gallery__section [class*="kit-"]')) {
        const classes = [...el.classList]
        if (classes.every((c) => c.startsWith('kit-gallery'))) continue
        if (el.closest('.kit-gallery__stage-label')) continue
        const cs = getComputedStyle(el)
        if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') framed += 1
        for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
          const width = cs.getPropertyValue(`border-${side.toLowerCase()}-width`)
          const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`)
          if (width === '0px' || style === 'none') continue
          // Rows and table rows keep a 4px start-edge slot for the selection bar: transparent at rest, ink when selected.
          const colour = cs.getPropertyValue(`border-${side.toLowerCase()}-color`)
          if (width === '4px' && (colour === 'rgba(0, 0, 0, 0)' || colour === 'rgb(27, 23, 48)') && el.closest('.kit-row, .kit-table')) continue
          // The skeleton row mirrors the row's geometry, slot included, so a loading list is exactly as tall as the real one.
          if (width === '4px' && classes.some((c) => c.startsWith('kit-skeleton'))) continue
          if (!widths.has(width) && !classes.some((c) => c.startsWith('kit-gallery'))) {
            bad.push(`${side} ${width} ${style} on ${el.tagName.toLowerCase()}.${classes[0]}`)
          }
        }
        for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
          const r = cs.getPropertyValue(`border-${corner}-radius`).split(' ')[0]!
          if (r === '0px' || r === '50%') continue
          if (parseFloat(r) >= 999) continue
          if (!radii.has(r)) bad.push(`radius ${r} on ${el.tagName.toLowerCase()}.${classes[0]}`)
        }
      }
      return { bad, framed }
    })
    expect(found.framed).toBeGreaterThan(300)
    expect(found.bad).toEqual([])
  })

  test('tangerine is a fill, never a text colour (trap 3)', async ({ page }) => {
    await gallery(page)
    const { offenders, checked } = await page.evaluate((tangerine) => {
      const bad: string[] = []
      let count = 0
      for (const el of document.querySelectorAll('.kit-gallery__section *')) {
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())
        if (!hasText) continue
        count += 1
        if (getComputedStyle(el).color === tangerine) bad.push(`${el.tagName}.${[...el.classList][0]}`)
      }
      return { offenders: bad, checked: count }
    }, RGB.tangerine)
    expect(checked).toBeGreaterThan(1000)
    expect(offenders).toEqual([])
  })

  test('numerals are normal width: no condensed stretch anywhere (1.4)', async ({ page }) => {
    await gallery(page)
    const { stretched, checked } = await page.evaluate(() => {
      const bad: string[] = []
      let count = 0
      for (const el of document.querySelectorAll('.kit-gallery__section *')) {
        count += 1
        const stretch = getComputedStyle(el).fontStretch
        if (stretch !== '100%') bad.push(`${stretch} on ${el.tagName}.${[...el.classList][0]}`)
      }
      return { stretched: bad, checked: count }
    })
    expect(checked).toBeGreaterThan(1000)
    expect(stretched).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 1.7  Buttons
// ───────────────────────────────────────────────────────────────────────────

test.describe('buttons (1.7)', () => {
  const SIZES = {
    sm: { height: '36px', radius: '12px', size: '14px', shadow: SH.sh1, px: '16px' },
    md: { height: '44px', radius: '16px', size: '15px', shadow: SH.sh2, px: '20px' },
    lg: { height: '56px', radius: '24px', size: '17px', shadow: SH.sh2, px: '32px' },
  } as const

  test('variants x sizes: fill, outline, radius, height, type and rest shadow', async ({ page }) => {
    await gallery(page)
    for (const [size, want] of Object.entries(SIZES)) {
      const common = {
        'min-height': want.height,
        'border-top-left-radius': want.radius,
        'font-size': want.size,
        'font-weight': '700',
        'font-stretch': '100%',
      }
      for (const [variant, extra] of Object.entries<Record<string, string>>({
        primary: { 'background-color': RGB.tangerine, color: RGB.ink, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': want.shadow, 'padding-left': want.px },
        secondary: { 'background-color': RGB.surface, color: RGB.ink, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': want.shadow, 'padding-left': want.px },
        destructive: { 'background-color': RGB.danger, color: RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': want.shadow, 'padding-left': want.px },
        ghost: { 'background-color': TRANSPARENT, color: RGB.ink, 'border-top-color': TRANSPARENT, 'box-shadow': SH.none, 'padding-left': '12px' },
      })) {
        const button = page.locator(`#button .kit-button--${variant}.kit-button--${size}:not([data-demo]):not([disabled]):not([data-loading])`).first()
        await expectStyles(button, { ...common, ...extra })
        await expectFont(button, 'ui')
      }
      // Link: bold, underlined 2px at 4px offset, no frame, no shadow, no fill.
      const link = page.locator(`#button .kit-button--link.kit-button--${size}:not([data-demo]):not([disabled]):not([data-loading])`).first()
      await expectStyles(link, {
        'font-weight': '700',
        'font-size': want.size,
        'text-decoration-line': 'underline',
        'text-decoration-thickness': '2px',
        'text-underline-offset': '4px',
        'border-top-width': '0px',
        'box-shadow': SH.none,
        'background-color': TRANSPARENT,
        color: RGB.ink,
      })
    }
  })

  test('the destructive button is only for destructive confirms: danger fill, white text, ink outline (1.7)', async ({ page }) => {
    await gallery(page)
    const button = page.locator('#button .kit-button--destructive.kit-button--md').first()
    await expectStyles(button, { 'background-color': RGB.danger, color: RGB.surface, 'border-top-color': RGB.ink, 'box-shadow': SH.sh2 })
  })

  test('hover lifts, press sinks, ghost never moves (fine pointer, 1.2 / 5.5)', async ({ page }) => {
    await gallery(page)
    const hover = (locator: Locator) => locator.hover()

    // md: lift (-2,-2) + sh-3, press (4,4) + no shadow.
    const md = page.locator('#button .kit-button--secondary.kit-button--md:not([data-demo]):not([disabled]):not([data-loading])').first()
    await hover(md)
    await expect.poll(async () => (await styles(md, ['box-shadow']))['box-shadow']).toBe(SH.sh3)
    expect(translationOf((await styles(md, ['transform']))['transform']!)).toEqual([-2, -2])
    await page.mouse.down()
    await expect.poll(async () => (await styles(md, ['box-shadow']))['box-shadow']).toBe(SH.sh0)
    expect(translationOf((await styles(md, ['transform']))['transform']!)).toEqual([4, 4])
    await page.mouse.up()

    // sm: lift (-1,-1) + sh-2, press (2,2).
    const sm = page.locator('#button .kit-button--secondary.kit-button--sm:not([data-demo]):not([disabled]):not([data-loading])').first()
    await hover(sm)
    await expect.poll(async () => (await styles(sm, ['box-shadow']))['box-shadow']).toBe(SH.sh2)
    expect(translationOf((await styles(sm, ['transform']))['transform']!)).toEqual([-1, -1])
    await page.mouse.down()
    await expect.poll(async () => translationOf((await styles(sm, ['transform']))['transform']!)).toEqual([2, 2])
    await page.mouse.up()

    // The border colour never changes on lift.
    await expectStyles(md, { 'border-top-color': RGB.ink, 'border-top-width': '2px' })
  })

  test('ghost hover: white fill, ink outline, sh-1, no lift; link hover: lemon marker (1.7)', async ({ page }) => {
    await gallery(page)
    const ghost = page.locator('#button .kit-button--ghost.kit-button--md:not([data-demo]):not([disabled]):not([data-loading]):not(.kit-button--icon)').first()
    await ghost.hover()
    await expect.poll(async () => (await styles(ghost, ['background-color']))['background-color']).toBe(RGB.surface)
    await expectStyles(ghost, { 'border-top-color': RGB.ink, 'box-shadow': SH.sh1 })
    await expectStill(ghost)

    const link = page.locator('#button .kit-button--link.kit-button--md:not([data-demo]):not([disabled]):not([data-loading])').first()
    await link.hover()
    await expect.poll(async () => (await styles(link, ['background-color']))['background-color']).toBe(RGB.lemon)
    await expectStyles(link, { 'box-shadow': SH.none })
    await expectStill(link)
  })

  test('the forced demo states match the real ones (hover, press)', async ({ page }) => {
    await gallery(page)
    const demoHover = page.locator('#button .kit-button--primary[data-demo="hover"]').first()
    await expectStyles(demoHover, { 'box-shadow': SH.sh3, transform: 'matrix(1, 0, 0, 1, -2, -2)', 'background-color': RGB.tangerine })
    const demoPress = page.locator('#button .kit-button--primary[data-demo="press"]').first()
    await expectStyles(demoPress, { 'box-shadow': SH.sh0, transform: 'matrix(1, 0, 0, 1, 4, 4)' })
  })

  test('focus-visible: a 3px ink ring at 3px offset that never touches the radius (1.7, trap 4)', async ({ page }) => {
    await gallery(page)
    for (const [variant, radius] of [
      ['primary', '16px'],
      ['secondary', '16px'],
      ['ghost', '16px'],
    ] as const) {
      const button = page.locator(`#button .kit-button--${variant}.kit-button--md:not([data-demo]):not([disabled]):not([data-loading]):not(.kit-button--icon)`).first()
      await page.keyboard.press('Tab') // keyboard modality, so :focus-visible applies
      await button.focus()
      await expectStyles(button, {
        'outline-style': 'solid',
        'outline-width': '3px',
        'outline-color': RGB.ink,
        'outline-offset': '3px',
        'border-top-left-radius': radius,
      })
    }
    // A pill keeps its pill: focusing a count badge button does not rewrite its radius.
    const small = page.locator('#button .kit-button--secondary.kit-button--sm:not([data-demo]):not([disabled]):not([data-loading])').first()
    await small.focus()
    await expectStyles(small, { 'border-top-left-radius': '12px' })
  })

  test('disabled: flat stone, ink-3 text, no shadow, no movement (1.7)', async ({ page }) => {
    await gallery(page)
    const disabled = page.locator('#button .kit-button--secondary:disabled:not(.kit-button--icon)').first()
    await expectStyles(disabled, {
      'background-color': RGB.stone,
      color: RGB.ink3,
      'border-top-color': RGB.ink3,
      'box-shadow': SH.none,
      cursor: 'not-allowed',
      'border-top-width': '2px',
    })
    await disabled.hover({ force: true })
    await expectStyles(disabled, { 'box-shadow': SH.none })
    await expectStill(disabled)

    const primaryDisabled = page.locator('#button .kit-button--primary:disabled:not(.kit-button--icon)').first()
    await expectStyles(primaryDisabled, { 'background-color': RGB.stone, color: RGB.ink3, 'box-shadow': SH.none })

    for (const variant of ['ghost', 'link']) {
      const quiet = page.locator(`#button .kit-button--${variant}:disabled:not(.kit-button--icon)`).first()
      await expectStyles(quiet, { 'background-color': TRANSPARENT, color: RGB.ink4, 'box-shadow': SH.none, 'border-top-color': TRANSPARENT })
    }
  })

  test('loading: label hidden, 18px ring spinner, aria-busy, the shadow stays (1.7)', async ({ page }) => {
    await gallery(page)
    const loading = page.locator('#button .kit-button--primary[data-loading="true"]').first()
    await expect(loading).toHaveAttribute('aria-busy', 'true')
    await expectStyles(loading, { color: TRANSPARENT, 'box-shadow': SH.sh2, 'background-color': RGB.tangerine, cursor: 'progress' })
    const spinner = loading.locator('.kit-button__spinner')
    await expectStyles(spinner, {
      width: '18px',
      height: '18px',
      'border-top-width': '2px',
      'border-top-color': RGB.ink,
      'border-right-color': TRANSPARENT,
      'animation-name': 'kit-spin',
    })
    await loading.hover({ force: true })
    await expectStill(loading)
  })

  test('aria-pressed reads as selected: lemon fill, ink text (1.7)', async ({ page }) => {
    await gallery(page)
    const toggle = page.getByRole('button', { name: 'Favorites only' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expectStyles(toggle, { 'background-color': RGB.surface })
    await toggle.click()
    await page.mouse.move(0, 0)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expectStyles(toggle, { 'background-color': RGB.lemon, color: RGB.ink, 'border-top-color': RGB.ink })
  })

  test('touch: every small and medium button is at least 44px (1.7)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await declineCookies(page)
    await gallery(page)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    const short = await page.evaluate(() => {
      const bad: string[] = []
      for (const el of document.querySelectorAll('#button .kit-button--sm, #button .kit-button--md')) {
        const h = el.getBoundingClientRect().height
        if (h > 0 && h < 43.5) bad.push(`${el.className} ${h}`)
      }
      return bad
    })
    expect(short).toEqual([])
    await context.close()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 1.8  Badges, chips, tags by meaning
// ───────────────────────────────────────────────────────────────────────────

test.describe('badges, counts and tags (1.8)', () => {
  test('every tone maps to its meaning; outline 2px ink, pill, 26px, 13/700', async ({ page }) => {
    await gallery(page)
    const tones: Record<string, string> = {
      neutral: RGB.stone,
      accent: RGB.tangerine,
      success: RGB.mint,
      warning: RGB.lemon,
      danger: RGB.rose,
      tangerine: RGB.tangerine,
      mint: RGB.mint,
      lilac: RGB.lilac,
      lemon: RGB.lemon,
      rose: RGB.rose,
      aqua: RGB.aqua,
      stone: RGB.stone,
      white: RGB.surface,
    }
    for (const [tone, fill] of Object.entries(tones)) {
      const badge = page.locator(`#badge .kit-badge--md[data-tone="${tone}"]`).first()
      await expectStyles(badge, {
        'background-color': fill,
        color: RGB.ink,
        'border-top-width': '2px',
        'border-top-color': RGB.ink,
        'border-top-left-radius': /^(999|9999)px$/,
        'min-height': '26px',
        'font-size': '13px',
        'font-weight': '700',
        'padding-left': '10px',
        'padding-top': '2px',
        'box-shadow': SH.none,
      })
      await expectFont(badge, 'ui')
    }
  })

  test('small badge: 22px, 12px type', async ({ page }) => {
    await gallery(page)
    await expectStyles(page.locator('#badge .kit-badge--sm').first(), { 'min-height': '22px', 'font-size': '12px', 'font-weight': '700', 'border-top-width': '2px' })
  })

  test('quiet badge (info): transparent, 2px line border, ink-2 600 text', async ({ page }) => {
    await gallery(page)
    await expectStyles(page.locator('#badge .kit-badge--md[data-tone="info"]').first(), {
      'background-color': TRANSPARENT,
      'border-top-color': RGB.line,
      'border-top-width': '2px',
      color: RGB.ink2,
      'font-weight': '600',
    })
  })

  test('severity: High rose, Medium lemon, Low lilac', async ({ page }) => {
    await gallery(page)
    for (const [severity, fill] of [
      ['high', RGB.rose],
      ['medium', RGB.lemon],
      ['low', RGB.lilac],
    ] as const) {
      await expectStyles(page.locator(`#badge .kit-badge[data-severity="${severity}"]`).first(), { 'background-color': fill, 'border-top-color': RGB.ink })
    }
  })

  test('stage: Saved lemon, Applied lilac, Interviewing tangerine, Offer mint, Closed stone (1.13)', async ({ page }) => {
    await gallery(page)
    for (const [stage, fill] of [
      ['saved', RGB.lemon],
      ['applied', RGB.lilac],
      ['interviewing', RGB.tangerine],
      ['offer', RGB.mint],
      ['closed', RGB.stone],
    ] as const) {
      const badge = page.locator(`#tiles .kit-stage-mark[data-variant="badge"][data-stage="${stage}"]`).first()
      await expectStyles(badge, { 'background-color': fill, 'border-top-width': '2px', 'border-top-color': RGB.ink })
      // The count block of the pipeline wears the same colour, as a 40px rounded square.
      await expectStyles(page.locator(`#tiles .kit-stage-mark[data-variant="count"][data-stage="${stage}"]`).first(), {
        'background-color': fill,
        width: '40px',
        height: '40px',
        'border-top-left-radius': '12px',
        'font-weight': '800',
      })
      await expectStyles(page.locator(`#tiles .kit-stage-mark[data-variant="dot"][data-stage="${stage}"]`).first(), { 'background-color': fill, width: '12px', height: '12px', 'border-top-left-radius': '50%' })
    }
  })

  test('count pill: 26px, 2px ink, display type, tone by meaning (rose / lemon / mint / white)', async ({ page }) => {
    await gallery(page)
    const pills = page.locator('#badge .kit-count[data-variant="pill"]')
    for (const [index, fill] of [RGB.rose, RGB.lemon, RGB.mint, RGB.surface].entries()) {
      await expectStyles(pills.nth(index), {
        'background-color': fill,
        height: '26px',
        'border-top-width': '2px',
        'border-top-color': RGB.ink,
        'font-weight': '800',
        'font-size': '13px',
      })
    }
    await expectFont(pills.first(), 'display')
    // A three digit count grows the pill, never shrinks the type below 12px.
    const wide = pills.nth(4)
    expect((await box(wide)).width).toBeGreaterThan(26)
    expect(parseFloat((await styles(wide, ['font-size']))['font-size']!)).toBeGreaterThanOrEqual(12)
  })

  test('verdict and issues chips: mint -3deg and white +2.5deg stickers, sh-1, radius 16', async ({ page }) => {
    await gallery(page)
    const chips = page.locator('#sticker .kit-sticker--sm')
    const verdict = chips.filter({ hasText: 'Strong foundation' }).first()
    const issues = chips.filter({ hasText: 'issues' }).first()
    await expectStyles(verdict, { 'background-color': RGB.mint, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh1, 'border-top-left-radius': '16px' }, '::before')
    await expectStyles(issues, { 'background-color': RGB.surface, 'box-shadow': SH.sh1 }, '::before')
    expect(await plateTilt(verdict)).toBeCloseTo(-3, 1)
    expect(await plateTilt(issues)).toBeCloseTo(2.5, 1)
    // The text block itself never rotates.
    expect((await styles(verdict, ['transform']))['transform']).toBe('none')
  })

  test('Kbd: 22px, 12/700, radius 6, white, 2px outline and a 1px shadow', async ({ page }) => {
    await gallery(page)
    await expectStyles(page.locator('#badge .kit-kbd').first(), {
      height: '22px',
      'font-size': '12px',
      'font-weight': '700',
      'border-top-left-radius': '6px',
      'background-color': RGB.surface,
      'border-top-width': '2px',
      'border-top-color': RGB.ink,
      'box-shadow': SH.kbd,
      'padding-left': '6px',
    })
  })

  test('Avatar: lilac disc, 2px ink, display initials 800', async ({ page }) => {
    await gallery(page)
    const avatar = page.locator('#badge .kit-avatar').first()
    await expectStyles(avatar, { 'background-color': RGB.lilac, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': /^(50%|999px|9999px)$/, 'font-weight': '800' })
    await expectFont(avatar, 'display')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 1.9  The score seal
// ───────────────────────────────────────────────────────────────────────────

test.describe('score seal (1.9)', () => {
  const SIZES: Array<[string, number]> = [
    ['Resume score (hero)', 300],
    ['Example score sm', 170],
    // Sign-off r2 (account-admin-F17): the named ladder only grows now, md 220 (phones, 404) < lg 230 (closer).
    ['Example score md', 220],
    ['Example score lg', 230],
  ]

  test('geometry: viewBox 220, 18 lobes at R 93 +/- 5 sampled 361 times, tangerine fill, ink 2.6 stroke', async ({ page }) => {
    await gallery(page)
    const hero = seal(page, 'Resume score (hero)')
    const svg = hero.locator('svg')
    await expect(svg).toHaveAttribute('viewBox', '0 0 220 220')
    const path = (await hero.locator('.kit-seal__shape').getAttribute('d'))!
    const points = path.slice(1, -1).split('L').map((p) => p.split(',').map(Number) as [number, number])
    expect(points).toHaveLength(361)
    expect(path.endsWith('Z')).toBe(true)
    // r(t) = 93 + 5 cos(18 t), centre (110, 110)
    points.forEach(([x, y], i) => {
      const t = (i / 360) * Math.PI * 2
      const r = 93 + 5 * Math.cos(18 * t)
      expect(Math.hypot(x - 110, y - 110)).toBeCloseTo(r, 1)
    })
    const radii = points.map(([x, y]) => Math.hypot(x - 110, y - 110))
    expect(Math.max(...radii)).toBeCloseTo(98, 0)
    expect(Math.min(...radii)).toBeCloseTo(88, 0)

    await expectStyles(hero.locator('.kit-seal__shape'), { fill: RGB.tangerine, stroke: RGB.ink, 'stroke-width': '2.6px', 'stroke-linejoin': 'round' })
    // The shadow: the same path in ink, offset 7 units down-right (3.2% of the seal size).
    await expectStyles(hero.locator('.kit-seal__shadow'), { fill: RGB.ink, transform: 'matrix(1, 0, 0, 1, 7, 7)' })
    // The dotted inner ring.
    await expectStyles(hero.locator('.kit-seal__ring'), { fill: 'none', stroke: RGB.ink, 'stroke-width': '1.6px', 'stroke-dasharray': '2px, 6px', 'stroke-linecap': 'round' })
    expect(await hero.locator('.kit-seal__ring').getAttribute('r')).toBe('80')
  })

  for (const [name, size] of SIZES) {
    test(`size ${size}px: numeral 0.44 x, unit 0.075 x, line-height 0.85, tilt -4deg (${name})`, async ({ page }) => {
      await gallery(page)
      const s = seal(page, name)
      expect((await box(s)).offsetWidth).toBe(size)
      expect(angleOf((await styles(s, ['transform']))['transform']!)).toBeCloseTo(-4, 1)

      const num = s.locator('.kit-seal__num')
      const numStyle = await styles(num, ['font-size', 'font-weight', 'font-stretch', 'letter-spacing', 'line-height', 'font-variant-numeric', 'font-family', 'color'])
      expect(parseFloat(numStyle['font-size']!)).toBeCloseTo(0.44 * size, 1)
      expect(numStyle['font-weight']).toBe('800')
      expect(numStyle['font-stretch']).toBe('100%')
      expect(numStyle['font-variant-numeric']).toBe('tabular-nums')
      expect(numStyle['color']).toBe(RGB.ink)
      expectDisplayFont(numStyle['font-family']!)
      expect(parseFloat(numStyle['line-height']!)).toBeCloseTo(0.85 * parseFloat(numStyle['font-size']!), 1)
      const ratio = parseFloat(numStyle['letter-spacing']!) / parseFloat(numStyle['font-size']!)
      // -0.05em on the big seals, -0.04em on the small ones (data-small).
      expect(ratio).toBeCloseTo(size <= 200 ? -0.04 : -0.05, 2)

      const unit = s.locator('.kit-seal__of')
      const unitStyle = await styles(unit, ['font-size', 'font-weight'])
      expect(parseFloat(unitStyle['font-size']!)).toBeCloseTo(0.075 * size, 1)
      expect(unitStyle['font-weight']).toBe('700')
      expect((await styles(unit, ['font-family']))['font-family']).toContain(FONT.ui)
      await expect(unit).toHaveText('/100')
    })
  }

  test('tones: tangerine by default, lemon (closer), mint, lilac, stone for a missing score', async ({ page }) => {
    await gallery(page)
    const fills: Array<[string, string]> = [
      ['Example score sm', RGB.tangerine],
      // The lemon closer seal is the lg specimen since the size ladder was reordered (account-admin-F17).
      ['Example score lg', RGB.lemon],
      ['Mint score', RGB.mint],
      ['Lilac score', RGB.lilac],
      ['Missing score', RGB.stone],
    ]
    for (const [name, fill] of fills) {
      await expectStyles(seal(page, name).locator('.kit-seal__shape'), { fill, stroke: RGB.ink })
    }
    const missing = seal(page, 'Missing score')
    await expect(missing).toHaveAttribute('data-missing', 'true')
    await expect(missing.locator('.kit-seal__num')).toHaveText('–')
    await expect(missing.locator('.kit-seal__of')).toHaveCount(0)
    await expect(missing.getByText('not available')).toHaveCount(1)
  })

  test('three digits step down so the numeral clears the dotted ring (5.7 item 7)', async ({ page }) => {
    await gallery(page)
    const perfect = seal(page, 'Perfect score')
    const size = (await box(perfect)).offsetWidth
    const num = perfect.locator('.kit-seal__num')
    expect(parseFloat((await styles(num, ['font-size']))['font-size']!)).toBeCloseTo(0.34 * size, 1)
    const numWidth = await num.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getBoundingClientRect().width
    })
    // The ring is r=80 of 220: its diameter at this size. Rotation inflates the measured rect by a few px.
    const ring = (160 / 220) * size
    expect(numWidth).toBeLessThan(ring - 12)
    // 404 is three characters too, and ships with no unit.
    const notFound = seal(page, 'Error 404')
    expect(parseFloat((await styles(notFound.locator('.kit-seal__num'), ['font-size']))['font-size']!)).toBeCloseTo(0.34 * (await box(notFound)).offsetWidth, 1)
    await expect(notFound.locator('.kit-seal__of')).toHaveCount(0)
  })

  test('the value is a term and a description, never the animated numeral (3.N1)', async ({ page }) => {
    await gallery(page)
    const hero = seal(page, 'Resume score (hero)')
    await expect(page.getByRole('term').filter({ hasText: 'Resume score (hero)' })).toHaveCount(1)
    await expect(hero.locator('dd')).toContainText('77 out of 100')
    await expect(hero.locator('.kit-seal__body')).toHaveAttribute('aria-hidden', 'true')
    await expect(hero.locator('.kit-seal__art')).toHaveAttribute('aria-hidden', 'true')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Stickers (1.2, 1.15), marks and tiles (1.12, 1.13), bars (1.12)
// ───────────────────────────────────────────────────────────────────────────

test.describe('stickers and marks', () => {
  test('sticker plates: tone fill, 2px ink, radius and shadow by size; the text block never rotates (1.2, 1.3, 1.15)', async ({ page }) => {
    await gallery(page)
    const md = page.locator('#sticker .kit-sticker--md').first()
    await expectStyles(md, { 'background-color': RGB.tangerine, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '24px', 'box-shadow': SH.sh2 }, '::before')
    await expect.poll(async () => (await styles(md, ['transform']))['transform']).toBe('none')
    expect((await styles(md, ['padding-left']))['padding-left']).toBe('20px')

    const sm = page.locator('#sticker .kit-sticker--sm').first()
    await expectStyles(sm, { 'border-top-left-radius': '16px', 'box-shadow': SH.sh1 }, '::before')
    expect((await styles(sm, ['padding-left']))['padding-left']).toBe('16px')

    const xl = page.locator('#sticker .kit-sticker--xl').first()
    await expectStyles(xl, { 'border-top-left-radius': '36px', 'box-shadow': SH.sh3, 'background-color': RGB.lilac }, '::before')
  })

  test('every tone of the palette is an ink-text sticker', async ({ page }) => {
    await gallery(page)
    const fills: Record<string, string> = {
      tangerine: RGB.tangerine,
      mint: RGB.mint,
      lilac: RGB.lilac,
      lemon: RGB.lemon,
      rose: RGB.rose,
      aqua: RGB.aqua,
      stone: RGB.stone,
      white: RGB.surface,
    }
    for (const [tone, fill] of Object.entries(fills)) {
      const sticker = page.locator(`#sticker .kit-sticker--md[data-tone="${tone}"]`).first()
      await expectStyles(sticker, { 'background-color': fill }, '::before')
      await expectStyles(sticker.locator('p').first(), { color: RGB.ink })
    }
  })

  test('tilt is clamped to 3 degrees and lives on the plate, not on the text (5.6)', async ({ page }) => {
    await gallery(page)
    const expected: Array<[number, number]> = [
      [-3, -3],
      [-2, -2],
      [0, 0],
      [1.6, 1.6],
      [3, 3],
      [12, 3],
    ]
    for (const [asked, got] of expected) {
      const sticker = page.getByTestId(`tilt-${asked}`)
      expect(await plateTilt(sticker), `tilt ${asked}`).toBeCloseTo(got, 1)
      expect((await styles(sticker, ['transform']))['transform']).toBe('none')
    }
  })

  test('pin: a 26px rose disc, 2px ink, sh-1, on the top edge of the note (1.15)', async ({ page }) => {
    await gallery(page)
    const note = page.locator('#sticker .kit-sticker[data-pin="true"]')
    await expectStyles(note, { 'background-color': RGB.rose, width: '26px', height: '26px', 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh1, 'border-top-left-radius': '50%' }, '::after')
    expect(await plateTilt(note)).toBeCloseTo(1.2, 1)
  })

  test('tool tiles: one tone per tool in the fixed order, 2px ink, radius by size (1.13)', async ({ page }) => {
    await gallery(page)
    const order = [RGB.tangerine, RGB.mint, RGB.lilac, RGB.lemon, RGB.rose, RGB.aqua]
    const md = page.locator('#tiles .kit-tool-tile--md')
    for (const [index, fill] of order.entries()) {
      await expectStyles(md.nth(index), { 'background-color': fill, width: '40px', height: '40px', 'border-top-left-radius': '12px', 'border-top-width': '2px', 'border-top-color': RGB.ink })
    }
    const sm = page.locator('#tiles .kit-tool-tile--sm')
    for (const [index, fill] of order.entries()) {
      await expectStyles(sm.nth(index), { 'background-color': fill, width: '28px', height: '28px', 'border-top-left-radius': '9px' })
    }
    await expectStyles(page.locator('#tiles .kit-tool-tile--lg').first(), { width: '56px', 'border-top-left-radius': '16px', 'box-shadow': SH.sh2 })
    await expectStyles(page.locator('#tiles .kit-tool-tile--xl').first(), { width: '120px', 'border-top-left-radius': '24px', 'box-shadow': SH.sh2, 'background-color': RGB.aqua })
    // Lucide icons at stroke 2, currentColor, 16 / 20 px.
    const icon = md.first().locator('svg')
    await expectStyles(icon, { width: '20px', height: '20px', 'stroke-width': '2px', stroke: RGB.ink })
    await expectStyles(sm.first().locator('svg'), { width: '16px', height: '16px' })
  })

  test('number disc: a 34px circle with display digits (1.10)', async ({ page }) => {
    await gallery(page)
    const disc = page.locator('#tiles .kit-number-disc:not(.kit-number-disc--sm):not(.kit-number-disc--lg)').first()
    await expectStyles(disc, { width: '34px', height: '34px', 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '50%', 'font-size': '18px', 'font-weight': '800', 'background-color': RGB.surface })
    await expectFont(disc, 'display')
  })

  test('round stamp: mint when above zero, stone at zero, rotated +8deg, dashed inner ring (1.15)', async ({ page }) => {
    await gallery(page)
    const stamps = page.locator('#tiles .kit-round-stamp')
    await expectStyles(stamps.first(), { 'background-color': RGB.mint, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh1, width: '84px', 'border-top-left-radius': '50%' })
    expect(angleOf((await styles(stamps.first(), ['transform']))['transform']!)).toBeCloseTo(8, 1)
    await expectStyles(stamps.first(), { 'border-top-style': 'dashed', 'border-top-width': /^1(\.5)?px$/, 'border-top-color': RGB.ink }, '::before')
    await expectStyles(stamps.nth(1), { 'background-color': RGB.stone })
    await expectFont(stamps.first().locator('.kit-round-stamp__value'), 'display')
  })

  test('highlight marker: an inset lemon shadow, bold, no gradient (5.7 item 4)', async ({ page }) => {
    await gallery(page)
    const mark = page.locator('#tiles .kit-highlight').first()
    const style = await styles(mark, ['box-shadow', 'background-image', 'font-weight'])
    expect(style['box-shadow']).toMatch(new RegExp(`^${RGB.lemon.replace(/[()]/g, '\\$&')} 0px -[\\d.]+px 0px 0px inset$`))
    expect(style['background-image']).toBe('none')
    expect(style['font-weight']).toBe('700')
  })
})

test.describe('bars and fit marks (1.12)', () => {
  test('score bar: 20px white track, 2px ink pill, ink fill with an ink end edge, display value 24/800', async ({ page }) => {
    await gallery(page)
    const bar = page.locator('#data .kit-score[data-size="md"]').first()
    await expectStyles(bar.locator('.kit-score__track'), { height: '20px', 'background-color': RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': /^(999|9999)px$/, 'box-shadow': SH.none })
    await expectStyles(bar.locator('.kit-score__fill'), { 'background-color': RGB.ink, 'border-right-width': '2px', 'border-right-color': RGB.ink, 'border-top-right-radius': /^(999|9999)px$/, 'border-top-left-radius': '0px' })
    const value = bar.locator('.kit-score__value')
    await expectStyles(value, { 'font-size': '24px', 'font-weight': '800', 'font-stretch': '100%', 'text-align': /^(right|end)$/, 'font-variant-numeric': 'tabular-nums' })
    await expectFont(value, 'display')
  })

  test('bars are neutral data: ink by default (even when auto resolves a tone), mint only where it is told, never rose by threshold (5.4)', async ({ page }) => {
    await gallery(page)
    // tone="auto" draws ink whatever the thresholds say.
    const autoFills = page.locator('#data .kit-score__fill[data-auto="true"]')
    const count = await autoFills.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) await expectStyles(autoFills.nth(i), { 'background-color': RGB.ink })
    // Explicit tones: accent tangerine, success mint, warning lemon, danger ink, ink. Danger was rose until sign-off
    // account-admin-AAG-F10: 5.4 says rose is never a bar colour, even when a page forces the tone.
    for (const [tone, fill] of [
      ['accent', RGB.tangerine],
      ['success', RGB.mint],
      ['warning', RGB.lemon],
      ['danger', RGB.ink],
      ['ink', RGB.ink],
    ] as const) {
      await expectStyles(page.locator(`#data .kit-score__fill[data-tone="${tone}"]:not([data-auto])`).first(), { 'background-color': fill })
    }
  })

  test('the small bar is a 14px track with a 15px value (skill fallback, landing example)', async ({ page }) => {
    await gallery(page)
    const bar = page.locator('#tiles .kit-skill-pips[data-mode="bar"] .kit-score').first()
    await expectStyles(bar.locator('.kit-score__track'), { height: '14px', 'border-top-width': '2px' })
    expect(parseFloat((await styles(bar.locator('.kit-score__value'), ['font-size']))['font-size']!)).toBeGreaterThanOrEqual(15)
  })

  test('inline bar rows: label column 148px, value column 56px, gap 16 (1.12)', async ({ page }) => {
    await gallery(page)
    const row = page.locator('#data .kit-score[data-layout="inline"][data-labelled]').first()
    const grid = await styles(row, ['grid-template-columns', 'column-gap'])
    const columns = grid['grid-template-columns']!.split(' ').map(parseFloat)
    expect(columns).toHaveLength(3)
    expect(columns[0]).toBe(148)
    expect(columns[2]).toBe(56)
    expect(grid['column-gap']).toBe('16px')
  })

  test('skill pips: 8 x 14, 2px ink, radius 3, gap 3, matched mint; more than 10 skills becomes a bar', async ({ page }) => {
    await gallery(page)
    const pips = specimen(page, /^5 of 7$/, '#tiles').locator('.kit-skill-pips__pip')
    await expect(pips).toHaveCount(7)
    for (let i = 0; i < 7; i++) {
      await expectStyles(pips.nth(i), {
        width: '8px',
        height: '14px',
        'border-top-width': '2px',
        'border-top-color': RGB.ink,
        'border-top-left-radius': '3px',
        'background-color': i < 5 ? RGB.mint : RGB.surface,
      })
    }
    expect((await styles(specimen(page, /^5 of 7$/, '#tiles').locator('.kit-skill-pips'), ['column-gap']))['column-gap']).toBe('3px')
    await expect(specimen(page, /^11 of 14$/, '#tiles').locator('.kit-skill-pips[data-mode="bar"]')).toHaveCount(1)
    await expect(specimen(page, /^11 of 14$/, '#tiles').locator('.kit-skill-pips__pip')).toHaveCount(0)
  })

  test('fit stamp: 60 x 52, radius 16, sh-1; mint from 80, lemon 65-79, white below; three digits step down', async ({ page }) => {
    await gallery(page)
    const fits = page.locator('#tiles .kit-fit-stamp')
    const cases: Array<[number, string]> = [
      [0, RGB.mint], // 94
      [1, RGB.mint], // 88
      [2, RGB.lemon], // 73
      [3, RGB.surface], // 64
      [4, RGB.mint], // 100
    ]
    for (const [index, fill] of cases) {
      await expectStyles(fits.nth(index), {
        'background-color': fill,
        width: '60px',
        height: '52px',
        'border-top-width': '2px',
        'border-top-color': RGB.ink,
        'border-top-left-radius': '16px',
        'box-shadow': SH.sh1,
        'font-weight': '800',
        'font-stretch': '100%',
        'font-variant-numeric': 'tabular-nums',
      })
    }
    expect((await styles(fits.nth(0), ['font-size']))['font-size']).toBe('24px')
    expect((await styles(fits.nth(4), ['font-size']))['font-size']).toBe('20px')
    await expectFont(fits.first(), 'display')
    // The small stamp is 52 x 48; 100 (small) is still readable.
    const small = page.locator('#tiles .kit-fit-stamp[data-size="sm"]').first()
    await expectStyles(small, { width: '52px', height: '48px' })
    // "100%" in the phone stamp steps down to 16px and keeps clear of the outline on both sides (5.7.7).
    expect((await styles(small, ['font-size']))['font-size']).toBe('16px')
    const room = await small.evaluate((el) => el.clientWidth - el.scrollWidth)
    expect(room).toBeGreaterThanOrEqual(0)
    const inner = await small.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(el)
      const text = range.getBoundingClientRect()
      return { left: text.left - box.left - 2, right: box.right - 2 - text.right }
    })
    expect(Math.min(inner.left, inner.right)).toBeGreaterThanOrEqual(4)
    // No fit renders an en dash on white, with an accessible name.
    await expect(page.locator('#tiles .kit-fit-stamp[aria-label="Fit not available"]')).toHaveCount(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 1.11 Tabs, 1.16 Fields / panels / notices / empty states, overlays
// ───────────────────────────────────────────────────────────────────────────

test.describe('tabs, fields and surfaces (1.11, 1.16)', () => {
  test('folder tabs: stone, 16/16/0/0, selected opens into a white panel, 44px, 14/600 (1.11)', async ({ page }) => {
    await gallery(page)
    const tabs = page.locator('#tabs .kit-tabs').first()
    const list = tabs.locator('.kit-tabs__list')
    await expectStyles(list, { 'column-gap': '4px', 'padding-left': '12px', 'margin-bottom': '-2px', 'z-index': '1' })
    const inactive = tabs.locator('.kit-tabs__trigger[data-state="inactive"]').first()
    await expectStyles(inactive, {
      'background-color': RGB.stone,
      color: RGB.ink2,
      'min-height': '44px',
      'font-size': '14px',
      'font-weight': '600',
      'border-top-width': '2px',
      'border-top-color': RGB.ink,
      'border-top-left-radius': '16px',
      'border-bottom-left-radius': '0px',
      'box-shadow': SH.none,
    })
    const active = tabs.locator('.kit-tabs__trigger[data-state="active"]')
    await expectStyles(active, { 'background-color': RGB.surface, color: RGB.ink, 'font-weight': '700', 'border-bottom-color': RGB.surface, 'border-top-color': RGB.ink, 'box-shadow': SH.none })
    await expectStyles(tabs.locator('.kit-tabs__panel').first(), { 'background-color': RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '24px', 'padding-top': '16px', 'box-shadow': SH.none })
    // The count inside a tab: a 20px pill.
    await expectStyles(tabs.locator('.kit-tabs__trigger .kit-count').first(), { height: '20px', 'font-size': '12px', 'border-top-width': '2px' })
  })

  test('tab hover tints lemon-soft, focus draws the 3px ring inside the border, disabled is flat (1.11)', async ({ page }) => {
    await gallery(page)
    const tabs = page.locator('#tabs .kit-tabs').first()
    const saved = tabs.getByRole('tab', { name: /^Saved/ })
    await saved.hover()
    await expect.poll(async () => (await styles(saved, ['background-color']))['background-color']).toBe(RGB.lemonSoft)
    await expectStyles(saved, { 'box-shadow': SH.none })
    await expectStill(saved)
    await page.mouse.move(0, 0)
    await page.keyboard.press('Tab')
    await saved.focus()
    await expectStyles(saved, { 'outline-style': 'solid', 'outline-width': '3px', 'outline-color': RGB.ink, 'border-top-left-radius': '16px' })
    const archive = tabs.getByRole('tab', { name: 'Archive' })
    await expectStyles(archive, { color: RGB.ink3, 'background-color': RGB.stone, cursor: 'not-allowed' })
  })

  test('inputs: white, 2px ink, radius 12, 44px, 15/500, no shadow; focus warms the fill and rings it (1.16)', async ({ page }) => {
    await gallery(page)
    const frame = specimen(page, /^default, empty$/, '#field').locator('.kit-input').first()
    await expectStyles(frame, {
      'background-color': RGB.surface,
      'border-top-width': '2px',
      'border-top-color': RGB.ink,
      'border-top-left-radius': '12px',
      height: '44px',
      'box-shadow': SH.none,
    })
    const control = frame.locator('.kit-input__control')
    await expectStyles(control, { 'font-size': '15px', 'font-weight': '500', color: RGB.ink })
    await expectFont(control, 'ui')
    expect((await styles(frame, ['padding-left']))['padding-left']).toBe('16px')
    await page.keyboard.press('Tab')
    await control.focus()
    await expectStyles(frame, { 'background-color': RGB.focusFill, 'outline-style': 'solid', 'outline-width': '3px', 'outline-color': RGB.ink, 'outline-offset': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.none })
  })

  test('input sizes 36 / 44 / 56 and the textarea (min 120, radius 12, padding 12 16)', async ({ page }) => {
    await gallery(page)
    for (const [label, height] of [
      [/^sm \(36\)$/, '36px'],
      [/^md \(44, default\)$/, '44px'],
      [/^lg \(56\)$/, '56px'],
    ] as const) {
      await expectStyles(specimen(page, label, '#field').locator('.kit-input').first(), { height })
    }
    const textarea = page.locator('#field .kit-textarea').first()
    await expectStyles(textarea, { 'min-height': '120px', 'border-top-left-radius': '12px', 'padding-top': '12px', 'padding-left': '16px', 'border-top-width': '2px', 'border-top-color': RGB.ink, 'line-height': '22.5px' })
  })

  test('invalid: the outline stays ink and the fill turns rose-soft; the message is danger ink (1.16)', async ({ page }) => {
    await gallery(page)
    const frame = specimen(page, /^invalid$/, '#field').locator('.kit-input').first()
    await expectStyles(frame, { 'border-top-color': RGB.ink, 'border-top-width': '2px', 'background-color': RGB.roseSoft })
    const message = page.locator('#field .kit-field__error').first()
    await expectStyles(message, { color: RGB.dangerInk, 'font-weight': '600', 'font-size': '14px' })
    await expect(message.locator('svg')).toHaveCount(1)
    await expectStyles(page.locator('#field .kit-field__label').first(), { 'font-size': '14px', 'font-weight': '700', color: RGB.ink })
  })

  test('disabled and read-only inputs are quiet stone, not a different outline (5.11)', async ({ page }) => {
    await gallery(page)
    const disabled = specimen(page, /^disabled$/, '#field').locator('.kit-input').first()
    await expectStyles(disabled, { 'border-top-width': '2px', 'border-top-left-radius': '12px', 'box-shadow': SH.none })
    expect((await styles(disabled, ['background-color']))['background-color']).not.toBe(RGB.surface)
  })

  test('panel: white, 2px ink, radius 24, flat; empty state is die-cut (2px dashed, 24, lemon disc rotated -8deg) (1.16)', async ({ page }) => {
    await gallery(page)
    await expectStyles(page.locator('#panel .kit-panel-surface').first(), { 'background-color': RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '24px', 'box-shadow': SH.none })

    const empty = page.locator('#state .kit-empty:not(.kit-error)').first()
    await expectStyles(empty, { 'border-top-style': 'dashed', 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '24px', 'background-color': RGB.surface, 'padding-top': '20px' })
    const disc = page.locator('#state .kit-empty__icon').first()
    await expectStyles(disc, { 'background-color': RGB.lemon, 'border-top-width': '2px', 'border-top-color': RGB.ink, width: '44px', height: '44px' })
    expect(angleOf((await styles(disc, ['transform']))['transform']!)).toBeCloseTo(-8, 1)
    await expectFont(page.locator('#state .kit-empty__title').first(), 'display')
    expect((await styles(page.locator('#state .kit-empty__title').first(), ['font-size']))['font-size']).toBe('20px')
  })

  test('notice: 2px ink, radius 16, padding 16, lemon-soft by default (1.16)', async ({ page }) => {
    await gallery(page)
    await expectStyles(page.locator('#surface .kit-notice').first(), { 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '16px', 'padding-top': '16px', 'background-color': RGB.lemonSoft, 'box-shadow': SH.none })
  })

  test('overlays: dialog radius 24 + sh-3; menu, popover and toast radius 16 + sh-2; all white, 2px ink', async ({ page }) => {
    await gallery(page)
    for (const [selector, radius, shadow] of [
      ['#dialog .kit-dialog', '24px', SH.sh3],
      ['#menu .kit-menu', '16px', SH.sh2],
      ['#floating .kit-popover', '16px', SH.sh2],
      ['#toast .kit-toast', '16px', SH.sh2],
    ] as const) {
      await expectStyles(page.locator(selector).first(), { 'background-color': RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': radius, 'box-shadow': shadow })
    }
  })

  test('jump nav: 40px flat links, current is lemon with a 2px ink outline and 700 weight (1.11)', async ({ page }) => {
    await gallery(page)
    const nav = page.locator('#jumpnav .kit-jump-nav').first()
    await expectStyles(nav, { 'background-color': RGB.ground })
    const links = nav.locator('.kit-jump-nav__link')
    const current = nav.locator('.kit-jump-nav__link[aria-current]')
    await expect(current).toHaveCount(1)
    await expectStyles(current, { 'background-color': RGB.lemon, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'font-weight': '700', 'min-height': '40px', 'border-top-left-radius': '12px', color: RGB.ink })
    const rest = links.filter({ hasNot: page.locator('[aria-current]') }).nth(1)
    await expectStyles(rest, { color: RGB.ink2, 'font-weight': '600', 'min-height': '40px', 'border-top-left-radius': '12px' })
    await rest.hover()
    await expect.poll(async () => (await styles(rest, ['background-color']))['background-color']).toBe(RGB.lemonSoft)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 6  Motion: reduced motion shows the final state; with motion the signature plays
// ───────────────────────────────────────────────────────────────────────────

test.describe('motion (6)', () => {
  test.describe('reduced motion', () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
    })

    test('the seal stamp and the sticker slap render their final state at once, with no animation', async ({ page }) => {
      await gallery(page)
      await expectMotionPreference(page, 'reduce')
      await page.getByRole('button', { name: 'Replay the stamp' }).click()
      await page.getByRole('button', { name: 'Replay the slap' }).click()
      const stamped = seal(page, 'Resume score (reveal)')
      const early = await stamped.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { opacity: cs.opacity, name: cs.animationName, running: el.getAnimations().length, transform: cs.transform, shadow: el.querySelector('.kit-seal__shadow') ? getComputedStyle(el.querySelector('.kit-seal__shadow')!).animationName : 'missing' }
      })
      expect(early.opacity).toBe('1')
      expect(early.name).toBe('none')
      expect(early.running).toBe(0)
      expect(angleOf(early.transform)).toBeCloseTo(-4, 1)
      expect(early.shadow).toBe('none')
      // The numeral is the final value from the first frame (no count-up).
      await expect(stamped.locator('.kit-seal__num')).toHaveText('77')

      const slaps = page.locator('#sticker .kit-sticker[data-reveal="slap"]')
      expect(await slaps.count()).toBe(3)
      for (let i = 0; i < 3; i++) {
        const state = await slaps.nth(i).evaluate((el) => ({ opacity: getComputedStyle(el).opacity, name: getComputedStyle(el).animationName, running: el.getAnimations().length }))
        expect(state).toEqual({ opacity: '1', name: 'none', running: 0 })
      }
    })

    test('duration tokens collapse; buttons stop transitioning; smooth scroll is off; the spinner slows instead of stopping', async ({ page }) => {
      await gallery(page)
      await expectMotionPreference(page, 'reduce')
      const state = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const button = getComputedStyle(document.querySelector('#button .kit-button--primary')!)
        return {
          dur1: root.getPropertyValue('--dur-1').trim(),
          dur2: root.getPropertyValue('--dur-2').trim(),
          dur3: root.getPropertyValue('--dur-3').trim(),
          stamp: root.getPropertyValue('--stamp-ms').trim(),
          slap: root.getPropertyValue('--slap-ms').trim(),
          scroll: root.scrollBehavior,
          transition: button.transitionProperty,
          spinner: getComputedStyle(document.querySelector('.kit-button__spinner')!).animationDuration,
        }
      })
      expect(state.dur1).toBe('0.01ms')
      expect(state.dur2).toBe('0.01ms')
      expect(state.dur3).toBe('0.01ms')
      expect(state.stamp).toBe('0.01ms')
      expect(state.slap).toBe('0.01ms')
      expect(state.scroll).toBe('auto')
      expect(state.transition).toBe('none')
      expect(state.spinner).toBe('2s')
    })

    test('buttons still change shadow on press (a state change), but nothing translates', async ({ page }) => {
      await gallery(page)
      await expectMotionPreference(page, 'reduce')
      const button = page.locator('#button .kit-button--secondary.kit-button--md:not([data-demo]):not([disabled]):not([data-loading])').first()
      await button.hover()
      await page.mouse.down()
      await expect.poll(async () => (await styles(button, ['box-shadow']))['box-shadow']).toBe(SH.sh0)
      expect(translationOf((await styles(button, ['transform']))['transform']!)).toEqual([0, 0])
      await page.mouse.up()
    })
  })

  test.describe('with motion', () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    })

    test('the seal stamps in and the stickers slap on, in that order, then rest level', async ({ page }) => {
      await gallery(page)
      await expectMotionPreference(page, 'no-preference')
      await page.getByRole('button', { name: 'Replay the stamp' }).click()
      const stamped = seal(page, 'Resume score (reveal)')
      const start = await stamped.evaluate((el) => ({ opacity: getComputedStyle(el).opacity, name: getComputedStyle(el).animationName, running: el.getAnimations().length }))
      expect(start).toEqual({ opacity: '0', name: 'kit-stamp', running: expect.any(Number) })
      expect(start.running).toBeGreaterThan(0)

      await page.getByRole('button', { name: 'Replay the slap' }).click()
      const slapStart = await page.locator('#sticker .kit-sticker[data-reveal="slap"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity))
      expect(slapStart).toEqual(['0', '0', '0'])

      await expect.poll(async () => stamped.evaluate((el) => el.getAnimations().length), { timeout: 3000 }).toBe(0)
      await page.waitForTimeout(1900) // the last slap starts at 1280ms and lasts 420ms
      expect(await stamped.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
      expect(angleOf((await styles(stamped, ['transform']))['transform']!)).toBeCloseTo(-4, 1)
      const slaps = page.locator('#sticker .kit-sticker[data-reveal="slap"]')
      for (let i = 0; i < 3; i++) {
        const done = await slaps.nth(i).evaluate((el) => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform, running: el.getAnimations().length }))
        expect(done).toEqual({ opacity: '1', transform: 'none', running: 0 })
      }
      await expect(stamped.locator('.kit-seal__num')).toHaveText('77')
    })

    test('smooth scrolling is on only when motion is allowed (5.7 item 11)', async ({ page }) => {
      await gallery(page)
      await expectMotionPreference(page, 'no-preference')
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('smooth')
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Geometry: no overflow at the three phone and desktop widths
// ───────────────────────────────────────────────────────────────────────────

test.describe('geometry', () => {
  for (const width of [1440, 390, 320]) {
    test(`the gallery has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      // Reduced motion: the mount reveals (a seal that flies in at 1.9x scale) are at rest, so only layout is measured.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await gallery(page)
      // The one specimen that is deliberately 26rem wide (a plain auto-layout table) is a demo of the failure mode, not a component.
      await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="button-auto-table"]')?.style.setProperty('display', 'none'))
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }
})

// ───────────────────────────────────────────────────────────────────────────
// Finished pages that need no data
// ───────────────────────────────────────────────────────────────────────────

test.describe('landing page (/)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/', '.lp-collage__strength')
  })

  test('the ground, the hero headline and the CTA pair (1.4, 1.7, 5.3)', async ({ page }) => {
    await expectStyles(page.locator('body'), { 'background-color': RGB.ground })
    const h1 = page.locator('h1').first()
    await expectStyles(h1, { 'font-size': '72px', 'font-weight': '800', 'line-height': '69.12px', 'letter-spacing': '-2.304px', color: RGB.ink, 'font-stretch': '100%' })
    await expectFont(h1, 'display')
    await expectStyles(page.locator('.lp-hero-body'), { 'font-size': '19px', color: RGB.ink2, 'font-weight': '400' })

    const primary = page.locator('.lp-hero-actions .kit-button--primary')
    await expectStyles(primary, { 'background-color': RGB.tangerine, 'min-height': '56px', 'border-top-left-radius': '24px', 'box-shadow': SH.sh2, 'font-size': '17px', color: RGB.ink })
    await expectStyles(page.locator('.lp-hero-actions .kit-button--secondary'), { 'background-color': RGB.surface, 'min-height': '56px', 'box-shadow': SH.sh2 })

    // One filled primary per section: the hero and the closer, nothing else.
    const perSection = await page.evaluate(() => [...document.querySelectorAll('main > section')].map((s) => [s.id, s.querySelectorAll('.kit-button--primary').length]))
    for (const [id, count] of perSection) expect(count, String(id)).toBeLessThanOrEqual(1)
    expect(perSection.reduce((sum, [, n]) => sum + Number(n), 0)).toBeLessThanOrEqual(2)
  })

  test('the nav: a -6deg tangerine brand mark and exactly one lemon current link (1.6, 1.14)', async ({ page }) => {
    const mark = page.locator('.lp-nav__brand .cw-brand-mark')
    await expectStyles(mark, { 'background-color': RGB.tangerine, width: '38px', height: '38px', 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '12px', 'box-shadow': SH.sh1 })
    expect(angleOf((await styles(mark, ['transform']))['transform']!)).toBeCloseTo(-6, 1)
    const wordmark = page.locator('.lp-nav__brand .cw-brand-wordmark')
    await expectStyles(wordmark, { 'font-size': '19px', 'font-weight': '800', 'letter-spacing': '-0.38px' })
    await expectFont(wordmark, 'display')

    const links = page.locator('.lp-nav__link')
    const fills = await links.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
    expect(fills.filter((fill) => fill === RGB.lemon)).toHaveLength(1)
    const current = links.nth(fills.indexOf(RGB.lemon))
    await expectStyles(current, { 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh1, 'font-weight': '700', 'border-top-left-radius': '12px', 'min-height': '44px' })
  })

  test('the beta tag is a -2deg lemon tag with sh-1 (1.8, 1.15)', async ({ page }) => {
    const tag = page.locator('.lp-beta')
    await expectStyles(tag, { 'background-color': RGB.lemon, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh1 }, '::before')
    expect(await plateTilt(tag)).toBeCloseTo(-2, 1)
  })

  test('the hero collage: a lilac-soft desk with five plates at their registry tilts and tones (1.15, 5.2)', async ({ page }) => {
    const desk = page.locator('.lp-collage')
    await expectStyles(desk, { 'background-color': RGB.lilacSoft, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '36px', width: '620px' })
    const plates: Array<[string, number, string]> = [
      ['.lp-collage__tab', -3, RGB.surface],
      ['.lp-collage__card', 1, RGB.surface],
      ['.lp-collage__fix', -2, RGB.lemon],
      ['.lp-collage__strength', 1.2, RGB.mint],
      ['.lp-collage__match', 2, RGB.surface],
    ]
    for (const [selector, tilt, fill] of plates) {
      const plate = page.locator(selector)
      expect(await plateTilt(plate), selector).toBeCloseTo(tilt, 1)
      await expectStyles(plate, { 'background-color': fill, 'border-top-width': '2px', 'border-top-color': RGB.ink }, '::before')
      expect((await styles(plate, ['transform']))['transform'], `${selector} text block`).toBe('none')
    }
    await expect(page.locator('.lp-collage__tab')).toHaveText('Example result')
    await expectStyles(page.locator('.lp-collage__card'), { 'box-shadow': SH.sh2 }, '::before')
    await expectStyles(page.locator('.lp-collage__tab'), { 'box-shadow': SH.sh1 }, '::before')
  })

  test('the example card: a 170px tangerine seal and four mint mini bars (1.9, 1.12)', async ({ page }) => {
    const exampleSeal = page.locator('.lp-collage .kit-seal')
    expect((await box(exampleSeal)).offsetWidth).toBeGreaterThanOrEqual(166)
    expect((await box(exampleSeal)).offsetWidth).toBeLessThanOrEqual(170)
    await expectStyles(exampleSeal.locator('.kit-seal__shape'), { fill: RGB.tangerine })
    const bars = page.locator('.lp-collage .kit-score')
    await expect(bars).toHaveCount(5) // four dimensions in the card and the Job Match fit
    for (let i = 0; i < 5; i++) {
      await expectStyles(bars.nth(i).locator('.kit-score__track'), { height: '14px', 'border-top-width': '2px', 'background-color': RGB.surface })
      await expectStyles(bars.nth(i).locator('.kit-score__fill'), { 'background-color': RGB.mint })
    }
  })

  test('pinned note: a rose pin on the top edge, +1.2deg (1.15)', async ({ page }) => {
    const note = page.locator('.lp-note')
    await expectStyles(note, { 'background-color': RGB.rose, width: '26px', height: '26px', 'box-shadow': SH.sh1 }, '::after')
    expect(await plateTilt(note)).toBeCloseTo(1.2, 1)
    // The "Built for" line marks its audiences with the lemon marker, not a gradient.
    const mark = page.locator('.lp-band__for .kit-highlight').first()
    expect((await styles(mark, ['box-shadow']))['box-shadow']).toContain(RGB.lemon)
    expect((await styles(mark, ['background-image']))['background-image']).toBe('none')
  })

  test('Review / Aim / Build: three xl stickers, tangerine, mint, lilac, tilted -1.4 / 1 / -0.8 (1.15)', async ({ page }) => {
    const cards = page.locator('.lp-workflow-card')
    await expect(cards).toHaveCount(3)
    for (const [index, tilt, fill] of [
      [0, -1.4, RGB.tangerine],
      [1, 1, RGB.mint],
      [2, -0.8, RGB.lilac],
    ] as const) {
      const card = cards.nth(index)
      expect(await plateTilt(card)).toBeCloseTo(tilt, 1)
      await expectStyles(card, { 'background-color': fill, 'border-top-left-radius': '36px', 'box-shadow': SH.sh3, 'border-top-width': '2px' }, '::before')
    }
    await expectStyles(cards.first().locator('.kit-number-disc'), { width: '44px', height: '44px', 'font-size': '24px' })
    const title = page.locator('.lp-workflow-title').first()
    await expectFont(title, 'display')
  })

  test('the tool list: six index blocks in the fixed colour order, 104px wide, in a 24px-radius panel (1.13, 1.5)', async ({ page }) => {
    const blocks = page.locator('#landing-tools .kit-tool-tile--index')
    await expect(blocks).toHaveCount(6)
    for (const [index, fill] of [RGB.tangerine, RGB.mint, RGB.lilac, RGB.lemon, RGB.rose, RGB.aqua].entries()) {
      await expectStyles(blocks.nth(index), { 'background-color': fill, width: '104px' })
    }
    await expectStyles(page.locator('#landing-tools .kit-panel-surface'), { 'border-top-left-radius': '24px', 'border-top-width': '2px', 'background-color': RGB.surface })
    await expectStyles(page.locator('#landing-tools .lp-display--l'), { 'font-size': '68px', 'font-weight': '800', 'letter-spacing': '-2.04px' })
  })

  test('the closer: a white xl sticker with the one 10px shadow, a 230px lemon seal, two tags (1.2, 1.9)', async ({ page }) => {
    const card = page.locator('.lp-cta-card')
    await expectStyles(card, { 'background-color': RGB.surface, 'border-top-left-radius': '36px', 'box-shadow': SH.sh4, 'border-top-width': '2px' }, '::before')
    const closerSeal = page.locator('.lp-cta-seal')
    expect((await box(closerSeal)).offsetWidth).toBe(230)
    await expectStyles(closerSeal.locator('.kit-seal__shape'), { fill: RGB.lemon })
    await expectStyles(page.locator('.lp-cta-tag--good'), { 'background-color': RGB.mint }, '::before')
    await expectStyles(page.locator('.lp-cta-tag--issues'), { 'background-color': RGB.surface }, '::before')
    expect(Math.abs(await plateTilt(page.locator('.lp-cta-tag--good')))).toBeGreaterThanOrEqual(2.5)
    expect(Math.abs(await plateTilt(page.locator('.lp-cta-tag--good')))).toBeLessThanOrEqual(3.01)
    await expectStyles(page.locator('.lp-footer'), { 'background-color': RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink })
  })

  test('tilt budget: at most 10 tilted plates on the hero fold (5.6)', async ({ page }) => {
    const tilted = await page.evaluate(() => {
      const angle = (matrix: string) => {
        if (!matrix || matrix === 'none') return 0
        const p = /matrix\(([^)]+)\)/.exec(matrix)?.[1]?.split(',').map(Number)
        return p ? (Math.atan2(p[1]!, p[0]!) * 180) / Math.PI : 0
      }
      let count = 0
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect()
        if (rect.bottom < 0 || rect.top > innerHeight || rect.width === 0) continue
        const own = angle(getComputedStyle(el).transform)
        const plate = getComputedStyle(el, '::before').content === 'none' ? 0 : angle(getComputedStyle(el, '::before').transform)
        if (Math.abs(own) > 0.05 || Math.abs(plate) > 0.05) count += 1
      }
      return count
    })
    expect(tilted).toBeGreaterThan(5)
    expect(tilted).toBeLessThanOrEqual(10)
  })

  for (const width of [1440, 1100, 768, 390, 320]) {
    test(`collage geometry at ${width}px: no plate touches another (24px between boxes), the seal clears the bars by 16px, no overflow (5.2)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/', '.lp-collage__strength')
      const measured = await page.evaluate(() => {
        const parts = ['.lp-collage__tab', '.lp-collage__card', '.lp-collage__fix', '.lp-collage__match', '.lp-collage__strength']
        const rects = parts.map((selector) => {
          const el = document.querySelector(selector) as HTMLElement
          const r = el.getBoundingClientRect()
          const plate = getComputedStyle(el, '::before')
          const m = /matrix\(([^)]+)\)/.exec(plate.transform)?.[1]?.split(',').map(Number) ?? [1, 0]
          const shadow = /(\d+)px (\d+)px/.exec(plate.boxShadow)
          return { selector, x: r.x, y: r.y, w: r.width, h: r.height, angle: (Math.atan2(m[1]!, m[0]!) * 180) / Math.PI, shadow: Number(shadow?.[1] ?? 0) }
        })
        const sealEl = document.querySelector('.lp-collage .kit-seal') as HTMLElement
        const sealRect = sealEl.getBoundingClientRect()
        const bars = (document.querySelector('.lp-collage__bars') as HTMLElement).getBoundingClientRect()
        return { rects, seal: { cx: sealRect.x + sealRect.width / 2, cy: sealRect.y + sealRect.height / 2, size: sealEl.offsetWidth }, bars: { left: bars.left, top: bars.top, right: bars.right, bottom: bars.bottom } }
      })
      // Layout boxes plus their hard shadow: >= 24px apart.
      for (let i = 0; i < measured.rects.length; i++) {
        for (let j = i + 1; j < measured.rects.length; j++) {
          const a = measured.rects[i]!
          const b = measured.rects[j]!
          const gap = gapBetween(grow(rectOf(a.x, a.y, a.w, a.h), { right: a.shadow, bottom: a.shadow }), grow(rectOf(b.x, b.y, b.w, b.h), { right: b.shadow, bottom: b.shadow }))
          expect(gap, `${a.selector} to ${b.selector}`).toBeGreaterThanOrEqual(24)
        }
      }
      // The tilted plates themselves (rotated corners, shadow included) never intersect either.
      const hull = (r: (typeof measured.rects)[number]) => {
        const t = (Math.abs(r.angle) * Math.PI) / 180
        const w = r.w * Math.cos(t) + r.h * Math.sin(t)
        const h = r.w * Math.sin(t) + r.h * Math.cos(t)
        return grow(rectOf(r.x + r.w / 2 - w / 2, r.y + r.h / 2 - h / 2, w, h), { right: r.shadow, bottom: r.shadow })
      }
      for (let i = 0; i < measured.rects.length; i++) {
        for (let j = i + 1; j < measured.rects.length; j++) {
          expect(gapBetween(hull(measured.rects[i]!), hull(measured.rects[j]!)), `${measured.rects[i]!.selector} plate to ${measured.rects[j]!.selector} plate`).toBeGreaterThan(0)
        }
      }
      // Seal clear space: the scalloped circle (R = 98/220 of its size) plus its 7/220 shadow, to the bars column.
      const radius = (98 / 220) * measured.seal.size
      const shadow = (7 / 220) * measured.seal.size
      const sealBox = { left: measured.seal.cx - radius, top: measured.seal.cy - radius, right: measured.seal.cx + radius + shadow, bottom: measured.seal.cy + radius + shadow }
      const verticalStack = measured.bars.top >= sealBox.bottom - 1 // phones stack the bars under the seal
      expect(gapBetween(sealBox, measured.bars), verticalStack ? 'seal above bars' : 'seal beside bars').toBeGreaterThanOrEqual(16)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }

  for (const width of [390, 320]) {
    test(`no horizontal overflow at ${width}px, brand mark and tilts included`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/', '.lp-collage__strength')
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('login (/login)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/login', '.auth-aside__tools .kit-tool-tile')
  })

  test('display title, folder tabs, primary submit and the lilac aside (1.4, 1.11, 1.13)', async ({ page }) => {
    const h1 = page.locator('h1').first()
    await expectStyles(h1, { 'font-size': '44px', 'font-weight': '800', 'letter-spacing': '-1.232px', color: RGB.ink })
    await expectFont(h1, 'display')

    await expectStyles(page.locator('.kit-tabs__trigger[data-state="active"]'), { 'background-color': RGB.surface, 'border-bottom-color': RGB.surface, 'font-weight': '700', 'border-top-left-radius': '16px' })
    await expectStyles(page.locator('.kit-tabs__trigger[data-state="inactive"]').first(), { 'background-color': RGB.stone, color: RGB.ink2, 'font-weight': '600' })

    const submit = page.locator('.auth-form button[type="submit"]')
    await expectStyles(submit, { 'background-color': RGB.tangerine, color: RGB.ink, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh2, 'font-weight': '700' })
    expect(await page.locator('main .kit-button--primary:visible').count()).toBe(1)

    await expectStyles(page.locator('.auth-aside'), { 'background-color': RGB.lilacSoft, 'border-top-left-radius': '36px' })
    const stickers = page.locator('.auth-aside .kit-sticker--md')
    await expectStyles(stickers.nth(0), { 'background-color': RGB.lemon, 'box-shadow': SH.sh2, 'border-top-width': '2px' }, '::before')
    await expectStyles(stickers.nth(1), { 'background-color': RGB.mint }, '::before')
    const tiles = page.locator('.auth-aside__tools .kit-tool-tile')
    for (const [index, fill] of [RGB.tangerine, RGB.mint, RGB.lilac, RGB.lemon, RGB.rose, RGB.aqua].entries()) {
      await expectStyles(tiles.nth(index), { 'background-color': fill })
    }
  })

  test('inputs wear the 2px ink frame, radius 12, white; focus warms the fill with a 3px ring (1.16)', async ({ page }) => {
    const frame = page.locator('.auth-form .kit-input').first()
    await expectStyles(frame, { 'background-color': RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '12px', 'box-shadow': SH.none })
    await page.keyboard.press('Tab')
    await page.locator('.auth-form input[type="email"]').focus()
    await expectStyles(frame, { 'background-color': RGB.focusFill, 'outline-width': '3px', 'outline-color': RGB.ink })
  })

  test('the brand mark is the same -6deg tangerine square as everywhere (1.14)', async ({ page }) => {
    const mark = page.locator('.cw-brand-mark').first()
    await expectStyles(mark, { 'background-color': RGB.tangerine, width: '38px', 'border-top-left-radius': '12px', 'box-shadow': SH.sh1 })
    expect(angleOf((await styles(mark, ['transform']))['transform']!)).toBeCloseTo(-6, 1)
  })

  for (const width of [390, 320]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/login', '.auth-aside__tools .kit-tool-tile')
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('not found (404)', () => {
  // The shortcut hints follow the viewer's OS (hooks/use-mod-key: "⌘K" on a Mac, "Ctrl K" elsewhere), and the
  // project's "Desktop Chrome" device reports Windows (Playwright derives navigator.platform "Win32" from its user
  // agent) whatever the host. The mockup's sidebar shows "⌘K", so this block browses as Chrome on a Mac.
  test.use({ userAgent: devices['Desktop Chrome'].userAgent.replace(/\(Windows NT [^)]*\)/, '(Macintosh; Intel Mac OS X 10_15_7)') })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/this-page-does-not-exist', '.kit-error')
  })

  test('a lemon 404 seal at 220px, a display title, a danger-ink code line and one primary (1.9, 1.4, 1.1)', async ({ page }) => {
    const notFoundSeal = page.locator('dl.kit-seal')
    expect((await box(notFoundSeal)).offsetWidth).toBe(220)
    await expectStyles(notFoundSeal.locator('.kit-seal__shape'), { fill: RGB.lemon })
    await expect(notFoundSeal.locator('.kit-seal__num')).toHaveText('404')
    await expect(notFoundSeal.locator('.kit-seal__of')).toHaveCount(0)
    expect(parseFloat((await styles(notFoundSeal.locator('.kit-seal__num'), ['font-size']))['font-size']!)).toBeCloseTo(0.34 * 220, 1)
    expect(angleOf((await styles(notFoundSeal, ['transform']))['transform']!)).toBeCloseTo(-4, 1)

    const h1 = page.locator('main h1').first()
    await expectStyles(h1, { 'font-size': '44px', 'font-weight': '800' })
    await expectFont(h1, 'display')
    await expectStyles(page.locator('.kit-error__code'), { color: RGB.dangerInk, 'font-weight': '700', 'font-size': '13px' })
    await expectStyles(page.locator('main .kit-button--primary'), { 'background-color': RGB.tangerine, 'box-shadow': SH.sh2 })
    expect(await page.locator('main .kit-button--primary').count()).toBe(1)
  })

  test('the sidebar: 264px white, ink edge, tool tiles in tone order, lemon-soft hover (1.5, 1.6)', async ({ page }) => {
    const sidebar = page.locator('.app-sidebar')
    await expectStyles(sidebar, { width: '264px', 'background-color': RGB.surface, 'border-right-width': '2px', 'border-right-color': RGB.ink })
    const search = page.locator('.app-sidebar__search')
    await expectStyles(search, { 'background-color': RGB.ground, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'border-top-left-radius': '16px', 'min-height': '44px', color: RGB.ink2, 'font-size': '14px', 'font-weight': '500' })
    await expect(search.locator('.kit-kbd')).toHaveText('⌘K')
    await expectStyles(page.locator('.app-sidebar__group-label').first(), { 'font-size': '13px', 'font-weight': '700', color: RGB.ink3 })
    await expectStyles(page.locator('.app-sidebar__legal a').first(), { 'font-size': '12px', color: RGB.ink3 })

    const tiles = page.locator('.app-sidebar .kit-tool-tile--sm')
    await expect(tiles).toHaveCount(6)
    for (const [index, fill] of [RGB.tangerine, RGB.mint, RGB.lilac, RGB.lemon, RGB.rose, RGB.aqua].entries()) {
      await expectStyles(tiles.nth(index), { 'background-color': fill, width: '28px', 'border-top-left-radius': '9px' })
    }

    const item = page.locator('.app-sidebar__button').nth(1)
    await expectStyles(item, { 'border-top-left-radius': '16px', 'min-height': '44px', 'font-weight': '600', 'border-top-width': '2px', 'border-top-color': TRANSPARENT, 'background-color': TRANSPARENT })
    await item.hover()
    await expect.poll(async () => (await styles(item, ['background-color']))['background-color']).toBe(RGB.lemonSoft)
    await expectStyles(item, { 'border-top-color': TRANSPARENT })
    await expectStill(item)
  })

  for (const width of [390, 320]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/this-page-does-not-exist', '.kit-error')
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('legal pages', () => {
  for (const path of ['/privacy', '/terms', '/cookies', '/imprint']) {
    test(`${path}: display title, lemon current link in the contents, ink body text (1.4, 1.11)`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, path, '.legal-page__body p')
      const h1 = page.locator('main h1').first()
      await expectStyles(h1, { 'font-size': '44px', 'font-weight': '800', color: RGB.ink })
      await expectFont(h1, 'display')
      await expectStyles(page.locator('body'), { 'background-color': RGB.ground })

      const links = page.locator('.kit-jump-nav__link')
      if ((await links.count()) > 0) {
        const current = page.locator('.kit-jump-nav__link[aria-current]')
        await expect(current).toHaveCount(1)
        await expectStyles(current, { 'background-color': RGB.lemon, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'font-weight': '700', 'min-height': '40px', 'border-top-left-radius': '12px' })
        const idle = page.locator('.kit-jump-nav__link:not([aria-current])').first()
        await expectStyles(idle, { color: RGB.ink2, 'font-weight': '600', 'min-height': '40px' })
        await idle.hover()
        await expect.poll(async () => (await styles(idle, ['background-color']))['background-color']).toBe(RGB.lemonSoft)
      }
      const body = page.locator('.legal-page__body p').first()
      await expectStyles(body, { 'font-size': '15px', color: RGB.ink })
      const heading = page.locator('.legal-page__body h2').first()
      if ((await heading.count()) > 0) {
        await expectStyles(heading, { 'font-size': '24px', 'font-weight': '800' })
        await expectFont(heading, 'display')
      }
      await expectStyles(page.locator('.legal-page__link').first(), { 'text-decoration-line': 'underline', color: RGB.ink })
    })

    test(`${path}: no horizontal overflow at 390 and 320`, async ({ page }) => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 800 })
        await open(page, path, '.legal-page__body p')
        expect(await horizontalOverflow(page), `${path} at ${width}`).toBeLessThanOrEqual(0)
      }
    })
  }
})

// ───────────────────────────────────────────────────────────────────────────
// The signature screen: a guest Resume run (the backend runs the heuristic scorer without an account)
// ───────────────────────────────────────────────────────────────────────────

const weakResume = `
Jordan Rivera
Backend Engineer

Experience
- Worked on backend services for the product team.
- Helped with databases and deployments.
- Responsible for fixing bugs and writing code.

Skills
Python, SQL
`.trim()

async function runGuestResume(page: Page) {
  await open(page, '/resume')
  const paste = page.getByRole('button', { name: 'Paste text instead' })
  const field = page.locator('#resume-resumeText')
  await expect(paste.or(field)).toBeVisible()
  if (await paste.isVisible()) await paste.click()
  await field.fill(weakResume)
  await page.getByRole('button', { name: 'Review resume' }).click()
  await page.waitForURL(/\/resume\/result\/resume-demo-\d+$/, { timeout: 60_000 })
}

test.describe('guest Resume result (the signature screen)', () => {
  test('on a phone: the seal is 220, stickers sit level, the floating tab tray clears the content, nothing overflows (1.16, 5.8)', async ({ browser }) => {
    test.setTimeout(120_000)
    for (const width of [390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true })
      const page = await context.newPage()
      await declineCookies(page)
      await runGuestResume(page)
      await expect(page.locator('.result-hero dl.kit-seal')).toBeVisible()
      await page.waitForTimeout(2200)

      const resultSeal = page.locator('.result-hero dl.kit-seal')
      expect((await box(resultSeal)).offsetWidth).toBe(220)
      expect(angleOf((await styles(resultSeal, ['transform']))['transform']!)).toBeCloseTo(-4, 1)
      // Mobile: nothing is tilted except the seal, the brand mark and the stamps.
      for (const selector of ['.result-verdict', '.result-issues', '.result-fix']) {
        const sticker = page.locator(selector).first()
        if ((await sticker.count()) > 0) expect(await plateTilt(sticker), `${selector} at ${width}`).toBeCloseTo(0, 1)
      }
      expect(await horizontalOverflow(page), `overflow at ${width}`).toBeLessThanOrEqual(0)

      const tray = page.locator('nav.app-tabbar')
      await expect(tray).toBeVisible()
      await expectStyles(tray, { 'background-color': RGB.surface, 'border-top-width': '2px', 'border-top-color': RGB.ink, // the contract says 26px; the shell ships --r-lg (24px). Both read as the same pill-ish tray, so the band is what is held.
        'border-top-left-radius': /^2[4-6]px$/, 'box-shadow': SH.sh2 })
      const items = tray.locator('.app-tabbar__item')
      expect(await items.count()).toBe(5)
      const geometry = await tray.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const widths = [...el.querySelectorAll('.app-tabbar__item')].map((item) => Math.round(item.getBoundingClientRect().width))
        return { bottomGap: innerHeight - r.bottom, left: r.left, right: innerWidth - r.right, widths }
      })
      expect(geometry.bottomGap).toBeGreaterThanOrEqual(10)
      expect(geometry.bottomGap).toBeLessThanOrEqual(10 + 34) // + the home-indicator inset on a real phone
      expect(geometry.left).toBe(8)
      expect(geometry.right).toBe(8)
      expect(Math.max(...geometry.widths) - Math.min(...geometry.widths), 'five equal tabs').toBeLessThanOrEqual(2)
      await expectStyles(items.first(), { 'min-height': '56px', 'font-size': '12px', 'font-weight': '600' })
      const active = tray.locator('.app-tabbar__item[aria-current="page"], .app-tabbar__item[data-active="true"], .app-tabbar__item[aria-expanded="true"]').first()
      if ((await active.count()) > 0) {
        await expectStyles(active, { 'background-color': RGB.lemon, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh1, 'font-weight': '700' })
        expect(translationOf((await styles(active, ['transform']))['transform']!)).toEqual([0, 0])
        expect(angleOf((await styles(active, ['transform']))['transform']!)).toBe(0)
      }
      // The report ends clear of the tray: scrolled to the very bottom, its last block sits above the tray.
      const clearance = await page.evaluate(() => {
        const trayRect = document.querySelector('nav.app-tabbar')!.getBoundingClientRect()
        const visible = [...document.querySelectorAll<HTMLElement>('main *')].filter((el) => {
          const r = el.getBoundingClientRect()
          return r.height > 4 && r.width > 4 && !el.closest('.kit-sr-only')
        })
        const last = visible.reduce((a, b) => (a.getBoundingClientRect().bottom + window.scrollY >= b.getBoundingClientRect().bottom + window.scrollY ? a : b))
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
        return { clearance: trayRect.top - last.getBoundingClientRect().bottom, last: `${last.tagName}.${last.className}` }
      })
      expect(clearance.clearance, `the tray never covers the last line (${clearance.last})`).toBeGreaterThanOrEqual(0)
      await context.close()
    }
  })

  test('the seal, its verdict row and the Fix first grid (1.9, 1.10, 5.2)', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await runGuestResume(page)
    const hero = page.locator('.result-hero')
    await expect(hero.locator('dl.kit-seal')).toBeVisible()
    await page.waitForTimeout(2200) // the reveal is done by 1.7s

    const resultSeal = hero.locator('dl.kit-seal')
    expect((await box(resultSeal)).offsetWidth).toBe(300)
    await expectStyles(resultSeal.locator('.kit-seal__shape'), { fill: RGB.tangerine })
    expect(parseFloat((await styles(resultSeal.locator('.kit-seal__num'), ['font-size']))['font-size']!)).toBeCloseTo(132, 0)
    // The legacy assertion of e2e/resume-tracer.spec.ts: the score is a term.
    await expect(page.getByRole('term').filter({ hasText: 'Resume score' })).toHaveCount(1)

    // Clear space: >= 16px between the seal circle (shadow included) and every other piece of the hero side.
    const clearances = await hero.locator('.result-hero__side').evaluate((side) => {
      const sealEl = side.querySelector('.kit-seal') as HTMLElement
      const sr = sealEl.getBoundingClientRect()
      const size = sealEl.offsetWidth
      const radius = (98 / 220) * size
      const shadow = (7 / 220) * size
      const cx = sr.x + sr.width / 2
      const cy = sr.y + sr.height / 2
      const circle = { left: cx - radius, top: cy - radius, right: cx + radius + shadow, bottom: cy + radius + shadow }
      // The score's "?" now lives in the seal's own box (so it follows the seal when the hero stacks): measure it
      // explicitly, as it was measured when it was a direct child of the side.
      const others = [...side.children, ...side.querySelectorAll('.result-hero__help')].filter(
        (child) => !child.contains(sealEl) && !sealEl.contains(child),
      )
      const out: Array<[string, number]> = []
      for (const el of others) {
        const r = el.getBoundingClientRect()
        const dx = Math.max(r.left - circle.right, circle.left - r.right)
        const dy = Math.max(r.top - circle.bottom, circle.top - r.bottom)
        out.push([el.className, Math.max(dx, dy)])
      }
      return out
    })
    expect(clearances.length).toBeGreaterThan(0)
    for (const [name, gap] of clearances) expect(gap, String(name)).toBeGreaterThanOrEqual(16)

    // Verdict + issues chips: sm stickers, -3 / +2.5 degrees.
    const verdict = page.locator('.result-verdict')
    if ((await verdict.count()) > 0) {
      await expectStyles(verdict, { 'box-shadow': SH.sh1, 'border-top-width': '2px', 'border-top-color': RGB.ink }, '::before')
      expect(await plateTilt(verdict)).toBeCloseTo(-3, 1)
    }
    const issues = page.locator('.result-issues')
    await expect(issues).toHaveCount(1)
    expect(await plateTilt(issues)).toBeCloseTo(2.5, 1)

    // Fix first: equal-height lemon stickers in one row, white number disc, -2 / +1.6 degrees.
    const fixes = page.locator('.result-fix')
    const count = await fixes.count()
    expect(count).toBeGreaterThanOrEqual(2)
    const heights = await fixes.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10))
    expect(new Set(heights).size, `fix heights ${heights.join(', ')}`).toBe(1)
    const tops = await fixes.evaluateAll((els) => els.slice(0, 2).map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(tops[0]).toBe(tops[1])
    for (const [index, tilt] of [-2, 1.6].entries()) {
      const fix = fixes.nth(index)
      await expectStyles(fix, { 'background-color': RGB.lemon, 'border-top-left-radius': '24px', 'box-shadow': SH.sh2, 'border-top-width': '2px', 'border-top-color': RGB.ink }, '::before')
      expect(await plateTilt(fix)).toBeCloseTo(tilt, 1)
      await expectStyles(fix.locator('.kit-number-disc').first(), { width: '34px', height: '34px', 'background-color': RGB.surface })
      await expectFont(fix.locator('.result-fix__title'), 'display')
      expect((await styles(fix.locator('.result-fix__title'), ['font-size']))['font-size']).toBe('28px')
    }

    // The shell: the current tool in the sidebar is lemon, outlined, shadowed and bold; its tile keeps the tool's tone (1.6).
    const current = page.locator('.app-sidebar__button[aria-current="page"]')
    await expect(current).toHaveCount(1)
    await expectStyles(current, { 'background-color': RGB.lemon, 'border-top-width': '2px', 'border-top-color': RGB.ink, 'box-shadow': SH.sh1, 'font-weight': '700', 'border-top-left-radius': '16px', 'min-height': '40px' })
    await expectStyles(current.locator('.kit-tool-tile'), { 'background-color': RGB.tangerine })
    // The page title wears the tool's tile at 56px, tilted -4 degrees (1.15).
    const titleTile = page.locator('.kit-page-header .kit-tool-tile--lg').first()
    await expectStyles(titleTile, { 'background-color': RGB.tangerine, width: '56px', 'box-shadow': SH.sh2 })
    expect(angleOf((await styles(titleTile, ['transform']))['transform']!)).toBeCloseTo(-4, 1)

    // Tilt budget: at most 8 tilted plates in the first screen of an app page (5.6).
    const tilted = await page.evaluate(() => {
      const angle = (matrix: string) => {
        if (!matrix || matrix === 'none') return 0
        const p = /matrix\(([^)]+)\)/.exec(matrix)?.[1]?.split(',').map(Number)
        return p ? (Math.atan2(p[1]!, p[0]!) * 180) / Math.PI : 0
      }
      let count = 0
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect()
        if (rect.bottom < 0 || rect.top > innerHeight || rect.width === 0) continue
        const own = angle(getComputedStyle(el).transform)
        const plate = getComputedStyle(el, '::before').content === 'none' ? 0 : angle(getComputedStyle(el, '::before').transform)
        if (Math.abs(own) > 0.05 || Math.abs(plate) > 0.05) count += 1
      }
      return count
    })
    expect(tilted).toBeGreaterThan(4)
    expect(tilted).toBeLessThanOrEqual(8)

    // The sticky jump nav under the header: lemon current link.
    await expectStyles(page.locator('.kit-jump-nav__link[aria-current]').first(), { 'background-color': RGB.lemon, 'border-top-color': RGB.ink })
    // One filled primary in the view: Re-generate.
    expect(await page.locator('main .kit-button--primary:visible').count()).toBe(1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('the reveal plays right after a run and shows the final state under reduced motion (6.2)', async ({ browser }) => {
    test.setTimeout(120_000)
    for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
      const page = await context.newPage()
      await declineCookies(page)
      await runGuestResume(page)
      const resultSeal = page.locator('.result-hero dl.kit-seal')
      await expect(resultSeal).toBeAttached()
      const first = await resultSeal.evaluate((el) => ({ reveal: el.getAttribute('data-reveal'), name: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity }))
      if (reduced) {
        // Never plays under reduced motion: the flag is consumed and the final state renders at once.
        expect(first.reveal).toBe('none')
        expect(first.name).toBe('none')
        expect(first.opacity).toBe('1')
      } else {
        expect(first.reveal).toBe('stamp') // a run has just completed
        // Either mid-flight (kit-stamp) or, on a slow machine, already landed.
        expect(['kit-stamp', 'none']).toContain(first.name)
      }
      await page.waitForTimeout(2200)
      expect(await resultSeal.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
      expect(angleOf((await styles(resultSeal, ['transform']))['transform']!)).toBeCloseTo(-4, 1)
      for (const el of await page.locator('.result-fix').all()) {
        expect(await el.evaluate((node) => getComputedStyle(node).opacity)).toBe('1')
      }
      // The announced value is the final number from the first frame; the visible numeral ends on it.
      const finalText = await resultSeal.locator('.kit-seal__num').innerText()
      await expect(resultSeal.locator('dd')).toContainText(`${finalText} out of 100`)
      await context.close()
    }
  })
})
