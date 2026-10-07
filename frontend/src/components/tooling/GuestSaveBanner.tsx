import { useEffect, useState } from 'react'
import { Button, Notice } from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import type { ToolId } from '#/lib/tools/registry'

const DISMISSED_KEY = 'cw:guest-banner-dismissed'

export function GuestSaveBanner({ toolId }: { toolId: ToolId }) {
  const { status, openAuthDialog } = useSession()
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
        <Button
          variant="secondary"
          size="sm"
          // Writes the pending intent so sign-in returns to this tool (the draft is still in the tab)
          // and the login page says where they will go.
          onClick={() =>
            openAuthDialog({
              to: window.location.pathname + window.location.search,
              reason: 'save-demo-result',
              toolId,
            })
          }
        >
          Sign in to keep your results
        </Button>
      }
    >
      Guest runs are not saved.
    </Notice>
  )
}
