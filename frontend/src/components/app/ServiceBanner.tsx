import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudOff, WifiOff } from 'lucide-react'
import { Button } from '#/components/kit'
import { ApiError } from '#/lib/api/errors'
import { getCurrentUser, getHealth } from '#/lib/api/client'

const POLL_MS = 15_000

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** True while the browser says it has no network. The server snapshot is "online" so hydration never differs. */
function useOffline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  )
}

/** A refused connection or a 5xx is an outage; a 401 or a 4xx is an answer from a server that is up. */
function isOutage(error: unknown) {
  if (error == null) return false
  return !(error instanceof ApiError) || error.status >= 500
}

/**
 * Whether the server can be reached. It watches the two queries the session already runs (`health` and
 * `current-user`, `enabled: false` so this adds no request of its own), and while it is unreachable it
 * re-checks every 15 seconds so the banner clears by itself when the server is back.
 */
function useServiceStatus() {
  const queryClient = useQueryClient()
  const offline = useOffline()
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false, enabled: false })
  const user = useQuery({ queryKey: ['current-user'], queryFn: getCurrentUser, retry: false, enabled: false })
  const unreachable = !offline && (isOutage(health.error) || isOutage(user.error))

  const retry = () =>
    Promise.allSettled([
      queryClient.fetchQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 0 }),
      queryClient.fetchQuery({ queryKey: ['current-user'], queryFn: getCurrentUser, staleTime: 0 }),
    ])

  useEffect(() => {
    if (!unreachable) return
    const timer = window.setInterval(() => void retry(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [unreachable])

  const wasOffline = useRef(false)
  useEffect(() => {
    // Back online: ask again at once instead of waiting for the next poll.
    if (wasOffline.current && !offline) void retry()
    wasOffline.current = offline
  }, [offline])

  const fetching = health.isFetching || user.isFetching
  return { offline, unreachable, retrying: fetching, retry }
}

/**
 * A slim lemon band at the top of the shell when the browser is offline or the server cannot be reached.
 * A dropped connection is not a sign-out: the page keeps what it has, and says so.
 */
export function ServiceBanner() {
  const { offline, unreachable, retrying, retry } = useServiceStatus()
  if (!offline && !unreachable) return null

  const Icon = offline ? WifiOff : CloudOff
  return (
    <div className="app-service-banner" role="status" data-kind={offline ? 'offline' : 'unreachable'}>
      <Icon aria-hidden className="app-service-banner__icon" />
      <p className="app-service-banner__text">
        <strong>{offline ? 'You’re offline.' : 'Can’t reach the server.'}</strong>{' '}
        {offline
          ? 'Pages stay as they are, but running tools and saving need a connection.'
          : 'Your sign-in is untouched. We’ll keep trying on our own.'}
      </p>
      <Button type="button" variant="secondary" size="sm" loading={retrying} onClick={() => void retry()}>
        Retry
      </Button>
    </div>
  )
}
