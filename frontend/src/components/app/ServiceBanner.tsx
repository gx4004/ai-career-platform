import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudOff, WifiOff } from 'lucide-react'
import { Button } from '#/components/kit'
import { ApiError } from '#/lib/api/errors'
import { getHealth } from '#/lib/api/client'
import { CURRENT_USER_QUERY_KEY, fetchSessionUser } from '#/lib/auth/currentUser'

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

type Outage = 'unreachable' | 'server-error'

/** A refused connection (status 0) or a 5xx is an outage; a 401 or another 4xx is an answer from a server that is up. */
function outageOf(error: unknown): Outage | null {
  if (error == null) return null
  if (!(error instanceof ApiError) || error.status === 0) return 'unreachable'
  return error.status >= 500 ? 'server-error' : null
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
  const user = useQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchSessionUser, retry: false, enabled: false })
  const outages = [outageOf(health.error), outageOf(user.error)]
  // A server that cannot be reached at all says more than one that answered with an error.
  const outage: Outage | null = offline
    ? null
    : outages.includes('unreachable')
      ? 'unreachable'
      : outages.includes('server-error')
        ? 'server-error'
        : null
  const unreachable = outage !== null

  const retry = () =>
    Promise.allSettled([
      queryClient.fetchQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 0 }),
      queryClient.fetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchSessionUser, staleTime: 0 }),
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
  return { offline, outage, retrying: fetching, retry }
}

const COPY = {
  offline: { title: 'You’re offline.', text: 'Pages stay as they are, but running tools and saving need a connection.' },
  unreachable: { title: 'Can’t reach the server.', text: 'Your sign-in is untouched. We’ll keep trying on our own.' },
  'server-error': { title: 'The server ran into a problem.', text: 'Your sign-in is untouched. We’ll try again on our own.' },
} as const

/**
 * A slim lemon band at the top of the shell when the browser is offline, the server cannot be reached, or it
 * answers with errors. None of these is a sign-out: the page keeps what it has, and says so.
 */
export function ServiceBanner() {
  const { offline, outage, retrying, retry } = useServiceStatus()
  const kind = offline ? 'offline' : outage
  if (!kind) return null

  const Icon = offline ? WifiOff : CloudOff
  const copy = COPY[kind]
  return (
    <div className="app-service-banner" role="status" data-kind={kind}>
      <Icon aria-hidden className="app-service-banner__icon" />
      <p className="app-service-banner__text">
        <strong>{copy.title}</strong> {copy.text}
      </p>
      <Button type="button" variant="secondary" size="sm" loading={retrying} onClick={() => void retry()}>
        Retry
      </Button>
    </div>
  )
}
