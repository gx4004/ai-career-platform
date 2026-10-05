import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge, CardActions, EmptyState, ErrorState, NumberDisc, Panel, PanelHeader, ScoreSeal, ToneDot } from '#/components/kit'

describe('T18 kit refinements', () => {
  it('ScoreSeal accepts the rose tone and sizes a word by its length', () => {
    const { container, rerender } = render(<ScoreSeal value={3} unit="days" label="Days left" tone="rose" />)
    const seal = container.querySelector('dl.kit-seal') as HTMLElement
    expect(seal.getAttribute('data-tone')).toBe('rose')
    rerender(<ScoreSeal value="Applied" unit={null} label="Status" tone="lilac" />)
    expect(container.querySelector('dl.kit-seal')?.getAttribute('data-digits')).toBe('7')
    rerender(<ScoreSeal value="Application status" unit={null} label="Status" />)
    expect(container.querySelector('dl.kit-seal')?.getAttribute('data-digits')).toBe('8')
    rerender(<ScoreSeal value={77} label="Resume score" />)
    expect(container.querySelector('dl.kit-seal')?.getAttribute('data-digits')).toBe('2')
  })

  it('EmptyState and ErrorState have an open variant and stay framed by default', () => {
    const { container, rerender } = render(<ErrorState variant="open" code="404" title="Gone" headingLevel={1} role="status" />)
    expect(container.querySelector('.kit-empty')?.getAttribute('data-variant')).toBe('open')
    expect(screen.getByRole('heading', { level: 1, name: 'Gone' })).toBeTruthy()
    rerender(<EmptyState variant="open" title="Nothing" />)
    expect(container.querySelector('.kit-empty')?.getAttribute('data-variant')).toBe('open')
    rerender(<EmptyState title="Nothing" />)
    expect(container.querySelector('.kit-empty')?.hasAttribute('data-variant')).toBe(false)
  })

  it('PanelHeader takes a tone only when asked', () => {
    const { container, rerender } = render(
      <Panel>
        <PanelHeader title="Suggestions" tone="lemon" />
      </Panel>,
    )
    expect(container.querySelector('.kit-panel-surface__header')?.getAttribute('data-tone')).toBe('lemon')
    rerender(
      <Panel>
        <PanelHeader title="Suggestions" />
      </Panel>,
    )
    expect(container.querySelector('.kit-panel-surface__header')?.hasAttribute('data-tone')).toBe(false)
  })

  it('ToneDot is a decorative tone-coloured disc', () => {
    const { container } = render(<ToneDot tone="aqua" size="md" lead />)
    const dot = container.querySelector('.kit-tone-dot') as HTMLElement
    expect(dot.getAttribute('data-tone')).toBe('aqua')
    expect(dot.getAttribute('data-size')).toBe('md')
    expect(dot.getAttribute('data-lead')).toBe('true')
    expect(dot.getAttribute('aria-hidden')).toBe('true')
  })

  it('NumberDisc renders a node and marks the current step', () => {
    const { container } = render(
      <>
        <NumberDisc n={<svg data-testid="check" />} tone="mint" />
        <NumberDisc n={2} tone="lemon" current />
        <NumberDisc n={3} />
      </>,
    )
    const discs = container.querySelectorAll('.kit-number-disc')
    expect(discs[0].querySelector('[data-testid="check"]')).toBeTruthy()
    expect(discs[1].getAttribute('data-current')).toBe('true')
    expect(discs[2].hasAttribute('data-current')).toBe(false)
  })

  it('Badge has an icon slot that replaces the dot and stays decorative', () => {
    const { container } = render(
      <Badge tone="rose" icon={<svg data-testid="clock" />} dot>
        Deadline
      </Badge>,
    )
    const badge = container.querySelector('.kit-badge') as HTMLElement
    expect(badge.querySelector('.kit-badge__icon[aria-hidden="true"] [data-testid="clock"]')).toBeTruthy()
    expect(badge.querySelector('.kit-badge__dot')).toBeNull()
    expect(badge.textContent).toBe('Deadline')
  })

  it('CardActions can be placed as an overlay', () => {
    const { container, rerender } = render(<CardActions placement="overlay">x</CardActions>)
    expect(container.querySelector('.kit-card__actions')?.getAttribute('data-placement')).toBe('overlay')
    rerender(<CardActions>x</CardActions>)
    expect(container.querySelector('.kit-card__actions')?.hasAttribute('data-placement')).toBe(false)
  })
})
