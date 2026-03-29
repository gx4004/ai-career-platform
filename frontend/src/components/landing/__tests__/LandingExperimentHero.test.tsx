import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingExperimentHero } from '#/components/landing/LandingExperimentHero'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('framer-motion', () => ({
  motion: {
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 {...props}>{children}</h1>,
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}))

describe('LandingExperimentHero', () => {
  it('renders the headline, body copy, CTA, and static proof card', () => {
    const { container } = render(<LandingExperimentHero />)
    const heading = container.querySelector('h1')
    const links = container.querySelectorAll('a')

    expect(heading?.textContent).toContain('blind spots.')
    expect(heading?.textContent).toContain('We find them before recruiters do.')
    // Primary CTA links to dashboard
    expect(links[0]?.getAttribute('href')).toBe('/dashboard')
    // Static proof card shows score
    expect(container.textContent).toContain('86')
    expect(container.textContent).toContain('Ready for shortlists')
  })
})
