import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import {
  type ConsentState,
  getStoredConsent,
  setStoredConsent,
  hasAnalyticsConsent as hasAnalyticsConsentFromLib,
} from '#/lib/consent'

/** Re-export for backwards compatibility with existing imports. */
export const hasAnalyticsConsent = hasAnalyticsConsentFromLib

export function CookieConsent() {
  const [state, setState] = useState<ConsentState>('accepted') // SSR-safe default
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = getStoredConsent()
    setState(stored)
    if (stored === 'pending') {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
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

  if (state !== 'pending' || !visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
      <div className="cookie-banner__inner">
        <p className="cookie-banner__text">
          We use strictly-necessary cookies to keep you signed in. Optional advertising cookies (Google AdSense) only
          load if you accept. No third-party analytics are active today.{' '}
          <Link to="/cookies" className="cookie-banner__link">
            Learn more
          </Link>
          .
        </p>
        <div className="cookie-banner__actions">
          <button type="button" className="cookie-banner__btn cookie-banner__btn--reject" onClick={reject}>
            Decline
          </button>
          <button type="button" className="cookie-banner__btn cookie-banner__btn--accept" onClick={accept}>
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
