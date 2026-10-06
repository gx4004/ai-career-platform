import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CheckDisc, Lines, Prose, ReportSection, ResultList, SeverityBadge, sectionId, verdictTone } from '#/components/tooling/ResultParts'

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
    expect(screen.getByText('Low').closest('.kit-badge')?.getAttribute('data-tone')).toBe('lilac')
    expect(screen.getByText('Medium').closest('.kit-badge')?.getAttribute('data-tone')).toBe('warning')
    expect(screen.getByText('High').closest('.kit-badge')?.getAttribute('data-severity')).toBe('high')
  })

  it('draws severity white on a lemon sticker, where a lemon badge would vanish', () => {
    render(<SeverityBadge level="medium" onSticker />)
    expect(screen.getByText('Medium').closest('.kit-badge')?.getAttribute('data-tone')).toBe('white')
  })

  it('colours a verdict by meaning: the words first, then the score', () => {
    expect(verdictTone('Strong foundation', 77)).toBe('mint')
    expect(verdictTone('borderline', 90)).toBe('lemon')
    expect(verdictTone('stretch', 90)).toBe('rose')
    // The resume's three bands keep one colour each, whatever the score inside the band.
    expect(verdictTone('Promising but uneven', 82)).toBe('lemon')
    expect(verdictTone('Promising but uneven', 72)).toBe('lemon')
    expect(verdictTone('Needs stronger evidence', 60)).toBe('rose')
    expect(verdictTone('Strong foundation', 90)).toBe('mint')
    expect(verdictTone('Steady', 40)).toBe('rose')
    expect(verdictTone('Something unknown')).toBe('white')
  })

  it('puts a tick in front of a row instead of its number', () => {
    const { container } = render(<ResultList label="Strengths" items={[{ key: 'a', title: 'Clear', leading: <CheckDisc /> }]} />)
    expect(container.querySelector('.kit-row__leading [data-tone="mint"]')).toBeTruthy()
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
