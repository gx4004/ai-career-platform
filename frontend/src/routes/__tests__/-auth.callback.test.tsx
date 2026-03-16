import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthCallbackPage } from '#/routes/auth.callback'

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
  createFileRoute: () => (options: unknown) => options,
}))

describe('AuthCallbackPage', () => {
  it('avoids future-tense OAuth placeholder copy and points back to working entry points', () => {
    render(<AuthCallbackPage />)

    expect(screen.getByText(/No external sign-in provider is configured/i)).toBeTruthy()
    expect(screen.getByText(/Use email sign-in to access your workspace/i)).toBeTruthy()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
    expect(screen.getByRole('link', { name: /Go to login/i }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: /Continue as guest/i }).getAttribute('href')).toBe(
      '/dashboard',
    )
  })
})
