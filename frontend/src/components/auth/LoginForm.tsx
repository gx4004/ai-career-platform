import { useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useSession } from '#/hooks/useSession'
import { requestPasswordReset } from '#/lib/api/client'

export function LoginForm({
  onSuccess,
}: {
  onSuccess?: () => void
}) {
  const posthog = usePostHog()
  const { login, googleLogin, authError } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  if (showReset) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1">
          <p className="auth-surface-title" style={{ fontSize: 'clamp(1.2rem, 2.5vw, 1.5rem)' }}>
            Reset your password
          </p>
          <p className="small-copy" style={{ color: 'var(--text-soft)', lineHeight: 1.6 }}>
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>
        {resetMessage ? (
          <p className="small-copy" style={{ color: 'var(--success, #22c55e)' }}>{resetMessage}</p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault()
              setResetLoading(true)
              setResetError('')
              try {
                const result = await requestPasswordReset({ email: resetEmail })
                posthog.capture('password_reset_requested')
                setResetMessage(result.message || 'Check your email for a reset link.')
              } catch (error) {
                setResetError(error instanceof Error ? error.message : 'Something went wrong.')
              } finally {
                setResetLoading(false)
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                placeholder="you@example.com"
                className="auth-input"
                required
              />
            </div>
            {resetError ? <p className="small-copy" style={{ color: 'var(--destructive)' }}>{resetError}</p> : null}
            <Button type="submit" size="lg" className="auth-submit w-full" disabled={resetLoading}>
              {resetLoading ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        )}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="auth-submit w-full"
          onClick={() => {
            setShowReset(false)
            setResetMessage('')
            setResetError('')
          }}
        >
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="auth-submit w-full"
        onClick={() => {
          posthog.capture('google_auth_initiated', { action: 'login' })
          googleLogin()
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" className="mr-2" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Sign in with Google
      </Button>

      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="small-copy muted-copy">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form
        className="grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          setLoading(true)
          try {
            await login({ email, password })
            posthog.capture('user_logged_in', { method: 'email' })
            onSuccess?.()
          } catch {
            // Error displayed via session authError state
          } finally {
            setLoading(false)
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="auth-input"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => setShowReset(true)}
            >
              Forgot password?
            </button>
          </div>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="auth-input"
            required
          />
        </div>
        {authError ? <p className="small-copy" style={{ color: 'var(--destructive)' }}>{authError}</p> : null}
        <Button type="submit" size="lg" className="auth-submit w-full" disabled={loading}>
          {loading ? 'Signing you in...' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
