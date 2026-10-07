import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LegalLayout } from '#/components/legal/LegalLayout'

const nav = vi.hoisted(() => ({ canGoBack: false, back: vi.fn(), pathname: '/' }))
const session = vi.hoisted(() => ({ status: 'authenticated' as 'authenticated' | 'guest' | 'loading' }))

vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status }) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useCanGoBack: () => nav.canGoBack,
  useRouter: () => ({ history: { back: nav.back } }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: nav.pathname } }),
}))

describe('LegalLayout', () => {
  beforeEach(() => {
    nav.canGoBack = false
    nav.back.mockReset()
    nav.pathname = '/'
    session.status = 'authenticated'
  })

  // A guest who opens a legal page from a search result or a fresh tab goes back to the landing page, not into
  // the guest app shell; signed in, Back is the dashboard (the 404's rule; sign-off public-G13).
  it('without in-app history, Back leads home for a guest and to the dashboard when signed in', () => {
    session.status = 'guest'
    const { unmount } = render(
      <LegalLayout title="Privacy Policy">
        <p>Text.</p>
      </LegalLayout>,
    )
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/')
    unmount()
    session.status = 'authenticated'
    render(
      <LegalLayout title="Privacy Policy">
        <p>Text.</p>
      </LegalLayout>,
    )
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/dashboard')
  })

  it('is one reading page: the brand, a way back, a title with its date, the text and the other pages', () => {
    render(
      <LegalLayout title="Privacy Policy" lastUpdated="2026-04-28">
        <h2>1. Who we are</h2>
        <p>Text.</p>
      </LegalLayout>,
    )
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy()
    expect(screen.getByText('Last updated Apr 28, 2026')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Career Workbench home' }).getAttribute('href')).toBe('/')
    // One label for the way out on every shell-less page (sign-in, reset password, legal), so the wordmark always fits.
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/dashboard')
    expect(screen.getByRole('heading', { level: 2, name: '1. Who we are' })).toBeTruthy()
  })

  it('links the four legal pages once, at the foot of the page', () => {
    render(
      <LegalLayout title="Terms of Service">
        <p>Text.</p>
      </LegalLayout>,
    )
    const nav = within(screen.getByRole('navigation', { name: 'Legal pages' }))
    expect(nav.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/privacy',
      '/terms',
      '/cookies',
      '/imprint',
    ])
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })

  it('goes back to the page the visitor came from (the half-filled sign-up form) when there is one', () => {
    nav.canGoBack = true
    render(
      <LegalLayout title="Terms of Service">
        <p>Text.</p>
      </LegalLayout>,
    )
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(nav.back).toHaveBeenCalledTimes(1)
  })

  it('shows where you are in the foot strip: the current page is plain text, not a link to itself', () => {
    nav.pathname = '/privacy'
    render(
      <LegalLayout title="Privacy Policy">
        <p>Text.</p>
      </LegalLayout>,
    )
    const strip = screen.getByRole('navigation', { name: 'Legal pages' })
    expect(within(strip).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/terms', '/cookies', '/imprint'])
    const current = within(strip).getByText('Privacy')
    expect(current.tagName).not.toBe('A')
    expect(current.getAttribute('aria-current')).toBe('page')
  })

  it('builds a contents rail from the h2 headings and gives each one an id', () => {
    render(
      <LegalLayout title="Privacy Policy">
        <h2>1. Who we are</h2>
        <p>Text.</p>
        <h2>2. What data we collect</h2>
        <p>Text.</p>
        <h2>3. Contact</h2>
        <p>Text.</p>
      </LegalLayout>,
    )
    const rail = within(screen.getByRole('navigation', { name: 'On this page' }))
    expect(rail.getAllByRole('link').map((link) => link.textContent)).toEqual(['1. Who we are', '2. What data we collect', '3. Contact'])
    expect(rail.getByRole('link', { name: '1. Who we are' }).getAttribute('href')).toBe('#legal-who-we-are')
    expect(screen.getByRole('heading', { level: 2, name: '1. Who we are' }).id).toBe('legal-who-we-are')
  })

  it('skips the rail on a page with only a couple of sections', () => {
    render(
      <LegalLayout title="Imprint">
        <h2>Contact</h2>
        <p>Text.</p>
      </LegalLayout>,
    )
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull()
  })
})
