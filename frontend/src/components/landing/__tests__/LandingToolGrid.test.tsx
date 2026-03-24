import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingToolGrid } from '#/components/landing/LandingToolGrid'

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

vi.mock('#/components/ui/motion', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('framer-motion', () => {
  const MotionDiv = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  )

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    useReducedMotion: () => false,
    motion: {
      div: MotionDiv,
    },
  }
})

describe('LandingToolGrid', () => {
  it('renders the canonical grouped tool order and updates the preview manually', () => {
    render(<LandingToolGrid />)

    expect(
      screen.getByRole('heading', { name: /Six tools for the search, not six separate tabs\./i }),
    ).toBeTruthy()
    expect(screen.getByText(/Review the resume/i)).toBeTruthy()
    expect(screen.getByText(/Build the application/i)).toBeTruthy()
    expect(screen.getByText(/Plan the next move/i)).toBeTruthy()

    const cardButtons = screen.getAllByRole('button')
    expect(cardButtons[0]?.textContent).toContain('Resume Analyzer')
    expect(cardButtons[1]?.textContent).toContain('Job Match')
    expect(cardButtons[2]?.textContent).toContain('Cover Letter')
    expect(cardButtons[3]?.textContent).toContain('Interview Q&A')
    expect(cardButtons[4]?.textContent).toContain('Career Path')
    expect(cardButtons[5]?.textContent).toContain('Portfolio Planner')

    expect(
      screen.getAllByText(
        /Score the draft and get the first fixes worth making\./i,
      ).length,
    ).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /Interview Q&A/i }))

    expect(
      screen.getAllByText(
        /Practice likely questions with stronger answer angles\./i,
      ).length,
    ).toBeGreaterThan(0)
  }, 20000)
})
