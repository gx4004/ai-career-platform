import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button, EmptyState } from '#/components/kit'

const dir = path.resolve(__dirname, '../../../styles/kit') + path.sep
const css = (name: string) => readFileSync(dir + name, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('one outline everywhere: an error is a rose fill and a message, never a red ring', () => {
  it('keeps the focus ring ink on an invalid control and keeps its rose fill while focused', () => {
    const source = css('control.css')
    expect(source).not.toMatch(/danger-ink/)
    const invalid = source.match(/\.kit-check\[data-framed\]\[data-invalid\]\s*\{([^}]*)\}/)
    expect(invalid?.[1]).toMatch(/--kit-control-bg:\s*var\(--rose-soft\)/)
    expect(invalid?.[1]).toMatch(/--kit-control-focus-bg:\s*var\(--rose-soft\)/)
    expect(source).toMatch(/--kit-control-bg:\s*var\(--kit-control-focus-bg\);\s*outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring-color\)/)
  })

  it('keeps the Segmented outline ink when it is invalid', () => {
    expect(css('segmented.css')).not.toMatch(/danger/)
  })
})

describe('Segmented overflow cue', () => {
  it('draws the edge fades above the options, click-through, only while data-overflow says there is more', () => {
    const source = css('segmented.css')
    const pseudo = source.match(/\.kit-segmented::before,\s*\.kit-segmented::after\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(pseudo).toMatch(/position:\s*sticky/)
    expect(pseudo).toMatch(/pointer-events:\s*none/)
    expect(pseudo).toMatch(/opacity:\s*0/)
    expect(source).toMatch(/\.kit-segmented\[data-overflow~='start'\]::before,\s*\.kit-segmented\[data-overflow~='end'\]::after\s*\{\s*opacity:\s*1/)
  })

  it('keeps the cue inside the inset touch outline so the frame stays whole', () => {
    const source = css('segmented.css')
    const coarse = source.slice(source.indexOf('@media (pointer: coarse)'))
    expect(coarse).toMatch(/\.kit-segmented::before,\s*\.kit-segmented::after\s*\{\s*margin-block:\s*var\(--bw\)/)
    expect(coarse).toMatch(/\.kit-segmented::before\s*\{\s*inset-inline-start:\s*var\(--bw\)/)
    expect(coarse).toMatch(/\.kit-segmented::after\s*\{\s*inset-inline-end:\s*var\(--bw\)/)
  })
})

describe('row actions on touch', () => {
  it('shows revealed actions on any device with a touchscreen, after the hover-only block', () => {
    const source = css('row.css')
    const hoverOnly = source.indexOf('@media (hover: hover) and (pointer: fine)')
    const touch = source.indexOf('@media (any-pointer: coarse)')
    expect(hoverOnly).toBeGreaterThan(-1)
    expect(touch).toBeGreaterThan(hoverOnly)
    expect(source.slice(touch)).toMatch(/\.kit-row__actions\[data-reveal\],\s*\.kit-row__reveal\s*\{\s*opacity:\s*1/)
  })
})

describe('EmptyState slot', () => {
  it('is the dashed 72px place a card would take', () => {
    const { container } = render(<EmptyState size="inline" variant="slot" title="Offers on the table" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-size')).toBe('inline')
    expect(root.getAttribute('data-variant')).toBe('slot')
    const rule = css('state.css').match(/\.kit-empty\[data-variant='slot'\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/min-height:\s*4\.5rem/)
    expect(rule).toMatch(/border:\s*var\(--bw\) dashed var\(--ink\)/)
  })

  it('leaves the framed default without a data-variant', () => {
    const { container } = render(<EmptyState title="Nothing yet" />)
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-variant')).toBe(false)
  })
})

describe('Button iconOnly naming', () => {
  it('allows a decorative, hidden, untabbable icon button without a name', () => {
    render(
      <Button iconOnly variant="secondary" aria-hidden="true" tabIndex={-1}>
        <svg aria-hidden="true" />
      </Button>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    const button = screen.getByRole('button', { hidden: true })
    expect(button.getAttribute('tabindex')).toBe('-1')
    expect(button.hasAttribute('aria-label')).toBe(false)
  })

  it('still asks a visible icon button for a name (type-level)', () => {
    // @ts-expect-error an icon-only button that assistive tech can see must carry aria-label or aria-labelledby
    const element = <Button iconOnly><svg aria-hidden="true" /></Button>
    expect(element).toBeTruthy()
  })
})
