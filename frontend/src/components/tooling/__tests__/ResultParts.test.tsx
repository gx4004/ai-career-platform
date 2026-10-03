import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Lines, Prose, ReportSection, ResultList, SeverityBadge, sectionId } from '#/components/tooling/ResultParts'

describe('ResultParts', () => {
  it('renders one list for every report: number, title, detail, status', () => {
    const { container } = render(
      <ResultList
        numbered
        label="Fix first"
        items={[
          { key: 'a', title: 'First', detail: 'Do this', meta: <SeverityBadge level="high" /> },
          { key: 'b', title: 'Second', body: <p>More</p>, meta: <SeverityBadge level="low" /> },
        ]}
      />,
    )
    expect(screen.getByRole('list', { name: 'Fix first' }).tagName).toBe('OL')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('Do this')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    // Only a row with a block under its title is laid out from the top, so its badge stays on the title line.
    expect(container.querySelectorAll('.result-row--stacked')).toHaveLength(1)
  })

  it('maps severity to a kit badge tone, falling back to medium', () => {
    render(
      <>
        <SeverityBadge level="high" />
        <SeverityBadge level="low" />
        <SeverityBadge level="whatever" />
      </>,
    )
    expect(screen.getByText('High').closest('.kit-badge')?.getAttribute('data-tone')).toBe('danger')
    expect(screen.getByText('Low').closest('.kit-badge')?.getAttribute('data-tone')).toBe('neutral')
    expect(screen.getByText('Medium').closest('.kit-badge')?.getAttribute('data-tone')).toBe('warning')
  })

  it('gives a section an id from its title so the contents list can find it', () => {
    render(
      <ReportSection title="Score breakdown">
        <Prose>Body</Prose>
      </ReportSection>,
    )
    const heading = screen.getByRole('heading', { name: 'Score breakdown' })
    const section = heading.closest('section') as HTMLElement
    expect(section.id).toBe(sectionId('Score breakdown'))
    expect(section.dataset.tocTitle).toBe('Score breakdown')
  })

  it('lists short lines without bullets', () => {
    render(<Lines items={['One', 'Two']} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['One', 'Two'])
  })
})
