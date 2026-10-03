import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppNotFound } from '#/components/app/AppNotFound'
import { toolList } from '#/lib/tools/registry'

const session = vi.hoisted(() => ({ status: 'guest' as 'guest' | 'authenticated' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status }) }))

describe('AppNotFound', () => {
  it('says what happened once, with the 404 as a quiet code', () => {
    session.status = 'guest'
    render(<AppNotFound />)
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy()
    expect(screen.getByText('404')).toBeTruthy()
    expect(screen.queryByText(/Error 404/)).toBeNull()
  })

  it('offers a signed-out visitor home and every tool with its one-line purpose', () => {
    session.status = 'guest'
    render(<AppNotFound />)
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('link', { name: 'Go to dashboard' })).toBeNull()
    const tools = within(screen.getByRole('list', { name: 'Tools' }))
    for (const tool of toolList) {
      expect(tools.getByRole('link', { name: tool.label }).getAttribute('href')).toBe(tool.route)
      expect(tools.getByText(tool.summary)).toBeTruthy()
    }
  })

  it('leads a signed-in user to the dashboard first', () => {
    session.status = 'authenticated'
    render(<AppNotFound />)
    expect(screen.getByRole('link', { name: 'Go to dashboard' }).getAttribute('href')).toBe('/dashboard')
  })
})
