import { Link, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { confirmPasswordReset } from '#/lib/api/client'
import { FadeUp } from '#/components/ui/motion'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export function ResetPasswordPage() {
  const { token } = useSearch({ from: '/reset-password' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  if (!token) {
    return (
      <div className="auth-page">
        <FadeUp className="auth-page-shell">
          <div className="auth-surface" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
                display: 'inline-grid',
                placeItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <Lock size={22} style={{ color: 'var(--destructive)' }} />
            </div>
            <h1 className="auth-surface-title">Invalid reset link</h1>
            <p className="muted-copy" style={{ marginTop: '0.5rem', maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
              This password reset link is missing or expired. Request a new one and we'll email you a fresh link.
            </p>
            <Button asChild size="lg" className="auth-submit" style={{ marginTop: '1.5rem' }}>
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        </FadeUp>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="auth-page">
        <FadeUp className="auth-page-shell">
          <div className="auth-surface" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'color-mix(in srgb, #22c55e 14%, transparent)',
                display: 'inline-grid',
                placeItems: 'center',
                marginBottom: '1rem',
                boxShadow: '0 8px 24px color-mix(in srgb, #22c55e 18%, transparent)',
              }}
            >
              <CheckCircle2 size={24} style={{ color: '#16a34a' }} />
            </div>
            <h1 className="auth-surface-title">Password updated</h1>
            <p className="muted-copy" style={{ marginTop: '0.5rem', maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
              Your password has been reset. Sign in with your new password to continue.
            </p>
            <Button asChild size="lg" className="auth-submit" style={{ marginTop: '1.5rem' }}>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </FadeUp>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setStatus('loading')
    try {
      await confirmPasswordReset({ token: token!, new_password: password })
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof Error
          ? err.message
          : 'This reset link may have expired. Request a new one.',
      )
    }
  }

  return (
    <div className="auth-page">
      <FadeUp className="auth-page-shell">
        <div className="auth-page-actions">
          <Link to="/login" className="small-copy muted-copy auth-back-link">
            ← Back to sign in
          </Link>
        </div>
        <div className="auth-surface">
          <div className="auth-surface-header">
            <h1 className="auth-surface-title">Set a new password</h1>
            <p className="auth-surface-copy">Choose a strong password you haven't used before.</p>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input pr-10"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 rounded-r-lg"
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
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="min-h-[2.5rem]">
              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p className="text-sm leading-relaxed">{error}</p>
                </div>
              ) : null}
            </div>
            <Button
              type="submit"
              size="lg"
              className="auth-submit w-full"
              loading={status === 'loading'}
            >
              Reset password
            </Button>
          </form>
        </div>
      </FadeUp>
    </div>
  )
}
