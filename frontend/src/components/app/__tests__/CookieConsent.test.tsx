import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieConsent } from '#/components/app/CookieConsent'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('CookieConsent', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function showBanner() {
    render(<CookieConsent />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
  }

  it('asks once, with two equal-weight choices and a link to the policy', () => {
    showBanner()
    const dialog = screen.getByRole('dialog', { name: 'Cookie consent' })
    const decline = screen.getByRole('button', { name: 'Decline' })
    const accept = screen.getByRole('button', { name: 'Accept' })
    expect(decline.className).toBe(accept.className)
    expect(screen.getByRole('link', { name: 'Learn more' }).getAttribute('href')).toBe('/cookies')
    expect(dialog.contains(decline)).toBe(true)
  })

  it('remembers the choice and goes away', () => {
    showBanner()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.queryByRole('dialog', { name: 'Cookie consent' })).toBeNull()
    expect(window.localStorage.getItem('cw-cookie-consent')).toBe('rejected')
  })

  it('stays away once a choice is stored', () => {
    window.localStorage.setItem('cw-cookie-consent', 'accepted')
    showBanner()
    expect(screen.queryByRole('dialog', { name: 'Cookie consent' })).toBeNull()
  })
})
