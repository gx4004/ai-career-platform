import { render, screen, within } from '@testing-library/react'
import { SquareKanban } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { PageHero } from '#/components/app/PageHero'

describe('PageHero', () => {
  it('renders the page title, purpose, primary action and chips', () => {
    render(
      <PageHero
        icon={SquareKanban}
        title="Your applications"
        purpose="Every job you're going for."
        action={<a href="/discovery">Find jobs</a>}
        chips={['3 in progress', '1 offer']}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Your applications' })).toBeTruthy()
    expect(screen.getByText("Every job you're going for.")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Find jobs' }).getAttribute('href')).toBe('/discovery')
    const chips = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(chips.map((chip) => chip.textContent)).toEqual(['3 in progress', '1 offer'])
  })

  it('renders a compact left-aligned page header, not a centred hero', () => {
    const { container } = render(<PageHero title="Queue" purpose="Review packets." />)

    const header = container.querySelector('header')
    expect(header?.classList.contains('page-header')).toBe(true)
    expect(header?.classList.contains('tool-input-hero')).toBe(false)
    expect(screen.queryByRole('list')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
  })
})
