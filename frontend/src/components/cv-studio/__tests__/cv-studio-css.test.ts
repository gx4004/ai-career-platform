import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(__dirname, '../../../styles/cv-studio.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1]
}

describe('CV Studio layout contracts', () => {
  it('keeps the export moment under every overlay, so a sheet or dialog opened over it covers it (cv-studio-F01)', () => {
    // Under every overlay, over the cookie card it shares the corner with (--z-notice sits between the two).
    expect(rule('.cvs-moment')).toMatch(/z-index:\s*var\(--z-notice\)/)
    expect(css).not.toMatch(/\.cvs-moment[^{]*\{[^}]*z-index:\s*var\(--z-toast\)/)
  })

  it('sizes the tools column from where it starts, not only from its stuck offset (cv-studio-F04)', () => {
    expect(rule('.kit-tabs.cvs-tabs')).toMatch(/max-height:\s*calc\(100svh - var\(--cvs-side-top/)
  })

  it('keeps a highlight’s move and remove tools under its text, never drawn over it (cv-studio-G01)', () => {
    // Every rule for the tools, at every pointer: none takes them out of the flow over the textarea.
    const toolRules = [...css.matchAll(/\.cvs-bullet__tools\s*\{([^}]*)\}/g)].map((match) => match[1])
    expect(toolRules.length).toBeGreaterThan(0)
    for (const body of toolRules) expect(body).not.toMatch(/position:\s*absolute|inset/)
    expect(rule('.cvs-bullet__tools')).toMatch(/justify-self:\s*end/)
    expect(rule('.cvs-bullet__tools')).toMatch(/margin-top:\s*var\(--s1\)/)
  })

  it('centres the chevron of every one-line section row, the Header row too, over the kit’s narrow-list top alignment (cv-studio-G02)', () => {
    // The Header row is a .cvs-sec row of the same list, so this one rule covers it.
    expect(rule('.kit-list.cvs-outline > .kit-row.cvs-sec > .kit-row__actions')).toMatch(/align-self:\s*center/)
  })

  it('gives the Tailor version field its 14rem basis only beside Save in the footer (cv-studio-F07)', () => {
    expect(rule('.kit-field.cvs-tailor__version')).toBeUndefined()
    expect(rule('.kit-panel__footer.cvs-tailor__footer > .kit-field.cvs-tailor__version')).toMatch(/flex:\s*1 1 14rem/)
  })
})
