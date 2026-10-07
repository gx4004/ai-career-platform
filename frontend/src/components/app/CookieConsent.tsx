import { useState, useEffect, useRef, type FocusEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/kit'
import {
  type ConsentState,
  getStoredConsent,
  setStoredConsent,
  subscribeConsent,
  hasAnalyticsConsent as hasAnalyticsConsentFromLib,
} from '#/lib/consent'

/** Re-export for backwards compatibility with existing imports. */
export const hasAnalyticsConsent = hasAnalyticsConsentFromLib

/** Something else is asking for the viewer's attention: the dashboard tour card or any open dialog. */
const OTHER_OVERLAY = '.app-tour__card, [role="dialog"]:not(.cookie-banner)'

/** What the corner card must never sit on when it first shows (the landing's hero collage, a form's submit). */
const KEEP_CLEAR = '[data-cookie-keep-clear]'
/** Room kept between the card (its hard shadow included) and what it keeps clear of. */
const KEEP_CLEAR_GAP = 8
/**
 * The corner card's layout (shell.css); on phones and single-column touch tablets the notice is a slim
 * full-width bar instead (the complement of shell.css's bar query).
 */
const CORNER_CARD = '(min-width: 1024px), (min-width: 640px) and (pointer: fine)'

function coversKeepClear(banner: HTMLElement): boolean {
  if (!window.matchMedia?.(CORNER_CARD).matches) return false
  const card = banner.getBoundingClientRect()
  return Array.from(document.querySelectorAll<HTMLElement>(KEEP_CLEAR)).some((element) => {
    const box = element.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return false
    return (
      box.left < card.right + KEEP_CLEAR_GAP &&
      box.right > card.left - KEEP_CLEAR_GAP &&
      box.top < card.bottom + KEEP_CLEAR_GAP &&
      box.bottom > card.top - KEEP_CLEAR_GAP
    )
  })
}

export function CookieConsent() {
  const [state, setState] = useState<ConsentState>('accepted') // SSR-safe default
  const [visible, setVisible] = useState(false)
  const [blocked, setBlocked] = useState(false)
  // Laid out but hidden while it would cover something marked to keep clear; shown once that has scrolled away.
  const [waiting, setWaiting] = useState(true)
  const bannerRef = useRef<HTMLDivElement>(null)
  // Where the reader was when the notice appeared (or, failing that, where they tabbed in from): answering it
  // unmounts the focused button, and focus goes back there instead of to the page body.
  const returnFocus = useRef<HTMLElement | null>(null)

  // Read the stored choice now and again whenever it changes (this tab, or another), so "Reset cookie consent" brings the banner back without a reload.
  useEffect(() => {
    const sync = () => setState(getStoredConsent())
    sync()
    return subscribeConsent(sync)
  }, [])

  useEffect(() => {
    if (state !== 'pending') {
      setVisible(false)
      return
    }
    // Small delay so it doesn't flash on page load
    const timer = setTimeout(() => setVisible(true), 800)
    return () => clearTimeout(timer)
  }, [state])

  // The notice waits its turn: it never stacks on the first-run tour or an open dialog, which also sit in a corner of the page.
  useEffect(() => {
    const update = () => setBlocked(document.querySelector(OTHER_OVERLAY) !== null)
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true })
    return () => observer.disconnect()
  }, [])

  const open = state === 'pending' && visible && !blocked

  // The first time the card is laid out it may sit on the landing's hero collage or a form's submit: it waits,
  // hidden (nothing optional runs before a choice), until that is out from under it: scrolled away, the window
  // resized, or the page changed (a sign-in that does not scroll lands on the dashboard, a form swaps step; a
  // page that never scrolls fires no scroll event). Once shown it stays put.
  useEffect(() => {
    const banner = bannerRef.current
    if (!open || !banner) {
      setWaiting(true)
      return
    }
    const show = () => {
      const active = document.activeElement
      returnFocus.current = active instanceof HTMLElement && active !== document.body && !banner.contains(active) ? active : null
      setWaiting(false)
    }
    if (!coversKeepClear(banner)) {
      show()
      return
    }
    let frame = 0
    const check = () => {
      if (coversKeepClear(banner)) return
      stop()
      show()
    }
    // DOM changes come in bursts (a route renders): measure once per frame, not once per mutation.
    const checkSoon = () => {
      if (!frame) frame = window.requestAnimationFrame(() => {
        frame = 0
        check()
      })
    }
    const observer = new MutationObserver(checkSoon)
    const stop = () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    observer.observe(document.body, { childList: true, subtree: true })
    return stop
  }, [open])

  function onFocusEnter(event: FocusEvent<HTMLDivElement>) {
    const from = event.relatedTarget
    if (!returnFocus.current && from instanceof HTMLElement && from !== document.body && !event.currentTarget.contains(from)) {
      returnFocus.current = from
    }
  }

  function restoreFocus() {
    const target = returnFocus.current
    returnFocus.current = null
    if (target?.isConnected) {
      target.focus()
      return
    }
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }

  function accept() {
    setStoredConsent('accepted')
    setState('accepted')
    setVisible(false)
    restoreFocus()
  }

  function reject() {
    setStoredConsent('rejected')
    setState('rejected')
    setVisible(false)
    restoreFocus()
  }

  if (!open) return null

  return (
    <div
      ref={bannerRef}
      className="cookie-banner"
      role="dialog"
      aria-label="Cookie consent"
      // Hidden while it waits (shell.css: visibility hidden, so not seen and not in the tab order) and not announced.
      data-waiting={waiting ? 'true' : undefined}
      aria-hidden={waiting ? true : undefined}
      onFocus={onFocusEnter}
    >
      <div className="cookie-banner__inner">
        <p className="cookie-banner__text">
          {/* Two lengths of the same promise: phones get the short one so the sticker stays one slim row. */}
          <span className="cookie-banner__long">
            Essential cookies keep you signed in. Optional diagnostics help us fix bugs, and declining turns them off.
          </span>
          <span className="cookie-banner__short">Essential cookies only, unless you accept.</span>{' '}
          <Button asChild variant="link" size="sm">
            <Link to="/cookies">Learn more</Link>
          </Button>
        </p>
        <div className="cookie-banner__actions">
          <Button type="button" variant="secondary" size="sm" onClick={reject}>
            Decline
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={accept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
