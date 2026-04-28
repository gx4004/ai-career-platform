import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { captureAppError } from '#/lib/telemetry/client'

function isChunkLoadError(error: Error) {
  // Match the error names and message substrings Vite + the bundler runtime
  // actually emit when a deferred route bundle is missing (typically because
  // the user opened a stale tab after a deploy). Plain TypeErrors must NOT
  // match — they are real bugs and we do not want to lure the user into a
  // reload loop that hides them behind an "update required" prompt.
  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  return (
    name.includes('chunkloaderror') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('loading chunk') ||
    message.includes('chunkloaderror')
  )
}

export function AppRouteError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const chunkLoadFailure = isChunkLoadError(error)

  useEffect(() => {
    const route = typeof window !== 'undefined' ? window.location.pathname : undefined
    const failureKind = chunkLoadFailure ? 'chunk-load' : 'generic-route'
    captureAppError(error, { source: 'route-error', failure_kind: failureKind, route })
  }, [chunkLoadFailure, error])

  if (chunkLoadFailure) {
    return (
      <div className="error-gradient-bg">
        <AppStatePanel
          badge="Update required"
          icon={<RefreshCw size={48} style={{ color: 'var(--accent)' }} />}
          title="The app was updated in the background"
          description="This page is using an older route bundle. Reload to fetch the latest version and retry your result."
          detail={error.message}
          actions={[
            { label: 'Reload app', onClick: () => window.location.reload() },
            { label: 'Go to dashboard', to: '/dashboard', variant: 'outline' },
          ]}
        />
      </div>
    )
  }

  return (
    <div className="error-gradient-bg">
      <AppStatePanel
        badge="Route error"
        scene="emptyPlanning"
        icon={<AlertTriangle size={48} style={{ color: 'var(--warning)' }} />}
        title="This route failed to load"
        description="A rendering or data-loading error interrupted the page."
        detail={error.message}
        actions={[
          { label: 'Try again', onClick: reset },
          { label: 'Go to dashboard', to: '/dashboard', variant: 'outline' },
        ]}
      />
    </div>
  )
}
