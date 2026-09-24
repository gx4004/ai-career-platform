import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { z } from 'zod'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useSession } from '#/hooks/useSession'
import { API_URL } from '#/lib/api/client'
import { newPasswordSchema } from '#/lib/api/schemas'
import { readPendingIntent } from '#/lib/auth/pendingIntent'
import { trackTelemetry } from '#/lib/telemetry/client'

// --- registration challenge -------------------------------------------------
// `GET /auth/providers` is where the backend already tells the client what this
// deployment has configured, so it also advertises whether registration needs a
// challenge token. Without that advertisement the client had no way to know,
// and turning `CAPTCHA_ENABLED` on rejected every registration.
//
// Mirrors AuthProvidersPayload in backend/app/routers/auth.py. Anything the
// client cannot read is treated as "no challenge": the server remains the
// authority that enforces it.

const registrationChallengeSchema = z.object({
  captcha_required: z.boolean().default(false),
  captcha_provider: z.string().nullable().default(null),
})

type RegistrationChallenge = {
  required: boolean
  provider: string | null
}

const NO_CHALLENGE: RegistrationChallenge = { required: false, provider: null }

async function fetchRegistrationChallenge(): Promise<RegistrationChallenge> {
  const response = await fetch(`${API_URL}/auth/providers`, {
    method: 'GET',
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error('Sign-up configuration is unavailable')
  }
  const advertised = registrationChallengeSchema.parse(await response.json())
  return {
    required: advertised.captcha_required,
    provider: advertised.captcha_provider,
  }
}

// Deployment configuration cannot change while the page is open, so the
// advertisement is fetched once per page load and shared by every mount of this
// form. Memoising here also keeps a remount (the auth tabs mount the panel more
// than once) from issuing a second request or aborting an in-flight one — extra
// request churn on the sign-up path buys nothing.
let advertisedChallenge: Promise<RegistrationChallenge> | null = null

function loadRegistrationChallenge(): Promise<RegistrationChallenge> {
  if (!advertisedChallenge) {
    // A failed advertisement is not an error the user should ever see: the
    // server enforces the real requirement on the register call itself.
    advertisedChallenge = fetchRegistrationChallenge().catch(() => NO_CHALLENGE)
  }
  return advertisedChallenge
}

// Test-only: drop the cached advertisement between cases.
export function __resetRegistrationChallengeCache() {
  advertisedChallenge = null
}

// --- challenge token seam ---------------------------------------------------
// The one piece that cannot ship without deployment credentials is the public
// site key, which arrives at build time like VITE_SENTRY_DSN does. Everything
// else is wired here: the provider script is loaded on demand and the token
// comes from the provider itself.
//
// Nothing in this seam fabricates a token. If the key is missing, the
// advertised provider is one this client cannot satisfy, the script fails or
// hangs, or the provider hands back an empty token, `requestChallengeToken`
// throws and the submit handler fails closed — no registration is attempted.

const RECAPTCHA_PROVIDER = 'recaptcha'
const RECAPTCHA_SCRIPT_ID = 'cw-recaptcha-script'
const RECAPTCHA_LOAD_TIMEOUT_MS = 10_000
const CHALLENGE_UNAVAILABLE_MESSAGE =
  'We could not load the verification challenge. Please reload the page and try again.'

type ReCaptcha = {
  ready: (callback: () => void) => void
  execute: (siteKey: string, options: { action: string }) => Promise<string>
}

declare global {
  interface Window {
    grecaptcha?: ReCaptcha
  }
}

function readCaptchaSiteKey(): string {
  const configured = import.meta.env.VITE_CAPTCHA_SITE_KEY
  return typeof configured === 'string' ? configured.trim() : ''
}

function loadRecaptcha(siteKey: string): Promise<ReCaptcha> {
  const installed = window.grecaptcha
  if (installed) return Promise.resolve(installed)

  return new Promise<ReCaptcha>((resolve, reject) => {
    const existing = document.getElementById(RECAPTCHA_SCRIPT_ID)
    const script =
      existing instanceof HTMLScriptElement ? existing : document.createElement('script')

    // A script that never loads must not hold the submission open forever.
    const timeout = window.setTimeout(() => {
      reject(new Error('Challenge script timed out'))
    }, RECAPTCHA_LOAD_TIMEOUT_MS)

    script.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeout)
        const provider = window.grecaptcha
        if (provider) resolve(provider)
        else reject(new Error('Challenge script installed no provider'))
      },
      { once: true },
    )
    script.addEventListener(
      'error',
      () => {
        window.clearTimeout(timeout)
        reject(new Error('Challenge script failed to load'))
      },
      { once: true },
    )

    if (!(existing instanceof HTMLScriptElement)) {
      script.id = RECAPTCHA_SCRIPT_ID
      script.async = true
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
      document.head.appendChild(script)
    }
  })
}

async function requestChallengeToken(challenge: RegistrationChallenge): Promise<string> {
  if (challenge.provider !== RECAPTCHA_PROVIDER) {
    throw new Error(`Unsupported challenge provider: ${challenge.provider ?? 'none'}`)
  }
  const siteKey = readCaptchaSiteKey()
  if (!siteKey) {
    throw new Error('No challenge site key is configured for this deployment')
  }

  const provider = await loadRecaptcha(siteKey)
  const token = await new Promise<string>((resolve, reject) => {
    provider.ready(() => {
      provider.execute(siteKey, { action: 'register' }).then(resolve, reject)
    })
  })
  if (!token) {
    throw new Error('Challenge provider returned an empty token')
  }
  return token
}

// The originating surface a signup converted from, expressed with the existing
// allowlisted `tool_id` dimension (D-040). A guest-save prompt records the tool
// it was raised from in the pending intent, so the signup is attributed to that
// tool; a direct registration has no pending tool context. Only low-cardinality
// allowlisted values leave the client — never the raw intent route or reason.
function resolveSignupSurfaceTool() {
  return readPendingIntent()?.toolId
}

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
  const [tosAccepted, setTosAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [challengeError, setChallengeError] = useState('')
  // Plain state, deliberately not awaited on submit. Until the advertisement
  // lands, this form behaves exactly as it did before the challenge existed —
  // an advertisement that is slow, aborted, or unreachable can never delay or
  // block a sign-up, and the server stays the authority on what is required.
  const [challenge, setChallenge] = useState<RegistrationChallenge>(NO_CHALLENGE)

  useEffect(() => {
    let active = true
    loadRegistrationChallenge().then((advertised) => {
      if (active) setChallenge(advertised)
    })
    return () => {
      active = false
    }
  }, [])

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
          if (!tosAccepted) return
          const passwordResult = newPasswordSchema.safeParse(password)
          if (!passwordResult.success) {
            setPasswordError(passwordResult.error.issues[0]?.message || 'Password is invalid')
            return
          }
          setPasswordError('')
          setChallengeError('')
          setLoading(true)
          // Capture the originating surface before `register` completes — a
          // successful signup consumes and clears the pending intent.
          const signupSurfaceTool = resolveSignupSurfaceTool()
          try {
            let captchaToken: string | null = null
            if (challenge.required) {
              try {
                captchaToken = await requestChallengeToken(challenge)
              } catch {
                // Fail closed. A deployment that requires a challenge never
                // gets a registration attempt without a provider token.
                setChallengeError(CHALLENGE_UNAVAILABLE_MESSAGE)
                return
              }
            }
            // When no challenge is advertised the payload is exactly what it
            // has always been; the token rides the existing `captcha_token`
            // field of the register contract only when one was obtained.
            const payload = {
              email,
              password,
              full_name: fullName || undefined,
              tos_accepted: tosAccepted,
              ...(captchaToken ? { captcha_token: captchaToken } : {}),
            }
            await register(payload)
            // Fire exactly once at successful signup completion (D-040). The
            // originating surface is carried by `tool_id` (the tool a guest-save
            // prompt was raised from; absent for a direct registration). Google
            // OAuth never reaches here — first-time OAuth users are redirected to
            // this email form to create the account (signup_via_email_required),
            // so every account creation flows through this call site.
            trackTelemetry({
              event_name: 'auth_signup_source',
              tool_id: signupSurfaceTool,
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
              onChange={(event) => {
                setPassword(event.target.value)
                setPasswordError('')
              }}
              placeholder="8+ characters, at most 72 UTF-8 bytes"
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
        <div className="flex items-start gap-2.5">
          <input
            id="register-tos"
            type="checkbox"
            checked={tosAccepted}
            onChange={(event) => setTosAccepted(event.target.checked)}
            required
            className="mt-1 size-4 rounded border border-input bg-background accent-foreground"
          />
          <Label
            htmlFor="register-tos"
            className="text-sm font-normal leading-relaxed text-muted-foreground"
          >
            I agree to the{' '}
            <Link to="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </Label>
        </div>
        <div className="min-h-[2.5rem]">
          {passwordError || challengeError || authError ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="text-sm leading-relaxed">
                {passwordError || challengeError || authError}
              </p>
            </div>
          ) : null}
        </div>
        {challenge.required ? (
          // Rendered only where a deployment turned the challenge on, so the
          // default sign-up surface is untouched. It also tells the user why a
          // third-party widget is about to run.
          <p className="small-copy muted-copy">Protected by reCAPTCHA.</p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="auth-submit w-full"
          loading={loading}
          disabled={!tosAccepted}
        >
          Create free account
        </Button>
      </form>
    </div>
  )
}
