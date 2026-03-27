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
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
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

vi.mock('#/components/ui/border-beam', () => ({
  BorderBeam: () => null,
}))

vi.mock('#/components/ui/number-ticker', () => ({
  NumberTicker: ({ value }: { value: number }) => <span>{value}</span>,
}))

describe('LandingResumeDemo', () => {
  beforeEach(() => {
    demoState.reducedMotion = false
    demoState.triggered = true
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the headline and resume identity', () => {
    render(<LandingResumeDemo />)

    expect(
      screen.getByText('Watch your resume get read the way a recruiter reads it.'),
    ).toBeTruthy()
    expect(screen.getByText('Adrian Nowak')).toBeTruthy()
    expect(screen.getByText(/adrian@nowak\.dev/i)).toBeTruthy()
    expect(screen.getByText('Core Stack')).toBeTruthy()
    expect(screen.getByText('Profile')).toBeTruthy()
    expect(screen.getByText('Experience')).toBeTruthy()
  })

  it('advances through the annotation sequence to the score phase', () => {
    vi.useFakeTimers()

    render(<LandingResumeDemo />)

    // Initially no annotations visible
    expect(screen.queryByText('Add leadership scope to summary')).toBeNull()
    expect(screen.queryByText('Measurable delivery proof found')).toBeNull()

    // Advance past scanning into annotate phases
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(screen.getByText('Add leadership scope to summary')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByText('Measurable delivery proof found')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByText('Clear business impact detected')).toBeTruthy()

    // Advance to score phase
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(screen.getByText('Ready for shortlists')).toBeTruthy()
  })

  it('renders the final state immediately for reduced motion', () => {
    demoState.reducedMotion = true
    demoState.triggered = false

    render(<LandingResumeDemo />)

    expect(screen.getAllByText('86').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Ready for shortlists')).toBeTruthy()
    expect(screen.getByText('Add leadership scope to summary')).toBeTruthy()
    expect(screen.getByText('Measurable delivery proof found')).toBeTruthy()
    expect(screen.getByText('Clear business impact detected')).toBeTruthy()
    expect(screen.getByText('Core Stack')).toBeTruthy()
  })
})
