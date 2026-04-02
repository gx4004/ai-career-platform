import { useState, useEffect } from 'react'

const CONSENT_KEY = 'cw-cookie-consent'

type ConsentState = 'pending' | 'accepted' | 'rejected'

function getStoredConsent(): ConsentState {
  if (typeof window === 'undefined') return 'pending'
  const stored = localStorage.getItem(CONSENT_KEY)
  if (stored === 'accepted' || stored === 'rejected') return stored
  return 'pending'
}

/** Read consent state without rendering the banner (for use in telemetry/ads). */
export function hasAnalyticsConsent(): boolean {
  return getStoredConsent() === 'accepted'
}

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
    localStorage.setItem(CONSENT_KEY, 'accepted')
    setState('accepted')
    setVisible(false)
  }

  function reject() {
    localStorage.setItem(CONSENT_KEY, 'rejected')
    setState('rejected')
    setVisible(false)
  }

  if (state !== 'pending' || !visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
      <div className="cookie-banner__inner">
        <p className="cookie-banner__text">
          We use cookies for analytics and to improve your experience.
          By continuing, you agree to our use of cookies.
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
