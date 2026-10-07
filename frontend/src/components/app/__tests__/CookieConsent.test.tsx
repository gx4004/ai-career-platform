import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieConsent } from '#/components/app/CookieConsent'
import { clearStoredConsent } from '#/lib/consent'

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

  it('comes back right after the stored choice is reset, without a reload', () => {
    window.localStorage.setItem('cw-cookie-consent', 'accepted')
    showBanner()
    expect(screen.queryByRole('dialog', { name: 'Cookie consent' })).toBeNull()
    act(() => {
      clearStoredConsent()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole('dialog', { name: 'Cookie consent' })).toBeTruthy()
  })

  it('waits while the first-run tour or another dialog is open, then shows', async () => {
    const tour = document.createElement('div')
    tour.className = 'app-tour__card'
    tour.setAttribute('role', 'dialog')
    document.body.appendChild(tour)
    showBanner()
    expect(screen.queryByRole('dialog', { name: 'Cookie consent' })).toBeNull()
    document.body.removeChild(tour)
    // MutationObserver callbacks are microtasks: let them run.
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('dialog', { name: 'Cookie consent' })).toBeTruthy()
  })

  // Answering the notice unmounted the focused button and dropped focus to the page body (sign-off public-G03).
  it('hands focus back to where the reader was when the notice appeared', () => {
    const reset = document.createElement('button')
    reset.textContent = 'Reset cookie consent'
    document.body.appendChild(reset)
    try {
      reset.focus()
      showBanner()
      const decline = screen.getByRole('button', { name: 'Decline' })
      decline.focus()
      fireEvent.click(decline)
      expect(screen.queryByRole('dialog', { name: 'Cookie consent' })).toBeNull()
      expect(document.activeElement).toBe(reset)
    } finally {
      reset.remove()
    }
  })

  it('falls back to the main landmark when nothing had focus', () => {
    const main = document.createElement('main')
    main.id = 'main-content'
    main.tabIndex = -1
    document.body.appendChild(main)
    try {
      showBanner()
      const accept = screen.getByRole('button', { name: 'Accept' })
      accept.focus()
      fireEvent.click(accept)
      expect(document.activeElement).toBe(main)
    } finally {
      main.remove()
    }
  })

  // On a wide screen the card sat on the landing's hero collage and on the end of a sign-in button (sign-off
  // public-G08): it waits, hidden, until what is marked to keep clear has moved out from under it.
  it('waits until an element marked to keep clear is out from under it', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: /min-width/.test(query), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const collage = document.createElement('div')
    collage.setAttribute('data-cookie-keep-clear', '')
    document.body.appendChild(collage)
    let collageBottom = 850
    collage.getBoundingClientRect = () => ({ left: 740, right: 1360, top: 120, bottom: collageBottom, width: 620, height: collageBottom - 120, x: 740, y: 120, toJSON() {} }) as DOMRect
    const rect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains('cookie-banner')) return { left: 1072, right: 1424, top: 739, bottom: 884, width: 352, height: 145, x: 1072, y: 739, toJSON() {} } as DOMRect
      return rect.call(this)
    }
    try {
      showBanner()
      expect(screen.queryByRole('dialog', { name: 'Cookie consent' })).toBeNull()
      collageBottom = 600
      act(() => {
        window.dispatchEvent(new Event('scroll'))
        vi.advanceTimersByTime(50)
      })
      expect(screen.getByRole('dialog', { name: 'Cookie consent' })).toBeTruthy()
      // Once shown it stays, even if the collage comes back under it.
      collageBottom = 850
      act(() => {
        window.dispatchEvent(new Event('scroll'))
        vi.advanceTimersByTime(50)
      })
      expect(screen.getByRole('dialog', { name: 'Cookie consent' })).toBeTruthy()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect
      window.matchMedia = original
      collage.remove()
    }
  })

  // Review F4: on a sign-in page that does not scroll, no scroll or resize ever fires; the card must not stay held back
  // after the page changes under it (the sign-in lands on the dashboard, the form swaps to its reset step).
  it('shows once the page changes and nothing marked to keep clear is under it any more, with no scroll', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: /min-width/.test(query), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const submit = document.createElement('button')
    submit.setAttribute('data-cookie-keep-clear', '')
    document.body.appendChild(submit)
    submit.getBoundingClientRect = () => ({ left: 1100, right: 1300, top: 760, bottom: 804, width: 200, height: 44, x: 1100, y: 760, toJSON() {} }) as DOMRect
    const rect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains('cookie-banner')) return { left: 1072, right: 1424, top: 739, bottom: 884, width: 352, height: 145, x: 1072, y: 739, toJSON() {} } as DOMRect
      return rect.call(this)
    }
    try {
      showBanner()
      expect(screen.queryByRole('dialog', { name: 'Cookie consent' })).toBeNull()
      await act(async () => {
        submit.remove()
        document.body.appendChild(document.createElement('main'))
        await Promise.resolve()
        vi.advanceTimersByTime(50)
      })
      expect(screen.getByRole('dialog', { name: 'Cookie consent' })).toBeTruthy()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect
      window.matchMedia = original
      submit.remove()
      document.querySelectorAll('body > main').forEach((main) => main.remove())
    }
  })

  // A 768 touch tablet shows the landing as one column: the notice is the slim bar there, shown straight away,
  // and only the desktop corner card waits for the hero to move out from under it (public-R3-N1).
  it('shows the bar at once on a touch tablet, where the corner card layout does not apply', () => {
    const original = window.matchMedia
    const queries: string[] = []
    window.matchMedia = ((query: string) => {
      queries.push(query)
      return { matches: false, media: query, addEventListener() {}, removeEventListener() {} }
    }) as unknown as typeof window.matchMedia
    const collage = document.createElement('div')
    collage.setAttribute('data-cookie-keep-clear', '')
    document.body.appendChild(collage)
    collage.getBoundingClientRect = () => ({ left: 0, right: 768, top: 0, bottom: 1024, width: 768, height: 1024, x: 0, y: 0, toJSON() {} }) as DOMRect
    try {
      showBanner()
      expect(screen.getByRole('dialog', { name: 'Cookie consent' })).toBeTruthy()
      expect(queries).toContain('(min-width: 1024px), (min-width: 640px) and (pointer: fine)')
    } finally {
      window.matchMedia = original
      collage.remove()
    }
  })
})
