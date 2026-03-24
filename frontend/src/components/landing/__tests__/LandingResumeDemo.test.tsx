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

  it('renders the new headline and proof summary state', () => {
    render(<LandingResumeDemo />)

    expect(screen.getByText('See what is working before you rewrite.')).toBeTruthy()
    expect(
      screen.getByText(
        'Get a score, spot the strongest proof, and find the first fix worth making.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('What to fix first')).toBeTruthy()
    expect(screen.getByText('Adrian Nowak')).toBeTruthy()
    expect(screen.getByText(/adrian@nowak\.dev/i)).toBeTruthy()
    expect(screen.getByText('Selected Work')).toBeTruthy()
    expect(screen.getByText('Core Stack')).toBeTruthy()
  })

  it('advances through the simplified scan, proof, and analysis sequence', () => {
    vi.useFakeTimers()

    render(<LandingResumeDemo />)

    const initialScan = screen.getByTestId('landing-demo-scan-overlay')
    expect(initialScan.getAttribute('data-pass')).toBe('initial')
    expect(screen.queryByText('Strong shortlist signal')).toBeNull()
    expect(screen.queryByText('Strongest signal')).toBeNull()
    expect(screen.queryByText('First fix')).toBeNull()
    expect(
      screen.queryByText(
        'Quantified platform and performance wins make the profile credible fast.',
      ),
    ).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    const summaryLine = screen
      .getByText(
        'Senior frontend engineer building revenue-critical React products, design systems, and performance improvements across scaling SaaS teams.',
      )
      .closest('.landing-demo-doc-line')
    expect(summaryLine).toBeTruthy()
    expect(summaryLine?.getAttribute('data-highlighted')).toBe('true')

    act(() => {
      vi.advanceTimersByTime(600)
    })

    const proofLine = screen
      .getByText(
        'Led the design-system migration across 6 product squads, reducing UI delivery time by 34%.',
      )
      .closest('.landing-demo-doc-line')
    expect(proofLine).toBeTruthy()
    expect(proofLine?.getAttribute('data-highlighted')).toBe('true')

    act(() => {
      vi.advanceTimersByTime(900)
    })

    const confirmScan = screen.getByTestId('landing-demo-scan-overlay')
    expect(confirmScan.getAttribute('data-pass')).toBe('confirm')
    expect(screen.queryByText('Strong shortlist signal')).toBeNull()
    expect(screen.queryByText('Strongest signal')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1900)
    })

    expect(screen.queryByTestId('landing-demo-scan-overlay')).toBeNull()
    expect(screen.getByText('86')).toBeTruthy()
    expect(screen.getByText('Strong shortlist signal')).toBeTruthy()
    expect(screen.getByText('Resume score')).toBeTruthy()
    expect(screen.getByText('Strongest signal')).toBeTruthy()
    expect(screen.getByText('First fix')).toBeTruthy()
    expect(
      screen.getByText(
        'Quantified platform and performance wins make the profile credible fast.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'The summary needs clearer leadership scope and stronger target-role language.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Selected Work')).toBeTruthy()
    expect(screen.getByText('Core Stack')).toBeTruthy()
  })

  it('renders the final proof state immediately for reduced motion', () => {
    demoState.reducedMotion = true
    demoState.triggered = false

    render(<LandingResumeDemo />)

    expect(screen.queryByTestId('landing-demo-scan-overlay')).toBeNull()
    expect(screen.getByText('86')).toBeTruthy()
    expect(screen.getByText('Strong shortlist signal')).toBeTruthy()
    expect(
      screen.getByText(
        'Quantified platform and performance wins make the profile credible fast.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'The summary needs clearer leadership scope and stronger target-role language.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Selected Work')).toBeTruthy()
    expect(screen.getByText('Core Stack')).toBeTruthy()
  })
})
