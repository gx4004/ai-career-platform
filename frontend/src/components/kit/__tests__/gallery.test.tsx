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
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
      const hasLabel = (el as HTMLInputElement).labels && (el as HTMLInputElement).labels!.length > 0
      const text = el.textContent?.trim()
      return !labelled && !hasLabel && !text
    })
    expect(unnamed.map((node) => node.outerHTML)).toEqual([])
  })
})
