import { useState } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useSession } from '#/hooks/useSession'

function GoogleG() {
  return (
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
  )
}

export function RegisterForm({
  onSuccess,
}: {
  onSuccess?: () => void
}) {
  const { register, googleLogin, authError } = useSession()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <div className="grid gap-5">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="auth-submit auth-google w-full"
        onClick={() => {
          googleLogin()
        }}
      >
        <GoogleG />
        Sign up with Google
      </Button>

      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="small-copy muted-copy">or continue with email</span>
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
            autoComplete="name"
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
            autoComplete="email"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="register-password">Password</Label>
          <div className="relative">
            <Input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="auth-input pr-11"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 grid min-h-11 w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 rounded-r-lg"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <div className="min-h-[2.5rem]">
          {authError ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="text-sm leading-relaxed">{authError}</p>
            </div>
          ) : null}
        </div>
        <Button
          type="submit"
          size="lg"
          className="auth-submit w-full"
          loading={loading}
        >
          Create free account
        </Button>
      </form>
    </div>
  )
}
