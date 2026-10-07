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

  // On phones the bar keeps the wordmark and hands its call to action to the menu (sign-off public-F14).
  it('also offers Get started in the menu, and Open dashboard there to a signed-in visitor', async () => {
    const { container, unmount } = render(<LandingNavbar items={items} ctaTo="/resume" />)
    expect(container.querySelector('.lp-nav__end > .lp-nav__cta')?.textContent).toBe('Get started')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const guestMenu = await screen.findByRole('dialog', { name: 'Menu' })
    expect(guestMenu.querySelector('a[href="/resume"]')?.textContent).toBe('Get started')
    expect(guestMenu.querySelector('a[href="/login"]')?.textContent).toBe('Sign in')
    unmount()

    render(<LandingNavbar items={items} ctaTo="/resume" signedIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const memberMenu = await screen.findByRole('dialog', { name: 'Menu' })
    expect(memberMenu.querySelector('a[href="/dashboard"]')?.textContent).toBe('Open dashboard')
    expect(memberMenu.querySelector('a[href="/login"]')).toBeNull()
  })

  // The menu read ragged: section links with icons, a padded ghost Sign in, icon-less account buttons (sign-off
  // public-G12). Every entry is the same lg secondary button with an icon, so the labels share one start.
  it('draws every menu entry the same way: secondary, with an icon before the label', async () => {
    const { unmount } = render(<LandingNavbar items={items} ctaTo="/resume" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const guestMenu = await screen.findByRole('dialog', { name: 'Menu' })
    const guestLinks = Array.from(guestMenu.querySelectorAll<HTMLElement>('.lp-menu__link'))
    expect(guestLinks.map((link) => link.textContent)).toEqual(['Overview', 'Tools', 'Sign in', 'Get started'])
    for (const link of guestLinks) {
      expect(link.className, link.textContent!).toContain('kit-button--secondary')
      expect(link.querySelector('svg'), link.textContent!).toBeTruthy()
    }
    unmount()

    render(<LandingNavbar items={items} ctaTo="/resume" signedIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const memberMenu = await screen.findByRole('dialog', { name: 'Menu' })
    const dashboard = memberMenu.querySelector<HTMLElement>('a[href="/dashboard"]')!
    expect(dashboard.className).toContain('kit-button--secondary')
    expect(dashboard.querySelector('svg')).toBeTruthy()
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

  // public-F05: the current item is read from positions, so a band that is not in the list (Built for, the
  // closer) and a jump back up never leave a stale item lemon.
  it('marks the last section whose top has passed the reading line, from positions on scroll', async () => {
    const tops: Record<string, number> = { 'landing-hero': 0, 'landing-proof': 700, 'landing-journey': 1100, 'landing-tools': 2000 }
    const offset = { y: 0 }
    const nodes = Object.keys(tops).map((id) => {
      const node = document.createElement('section')
      node.id = id
      node.getBoundingClientRect = () => ({ top: tops[id]! - offset.y, height: 400, bottom: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} })
      document.body.appendChild(node)
      return node
    })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    const sections = [
      { label: 'Overview', href: '#landing-hero' },
      { label: 'Workflow', href: '#landing-journey' },
      { label: 'Tools', href: '#landing-tools' },
    ]
    const current = () => screen.getAllByRole('link').find((link) => link.getAttribute('aria-current') === 'location')?.textContent
    const scrollTo = async (y: number) => {
      offset.y = y
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
      fireEvent.scroll(window)
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    render(<LandingNavbar items={sections} sectionIds={['landing-hero', 'landing-journey', 'landing-tools']} ctaTo="/resume" />)
    await waitFor(() => expect(current()).toBe('Overview'))
    await scrollTo(1000) // Workflow's top is 100px from the top of the screen
    await waitFor(() => expect(current()).toBe('Workflow'))
    await scrollTo(400) // back up to the Built-for band: it counts as the overview
    await waitFor(() => expect(current()).toBe('Overview'))
    await scrollTo(1900)
    await waitFor(() => expect(current()).toBe('Tools'))
    await scrollTo(0)
    for (const node of nodes) node.remove()
  })
})
