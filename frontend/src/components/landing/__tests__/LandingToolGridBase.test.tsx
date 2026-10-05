import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingToolGridBase } from '#/components/landing/LandingToolGridBase'
import { toolList } from '#/lib/tools/registry'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('LandingToolGridBase', () => {
  it('opens every tool at its own route, in the canonical order', () => {
    const { container } = render(<LandingToolGridBase />)
    const hrefs = [...container.querySelectorAll('.lp-tool-row')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(toolList.map((tool) => tool.route))
    expect(hrefs).not.toContain('/dashboard')
    for (const tool of toolList) {
      expect(screen.getByRole('heading', { name: tool.label })).toBeTruthy()
    }
  })

  it('draws each row with the tool tile in the tool colour', () => {
    const { container } = render(<LandingToolGridBase />)
    const tones = [...container.querySelectorAll('.kit-tool-tile--index')].map((el) => el.getAttribute('data-tone'))
    expect(tones).toEqual(toolList.map((tool) => tool.tone))
  })
})
