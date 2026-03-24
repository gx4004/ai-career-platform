import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingHero } from '#/components/landing/LandingHero'

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')

  return {
    ...actual,
    useReducedMotion: () => false,
  }
})

vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

describe('LandingHero', () => {
  it('renders the classic hero by default with the original base copy', () => {
    render(<LandingHero />)

    expect(
      screen.getByRole('heading', {
        name: /Your resume has blind spots\. We find them before recruiters do\./i,
      }),
    ).toBeTruthy()
    expect(
      screen.getByText(/Upload your resume and get an instant score, targeted fixes/i),
    ).toBeTruthy()

    const cta = screen.getByRole('link', { name: /Start free — no account needed/i })
    expect(cta).toBeTruthy()
    expect(cta.getAttribute('href')).toBe('/dashboard')

    const heroImage = screen.getByRole('img', { name: /Resume Analyzer/i })
    expect(heroImage).toBeTruthy()
  })

  it('renders the lamp variant with the staged dashboard hero', () => {
    const { container } = render(<LandingHero variant="lamp" />)

    expect(container.querySelector('.landing-hero--lamp')).toBeTruthy()
    expect(
      screen.getByRole('heading', {
        name: /One shared signal\. Six sharper moves\./i,
      }),
    ).toBeTruthy()
    expect(
      screen.getByText(/Career Workbench keeps your resume baseline, role context, and next fixes connected/i),
    ).toBeTruthy()

    const cta = screen.getByRole('link', { name: /Open the workbench/i })
    expect(cta.getAttribute('href')).toBe('/dashboard')
    expect(screen.getByTestId('landing-dashboard-stage')).toBeTruthy()
    expect(
      screen.getByRole('img', { name: /Career Workbench dashboard preview/i }),
    ).toBeTruthy()
  })
})
