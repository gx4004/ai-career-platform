import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge, Count, Kbd } from '#/components/kit'

describe('kit Badge', () => {
  it('renders the label with the tone and size', () => {
    render(
      <Badge tone="success" size="sm" className="extra">
        Offer
      </Badge>,
    )
    const badge = screen.getByText('Offer').closest('.kit-badge') as HTMLElement
    expect(badge.getAttribute('data-tone')).toBe('success')
    expect(badge.classList.contains('kit-badge--sm')).toBe(true)
    expect(badge.classList.contains('extra')).toBe(true)
  })

  it('defaults to a neutral medium badge without a dot', () => {
    const { container } = render(<Badge>Saved</Badge>)
    const badge = container.querySelector('.kit-badge') as HTMLElement
    expect(badge.getAttribute('data-tone')).toBe('neutral')
    expect(badge.classList.contains('kit-badge--md')).toBe(true)
    expect(container.querySelector('.kit-badge__dot')).toBeNull()
  })

  it('renders every tone', () => {
    const tones = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'] as const
    const { container } = render(
      <>
        {tones.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
      </>,
    )
    const rendered = [...container.querySelectorAll('.kit-badge')].map((node) => node.getAttribute('data-tone'))
    expect(rendered).toEqual([...tones])
  })

  it('hides the dot from assistive tech, so the label carries the meaning', () => {
    const { container } = render(
      <Badge tone="danger" dot>
        Rejected
      </Badge>,
    )
    expect(container.querySelector('.kit-badge__dot')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('Rejected')
  })

  it('forwards its ref and native attributes', () => {
    const ref = createRef<HTMLSpanElement>()
    render(
      <Badge ref={ref} title="Stage" data-testid="badge">
        Applied
      </Badge>,
    )
    expect(ref.current).toBe(screen.getByTestId('badge'))
    expect(ref.current?.getAttribute('title')).toBe('Stage')
  })
})

describe('kit Count', () => {
  it('renders numbers and text', () => {
    render(
      <>
        <Count value={12} data-testid="n" />
        <Count value="2 of 7" data-testid="t" />
      </>,
    )
    expect(screen.getByTestId('n').textContent).toBe('12')
    expect(screen.getByTestId('t').textContent).toBe('2 of 7')
  })

  it('caps values above max with a plus sign and leaves smaller ones alone', () => {
    render(
      <>
        <Count value={148} max={99} data-testid="big" />
        <Count value={99} max={99} data-testid="edge" />
      </>,
    )
    expect(screen.getByTestId('big').textContent).toBe('99+')
    expect(screen.getByTestId('edge').textContent).toBe('99')
  })

  it('supports an accent tone', () => {
    render(<Count value={3} tone="accent" data-testid="c" />)
    expect(screen.getByTestId('c').getAttribute('data-tone')).toBe('accent')
  })
})

describe('kit Kbd', () => {
  it('renders a kbd element', () => {
    render(<Kbd>⌘K</Kbd>)
    const key = screen.getByText('⌘K')
    expect(key.tagName).toBe('KBD')
    expect(key.classList.contains('kit-kbd')).toBe(true)
  })
})
