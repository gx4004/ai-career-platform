import { useEffect, useRef, useState } from 'react'
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

  const backRef = useRef<HTMLButtonElement>(null)

  function setReset(next: boolean) {
    setShowReset(next)
    setErrors({})
    // A failed sign-in from before the reset is no longer news, and a password typed then is not kept.
    signIn.clear()
    setPassword('')
    onResetChange?.(next)
  }

  // A form that opens on the reset step tells its container once, so the container heads it correctly.
  useEffect(() => {
    if (startInReset) onResetChange?.(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  // Each step replaces the button that led to it (Forgot password?, Back to sign in, Send reset link, or the
  // "Sign in instead" handoff that remounts this form), so the browser drops focus to the page. Put it on what
  // comes next instead. Only when focus was lost: a plain page load or a tab switch keeps it where it is.
  // The step this effect last ran for: a run for the same step is the mount (or React's development double run of it,
  // which otherwise pulled focus to Email after a dialog had put it on the panel, consistency-F24), never a step change.
  const lastStep = useRef<{ showReset: boolean; resetMessage: string } | null>(null)
  useEffect(() => {
    const previous = lastStep.current
    lastStep.current = { showReset, resetMessage }
    const mounting = previous === null || (previous.showReset === showReset && previous.resetMessage === resetMessage)
    // On mount only a handoff (email filled in, or straight to the reset step) has lost focus to restore.
    if (mounting && !initialEmail && !startInReset) return
    const lost = !document.activeElement || document.activeElement === document.body
    if (!lost) return
    if (showReset && resetMessage) backRef.current?.focus()
    else document.getElementById(showReset ? 'reset-email' : email ? 'login-password' : 'login-email')?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the step changes, reading the fields as they are then
  }, [showReset, resetMessage])

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
        <FormFailureNotice failure={reset.failure} remaining={reset.remaining} shownFields={['email']} />
        <Button type="submit" size="lg" className="auth-wide" data-cookie-keep-clear="" loading={resetLoading} disabled={reset.remaining > 0}>
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
          ref={backRef}
          type="button"
          variant="secondary"
          size="lg"
          className="auth-wide"
          onClick={() => {
            // The address used for the reset is the one to sign in with, unless sign in already has one.
            if (!email.trim()) setEmail(resetEmail)
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
          <Button
            type="button"
            variant="link"
            className="auth-forgot"
            onClick={() => {
              // The address typed here is the one to reset: no retyping.
              setResetEmail(email)
              setReset(true)
            }}
          >
            Forgot password?
          </Button>
        </Stack>
        <FormFailureNotice failure={signIn.failure} remaining={signIn.remaining} shownFields={['email', 'password']} />
        <Button type="submit" size="lg" className="auth-wide" data-cookie-keep-clear="" loading={loading} disabled={signIn.remaining > 0}>
          Sign in
        </Button>
      </form>
    </div>
  )
}
