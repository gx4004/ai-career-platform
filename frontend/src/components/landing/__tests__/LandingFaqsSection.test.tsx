import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingFaqsSection } from '#/components/landing/LandingFaqsSection'

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver

vi.mock('#/components/ui/motion', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: { children?: ReactNode } & Record<string, unknown>) => (
      <div {...(props as Record<string, unknown>)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}))

describe('LandingFaqsSection', () => {
  it('renders the landing FAQ card with product-specific questions', () => {
    render(<LandingFaqsSection />)

    expect(
      screen.getByRole('heading', { name: /Common questions/i }),
    ).toBeTruthy()
    expect(
      screen.getByText(/Can I try Career Workbench without an account/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/Do I need a job description/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/What carries across tools/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/What do I leave with/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/How is this different from a resume checker/i),
    ).toBeTruthy()
  }, 20000)
})
