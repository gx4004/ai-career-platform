import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingResumeDemo } from '#/components/landing/LandingResumeDemo'

const demoState = vi.hoisted(() => ({
  reducedMotion: false,
  triggered: true,
}))

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
  useReducedMotion: () => demoState.reducedMotion,
}))

vi.mock('#/components/ui/motion', () => {
  const Passthrough = ({
    children,
    ...props
  }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>

  const MotionDiv = ({
    children,
    initial,
    animate,
    exit,
    transition,
    variants,
    custom,
    whileInView,
    viewport,
    ...props
  }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
    <div {...props}>{children}</div>
  )

  return {
    ScrollReveal: Passthrough,
    StaggerChildren: Passthrough,
    StaggerItem: Passthrough,
    useViewportTrigger: () => demoState.triggered,
    motion: {
      div: MotionDiv,
    },
  }
})

describe('LandingResumeDemo', () => {
  beforeEach(() => {
    demoState.reducedMotion = false
    demoState.triggered = true
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the new headline, score band, and CTA', () => {
    render(<LandingResumeDemo />)

    expect(screen.getByText('Watch your resume turn into a clear hiring signal.')).toBeTruthy()
    expect(screen.getByText('Shortlist range')).toBeTruthy()

    const cta = screen.getByRole('link', { name: /analyze my resume/i })
    expect(cta).toBeTruthy()
    expect(cta.getAttribute('href')).toBe('/resume')
    expect(screen.getByText('Free demo, no sign-in')).toBeTruthy()
  })

  it('advances through highlight, score, and fixes after the section triggers', () => {
    vi.useFakeTimers()

    render(<LandingResumeDemo />)

    const initialScan = screen.getByTestId('landing-demo-scan-overlay')
    expect(initialScan.getAttribute('data-pass')).toBe('initial')
    expect(screen.queryByText('Add business metrics')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1400)
    })

    expect(screen.queryByTestId('landing-demo-scan-overlay')).toBeNull()
    expect(screen.getByText('40 modules migrated to TypeScript')).toBeTruthy()
    expect(screen.getByText('UI dev time reduced 35%')).toBeTruthy()
    expect(screen.getByText('Summary lacks leadership signal')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1850)
    })

    const finalScan = screen.getByTestId('landing-demo-scan-overlay')
    expect(finalScan.getAttribute('data-pass')).toBe('confirm')
    expect(screen.getByText('84')).toBeTruthy()
    expect(screen.getByText('ATS format')).toBeTruthy()
    expect(screen.getByText('React depth')).toBeTruthy()
    expect(screen.getByText('Add business metrics')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1100)
    })

    expect(screen.queryByTestId('landing-demo-scan-overlay')).toBeNull()
  })

  it('renders the final proof state immediately for reduced motion', () => {
    demoState.reducedMotion = true
    demoState.triggered = false

    render(<LandingResumeDemo />)

    expect(screen.queryByTestId('landing-demo-scan-overlay')).toBeNull()
    expect(screen.getByText('84')).toBeTruthy()
    expect(screen.getByText('40 modules migrated to TypeScript')).toBeTruthy()
    expect(screen.getByText('Add business metrics')).toBeTruthy()
  })
})
