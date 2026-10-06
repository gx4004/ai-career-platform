import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, Notice } from '#/components/kit'
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

  // Only a known guest is told their runs are not saved: not while the session resolves (a signed-in
  // person would see it flash), and not when a signed-in browser cannot reach the server.
  if (status !== 'guest' || dismissed) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // ignore write failures
    }
    setDismissed(true)
  }

  return (
    <Notice
      onDismiss={dismiss}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link to="/login">Sign in to keep your results</Link>
        </Button>
      }
    >
      Guest runs are not saved.
    </Notice>
  )
}
