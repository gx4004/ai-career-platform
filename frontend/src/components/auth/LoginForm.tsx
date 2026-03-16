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
        <Label htmlFor="login-password">Password</Label>
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
        {loading ? 'Signing you in…' : 'Sign in'}
      </Button>
    </form>
  )
}
