import type { HTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingExperimentScrollShowcase } from '#/components/landing/LandingExperimentScrollShowcase'

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const showcaseState = vi.hoisted(() => ({
  isMobile: false,
  reducedMotion: false,
}))

vi.mock('framer-motion', () => ({
  useReducedMotion: () => showcaseState.reducedMotion,
}))

vi.mock('#/hooks/use-mobile', () => ({
  useIsMobile: () => showcaseState.isMobile,
}))

vi.mock('#/components/ui/motion', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

describe('LandingExperimentScrollShowcase', () => {
  beforeEach(() => {
    showcaseState.isMobile = false
    showcaseState.reducedMotion = false
    globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver
  })

  it('renders the sticky storyboard version on desktop', () => {
    render(<LandingExperimentScrollShowcase />)

    expect(screen.getByTestId('landing-storyboard-stage')).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: /The baseline, target role, and fixes travel together/i }),
    ).toBeTruthy()
    expect(screen.getByText(/Resume review, matching, applications, and planning all start/i)).toBeTruthy()
    expect(screen.getByRole('img', { name: /Connected workspace preview/i })).toBeTruthy()
    expect(screen.getAllByText(/See the baseline before you rewrite anything\./i)).toHaveLength(2)
    expect(screen.getByText(/Shared context active/i)).toBeTruthy()
  }, 20000)

  it('falls back to a static card on mobile', () => {
    showcaseState.isMobile = true

    render(<LandingExperimentScrollShowcase />)

    expect(screen.queryByTestId('landing-storyboard-stage')).toBeNull()
    expect(
      screen.getByRole('heading', { name: /The baseline, target role, and fixes travel together/i }),
    ).toBeTruthy()
    expect(screen.getByText(/Resume baseline loaded/i)).toBeTruthy()
    expect(screen.getByText(/Role context synced/i)).toBeTruthy()
    expect(screen.getByText(/Resume signal/i)).toBeTruthy()
  }, 20000)
})
