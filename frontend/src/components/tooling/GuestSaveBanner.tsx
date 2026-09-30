import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useSession } from '#/hooks/useSession'

const DISMISSED_KEY = 'cw:guest-banner-dismissed'

export function GuestSaveBanner() {
  const { status } = useSession()
  // Initialise to false so the SSR render and the first client render agree
  // (sessionStorage is undefined on the server). Hydrate the persisted choice
  // in an effect after mount.
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === '1') setDismissed(true)
    } catch {
      // sessionStorage unavailable (private mode, sandboxed) — banner stays visible.
    }
  }, [])

  if (status === 'authenticated' || dismissed) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // ignore write failures
    }
    setDismissed(true)
  }

  return (
    <div className="tool-notice guest-save-banner">
      <span className="tool-notice-text">
        Guest runs are not saved.{' '}
        <Link to="/login" className="tool-notice-link">
          Sign in
        </Link>{' '}
        to keep your results.
      </span>
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
