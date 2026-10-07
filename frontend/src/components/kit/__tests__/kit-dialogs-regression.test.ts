import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Regression group "dialogs": the CSS halves of the kit fixes. */
const styles = path.resolve(__dirname, '../../../styles')
const read = (name: string) => readFileSync(path.join(styles, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const flat = (css: string) => css.replace(/\s+/g, ' ')

describe('kit fixes (dialogs regression round)', () => {
  // R1: in a 236px list (a 320px dialog) a leading disc + 16px gap + the 12rem text basis did not fit, so the text
  // wrapped under the disc in the onboarding tour.
  it('narrows the text basis of a row with a leading slot on a list under 20rem', () => {
    const row = flat(read('kit/row.css'))
    const narrow = row.match(/@container kit-list \(max-width: 20rem\) \{(.*?\}) \}/)?.[1] ?? ''
    const rule = narrow.match(/\.kit-row:has\(> \.kit-row__leading\) \{([^}]*)\}/)?.[1]
    expect(rule).toBeTruthy()
    expect(rule).toContain('--kit-row-body-min: 9rem')
    // The body reads the property, falling back to 12rem everywhere else.
    expect(row).toContain('flex: 1 1 var(--kit-row-body-min, 12rem)')
  })

  // R2: the phoneLayout="row" footer grows each button from its own label width (equal widths would wrap
  // "Get started" at 320px).
  it('keeps the phone stepper footer buttons grown from their own label widths', () => {
    const overlay = flat(read('kit/overlay.css'))
    expect(overlay).toMatch(/\.kit-panel__footer\[data-phone-layout='row'\] > \.kit-button \{ flex: 1 0 auto; \}/)
  })
})
