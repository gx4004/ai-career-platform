import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingCTA } from '#/components/landing/LandingCTA'

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

vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

describe('LandingCTA', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders one stable CTA to the dashboard when the R7 entry-choice flag is off (default)', () => {
    const { container } = render(<LandingCTA />)

    expect(screen.getByRole('link', { name: /Upload your resume/i }).getAttribute('href')).toBe(
      '/dashboard',
    )
    // Dark-shipped: the entry-choice step is absent by default.
    expect(container.querySelector('.lp-entry-choice')).toBeNull()
    expect(container.querySelector('#landing-cta')).toBeTruthy()
  })

  it('stays on the single-CTA path for any non-"true" flag value', () => {
    vi.stubEnv('VITE_R7_ENTRY_CHOICE', 'false')
    const { container } = render(<LandingCTA />)

    expect(screen.getByRole('link', { name: /Upload your resume/i }).getAttribute('href')).toBe(
      '/dashboard',
    )
    expect(container.querySelector('.lp-entry-choice')).toBeNull()
  })

  it('renders the resume-first vs role-first entry choice when the flag is on', () => {
    vi.stubEnv('VITE_R7_ENTRY_CHOICE', 'true')
    const { container } = render(<LandingCTA />)

    // The generic single CTA is replaced by the explicit choice.
    expect(screen.queryByRole('link', { name: /Upload your resume/i })).toBeNull()
    expect(container.querySelector('.lp-entry-choice')).toBeTruthy()

    const resumeFirst = container.querySelector('[data-entry-choice="resume-first"]')
    expect(resumeFirst?.getAttribute('href')).toBe('/resume')

    const roleFirst = container.querySelector('[data-entry-choice="role-first"]')
    expect(roleFirst?.getAttribute('href')).toBe('/job-match')
  })
})
