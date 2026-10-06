import { useEffect, useState } from 'react'
import { Button, Field, Input, Notice, Section, Stack } from '#/components/kit'
import { RESET_COPY } from '#/components/auth/auth-copy'
import { FormFailureNotice, useFormFailure } from '#/components/auth/FormFailureNotice'
import { GoogleButton } from '#/components/auth/GoogleButton'
import { PasswordInput } from '#/components/auth/PasswordInput'
import { devResetPath } from '#/components/auth/devResetLink'
import { useGoogleEnabled } from '#/components/auth/useGoogleEnabled'
import { emailError, focusFirstError, passwordError } from '#/components/auth/auth-validation'
import { useSession } from '#/hooks/useSession'
import { requestPasswordReset } from '#/lib/api/client'

export function LoginForm({
  onSuccess,
  onResetChange,
  initialEmail = '',
  startInReset = false,
}: {
  onSuccess?: () => void
  /** Reports the password-reset step opening and closing. A container that heads the form with it passes this and the form drops its own title. */
  onResetChange?: (resetting: boolean) => void
  /** Prefills the email (sign in and reset), e.g. after "Sign in instead" on a taken address. Read on mount. */
  initialEmail?: string
  /** Opens on the password-reset step. Read on mount. */
  startInReset?: boolean
}) {
  const { login, googleLogin } = useSession()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(startInReset)
  const [resetEmail, setResetEmail] = useState(initialEmail)
  const [errors, setErrors] = useState<{ email?: string; password?: string; resetEmail?: string }>({})
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [devLink, setDevLink] = useState<string | null>(null)
  const googleEnabled = useGoogleEnabled()
  const signIn = useFormFailure()
  const reset = useFormFailure()

  function setReset(next: boolean) {
    setShowReset(next)
    setErrors({})
    onResetChange?.(next)
  }

  // A form that opens on the reset step tells its container once, so the container heads it correctly.
  useEffect(() => {
    if (startInReset) onResetChange?.(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  if (showReset) {
    const body = resetMessage ? (
      <Stack gap={3}>
        <Notice tone="success">{resetMessage}</Notice>
        {devLink ? (
          <Notice
            title="Development only"
            action={
              <Button asChild size="sm" variant="secondary">
                <a href={devLink}>Open reset link</a>
              </Button>
            }
          >
            No email goes out without a mail key, so the link is here instead.
          </Notice>
        ) : null}
      </Stack>
    ) : (
      <form
        className="auth-form__fields"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault()
          const resetEmailProblem = emailError(resetEmail)
          setErrors({ resetEmail: resetEmailProblem })
          if (focusFirstError([['reset-email', resetEmailProblem]])) return
          setResetLoading(true)
          reset.clear()
          try {
            const result = await requestPasswordReset({ email: resetEmail })
            setResetMessage(result.message || 'Check your email for a reset link.')
            setDevLink(devResetPath(result))
          } catch (error) {
            reset.fail(error)
          } finally {
            setResetLoading(false)
          }
        }}
      >
        <Field label="Email" id="reset-email" error={errors.resetEmail || reset.failure?.fields.email}>
          <Input
            type="email"
            size="lg"
            value={resetEmail}
            onChange={(event) => {
              setResetEmail(event.target.value)
              setErrors({})
            }}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <FormFailureNotice failure={reset.failure} remaining={reset.remaining} />
        <Button type="submit" size="lg" className="auth-wide" loading={resetLoading} disabled={reset.remaining > 0}>
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
            setDevLink(null)
            reset.clear()
          }}
        >
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="auth-form">
      {googleEnabled ? (
        <>
          <GoogleButton onClick={() => googleLogin()}>Sign in with Google</GoogleButton>
          <p className="auth-hint">New here? Create your account with email first.</p>
          <p className="auth-divider">or continue with email</p>
        </>
      ) : null}

      <form
        className="auth-form__fields"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault()
          const next = { email: emailError(email), password: passwordError(password) }
          setErrors(next)
          if (
            focusFirstError([
              ['login-email', next.email],
              ['login-password', next.password],
            ])
          ) {
            return
          }
          setLoading(true)
          signIn.clear()
          try {
            await login({ email, password })
            onSuccess?.()
          } catch (error) {
            signIn.fail(error, 'Sign-in failed. Please try again.')
          } finally {
            setLoading(false)
          }
        }}
      >
        <Field label="Email" id="login-email" error={errors.email || signIn.failure?.fields.email}>
          <Input
            type="email"
            size="lg"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setErrors((prev) => ({ ...prev, email: undefined }))
            }}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Stack gap={2}>
          <Field label="Password" id="login-password" error={errors.password || signIn.failure?.fields.password}>
            <PasswordInput
              size="lg"
              shown={showPassword}
              onShownChange={setShowPassword}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setErrors((prev) => ({ ...prev, password: undefined }))
              }}
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="button" variant="link" className="auth-forgot" onClick={() => setReset(true)}>
            Forgot password?
          </Button>
        </Stack>
        <FormFailureNotice failure={signIn.failure} remaining={signIn.remaining} />
        <Button type="submit" size="lg" className="auth-wide" loading={loading} disabled={signIn.remaining > 0}>
          Sign in
        </Button>
      </form>
    </div>
  )
}
