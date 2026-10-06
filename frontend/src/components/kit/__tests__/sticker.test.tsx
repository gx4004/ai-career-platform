import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Highlight, Sticker, clampTilt } from '#/components/kit'

describe('kit Sticker', () => {
  it('defaults to a level white md div', () => {
    const { container } = render(<Sticker>Hello</Sticker>)
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('DIV')
    expect(el.classList.contains('kit-sticker')).toBe(true)
    expect(el.classList.contains('kit-sticker--md')).toBe(true)
    expect(el.getAttribute('data-tone')).toBe('white')
    expect(el.style.getPropertyValue('--kit-tilt')).toBe('')
    expect(el.hasAttribute('data-reveal')).toBe(false)
  })

  it('renders the requested element, size, tone and tilt', () => {
    const { container } = render(
      <Sticker as="article" size="xl" tone="lilac" tilt={-1.4}>
        Build
      </Sticker>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('ARTICLE')
    expect(el.classList.contains('kit-sticker--xl')).toBe(true)
    expect(el.getAttribute('data-tone')).toBe('lilac')
    expect(el.style.getPropertyValue('--kit-tilt')).toBe('-1.4deg')
  })

  it('clamps the tilt to three degrees either way', () => {
    expect(clampTilt(12)).toBe(3)
    expect(clampTilt(-40)).toBe(-3)
    expect(clampTilt(1.6)).toBe(1.6)
    expect(clampTilt(undefined)).toBe(0)
    expect(clampTilt(Number.NaN)).toBe(0)
    const { container } = render(<Sticker tilt={9}>x</Sticker>)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--kit-tilt')).toBe('3deg')
  })

  it('never rotates the content: only the ::before plate carries the tilt', () => {
    const { container } = render(
      <Sticker tilt={2}>
        <p>Body copy</p>
      </Sticker>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.transform).toBe('')
    expect((screen.getByText('Body copy') as HTMLElement).style.transform).toBe('')
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/sticker.css'), 'utf8')
    const plate = css.match(/\.kit-sticker::before\s*\{([^}]*)\}/)![1]
    expect(plate).toMatch(/transform:\s*rotate\(var\(--kit-tilt/)
    const base = css.match(/\.kit-sticker\s*\{([^}]*)\}/)![1]
    expect(base).not.toMatch(/transform/)
  })

  it('marks a slap with its order, and a pin', () => {
    const { container } = render(
      <Sticker reveal="slap" revealOrder={2} pin>
        x
      </Sticker>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('data-reveal')).toBe('slap')
    expect(el.getAttribute('data-order')).toBe('2')
    expect(el.getAttribute('data-pin')).toBe('true')
  })

  it('forwards props and a ref', () => {
    let node: HTMLElement | null = null
    render(
      <Sticker as="li" ref={(n) => {
          node = n
        }} aria-label="fix one" className="extra">
        x
      </Sticker>,
    )
    expect(node).not.toBeNull()
    expect(node!.tagName).toBe('LI')
    expect(node!.getAttribute('aria-label')).toBe('fix one')
    expect(node!.classList.contains('extra')).toBe(true)
  })
})

describe('kit Highlight', () => {
  it('is a mark element', () => {
    render(<Highlight>career switchers</Highlight>)
    const mark = screen.getByText('career switchers')
    expect(mark.tagName).toBe('MARK')
    expect(mark.classList.contains('kit-highlight')).toBe(true)
  })

  it('draws a whole-sticker link focus ring inside the fill, clear of the 2px ink outline', () => {
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/sticker.css'), 'utf8')
    const md = css.match(/\.kit-sticker \.kit-stretched:focus-visible::after\s*\{([^}]*)\}/)![1]
    expect(md).toMatch(/outline-offset:\s*-10px/)
    const sm = css.match(/\.kit-sticker--sm \.kit-stretched:focus-visible::after\s*\{([^}]*)\}/)![1]
    expect(sm).toMatch(/outline-offset:\s*-5px/)
  })
})
