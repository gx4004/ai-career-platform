import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Panel, PanelBody, PanelFooter, PanelHeader } from '#/components/kit'

describe('kit Panel', () => {
  it('renders a white div by default and a tone or an element on request', () => {
    const { container, rerender } = render(<Panel>x</Panel>)
    let panel = container.firstElementChild as HTMLElement
    expect(panel.tagName).toBe('DIV')
    expect(panel.getAttribute('data-tone')).toBe('white')
    expect(panel.hasAttribute('data-flush')).toBe(false)
    rerender(
      <Panel as="section" tone="stone" flush aria-label="Import">
        x
      </Panel>,
    )
    panel = container.firstElementChild as HTMLElement
    expect(panel.tagName).toBe('SECTION')
    expect(panel.getAttribute('data-tone')).toBe('stone')
    expect(panel.getAttribute('data-flush')).toBe('true')
    expect(screen.getByRole('region', { name: 'Import' })).toBe(panel)
  })

  it('header: a heading of the chosen level with a count and actions', () => {
    render(
      <Panel>
        <PanelHeader title="Pipeline" count={5} headingLevel={3} actions={<button type="button">Open</button>} />
      </Panel>,
    )
    const heading = screen.getByRole('heading', { level: 3, name: /Pipeline/ })
    expect(heading.textContent).toContain('5')
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })

  it('header: level 2 by default, no count when none is given', () => {
    render(<PanelHeader title="Facts" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Facts' })).toBeTruthy()
  })

  it('body can be flush and footer takes a tone', () => {
    const { container } = render(
      <Panel>
        <PanelBody flush>rows</PanelBody>
        <PanelFooter tone="mint">footer</PanelFooter>
      </Panel>,
    )
    expect(container.querySelector('.kit-panel-surface__body')!.getAttribute('data-flush')).toBe('true')
    const footer = container.querySelector('.kit-panel-surface__footer') as HTMLElement
    expect(footer.getAttribute('data-tone')).toBe('mint')
    expect(footer.classList.contains('kit-tone')).toBe(true)
  })
})
