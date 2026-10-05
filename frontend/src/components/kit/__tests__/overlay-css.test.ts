import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = path.resolve(__dirname, '../../../styles/kit') + path.sep
const css = (name: string) => readFileSync(dir + name, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** The declaration block of the first rule whose selector is exactly `selector`. */
const block = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `rule ${selector}`).toBeTruthy()
  return match![1]
}

describe('Sticker overlays', () => {
  it('Dialog is white, 2px ink, radius 24, with the 7px hard shadow', () => {
    const rule = block(css('dialog.css'), '.kit-dialog')
    expect(rule).toMatch(/border:\s*var\(--bw\) solid var\(--ink\)/)
    expect(rule).toMatch(/border-radius:\s*var\(--r-lg\)/)
    expect(rule).toMatch(/box-shadow:\s*var\(--sh-3\)/)
    expect(rule).toMatch(/background:\s*var\(--surface\)/)
  })

  it('Dialog enters with kit-pop-in over 200ms and leaves with a 120ms fade', () => {
    const source = css('dialog.css')
    expect(block(source, ".kit-dialog[data-state='open']")).toMatch(/animation:\s*kit-pop-in var\(--duration-overlay\)/)
    expect(block(source, ".kit-dialog[data-state='closed']")).toMatch(/animation:\s*kit-fade-out var\(--duration-fast\)/)
  })

  it('header and footer are ruled off with 2px ink lines', () => {
    const source = css('overlay.css')
    expect(block(source, '.kit-panel__header')).toMatch(/border-bottom:\s*var\(--bw\) solid var\(--ink\)/)
    expect(block(source, '.kit-panel__footer')).toMatch(/border-top:\s*var\(--bw\) solid var\(--ink\)/)
    expect(block(source, ".kit-panel__header[data-tone='danger']")).toMatch(/background:\s*var\(--rose-soft\)/)
  })

  it('bottom Sheet has 28px top corners, a 2px top edge and rises over the 260ms token; the drawer slides 24px', () => {
    const source = css('sheet.css')
    const bottom = block(source, ".kit-sheet[data-side='bottom']")
    expect(bottom).toMatch(/border-radius:\s*28px 28px 0 0/)
    expect(bottom).toMatch(/border-width:\s*var\(--bw\) var\(--bw\) 0/)
    expect(bottom).toMatch(/--kit-shift-y:\s*60px/)
    expect(bottom).toMatch(/--kit-sheet-dur:\s*var\(--dur-3\)/)
    expect(block(source, '.kit-sheet')).toMatch(/--kit-shift-x:\s*24px/)
    expect(block(source, '.kit-sheet__grab')).toMatch(/width:\s*44px/)
  })

  it('Menu and Popover are white, 2px ink, radius 16 and the 4px shadow; the highlight is lemon-soft', () => {
    const source = css('menu.css')
    const frame = block(source, '.kit-menu,\n.kit-popover')
    expect(frame).toMatch(/border:\s*var\(--bw\) solid var\(--ink\)/)
    expect(frame).toMatch(/border-radius:\s*var\(--r-md\)/)
    expect(frame).toMatch(/box-shadow:\s*var\(--sh-2\)/)
    expect(block(source, ".kit-menu__item[data-highlighted]")).toMatch(/background:\s*var\(--lemon-soft\)/)
    expect(block(source, ".kit-menu__item[data-tone='danger'][data-highlighted]")).toMatch(/background:\s*var\(--rose-soft\)/)
  })

  it('Tooltip is an ink bubble with no outline and no shadow', () => {
    const rule = block(css('menu.css'), '.kit-tooltip')
    expect(rule).toMatch(/background:\s*var\(--ink\)/)
    expect(rule).toMatch(/color:\s*var\(--surface\)/)
    expect(rule).not.toMatch(/border:|box-shadow:/)
  })

  it('Toast defines kit-slap-lite itself, plays it on enter, and stops it under reduced motion', () => {
    const source = css('toast.css')
    expect(source).toMatch(/@keyframes kit-slap-lite/)
    expect(block(source, ".kit-toast[data-state='open']")).toMatch(/animation:\s*kit-slap-lite var\(--dur-3\) var\(--ease-pop\)/)
    const reduced = source.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/)
    expect(reduced?.[1]).toMatch(/animation:\s*none/)
    expect(block(source, '.kit-toast')).toMatch(/box-shadow:\s*var\(--sh-2\)/)
  })

  it('Tabs are folder tabs: they overlap the panel edge by 2px and the selected one opens into it', () => {
    const source = css('tabs.css')
    expect(block(source, '.kit-tabs__list')).toMatch(/margin-bottom:\s*calc\(var\(--bw\) \* -1\)/)
    expect(block(source, '.kit-tabs__trigger')).toMatch(/border-radius:\s*var\(--r-md\) var\(--r-md\) 0 0/)
    expect(block(source, ".kit-tabs__trigger[data-state='active']")).toMatch(/border-bottom-color:\s*var\(--surface\)/)
    expect(block(source, ".kit-tabs[data-variant='folder'] > .kit-tabs__panel")).toMatch(/border:\s*var\(--bw\) solid var\(--ink\)/)
  })

  it('Disclosure sections are 56px rows with a 28px chevron disc that turns lemon when open', () => {
    const source = css('disclosure.css')
    expect(block(source, '.kit-disclosure--section .kit-disclosure__trigger')).toMatch(/min-height:\s*3\.5rem/)
    expect(block(source, '.kit-disclosure--section .kit-disclosure__chevron')).toMatch(/width:\s*1\.75rem/)
    expect(block(source, ".kit-disclosure--section .kit-disclosure__trigger[data-state='open'] .kit-disclosure__chevron")).toMatch(/background:\s*var\(--lemon\)/)
  })
})
