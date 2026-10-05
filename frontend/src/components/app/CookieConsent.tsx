import { useState, useEffect } from 'react'
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

export function CookieConsent() {
  const [state, setState] = useState<ConsentState>('accepted') // SSR-safe default
  const [visible, setVisible] = useState(false)
  const [blocked, setBlocked] = useState(false)

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

  function accept() {
    setStoredConsent('accepted')
    setState('accepted')
    setVisible(false)
  }

  function reject() {
    setStoredConsent('rejected')
    setState('rejected')
    setVisible(false)
  }

  if (state !== 'pending' || !visible || blocked) return null

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
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
