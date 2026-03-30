import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingExperimentPage } from '#/pages/landing-experiment-page'

const scrollToMock = vi.hoisted(() => vi.fn())

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

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

vi.mock('#/components/app/AppBrandLockup', () => ({
  AppBrandLockup: () => <div data-testid="brand-lockup" />,
}))

vi.mock('#/components/landing/LandingTubelightNavbar', () => ({
  LandingTubelightNavbar: ({
    items,
    ctaLabel,
    ctaTo,
    signInLabel,
    signInTo,
    brand,
  }: {
    items: Array<{ label: string; href?: string; to?: string }>
    ctaLabel: string
    ctaTo?: string
    signInLabel?: string
    signInTo?: string
    brand: ReactNode
  }) => (
    <div data-testid="experiment-navbar">
      {brand}
      <nav>
        {items.map((item) => (
          <a key={item.label} href={item.to ?? item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a href={signInTo}>{signInLabel}</a>
      <a href={ctaTo}>{ctaLabel}</a>
    </div>
  ),
}))

vi.mock('#/components/landing/LandingExperimentHero', () => ({
  LandingExperimentHero: () => <div data-testid="landing-hero" />,
}))

vi.mock('#/components/landing/LandingSocialProof', () => ({
  LandingSocialProof: () => <div data-testid="landing-social-proof" />,
}))

vi.mock('#/components/landing/LandingFeatureStepsDemo', () => ({
  LandingFeatureStepsDemo: () => <div data-testid="landing-feature-steps" />,
}))

vi.mock('#/components/landing/LandingToolGridBase', () => ({
  LandingToolGridBase: () => <div data-testid="landing-tool-grid" />,
}))

vi.mock('#/components/landing/LandingFaqsSection', () => ({
  LandingFaqsSection: () => <div data-testid="landing-faqs" />,
}))

vi.mock('#/components/landing/LandingCTA', () => ({
  LandingCTA: ({ variant = 'default' }: { variant?: string }) => (
    <div data-testid="landing-cta">{variant}</div>
  ),
}))

beforeEach(() => {
  scrollToMock.mockReset()
  Object.defineProperty(window, 'scrollTo', {
    value: scrollToMock,
    writable: true,
  })
})

afterEach(() => {
  document.body.className = ''
  window.history.replaceState({}, '', '/')
})

describe('LandingExperimentPage', () => {
  it('renders the redesigned experiment page with correct section order', () => {
    const { container } = render(<LandingExperimentPage />)

    expect(document.body.classList.contains('page-tone-landing')).toBe(true)
    expect(screen.getByTestId('experiment-navbar')).toBeTruthy()
    expect(screen.getByTestId('brand-lockup')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('#landing-hero')
    expect(screen.getByRole('link', { name: 'Workflow' }).getAttribute('href')).toBe('#landing-journey')
    expect(screen.getByRole('link', { name: 'Tools' }).getAttribute('href')).toBe('#landing-tools')
    expect(screen.getByRole('link', { name: 'FAQ' }).getAttribute('href')).toBe('#landing-faq')
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Get started' }).getAttribute('href')).toBe('/dashboard')
    expect(screen.getByTestId('landing-hero')).toBeTruthy()
    expect(screen.getByTestId('landing-feature-steps')).toBeTruthy()
    expect(screen.getByTestId('landing-tool-grid')).toBeTruthy()
    expect(screen.getByTestId('landing-faqs')).toBeTruthy()
    expect(screen.getByTestId('landing-cta').textContent).toBe('default')
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })

    // Verify section order matches landingExperimentSectionOrder
    const orderedTestIds = [
      'experiment-navbar',
      'landing-hero',
      'landing-social-proof',
      'landing-feature-steps',
      'landing-tool-grid',
      'landing-faqs',
      'landing-cta',
    ].map((testId) => container.querySelector(`[data-testid="${testId}"]`))

    orderedTestIds.forEach((element) => expect(element).toBeTruthy())
    for (let index = 0; index < orderedTestIds.length - 1; index += 1) {
      expect(
        orderedTestIds[index]?.compareDocumentPosition(orderedTestIds[index + 1] as Element),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
  }, 20000)

  it('preserves intentional hash navigation instead of forcing scroll to top', () => {
    window.history.replaceState({}, '', '/#landing-tools')

    render(<LandingExperimentPage />)

    expect(scrollToMock).not.toHaveBeenCalled()
  })
})
