import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useSession } from '#/hooks/useSession'

export function RegisterForm({
  onSuccess,
}: {
  onSuccess?: () => void
}) {
  const { register, authError } = useSession()
  const [fullName, setFullName] = useState('')
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
          await register({
            email,
            password,
            full_name: fullName || undefined,
          })
          onSuccess?.()
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
        {loading ? 'Creating your account…' : 'Create free account'}
      </Button>
    </form>
  )
}
