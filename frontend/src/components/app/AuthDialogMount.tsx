import { Suspense, lazy, useState } from 'react'
import { ChunkBoundary } from '#/components/app/ChunkBoundary'
import { useSession } from '#/hooks/useSession'

const AuthDialog = lazy(() => import('#/components/auth/AuthDialog').then((module) => ({ default: module.AuthDialog })))

/** The dialog's chunk could not load: a full load of the sign-in page fetches current files and returns here. */
function signInByFullLoad() {
  const here = window.location.pathname + window.location.search
  window.location.assign(`/login?returnTo=${encodeURIComponent(here)}`)
}

/**
 * The session-expired sign-in dialog, mounted on first open only: its forms are a separate chunk that no
 * page needs until a session actually expires (sign-in itself is the /login page). Once mounted it stays,
 * so closing keeps the dialog's exit and a second expiry opens it instantly.
 */
export function AuthDialogMount() {
  const { authDialogOpen } = useSession()
  const [mounted, setMounted] = useState(false)
  if (authDialogOpen && !mounted) setMounted(true)
  if (!mounted) return null
  return (
    <ChunkBoundary onError={signInByFullLoad}>
      <Suspense fallback={null}>
        <AuthDialog />
      </Suspense>
    </ChunkBoundary>
  )
}
