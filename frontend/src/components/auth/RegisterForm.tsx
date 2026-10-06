import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, Checkbox, Cluster, Field, Input, Notice } from '#/components/kit'
import { FormFailureNotice, useFormFailure } from '#/components/auth/FormFailureNotice'
import { PasswordInput } from '#/components/auth/PasswordInput'
import { emailError, focusFirstError, newPasswordError } from '#/components/auth/auth-validation'
import { useSession } from '#/hooks/useSession'
import { readPendingIntent } from '#/lib/auth/pendingIntent'
import { trackTelemetry } from '#/lib/telemetry/client'

// The originating surface a signup converted from, expressed with the existing
// allowlisted `tool_id` dimension (D-040). A guest-save prompt records the tool
// it was raised from in the pending intent, so the signup is attributed to that
// tool; a direct registration has no pending tool context. Only low-cardinality
// allowlisted values leave the client — never the raw intent route or reason.
function resolveSignupSurfaceTool() {
  return readPendingIntent()?.toolId
}

export function RegisterForm({
  onSuccess,
  onRegistering,
  onExistingAccount,
}: {
  onSuccess?: () => void
  /** True while the account is being created, false again if that failed. A page that celebrates the new account needs it before the session flips. */
  onRegistering?: (registering: boolean) => void
  /** The address already has an account: the container moves to sign in (or its reset step) with the email filled in. */
  onExistingAccount?: (email: string, next: 'login' | 'reset') => void
}) {
  const { register } = useSession()
  const signUp = useFormFailure()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [tosAccepted, setTosAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  // The address that came back as already registered (409), so the form can offer the way in instead.
  const [takenEmail, setTakenEmail] = useState<string | null>(null)

  return (
    <div className="auth-form">
      <form
        className="auth-form__fields"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault()
          if (!tosAccepted) return
          const next = { email: emailError(email), password: newPasswordError(password) }
          setErrors(next)
          if (
            focusFirstError([
              ['register-email', next.email],
              ['register-password', next.password],
            ])
          ) {
            return
          }
          setLoading(true)
          setTakenEmail(null)
          signUp.clear()
          onRegistering?.(true)
          // Capture the originating surface before `register` completes — a
          // successful signup consumes and clears the pending intent.
          const signupSurfaceTool = resolveSignupSurfaceTool()
          try {
            await register({
              email,
              password,
              full_name: fullName || undefined,
              tos_accepted: tosAccepted,
            })
            // Fire exactly once at successful signup completion (D-040). The
            // originating surface is carried by `tool_id` (the tool a guest-save
            // prompt was raised from; absent for a direct registration). Google
            // OAuth never reaches here — first-time OAuth users are redirected to
            // this email form to create the account (signup_via_email_required),
            // so every account creation flows through this call site (and this
            // form offers no Google button for that reason).
            trackTelemetry({
              event_name: 'auth_signup_source',
              tool_id: signupSurfaceTool,
            })
            onSuccess?.()
          } catch (error) {
            onRegistering?.(false)
            if (error instanceof Error && (error as { status?: number }).status === 409) {
              setTakenEmail(email.trim())
            } else {
              signUp.fail(error, 'Sign-up failed. Please try again.')
            }
          } finally {
            setLoading(false)
          }
        }}
      >
        <Field label="Full name" optional id="register-name">
          <Input
            size="lg"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="Email" id="register-email" error={errors.email || signUp.failure?.fields.email}>
          <Input
            type="email"
            size="lg"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setErrors((prev) => ({ ...prev, email: undefined }))
              setTakenEmail(null)
            }}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Field
          label="Password"
          id="register-password"
          help={errors.password || signUp.failure?.fields.password ? undefined : 'At least 8 characters.'}
          error={errors.password || signUp.failure?.fields.password || undefined}
        >
          <PasswordInput
            size="lg"
            shown={showPassword}
            onShownChange={setShowPassword}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setErrors((prev) => ({ ...prev, password: undefined }))
            }}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Checkbox
          id="register-tos"
          checked={tosAccepted}
          onCheckedChange={setTosAccepted}
          required
          label={
            <>
              I agree to the <Link to="/terms">Terms of Service</Link> and{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </>
          }
        />
        {takenEmail ? (
          <Notice tone="danger" title="An account already exists for this email.">
            <p>Sign in with it, or reset its password if you've forgotten it.</p>
            {onExistingAccount ? (
              <Cluster gap={2} className="auth-taken__actions">
                <Button type="button" size="sm" variant="secondary" onClick={() => onExistingAccount(takenEmail, 'login')}>
                  Sign in instead
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => onExistingAccount(takenEmail, 'reset')}>
                  Reset password
                </Button>
              </Cluster>
            ) : null}
          </Notice>
        ) : null}
        <FormFailureNotice failure={signUp.failure} remaining={signUp.remaining} />
        <Button type="submit" size="lg" className="auth-wide" loading={loading} disabled={!tosAccepted || signUp.remaining > 0}>
          Create free account
        </Button>
      </form>
    </div>
  )
}
