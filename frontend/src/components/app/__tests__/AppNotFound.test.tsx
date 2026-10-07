import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppNotFound } from '#/components/app/AppNotFound'
import { toolList } from '#/lib/tools/registry'

const session = vi.hoisted(() => ({ status: 'guest' as 'guest' | 'authenticated' }))
const nav = vi.hoisted(() => ({ canGoBack: false, back: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useCanGoBack: () => nav.canGoBack,
  useRouter: () => ({ history: { back: nav.back } }),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status }) }))
const openPalette = vi.hoisted(() => vi.fn())
vi.mock('#/components/app/CommandPalette', () => ({ openCommandPalette: openPalette }))

describe('AppNotFound', () => {
  it('says what happened once, under a big 404 seal', () => {
    session.status = 'guest'
    const { container } = render(<AppNotFound />)
    expect(screen.getByRole('heading', { level: 1, name: "This page doesn't exist" })).toBeTruthy()
    expect(screen.getByText('Page not found')).toBeTruthy()
    expect(screen.getByRole('term').textContent).toBe('Error 404')
    expect(container.querySelector('.state-page .kit-seal')).toBeTruthy()
  })

  it('offers search, which opens the command palette', () => {
    render(<AppNotFound />)
    fireEvent.click(screen.getByRole('button', { name: /Search tools, pages and runs/ }))
    expect(openPalette).toHaveBeenCalledTimes(1)
  })

  it('makes going back the one primary action when there is somewhere to go back to', () => {
    nav.canGoBack = true
    session.status = 'authenticated'
    render(<AppNotFound />)
    const goBack = screen.getByRole('button', { name: 'Go back' })
    expect(goBack.className).toContain('kit-button--primary')
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).className).toContain('kit-button--secondary')
    fireEvent.click(goBack)
    expect(nav.back).toHaveBeenCalled()
  })

  it('makes the dashboard the primary action when the page was opened directly', () => {
    nav.canGoBack = false
    session.status = 'authenticated'
    render(<AppNotFound />)
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).className).toContain('kit-button--primary')
  })

  it('offers a signed-out visitor home and every tool with its one-line purpose', () => {
    session.status = 'guest'
    render(<AppNotFound />)
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('link', { name: 'Back to the dashboard' })).toBeNull()
    const tools = within(screen.getByRole('list', { name: 'Tools' }))
    for (const tool of toolList) {
      expect(tools.getByRole('link', { name: tool.label }).getAttribute('href')).toBe(tool.route)
      expect(tools.getByText(tool.summary)).toBeTruthy()
    }
  })

  it('names the tab "Page not found" while it is shown and gives the old title back after', () => {
    document.title = 'Career Workbench'
    const { unmount } = render(<AppNotFound />)
    expect(document.title).toBe('Page not found | Career Workbench')
    unmount()
    expect(document.title).toBe('Career Workbench')
  })

  it('leaves the next page its own title when the router has already set it', () => {
    document.title = 'Career Workbench'
    const { unmount } = render(<AppNotFound />)
    // Navigating away: the next route's head writes its title in the same commit, before this unmounts.
    document.title = 'Dashboard | Career Workbench'
    unmount()
    expect(document.title).toBe('Dashboard | Career Workbench')
  })

  it('leads a signed-in user to the dashboard first', () => {
    session.status = 'authenticated'
    render(<AppNotFound />)
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).getAttribute('href')).toBe('/dashboard')
  })
})
