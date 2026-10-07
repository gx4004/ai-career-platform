import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Sign-off group "account-admin" (gap round): the CSS halves of the kit fixes. */
const styles = path.resolve(__dirname, '../../../styles')
const read = (name: string) => readFileSync(path.join(styles, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const flat = (css: string) => css.replace(/\s+/g, ' ')
/** The declaration block of the first rule whose selector is exactly `selector`. */
const block = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('kit fixes (account-admin gap round)', () => {
  // AAG-F08: `1fr 1fr` let a long tile name push the right column past a 320px sheet's edge.
  it('lays the gallery tools sheet out like the shipped More sheet: shrinkable columns, a 320px step-down', () => {
    const gallery = flat(read('kit/gallery.css'))
    expect(block(gallery, '.kit-gallery__tool-list')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(block(gallery, ".kit-gallery__tool-row[data-tone]")).toContain('overflow-wrap: break-word')
    const narrow = gallery.match(/@media \(max-width: 359px\) \{(.*?\}) \}/)?.[1] ?? ''
    expect(narrow).toContain('.kit-gallery__tool-list--plain { grid-template-columns: minmax(0, 1fr); }')
  })

  // AAG-F09: three 44px icon actions beside the text left a 320px phone's title about 60px, broken mid-word.
  it('drops three or more inline row actions under the text on a list under 20rem', () => {
    const row = flat(read('kit/row.css'))
    const narrow = row.match(/@container kit-list \(max-width: 20rem\) \{(.*?\}) \}/)?.[1] ?? ''
    const rule = narrow.match(
      /\.kit-row > \.kit-row__actions:where\(:not\(\[data-collapsible\], \[data-placement='overlay'\]\):has\(> :nth-child\(3\)\)\) \{([^}]*)\}/,
    )?.[1]
    expect(rule).toBeTruthy()
    expect(rule).toContain('grid-column: 3 / -1')
    expect(rule).toContain('grid-row: 3')
  })

  // AAG-F10: STICKER 5.4, rose is never a bar colour.
  it('draws a forced danger ScoreBar in ink, never rose', () => {
    const meta = flat(read('kit/meta.css'))
    expect(block(meta, ".kit-score__fill[data-tone='danger']")).toContain('background: var(--ink)')
    expect(meta).not.toMatch(/\.kit-score__fill[^{]*\{[^}]*var\(--rose\)/)
  })

  // AAG-F12: an action toast (z 80) covered the last items of a menu (z 70) opened while it was up.
  it('steps the toasts under an open menu or popover, still above dialogs', () => {
    const toast = flat(read('kit/toast.css'))
    expect(toast).toContain(
      ":root:has(:is(.kit-menu, .kit-popover)[data-state='open']) .kit-toast-region { z-index: var(--z-yield); }",
    )
    const theme = read('theme.css')
    const z = (name: string) => Number(theme.match(new RegExp(`--z-${name}:\\s*(\\d+)`))?.[1])
    expect(z('yield')).toBeGreaterThan(z('overlay'))
    expect(z('yield')).toBeLessThan(z('popover'))
  })
})
