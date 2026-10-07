import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Sign-off r4, group "chrome": the CSS halves of the fixes (the behaviour halves have component tests). */
const styles = path.resolve(__dirname, '../../../styles')
const read = (name: string) => readFileSync(path.join(styles, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const flat = (css: string) => css.replace(/\s+/g, ' ')

describe('chrome stylesheets (sign-off r4)', () => {
  // r5 F14 rewrote F01: the padding used to sit on a bare :root and applied with no toast up (36px), so focusing the
  // rail avatar or a legal link near the viewport bottom scrolled the page. Now it applies only while a toast is up.
  it('F01/F14: ends the page scroll padding above the toast stack only while a toast is up', () => {
    const toast = flat(read('kit/toast.css'))
    expect(toast).toContain(
      ':root:has(.kit-toast-region > .kit-toast) { scroll-padding-block-end: calc(var(--kit-toast-clearance, var(--s4)) + var(--kit-toast-stack, 0px) + var(--s4)); }',
    )
    expect(toast).not.toMatch(/(^|\}) ?:root \{[^}]*scroll-padding/)
  })

  it('F14: keeps Tab clear of the phone tab tray with its own scroll padding, inside the tray query', () => {
    const tray = flat(read('shell.css')).match(/@media \(max-width: 639px\) \{ :root:has\(\.app-tabbar\) \{([^}]*)\}/)?.[1] ?? ''
    expect(tray).toContain('scroll-padding-block-end: calc(var(--kit-toast-clearance) + var(--s2))')
  })

  it('F06: hides the palette rows\' keyboard hints (Enter glyph, shortcut) on a touch screen, with the Esc key', () => {
    const coarse = flat(read('shell.css')).match(/@media \(pointer: coarse\) \{([^@]*?\.app-palette__esc[^@]*?)\}\s*\}/)?.[1] ?? ''
    expect(coarse).toContain('.app-palette .app-palette__meta > svg')
    expect(coarse).toContain('.app-palette .app-palette__shortcut')
    expect(coarse).toContain('display: none')
  })

  it('F07: gives the rail avatar the lemon-soft hover (fine pointers only) and open-menu fill of every rail item', () => {
    const shell = flat(read('shell.css'))
    expect(shell).toMatch(
      /@media \(hover: hover\) \{ \.app-sidebar\[data-state='collapsed'\] \.app-sidebar__button\.app-sidebar__account:hover \{ background: var\(--lemon-soft\); \}/,
    )
    const expanded = shell.indexOf(".app-sidebar[data-state='collapsed'] .app-sidebar__button.app-sidebar__account[aria-expanded='true'] { background: var(--lemon-soft); }")
    const active = shell.indexOf(".app-sidebar[data-state='collapsed'] .app-sidebar__button.app-sidebar__account[data-active='true'] {")
    expect(expanded).toBeGreaterThan(-1)
    // The active lemon square comes later, so it wins over both on Account and Settings.
    expect(active).toBeGreaterThan(expanded)
  })

  it('F07 (r5): shrinks the rail avatar to 36px on hover and while its menu is open, so the lemon-soft square reads', () => {
    const shell = flat(read('shell.css'))
    expect(shell).toMatch(
      /@media \(hover: hover\) \{ [^@]*\.app-sidebar\[data-state='collapsed'\] \.app-sidebar__account:hover \.kit-avatar \{ --kit-avatar-size: 2\.25rem; \} \}/,
    )
    const base = shell.indexOf(".app-sidebar[data-state='collapsed'] .app-sidebar__account .kit-avatar { --kit-avatar-size: 2.75rem; }")
    const hover = shell.indexOf(".app-sidebar[data-state='collapsed'] .app-sidebar__account:hover .kit-avatar { --kit-avatar-size: 2.25rem; }")
    const open = shell.indexOf(".app-sidebar[data-state='collapsed'] .app-sidebar__account[aria-expanded='true'] .kit-avatar { --kit-avatar-size: 2.25rem; }")
    expect(base).toBeGreaterThan(-1)
    // Same specificity as the 44px default: they come after it, so they win.
    expect(hover).toBeGreaterThan(base)
    expect(open).toBeGreaterThan(base)
    // The 48px square holds its size while the avatar shrinks, also under the short-screen 44 / 40px rows.
    const square = shell.match(/\.app-sidebar\[data-state='collapsed'\] \.app-sidebar__button\.app-sidebar__account \{([^}]*)\}/)?.[1] ?? ''
    expect(square).toContain('min-height: 3rem')
  })

  it('F10: draws the rail placeholders as the 48px squares of the rail items, not full-width bars', () => {
    expect(flat(read('shell.css'))).toContain(
      ".app-sidebar[data-state='collapsed'] .app-sidebar__placeholder { inline-size: 3rem; min-height: 3rem; margin-inline: auto; }",
    )
  })

  // r5 F15: the rule used to be phone-only (max-width: 479px); on desktop each step had its own height and Continue
  // jumped between steps. It now applies at every width.
  it('F09/F15: gives every welcome step one fixed height at every width, not a minimum the tools step outgrows', () => {
    const css = flat(read('dashboard.css'))
    const rule = css.match(/\.kit-dialog\.onboarding-dialog \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('block-size: min(36rem, 100dvh - min(12vh, 6rem) - var(--s4))')
    expect(rule).not.toContain('min-block-size')
    expect(css).not.toMatch(/@media[^{]*\{ \.kit-dialog\.onboarding-dialog \{/)
  })

  it('F12: shortens Open CV Studio to Open under 360px by hiding the rest visually (the name stays whole)', () => {
    const narrow = flat(read('dashboard.css')).match(/@media \(max-width: 359px\) \{ \.dash-cv__more \{([^}]*)\}/)?.[1] ?? ''
    expect(narrow).toContain('position: absolute')
    expect(narrow).toContain('clip-path: inset(50%)')
    expect(narrow).not.toContain('display: none')
  })

  // applications-discovery-F29: body's overflow-x: clip is handed to the viewport, and a phone's layout viewport still
  // grew to fit a seal flying in at 1.9x near the right edge (320 -> 327px), so the page zoomed out after "Mark as
  // applied" and stayed that way. Clipping on the app's own column keeps any passing overflow out of the document.
  it('clips horizontal overflow on the app column itself, not only on body, without making it a scroll container', () => {
    const main = flat(read('shell.css')).match(/(?:^|\} )\.app-main \{([^}]*)\}/)?.[1] ?? ''
    expect(main).toContain('overflow-x: clip')
    expect(main).not.toMatch(/overflow(-x)?: (hidden|auto|scroll)/)
  })

  // account-admin-AAG-F01: on phones the banner is static but stayed a flex item with z-index 10, so coming after the
  // sticky top bar in the DOM it painted over the bar as soon as the page scrolled.
  it('lets the phone top bar cover the outage banner as it scrolls away (no z-index on the static banner)', () => {
    const phone = flat(read('shell.css')).match(/@media \(max-width: 639px\) \{ \.app-service-banner \{([^}]*)\}/)?.[1] ?? ''
    expect(phone).toContain('position: static')
    expect(phone).toContain('z-index: auto')
  })
})
