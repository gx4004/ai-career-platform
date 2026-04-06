import '#/styles/auth.css'
import { Link, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Lock } from 'lucide-react'
import { confirmPasswordReset } from '#/lib/api/client'
import { FadeUp } from '#/components/ui/motion'

export function ResetPasswordPage() {
  const { token } = useSearch({ from: '/reset-password' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  if (!token) {
    return (
      <div className="auth-page">
        <FadeUp className="auth-page-shell">
          <div className="auth-surface" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <Lock size={32} style={{ color: 'var(--text-soft)', marginBottom: '1rem' }} />
            <h1 className="auth-surface-title">Invalid reset link</h1>
            <p className="muted-copy" style={{ marginTop: '0.5rem' }}>
              This password reset link is missing or expired. Please request a new one.
            </p>
            <Link to="/login" className="auth-submit" style={{ display: 'inline-flex', marginTop: '1.5rem' }}>
              Back to sign in
            </Link>
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
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--success-soft)', display: 'inline-grid', placeItems: 'center', marginBottom: '1rem' }}>
              <Lock size={24} style={{ color: 'var(--success)' }} />
            </div>
            <h1 className="auth-surface-title">Password updated</h1>
            <p className="muted-copy" style={{ marginTop: '0.5rem' }}>
              Your password has been reset. You can now sign in with your new password.
            </p>
            <Link to="/login" className="auth-submit" style={{ display: 'inline-flex', marginTop: '1.5rem' }}>
              Sign in
            </Link>
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
          : 'This reset link may have expired. Please request a new one.',
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
            <p className="auth-surface-copy">Enter your new password below.</p>
          </div>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                className="auth-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="auth-field">
              <label className="auth-field-label" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                className="auth-input"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button
              type="submit"
              className="auth-submit"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        </div>
      </FadeUp>
    </div>
  )
}
