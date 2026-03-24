import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingPage, LandingRoutePage } from '#/pages/landing-page'

vi.mock('#/components/landing/LandingNavbar', () => ({
  LandingNavbar: () => <div data-testid="landing-navbar" />,
}))

vi.mock('#/components/landing/LandingHero', () => ({
  LandingHero: () => <div data-testid="landing-hero" />,
}))

vi.mock('#/components/landing/LandingResumeDemoBase', () => ({
  LandingResumeDemo: () => <div data-testid="landing-resume-demo" />,
  LandingResumeDemoBase: () => <div data-testid="landing-resume-demo" />,
}))

vi.mock('#/components/landing/LandingToolGridBase', () => ({
  LandingToolGrid: () => <div data-testid="landing-tool-grid" />,
  LandingToolGridBase: () => <div data-testid="landing-tool-grid" />,
}))

vi.mock('#/components/landing/LandingCTABase', () => ({
  LandingCTA: () => <div data-testid="landing-cta" />,
  LandingCTABase: () => <div data-testid="landing-cta" />,
}))

vi.mock('#/components/landing/LandingFooterBase', () => ({
  LandingFooter: () => <div data-testid="landing-footer" />,
  LandingFooterBase: () => <div data-testid="landing-footer" />,
}))

afterEach(() => {
  document.body.className = ''
})

describe('LandingPage', () => {
  it('renders the fixed stable landing composition in the expected order', () => {
    const { container } = render(<LandingPage />)

    expect(screen.getByTestId('landing-navbar')).toBeTruthy()
    expect(screen.getByTestId('landing-hero')).toBeTruthy()
    expect(screen.getByTestId('landing-resume-demo')).toBeTruthy()
    expect(screen.getByTestId('landing-tool-grid')).toBeTruthy()
    expect(screen.getByTestId('landing-cta')).toBeTruthy()
    expect(screen.getByTestId('landing-footer')).toBeTruthy()
    expect(document.body.classList.contains('page-tone-landing')).toBe(true)

    const orderedTestIds = [
      'landing-navbar',
      'landing-hero',
      'landing-resume-demo',
      'landing-tool-grid',
      'landing-cta',
      'landing-footer',
    ].map((testId) => container.querySelector(`[data-testid="${testId}"]`))

    orderedTestIds.forEach((element) => expect(element).toBeTruthy())
    for (let index = 0; index < orderedTestIds.length - 1; index += 1) {
      expect(
        orderedTestIds[index]?.compareDocumentPosition(orderedTestIds[index + 1] as Element),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
  })

  it('route page renders the same fixed stable composition', () => {
    render(<LandingRoutePage />)

    expect(screen.getByTestId('landing-tool-grid')).toBeTruthy()
    expect(screen.queryByTestId('landing-feature-steps')).toBeNull()
    expect(screen.queryByTestId('landing-faqs')).toBeNull()
  })
})
