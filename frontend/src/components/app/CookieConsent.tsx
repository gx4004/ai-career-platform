import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/kit'
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
          Essential cookies keep you signed in. Optional diagnostics help us fix bugs, and declining turns them off.{' '}
          <Button asChild variant="link" size="sm">
            <Link to="/cookies">Learn more</Link>
          </Button>
        </p>
        <div className="cookie-banner__actions">
          <Button type="button" variant="secondary" onClick={reject}>
            Decline
          </Button>
          <Button type="button" variant="secondary" onClick={accept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
