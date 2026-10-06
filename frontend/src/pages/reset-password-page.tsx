import { Link, useSearch } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AuthShell } from '#/components/auth/AuthShell'
import { AuthStamp } from '#/components/auth/AuthStamp'
import { FormFailureNotice, useFormFailure } from '#/components/auth/FormFailureNotice'
import { PasswordInput } from '#/components/auth/PasswordInput'
import { focusFirstError, newPasswordError } from '#/components/auth/auth-validation'
import { Button, EmptyState, ErrorState, Field, Input, PageHeader, Panel, PanelBody } from '#/components/kit'
import { confirmPasswordReset } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'

/** Removes the reset token (fragment or legacy query) from the address bar without a navigation. */
function scrubTokenFromUrl() {
  const url = new URL(window.location.href)
  if (url.hash || url.searchParams.has('token')) {
    url.hash = ''
    url.searchParams.delete('token')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
  }
}

const backToSignIn = (
  <Button asChild variant="ghost" size="sm">
    <Link to="/login">
      <ArrowLeft aria-hidden />
      Back to sign in
    </Link>
  </Button>
)

export function ResetPasswordPage() {
  const { token: legacyQueryToken } = useSearch({ from: '/reset-password' })
  const [token, setToken] = useState<string | undefined>(legacyQueryToken)
  const [tokenReady, setTokenReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const failure = useFormFailure()
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [linkRejected, setLinkRejected] = useState(false)

  // The link's token is read once and scrubbed from the address bar. A re-run of this effect (the router
  // seeing the scrubbed URL, a dev-mode remount) must keep the token it already consumed.
  const consumed = useRef<{ token: string | undefined } | null>(null)
  useEffect(() => {
    if (!consumed.current) {
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      consumed.current = { token: fragment.get('token') ?? legacyQueryToken }
      scrubTokenFromUrl()
    }
    setToken(consumed.current.token)
    setTokenReady(true)
  }, [legacyQueryToken])

  // A fresh link opened in this same tab is only a hash change (/reset-password#token=...): take the new token,
  // scrub it again and start over, even from the invalid-link state.
  const clearFailure = failure.clear
  useEffect(() => {
    const onHashChange = () => {
      const next = new URLSearchParams(window.location.hash.slice(1)).get('token')
      if (!next) return
      consumed.current = { token: next }
      scrubTokenFromUrl()
      setToken(next)
      setLinkRejected(false)
      setStatus('idle')
      setPassword('')
      setConfirm('')
      setPasswordError('')
      setConfirmError('')
      clearFailure()
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [clearFailure])

  if (!tokenReady) {
    return (
      <AuthShell>
        <p className="auth-status" role="status">
          Checking reset link…
        </p>
      </AuthShell>
    )
  }

  if (!token || linkRejected) {
    return (
      <AuthShell>
        <AuthStamp word="Oops" tone="rose">
          <ErrorState
            size="page"
            headingLevel={1}
            role="none"
            title="Invalid reset link"
            description={
              linkRejected
                ? 'This reset link has expired or was already used. Back on the sign-in page, choose “Forgot password?” and we’ll email you a fresh link.'
                : 'This password reset link is missing or expired. Back on the sign-in page, choose “Forgot password?” and we’ll email you a fresh link.'
            }
            backAction={
              <Button asChild>
                <Link to="/login">Back to sign in</Link>
              </Button>
            }
          />
        </AuthStamp>
      </AuthShell>
    )
  }

  if (status === 'success') {
    return (
      <AuthShell>
        <AuthStamp word="Done">
          <EmptyState
            size="page"
            headingLevel={1}
            title="Password updated"
            description="Your password has been reset. Sign in with your new password to continue."
            action={
              <Button asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            }
          />
        </AuthStamp>
      </AuthShell>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    failure.clear()
    setPasswordError('')
    setConfirmError('')

    const passwordProblem = newPasswordError(password)
    const confirmProblem = passwordProblem ? undefined : !confirm ? 'Enter the password again.' : password !== confirm ? 'Passwords do not match.' : undefined
    setPasswordError(passwordProblem ?? '')
    setConfirmError(confirmProblem ?? '')
    if (
      focusFirstError([
        ['new-password', passwordProblem],
        ['confirm-password', confirmProblem],
      ])
    ) {
      return
    }

    setStatus('loading')
    // A fresh link opened in this tab while this reset was on its way replaces the token; the answer for the
    // old one (refused or accepted) is no longer about the link on screen, so it is dropped.
    const submittedToken = token
    const stillCurrent = () => consumed.current?.token === submittedToken
    try {
      await confirmPasswordReset({ token: submittedToken!, new_password: password })
      if (!stillCurrent()) return
      setStatus('success')
    } catch (err) {
      if (!stillCurrent()) return
      setStatus('error')
      // The server answers 400 only for a token it will not accept (expired, used, tampered): that is the
      // invalid-link state, not a form error. Anything else (rate limit, offline) stays on the form.
      if (err instanceof ApiError && err.status === 400) {
        setLinkRejected(true)
        return
      }
      failure.fail(err, 'This reset link may have expired. Request a new one.')
    }
  }

  return (
    <AuthShell actions={backToSignIn}>
      <PageHeader title="Set a new password" lead="Choose a strong password you haven't used before." />
      <Panel className="auth-panel">
        <PanelBody>
          <form onSubmit={handleSubmit} className="auth-form__fields" noValidate>
            <Field
              label="New password"
              id="new-password"
              help={passwordError || failure.failure?.fields.new_password ? undefined : 'At least 8 characters.'}
              error={passwordError || failure.failure?.fields.new_password || undefined}
            >
              <PasswordInput
                size="lg"
                shown={showPassword}
                onShownChange={setShowPassword}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordError('')
                }}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
            <Field label="Confirm password" id="confirm-password" error={confirmError || undefined}>
              <Input
                size="lg"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setConfirmError('')
                }}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
            <FormFailureNotice failure={failure.failure} remaining={failure.remaining} />
            <Button type="submit" size="lg" className="auth-wide" loading={status === 'loading'} disabled={failure.remaining > 0}>
              Reset password
            </Button>
          </form>
        </PanelBody>
      </Panel>
    </AuthShell>
  )
}
