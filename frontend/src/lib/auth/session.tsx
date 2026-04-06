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
import { ApiError } from '#/lib/api/errors'
import type { HealthCheck, OAuthProvider, User } from '#/lib/api/schemas'
import {
  clearPendingIntent,
  readPendingIntent,
  writePendingIntent,
} from '#/lib/auth/pendingIntent'
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '#/lib/auth/storage'
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

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => getAuthToken())
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [authView, setAuthView] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState('')
  const pendingActionRef = useRef<null | (() => void | Promise<void>)>(null)

  const userQuery = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    retry: false,
  })

  const providersQuery = useQuery({
    queryKey: ['auth-providers'],
    queryFn: getAuthProviders,
    retry: false,
    staleTime: 60 * 60_000,  // providers never change — cache 1 hour
  })

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: false,
    staleTime: 10 * 60_000,  // backend health — cache 10 min
  })

  useEffect(() => {
    if (token && userQuery.isError) {
      const err = userQuery.error
      // 401 = expired token, 403 = deactivated account — both clear session
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearAuthToken()
        setToken(null)
      }
    }
  }, [token, userQuery.isError, userQuery.error])

  // Listen for session-expired events from API client — open auth dialog in-place
  useEffect(() => {
    const handleExpired = () => {
      // Clear user-specific query caches so stale data isn't visible after re-auth
      queryClient.removeQueries({ queryKey: ['history-page'] })
      queryClient.removeQueries({ queryKey: ['history-workspaces'] })
      // Only remove server-fetched (authenticated) tool-run entries.
      // Preserve guest_demo entries and freshly-set mutation results so
      // the user doesn't land on a blank result page during session expiry.
      queryClient.removeQueries({
        queryKey: ['tool-run'],
        predicate: (query) => {
          const data = query.state.data as Record<string, unknown> | undefined
          return !data || data.access_mode === 'authenticated'
        },
      })
      queryClient.setQueryData(['current-user'], null)
      setToken(null)
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
    [],
  )

  const completeAuthentication = useCallback(
    async (accessToken?: string) => {
      if (accessToken) {
        setAuthToken(accessToken)
        setToken(accessToken)
      }
      await queryClient.invalidateQueries({ queryKey: ['current-user'] })
      closeAuthDialog()
      await consumePendingIntent()
    },
    [closeAuthDialog, consumePendingIntent, queryClient],
  )

  const login = useCallback<SessionState['login']>(
    async (payload) => {
      setAuthError('')
      const result = await loginRequest(payload)
      await completeAuthentication(result.access_token)
    },
    [completeAuthentication],
  )

  const register = useCallback<SessionState['register']>(
    async (payload) => {
      setAuthError('')
      await registerRequest(payload)
      const tokenResult = await loginRequest({
        email: payload.email,
        password: payload.password,
      })
      await completeAuthentication(tokenResult.access_token)
    },
    [completeAuthentication],
  )

  const googleLogin = useCallback(() => {
    window.location.href = `${API_URL}/auth/google/login`
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // Local session cleanup still runs so the UI does not stay stuck.
    } finally {
      clearAuthToken()
      clearPendingIntent()
      pendingActionRef.current = null
      setToken(null)
      setAuthDialogOpen(false)
      setAuthError('')
      queryClient.removeQueries({ queryKey: ['history-page'] })
      queryClient.removeQueries({ queryKey: ['history-workspaces'] })
      queryClient.removeQueries({ queryKey: ['tool-run'] })
      queryClient.setQueryData(['current-user'], null)
      await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    }
  }, [queryClient])

  const status: SessionState['status'] = userQuery.isPending
    ? 'loading'
    : userQuery.data
      ? 'authenticated'
      : 'guest'

  const value = useMemo<SessionState>(
    () => ({
      status,
      user: userQuery.data || null,
      providers: providersQuery.data?.providers || [],
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
      providersQuery.data?.providers,
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
