import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  API_URL,
  getAuthProviders,
  getCurrentUser,
  getHealth,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '#/lib/api/client'
import type { HealthCheck, OAuthProvider, User } from '#/lib/api/schemas'
import {
  clearPendingIntent,
  readPendingIntent,
  writePendingIntent,
} from '#/lib/auth/pendingIntent'
import { navigateToPath } from '#/lib/navigation/redirect'

export type SessionState = {
  status: 'loading' | 'guest' | 'authenticated'
  user: User | null
  providers: OAuthProvider[]
  health: HealthCheck | null
  authDialogOpen: boolean
  authView: 'login' | 'register'
  authError: string
  openAuthDialog: (
    intent?: { to?: string; reason?: string; label?: string },
    action?: () => void | Promise<void>,
  ) => void
  closeAuthDialog: () => void
  login: (payload: { email: string; password: string }) => Promise<void>
  register: (payload: {
    email: string
    password: string
    full_name?: string
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

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const posthog = usePostHog()
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
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    retry: false,
  })

  // /auth/providers is fetched primarily so a missing or misconfigured
  // endpoint surfaces in tests/telemetry; the response itself is intentionally
  // not surfaced as account-connection state. See NO_PROVIDERS above.
  useQuery({
    queryKey: ['auth-providers'],
    queryFn: getAuthProviders,
    retry: false,
  })

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: false,
  })

  // Listen for session-expired events from API client. Only act on them if we
  // had an authenticated user at some point — a 401 on the first-load
  // /auth/me probe for an anon visitor must NOT open the auth dialog.
  useEffect(() => {
    const handleExpired = () => {
      if (!hadAuthRef.current) return
      hadAuthRef.current = false
      posthog.reset()
      queryClient.removeQueries({ queryKey: ['history-page'] })
      queryClient.removeQueries({ queryKey: ['history-workspaces'] })
      queryClient.removeQueries({ queryKey: ['tool-run'] })
      queryClient.setQueryData(['current-user'], null)
      setAuthView('login')
      setAuthDialogOpen(true)
    }
    window.addEventListener('cw:session-expired', handleExpired)
    return () => window.removeEventListener('cw:session-expired', handleExpired)
  }, [queryClient, posthog])

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

    if (pendingIntent?.to && typeof window !== 'undefined') {
      const to = pendingIntent.to
      // Only allow relative paths to prevent open redirect
      if (to.startsWith('/') && !to.startsWith('//')) {
        if (window.location.pathname !== to) {
          navigateToPath(to)
        }
      }
    }
  }, [])

  const openAuthDialog = useCallback<SessionState['openAuthDialog']>(
    (intent, action) => {
      posthog.capture('login_redirect_triggered', { reason: intent?.reason || undefined })

      if (intent) {
        writePendingIntent({
          ...intent,
          createdAt: Date.now(),
        })
      }

      pendingActionRef.current = action || null

      // Navigate to /login instead of opening a popup dialog
      navigateToPath('/login')
    },
    [posthog],
  )

  const completeAuthentication = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
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

  // Identify user in PostHog when authentication state resolves.
  // Also flips `hadAuthRef` so future 401s are treated as expiry, not anon-probe.
  useEffect(() => {
    const user = userQuery.data
    if (user) {
      hadAuthRef.current = true
      posthog.identify(String(user.id), {
        email: user.email,
        name: user.full_name || undefined,
      })
    }
  }, [userQuery.data, posthog])

  const googleLogin = useCallback(() => {
    window.location.href = `${API_URL}/auth/google/login`
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // Local session cleanup still runs so the UI does not stay stuck.
    } finally {
      posthog.capture('user_logged_out')
      posthog.reset()
      clearPendingIntent()
      pendingActionRef.current = null
      setAuthDialogOpen(false)
      setAuthError('')
      hadAuthRef.current = false
      queryClient.removeQueries({ queryKey: ['history-page'] })
      queryClient.removeQueries({ queryKey: ['history-workspaces'] })
      queryClient.removeQueries({ queryKey: ['tool-run'] })
      queryClient.setQueryData(['current-user'], null)
      await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    }
  }, [queryClient, posthog])

  const status: SessionState['status'] = userQuery.isPending
    ? 'loading'
    : userQuery.data
      ? 'authenticated'
      : 'guest'

  const value = useMemo<SessionState>(
    () => ({
      status,
      user: userQuery.data || null,
      providers: NO_PROVIDERS,
      health: healthQuery.data || null,
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
      login,
      logout,
      openAuthDialog,
      register,
      status,
      userQuery.data,
    ],
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSessionContext() {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider')
  }

  return context
}
