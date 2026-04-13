import { useState } from 'react'
import { usePostHog } from 'posthog-js/react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useSession } from '#/hooks/useSession'

export function RegisterForm({
  onSuccess,
}: {
  onSuccess?: () => void
}) {
  const posthog = usePostHog()
  const { register, googleLogin, authError } = useSession()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <div className="grid gap-5">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="auth-submit w-full"
        onClick={() => {
          posthog.capture('google_auth_initiated', { action: 'signup' })
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
        Sign up with Google
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
            await register({
              email,
              password,
              full_name: fullName || undefined,
            })
            posthog.capture('user_signed_up', { method: 'email' })
            onSuccess?.()
          } catch {
            // Error displayed via session authError state
          } finally {
            setLoading(false)
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="register-name">Full name</Label>
          <Input
            id="register-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Optional"
            className="auth-input"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="auth-input"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            className="auth-input"
            required
          />
        </div>
        {authError ? <p className="small-copy" style={{ color: 'var(--destructive)' }}>{authError}</p> : null}
        <Button type="submit" size="lg" className="auth-submit w-full" disabled={loading}>
          {loading ? 'Creating your account...' : 'Create free account'}
        </Button>
      </form>
    </div>
  )
}
