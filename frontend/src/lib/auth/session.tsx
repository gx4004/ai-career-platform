import {
  Fragment,
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  API_URL,
  getHealth,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '#/lib/api/client'
import type { HealthCheck, OAuthProvider, User } from '#/lib/api/schemas'
import { CURRENT_USER_QUERY_KEY, fetchSessionUser } from '#/lib/auth/currentUser'
import {
  clearPendingIntent,
  readPendingIntent,
  writePendingIntent,
} from '#/lib/auth/pendingIntent'
import { clearSessionHint, hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'
import { navigateToPath, safeInternalPath } from '#/lib/navigation/redirect'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'
import type { ToolId } from '#/lib/tools/registry'

export type SessionState = {
  /**
   * `unreachable`: a browser that was signed in could not ask the server who it is (offline, 5xx). It is
   * neither a guest nor a known user; the shell's service banner says so, and pages should not offer sign-in.
   */
  status: 'loading' | 'guest' | 'authenticated' | 'unreachable'
  user: User | null
  providers: OAuthProvider[]
  /** A /health result when something fetched one; otherwise `{ status: 'ok' }` once the server answered the session check. */
  health: HealthCheck | null
  authDialogOpen: boolean
  authView: 'login' | 'register'
  authError: string
  openAuthDialog: (
    intent?: {
      to?: string
      reason?: string
      label?: string
      toolId?: ToolId
      /** Start on the Create account tab instead of Sign in. */
      view?: 'login' | 'register'
    },
    action?: () => void | Promise<void>,
  ) => void
  closeAuthDialog: () => void
  login: (payload: { email: string; password: string }) => Promise<void>
  register: (payload: {
    email: string
    password: string
    full_name?: string
    tos_accepted: boolean
  }) => Promise<void>
  logout: () => Promise<void>
  googleLogin: () => void
}

// /auth/providers returns deployment-level enabled providers, not the
// authenticated user's linked identities. We deliberately do not surface that
// list as account-connection state on the account page — doing so would claim
// a Google connection for every email/password user in a Google-enabled
// deployment. Until UserResponse exposes a per-user linked_providers field,
// SessionState.providers stays empty and the account page falls through to
// its "no additional providers" copy.
const NO_PROVIDERS: OAuthProvider[] = []

const DEPLOYMENT_QUERY_ROOTS = new Set([
  'current-user',
  'auth-providers',
  'health',
])

function purgeOwnerScopedQueryData(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => {
      const [root] = query.queryKey
      return typeof root !== 'string' || !DEPLOYMENT_QUERY_ROOTS.has(root)
    },
  })
  queryClient.getMutationCache().clear()
}

const SessionContext = createContext<SessionState | null>(null)

const SERVER_ANSWERED: HealthCheck = { status: 'ok' }

/**
 * A number that changes only when a known owner leaves (sign-out, expiry, a different account). Keyed on it,
 * the tree drops the previous owner's local state then, and is NOT remounted while the session first
 * resolves or when a guest signs in (which would lose what they typed and the sign-up welcome).
 */
function useOwnerEpoch(userId: string | null, settled: boolean): number {
  const [owner, setOwner] = useState<{ id: string | null; epoch: number }>({ id: null, epoch: 0 })
  if (settled && owner.id !== userId) {
    setOwner({ id: userId, epoch: owner.id ? owner.epoch + 1 : owner.epoch })
  }
  return owner.epoch
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [authView, setAuthView] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState('')
  const pendingActionRef = useRef<null | (() => void | Promise<void>)>(null)
  // Tracks whether the current browser session ever held an authenticated user.
  // Used to gate `cw:session-expired` handling so fresh anonymous visitors
  // don't get an unsolicited auth dialog on first-load 401 from /auth/me.
  const hadAuthRef = useRef(false)

  // One-shot cleanup: remove legacy localStorage token keys that pre-date the
  // cookie-only migration (Phase 1). Safe to retain across reloads — idempotent.
  useEffect(() => {
    try {
      window.localStorage.removeItem('auth_token')
      window.localStorage.removeItem('refresh_token')
    } catch {
      // sandboxed storage — ignore
    }
  }, [])

  const userQuery = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchSessionUser,
    retry: false,
  })

  // Neither the providers list (only the sign-in form needs it) nor /health (a database check) runs on every
  // page any more. The health result is read from the cache when something fetched it (the service banner).
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: false,
    enabled: false,
  })

  // Listen for session-expired events from API client. Only act on them if we
  // had an authenticated user at some point — a 401 on the first-load
  // /auth/me probe for an anon visitor must NOT open the auth dialog.
  useEffect(() => {
    const handleExpired = () => {
      if (!hadAuthRef.current) return
      hadAuthRef.current = false
      clearSessionHint()
      clearSensitiveBrowserData()
      purgeOwnerScopedQueryData(queryClient)
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null)

      if (typeof window !== 'undefined') {
        const path = safeInternalPath(window.location.pathname + window.location.search)
        if (path) {
          writePendingIntent({
            to: path,
            reason: 'session-expired',
            createdAt: Date.now(),
          })
        }
      }

      setAuthView('login')
      setAuthDialogOpen(true)
    }
    window.addEventListener('cw:session-expired', handleExpired)
    return () => window.removeEventListener('cw:session-expired', handleExpired)
  }, [queryClient])

  const closeAuthDialog = useCallback(() => {
    setAuthDialogOpen(false)
    setAuthError('')
  }, [])

  const consumePendingIntent = useCallback(async () => {
    const pendingIntent = readPendingIntent()
    clearPendingIntent()

    const action = pendingActionRef.current
    pendingActionRef.current = null

    if (action) {
      await action()
    }

    if (typeof window === 'undefined') return
    // On the sign-in page the page itself moves on (it may first welcome a new account).
    if (window.location.pathname === '/login') return
    const to = safeInternalPath(pendingIntent?.to)
    if (to && window.location.pathname + window.location.search !== to) navigateToPath(to)
  }, [])

  const openAuthDialog = useCallback<SessionState['openAuthDialog']>(
    (intent, action) => {
      if (intent) {
        writePendingIntent({
          to: intent.to,
          reason: intent.reason,
          label: intent.label,
          toolId: intent.toolId,
          createdAt: Date.now(),
        })
      }

      pendingActionRef.current = action || null

      // Navigate to /login instead of opening a popup dialog
      navigateToPath(intent?.view === 'register' ? '/login?view=register' : '/login')
    },
    [],
  )

  const completeAuthentication = useCallback(async () => {
    markSessionHint()
    // A successful credential exchange can establish a different owner in the
    // same tab. Purge before resolving that identity so no prior-owner query or
    // mutation payload can render during the transition.
    purgeOwnerScopedQueryData(queryClient)
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null)
    try {
      await queryClient.fetchQuery({ queryKey: CURRENT_USER_QUERY_KEY, queryFn: fetchSessionUser, staleTime: 0 })
    } catch {
      // The cookies are set: the person is signed in even if the server cannot say who they are right now.
      // The query keeps the error (status 'unreachable', the service banner re-checks); repeating the sign-in
      // would not help, and a repeated sign-up would fail as an existing account.
    }
    closeAuthDialog()
    await consumePendingIntent()
  }, [closeAuthDialog, consumePendingIntent, queryClient])

  const login = useCallback<SessionState['login']>(
    async (payload) => {
      setAuthError('')
      await loginRequest(payload)
      await completeAuthentication()
    },
    [completeAuthentication],
  )

  const register = useCallback<SessionState['register']>(
    async (payload) => {
      setAuthError('')
      await registerRequest(payload)
      await loginRequest({
        email: payload.email,
        password: payload.password,
      })
      await completeAuthentication()
    },
    [completeAuthentication],
  )

  // Flip `hadAuthRef` once an authenticated user resolves so future 401s
  // are treated as expiry, not as a first-load anon probe.
  useEffect(() => {
    if (userQuery.data) {
      hadAuthRef.current = true
    }
  }, [userQuery.data])

  const googleLogin = useCallback(() => {
    window.location.href = `${API_URL}/auth/google/login`
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // Local session cleanup still runs so the UI does not stay stuck.
    } finally {
      clearSessionHint()
      clearSensitiveBrowserData()
      clearPendingIntent()
      pendingActionRef.current = null
      setAuthDialogOpen(false)
      setAuthError('')
      hadAuthRef.current = false
      purgeOwnerScopedQueryData(queryClient)
      // Known without asking: the server was just told to end this session.
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null)
    }
  }, [queryClient])

  const status: SessionState['status'] = userQuery.isPending
    ? 'loading'
    : userQuery.data
      ? 'authenticated'
      : userQuery.isError && hasSessionHint()
        ? 'unreachable'
        : 'guest'
  const ownerEpoch = useOwnerEpoch(userQuery.data?.id ?? null, !userQuery.isPending)
  const serverAnswered = userQuery.isSuccess

  const value = useMemo<SessionState>(
    () => ({
      status,
      user: userQuery.data || null,
      providers: NO_PROVIDERS,
      health: healthQuery.data ?? (serverAnswered ? SERVER_ANSWERED : null),
      authDialogOpen,
      authView,
      authError,
      openAuthDialog,
      closeAuthDialog,
      login: async (payload) => {
        try {
          await login(payload)
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : 'Sign-in failed.')
          throw error
        }
      },
      register: async (payload) => {
        try {
          await register(payload)
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : 'Sign-up failed.')
          throw error
        }
      },
      logout,
      googleLogin,
    }),
    [
      authDialogOpen,
      authError,
      authView,
      closeAuthDialog,
      googleLogin,
      healthQuery.data,
      serverAnswered,
      login,
      logout,
      openAuthDialog,
      register,
      status,
      userQuery.data,
    ],
  )

  return (
    <SessionContext.Provider value={value}>
      <Fragment key={ownerEpoch}>
        {children}
      </Fragment>
    </SessionContext.Provider>
  )
}

export function useSessionContext() {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider')
  }

  return context
}
