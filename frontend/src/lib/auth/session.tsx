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
import { getAuthProviders, getCurrentUser, getHealth, login as loginRequest, register as registerRequest } from '#/lib/api/client'
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
  logout: () => void
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
    queryKey: ['current-user', token],
    queryFn: getCurrentUser,
    enabled: Boolean(token),
    retry: false,
  })

  const providersQuery = useQuery({
    queryKey: ['auth-providers'],
    queryFn: getAuthProviders,
    retry: false,
  })

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: false,
  })

  useEffect(() => {
    if (token && userQuery.isError) {
      const err = userQuery.error
      if (err instanceof ApiError && err.status === 401) {
        clearAuthToken()
        setToken(null)
      }
    }
  }, [token, userQuery.isError, userQuery.error])

  // Listen for session-expired events from API client — open auth dialog in-place
  useEffect(() => {
    const handleExpired = () => {
      setToken(null)
      setAuthView('login')
      setAuthDialogOpen(true)
    }
    window.addEventListener('cw:session-expired', handleExpired)
    return () => window.removeEventListener('cw:session-expired', handleExpired)
  }, [])

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
      setAuthView('login')
      setAuthError('')
      setAuthDialogOpen(true)
    },
    [],
  )

  const completeAuthentication = useCallback(
    async (accessToken: string) => {
      setAuthToken(accessToken)
      setToken(accessToken)
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

  const logout = useCallback(() => {
    clearAuthToken()
    clearPendingIntent()
    pendingActionRef.current = null
    setToken(null)
    setAuthDialogOpen(false)
    setAuthError('')
    void queryClient.invalidateQueries({ queryKey: ['current-user'] })
  }, [queryClient])

  const status: SessionState['status'] = token
    ? userQuery.isPending
      ? 'loading'
      : userQuery.data
        ? 'authenticated'
        : 'guest'
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
    }),
    [
      authDialogOpen,
      authError,
      authView,
      closeAuthDialog,
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
