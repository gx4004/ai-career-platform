import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Shared constants and probes for e2e/sticker-fidelity.spec.ts: the executable form of
 * STICKER-SYSTEM section 1 (the fidelity contract). Every expected value below is written out
 * from the contract, never read back from the app's own tokens, so changing a token in
 * styles/theme.css makes the spec fail instead of silently following it.
 */

/** Hex palette of section 1.1 (the new tokens of section 2.2 included). */
export const HEX = {
  ink: '#1b1730',
  ink2: '#4a4560',
  ink3: '#605b77',
  ink4: '#8a85a1',
  line: '#dcdae9',
  ground: '#f3f4f9',
  surface: '#ffffff',
  stone: '#e4e2ee',
  stoneSoft: '#f0eff6',
  desk: '#e7e8ee',
  tangerine: '#ff7b2e',
  tangerineSoft: '#ffe1cc',
  mint: '#4fd6a0',
  mintSoft: '#d2f5e6',
  lilac: '#b9a4ff',
  lilacSoft: '#e6dfff',
  lemon: '#ffd93d',
  lemonSoft: '#fff3b8',
  rose: '#ff8da8',
  roseSoft: '#ffd9e2',
  aqua: '#77d8e8',
  aquaSoft: '#d4f2f8',
  danger: '#c8183f',
  dangerInk: '#b4123c',
  successInk: '#0b6b47',
  warnInk: '#7a4b00',
  focusFill: '#fffdf0',
} as const

export function rgb(hex: string): string {
  const value = hex.replace('#', '')
  const n = Number.parseInt(value, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** Computed colour strings (what getComputedStyle returns), keyed like HEX. */
export const RGB = Object.fromEntries(Object.entries(HEX).map(([name, hex]) => [name, rgb(hex)])) as Record<
  keyof typeof HEX,
  string
>

export const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** The one hard shadow, as the browser prints it: colour first, no blur, no spread. */
export const SH = {
  none: 'none',
  sh0: `${RGB.ink} 0px 0px 0px 0px`,
  sh1: `${RGB.ink} 2px 2px 0px 0px`,
  sh2: `${RGB.ink} 4px 4px 0px 0px`,
  sh3: `${RGB.ink} 7px 7px 0px 0px`,
  sh4: `${RGB.ink} 10px 10px 0px 0px`,
  kbd: `${RGB.ink} 1px 1px 0px 0px`,
} as const

export const FONT = { display: 'Bricolage Grotesque Variable', ui: 'Onest Variable' } as const

/** The two shipped families, first in the stack; a serif or mono family here is a regression. */
export function expectDisplayFont(value: string) {
  expect(value.split(',')[0]?.replaceAll('"', '').trim()).toBe(FONT.display)
}
export function expectUiFont(value: string) {
  expect(value.split(',')[0]?.replaceAll('"', '').trim()).toBe(FONT.ui)
}

/** The element's first font family, polled (a dev server that re-renders mid-test must not fail a font probe). */
export async function expectFont(locator: Locator, which: 'display' | 'ui') {
  await expect
    .poll(async () => ((await styles(locator, ['font-family']))['font-family'] ?? '').split(',')[0]!.replaceAll('"', '').trim(), { timeout: 2_500 })
    .toBe(which === 'display' ? FONT.display : FONT.ui)
}

/**
 * Self-test hook. STICKER_FIDELITY_BREAK="--sh-2: 5px 5px 0 var(--ink); --tangerine: #00ff00" injects the
 * declarations on :root after the app's own CSS, i.e. a deliberately broken token. A green run with
 * that variable set would mean the spec cannot fail.
 */
export async function applyBreak(page: Page) {
  const broken = process.env.STICKER_FIDELITY_BREAK
  if (!broken) return
  await page.addStyleTag({ content: `:root { ${broken} }` })
}

/**
 * The hydrated page, with fonts loaded and `ready` (a selector that only exists once the screen under test
 * has rendered: the gallery and the landing page mount parts of themselves after hydration) attached.
 */
export async function open(page: Page, path: string, ready?: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator('html[data-hydrated="true"]').waitFor({ timeout: 30_000 })
  if (ready) await page.locator(ready).first().waitFor({ state: 'attached', timeout: 30_000 })
  await applyBreak(page)
  await page.evaluate(() => document.fonts.ready)
}

export async function declineCookies(page: Page) {
  await page.context().addInitScript(() => {
    try {
      localStorage.setItem('cw-cookie-consent', 'accepted')
    } catch {
      // storage can be blocked; the banner then simply shows
    }
  })
}

export type StyleMap = Record<string, string>

/** Computed values of `props` (kebab-case) on the element, or on its ::before / ::after. */
export function styles(locator: Locator, props: string[], pseudo?: '::before' | '::after'): Promise<StyleMap> {
  return locator.evaluate(
    (el, { props: names, pseudo: which }) => {
      const cs = getComputedStyle(el, which ?? null)
      return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name)]))
    },
    { props, pseudo },
  )
}

/**
 * One assertion per element: every key of `expected` must equal the computed value (RegExp for patterns).
 * It polls for a moment, because fills and shadows transition for 120ms after hover, focus and press.
 */
export async function expectStyles(
  locator: Locator,
  expected: Record<string, string | RegExp>,
  pseudo?: '::before' | '::after',
) {
  const want = Object.fromEntries(
    Object.entries(expected).map(([prop, value]) => [prop, value instanceof RegExp ? expect.stringMatching(value) : value]),
  )
  await expect.poll(() => styles(locator, Object.keys(expected), pseudo), { timeout: 2_500 }).toMatchObject(want)
}

/** No movement: a settled transform is `none` or an identity translate. */
export async function expectStill(locator: Locator) {
  await expect.poll(async () => translationOf((await styles(locator, ['transform']))['transform']!), { timeout: 2_500 }).toEqual([0, 0])
}

/** Rotation in degrees of a computed `matrix(a, b, ...)` (0 for none). */
export function angleOf(matrix: string): number {
  if (!matrix || matrix === 'none') return 0
  const parts = /matrix\(([^)]+)\)/.exec(matrix)?.[1]?.split(',').map(Number)
  if (!parts || parts.length < 2) return 0
  return (Math.atan2(parts[1]!, parts[0]!) * 180) / Math.PI
}

/** Translation of a computed matrix. */
export function translationOf(matrix: string): [number, number] {
  if (!matrix || matrix === 'none') return [0, 0]
  const parts = /matrix\(([^)]+)\)/.exec(matrix)?.[1]?.split(',').map(Number)
  return parts && parts.length >= 6 ? [parts[4]!, parts[5]!] : [0, 0]
}

/** Tilt (degrees) of a sticker's plate: the ::before carries it, the element itself never rotates. */
export async function plateTilt(locator: Locator): Promise<number> {
  const { transform } = await styles(locator, ['transform'], '::before')
  return angleOf(transform!)
}

export type Rect = { left: number; top: number; right: number; bottom: number }

export function rectOf(x: number, y: number, w: number, h: number): Rect {
  return { left: x, top: y, right: x + w, bottom: y + h }
}

/** Empty space between two rectangles (0 when they touch, negative when they overlap). */
export function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(b.left - a.right, a.left - b.right)
  const dy = Math.max(b.top - a.bottom, a.top - b.bottom)
  if (dx < 0 && dy < 0) return Math.max(dx, dy)
  return Math.max(dx, dy)
}

export function grow(rect: Rect, by: { right?: number; bottom?: number; all?: number }): Rect {
  const all = by.all ?? 0
  return {
    left: rect.left - all,
    top: rect.top - all,
    right: rect.right + all + (by.right ?? 0),
    bottom: rect.bottom + all + (by.bottom ?? 0),
  }
}

/** Horizontal overflow of the page in CSS px (0 when nothing sticks out). */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

/** Resolves `property: var(token)` on a throwaway element: nested var() chains and all. */
export function resolveToken(page: Page, token: string, property: string): Promise<string> {
  return page.evaluate(
    ({ token: name, property: prop }) => {
      const probe = document.createElement('div')
      probe.style.setProperty(prop, `var(${name})`)
      document.body.append(probe)
      const value = getComputedStyle(probe).getPropertyValue(prop)
      probe.remove()
      return value
    },
    { token, property },
  )
}
