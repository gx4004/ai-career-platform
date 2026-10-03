import { useState } from 'react'
import { Button, Field, Input, Notice, Section, Stack } from '#/components/kit'
import { RESET_COPY } from '#/components/auth/auth-copy'
import { GoogleButton } from '#/components/auth/GoogleButton'
import { PasswordInput } from '#/components/auth/PasswordInput'
import { useSession } from '#/hooks/useSession'
import { requestPasswordReset } from '#/lib/api/client'

export function LoginForm({
  onSuccess,
  onResetChange,
}: {
  onSuccess?: () => void
  /** Reports the password-reset step opening and closing. A container that heads the form with it passes this and the form drops its own title. */
  onResetChange?: (resetting: boolean) => void
}) {
  const { login, googleLogin, authError } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  function setReset(next: boolean) {
    setShowReset(next)
    onResetChange?.(next)
  }

  if (showReset) {
    const body = resetMessage ? (
      <Notice tone="success">{resetMessage}</Notice>
    ) : (
      <form
        className="auth-form__fields"
        onSubmit={async (event) => {
          event.preventDefault()
          setResetLoading(true)
          setResetError('')
          try {
            const result = await requestPasswordReset({ email: resetEmail })
            setResetMessage(result.message || 'Check your email for a reset link.')
          } catch (error) {
            setResetError(error instanceof Error ? error.message : 'Something went wrong.')
          } finally {
            setResetLoading(false)
          }
        }}
      >
        <Field label="Email" id="reset-email">
          <Input
            type="email"
            size="lg"
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        {resetError ? <Notice tone="danger">{resetError}</Notice> : null}
        <Button type="submit" size="lg" className="auth-wide" loading={resetLoading}>
          Send reset link
        </Button>
      </form>
    )
    return (
      <div className="auth-form">
        {onResetChange ? (
          body
        ) : (
          <Section title={RESET_COPY.title} description={RESET_COPY.intro} rule={false}>
            {body}
          </Section>
        )}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="auth-wide"
          onClick={() => {
            setReset(false)
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
    <div className="auth-form">
      <GoogleButton onClick={() => googleLogin()}>Sign in with Google</GoogleButton>

      <p className="auth-divider">or continue with email</p>

      <form
        className="auth-form__fields"
        onSubmit={async (event) => {
          event.preventDefault()
          setLoading(true)
          try {
            await login({ email, password })
            onSuccess?.()
          } catch {
            // Error displayed via session authError state
          } finally {
            setLoading(false)
          }
        }}
      >
        <Field label="Email" id="login-email">
          <Input
            type="email"
            size="lg"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Stack gap={1}>
          <Field label="Password" id="login-password">
            <PasswordInput
              size="lg"
              shown={showPassword}
              onShownChange={setShowPassword}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="button" variant="ghost" className="auth-forgot" onClick={() => setReset(true)}>
            Forgot password?
          </Button>
        </Stack>
        {authError ? <Notice tone="danger">{authError}</Notice> : null}
        <Button type="submit" size="lg" className="auth-wide" loading={loading}>
          Sign in
        </Button>
      </form>
    </div>
  )
}
