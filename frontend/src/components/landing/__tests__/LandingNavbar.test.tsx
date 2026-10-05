import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Home } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { LandingNavbar } from '#/components/landing/LandingNavbar'

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const items = [
  { label: 'Overview', href: '#landing-hero', icon: Home },
  { label: 'Tools', href: '#landing-tools', icon: Home },
]

describe('LandingNavbar', () => {
  it('shows Sign in and Get started to a guest', () => {
    render(<LandingNavbar items={items} ctaTo="/resume" brand={<span>Brand</span>} />)
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Get started' }).getAttribute('href')).toBe('/resume')
    expect(screen.queryByRole('link', { name: 'Open dashboard' })).toBeNull()
  })

  it('shows one Open dashboard action to a signed-in visitor', () => {
    render(<LandingNavbar items={items} ctaTo="/resume" signedIn />)
    expect(screen.getByRole('link', { name: 'Open dashboard' }).getAttribute('href')).toBe('/dashboard')
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Get started' })).toBeNull()
  })

  it('turns into the scrolled bar after 60px', async () => {
    const { container } = render(<LandingNavbar items={items} ctaTo="/resume" />)
    const header = container.querySelector('header')
    expect(header?.getAttribute('data-state')).toBe('top')
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    fireEvent.scroll(window)
    await waitFor(() => expect(header?.getAttribute('data-state')).toBe('scrolled'))
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('opens the menu as a dialog, closes it with Escape and returns focus to the button', async () => {
    render(<LandingNavbar items={items} ctaTo="/resume" />)
    const button = screen.getByRole('button', { name: 'Open menu' })
    button.focus()
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Menu' })
    expect(dialog.querySelectorAll('a[href="#landing-tools"]').length).toBe(1)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open menu' })))
  })
})
