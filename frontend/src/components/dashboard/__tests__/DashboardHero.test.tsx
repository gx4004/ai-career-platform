import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardHero } from '#/components/dashboard/DashboardHero'

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

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: 'guest',
    openAuthDialog: vi.fn(),
  }),
}))

describe('DashboardHero', () => {
  it('renders the real carousel image for the active tool', () => {
    render(<DashboardHero />)

    expect(screen.getByText('Build the search one strong decision at a time.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /start with resume/i }).getAttribute('href')).toBe('/resume')
    expect(screen.getByRole('img', { name: 'Resume Analyzer preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous tool' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next tool' })).toBeTruthy()
  })

  it('cycles through tools when navigation buttons are clicked', async () => {
    render(<DashboardHero />)

    const next = screen.getByRole('button', { name: 'Next tool' })
    const prev = screen.getByRole('button', { name: 'Previous tool' })

    expect(screen.getByRole('img', { name: 'Resume Analyzer preview' })).toBeTruthy()

    fireEvent.click(next)
    expect(await screen.findByRole('img', { name: 'Job Match preview' })).toBeTruthy()

    fireEvent.click(next)
    expect(await screen.findByRole('img', { name: 'Cover Letter preview' })).toBeTruthy()

    fireEvent.click(prev)
    expect(await screen.findByRole('img', { name: 'Job Match preview' })).toBeTruthy()
  })
})
