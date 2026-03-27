import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useSession } from '#/hooks/useSession'

export function LoginForm({
  onSuccess,
}: {
  onSuccess?: () => void
}) {
  const { login, authError } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)

  if (showReset) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1">
          <p className="auth-surface-title" style={{ fontSize: 'clamp(1.2rem, 2.5vw, 1.5rem)' }}>
            Reset your password
          </p>
          <p className="small-copy" style={{ color: 'var(--text-soft)', lineHeight: 1.6 }}>
            Password reset is not yet available. Please contact support to recover your account.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="auth-submit w-full"
          onClick={() => setShowReset(false)}
        >
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={async (event) => {
        event.preventDefault()
        setLoading(true)
        try {
          await login({ email, password })
          onSuccess?.()
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
  )
}
