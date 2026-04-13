import { useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { Link } from '@tanstack/react-router'
import { Sparkles, X } from 'lucide-react'
import { useSession } from '#/hooks/useSession'

const DISMISSED_KEY = 'cw:guest-banner-dismissed'

export function GuestSaveBanner() {
  const posthog = usePostHog()
  const { status } = useSession()
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) === '1',
  )

  if (status === 'authenticated' || dismissed) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="guest-save-banner">
      <div className="guest-save-banner-content">
        <Sparkles size={14} className="guest-save-banner-icon" />
        <span className="guest-save-banner-text">Sign in to keep your results</span>
        <Link
          to="/login"
          className="guest-save-banner-link"
          onClick={() => posthog.capture('guest_sign_in_prompted', { source: 'save_banner' })}
        >Sign in</Link>
      </div>
      <button
        type="button"
        className="guest-save-banner-close"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
