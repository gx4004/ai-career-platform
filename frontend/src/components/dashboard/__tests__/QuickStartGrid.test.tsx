import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuickStartGrid } from '#/components/dashboard/QuickStartGrid'

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

describe('QuickStartGrid', () => {
  it('renders the workflow stairs in the expected dashboard order', () => {
    const { container } = render(<QuickStartGrid />)

    expect(screen.getByText('Six tools, one connected workflow')).toBeTruthy()
    expect(screen.getByText(/Follow the steps from top to bottom/i)).toBeTruthy()

    expect(screen.getAllByText('Start')).toHaveLength(1)
    expect(screen.getAllByText('Apply')).toHaveLength(1)
    expect(screen.getAllByText('Plan')).toHaveLength(1)
    expect(container.querySelectorAll('.quick-start-phase-flight')).toHaveLength(3)

    const stepMarkers = Array.from(
      container.querySelectorAll('.quick-start-step-marker'),
    ).map((element) => element.textContent?.trim())

    expect(stepMarkers).toEqual(['1', '2', '3', '4', '5', '6'])

    const toolTitles = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)

    expect(toolTitles).toEqual([
      'Resume Analyzer',
      'Job Match',
      'Cover Letter',
      'Interview Q&A',
      'Career Path',
      'Portfolio Planner',
    ])

    expect(screen.getByRole('img', { name: 'Resume Analyzer preview' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Job Match preview' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Cover Letter preview' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Interview Q&A preview' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Career Path preview' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Portfolio Planner preview' })).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(6)
  })
})
