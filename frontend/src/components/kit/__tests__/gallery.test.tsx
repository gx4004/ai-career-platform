import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KitPage } from '#/pages/kit-page'
import { KIT_SECTIONS } from '#/pages/kit/sections'

describe('/_kit gallery', () => {
  it('lists every section in the index and renders it with a matching anchor id', () => {
    const { container } = render(<KitPage />)
    const nav = screen.getByRole('navigation', { name: 'Kit sections' })
    const links = within(nav).getAllByRole('link')
    expect(links.length).toBe(KIT_SECTIONS.length)
    for (const section of KIT_SECTIONS) {
      const link = links.find((node) => node.getAttribute('href') === `#${section.id}`)
      expect(link, `index link for ${section.id}`).toBeTruthy()
      const element = container.querySelector(`section#${section.id}`)
      expect(element, `section ${section.id}`).toBeTruthy()
      expect(element?.getAttribute('aria-labelledby')).toBe(`${section.id}-title`)
    }
  })

  it('shows a multi-line fact beside a one-line one in the narrow title-only row specimen (history-profile-F39)', () => {
    render(<KitPage />)
    const list = screen.getByRole('list', { name: 'Skills (narrow title-only specimen)' })
    const fact = list.querySelector('[data-specimen="multi-line-fact"]') as HTMLElement
    expect(within(fact).getByText('Senior Backend Engineer')).toBeTruthy()
    expect(within(fact).getByRole('button', { name: 'Edit Senior Backend Engineer' })).toBeTruthy()
  })

  it('shows a Section whose action stays beside its title (actionsWrap={false}, history-profile-F38)', () => {
    const { container } = render(<KitPage />)
    const specimen = container.querySelector('[data-specimen="section-actions-nowrap"]') as HTMLElement
    expect(specimen.querySelector('.kit-section')?.getAttribute('data-actions-wrap')).toBe('false')
    expect(within(specimen).getByRole('button', { name: 'Select all' })).toBeTruthy()
  })

  it('shows leading-disc and tool-tile rows in a 236px list (the 320px onboarding tour, regression-dialogs-R1)', () => {
    render(<KitPage />)
    const discs = screen.getByRole('list', { name: 'What you get (narrow leading specimen)' })
    expect(discs.querySelectorAll('.kit-row > .kit-row__leading').length).toBe(2)
    const tiles = screen.getByRole('list', { name: 'Tools (narrow leading specimen)' })
    expect(tiles.querySelectorAll('.kit-row__leading .kit-tool-tile').length).toBe(2)
    expect(screen.getByTestId('row-leading-narrow').style.maxWidth).toBe('236px')
  })

  it('has one h1 and no duplicate ids', () => {
    const { container } = render(<KitPage />)
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBe(1)
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every control an accessible name', () => {
    render(<KitPage />)
    const unnamed = [...document.querySelectorAll('button, input, select, textarea')].filter((control) => {
      const el = control as HTMLElement
      if (el.getAttribute('type') === 'hidden') return false
      // A decorative control hidden from assistive tech (and the tab order) has no name to give.
      if (el.closest('[aria-hidden="true"]')) return false
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
      const hasLabel = (el as HTMLInputElement).labels && (el as HTMLInputElement).labels!.length > 0
      const text = el.textContent?.trim()
      return !labelled && !hasLabel && !text
    })
    expect(unnamed.map((node) => node.outerHTML)).toEqual([])
  })
})
