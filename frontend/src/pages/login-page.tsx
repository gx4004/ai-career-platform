import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, UserCheck } from 'lucide-react'
import { authCopy } from '#/components/auth/auth-copy'
import { AuthIntentNotice } from '#/components/auth/AuthIntentNotice'
import { AuthSurface } from '#/components/auth/AuthSurface'
import { AuthShell } from '#/components/auth/AuthShell'
import { AuthStamp } from '#/components/auth/AuthStamp'
import { SiteBackAction } from '#/components/legal/SiteHeader'
import { Button, EmptyState, Notice, PageHeader } from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { readPendingIntent } from '#/lib/auth/pendingIntent'
import { safeInternalPath } from '#/lib/navigation/redirect'

/** How long a new account's welcome stays before the page moves on by itself. */
const WELCOME_MS = 2400

/** Google's first-time visitor is not a failure: the page has already switched to the form they need. */
const OAUTH_NEXT_STEP: Record<string, { title: string; text: string }> = {
  signup_via_email_required: {
    title: 'Create your account first',
    text: "Make it here with email (that's where you accept the Terms). After that, Sign in with Google works.",
  },
}

const OAUTH_ERROR_COPY: Record<string, string> = {
  unverified_email:
    'Google reported your email as unverified. Verify your address with Google and try again.',
  no_userinfo: 'Google did not return profile details. Please try again.',
  auth_failed: 'Google sign-in failed. Please try again.',
  account_deactivated:
    'This account has been deactivated. Contact support if you believe this is a mistake.',
}

export function LoginPage() {
  const { status, logout } = useSession()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  // Set the moment an account is being created, so the page can celebrate it instead of reading "already signed in".
  const [welcome, setWelcome] = useState(false)
  // Read inside the submit handlers, which close over an earlier render.
  const welcomeRef = useRef(false)
  const onRegistering = useCallback((registering: boolean) => {
    welcomeRef.current = registering
    setWelcome(registering)
  }, [])
  // Where sign-in leads: the link the visitor followed (?returnTo=), then the page that asked for it (pending
  // intent, possibly older), else the dashboard. Captured on arrival, because signing in consumes the intent.
  const destination = useRef('/dashboard')
  const [leaving, setLeaving] = useState(false)

  const [view, setView] = useState<'login' | 'register'>('login')
  const [resetting, setResetting] = useState(false)
  const [oauthErrorMessage, setOauthErrorMessage] = useState<string | null>(null)
  const [oauthNextStep, setOauthNextStep] = useState<{ title: string; text: string } | null>(null)

  // Pull `?oauth_error=...` out of the URL once on mount and translate the
  // error code into a human-friendly message. Default the auth surface to
  // the register tab when the error is "signup_via_email_required" so the
  // user lands on the right form.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    destination.current =
      safeInternalPath(params.get('returnTo')) ?? safeInternalPath(readPendingIntent()?.to) ?? '/dashboard'
    if (params.get('view') === 'register') setView('register')
    // A dead reset link sends the visitor here for a fresh one: open straight on the reset form.
    if (params.get('view') === 'reset') setResetting(true)
    const code = params.get('oauth_error')
    if (!code) return
    const nextStep = OAUTH_NEXT_STEP[code]
    if (nextStep) setOauthNextStep(nextStep)
    else setOauthErrorMessage(OAUTH_ERROR_COPY[code] ?? 'Sign-in failed. Please try again.')
    if (code === 'signup_via_email_required') setView('register')
  }, [])

  const moveOn = useCallback(() => {
    setLeaving(true)
    void router.navigate({ href: destination.current, replace: true })
  }, [router])

  const signedInNow = status === 'authenticated'
  // A new account gets its moment, then the page continues on its own.
  useEffect(() => {
    if (!signedInNow || !welcome || leaving) return
    const timer = window.setTimeout(moveOn, WELCOME_MS)
    return () => window.clearTimeout(timer)
  }, [signedInNow, welcome, leaving, moveOn])

  if (status === 'authenticated' && welcome) {
    // Straight after signing up the page stamps a seal: the account exists, and the page moves on.
    return (
      <AuthShell aside={false}>
        <AuthStamp word="Hi!">
          {/* An outcome, not an empty box: the open anatomy the reset outcomes use. */}
          <EmptyState
            variant="open"
            headingLevel={1}
            // It replaces the form whose button had focus and moves on by itself: the heading takes focus, so a
            // screen reader says it before the dashboard loads.
            focusTitle
            title="Your account is ready"
            description="Your runs, starred results and CV drafts now stay with you."
            action={
              <Button type="button" onClick={moveOn}>
                Continue
                <ArrowRight aria-hidden />
              </Button>
            }
          />
        </AuthStamp>
      </AuthShell>
    )
  }

  if (status === 'authenticated' && leaving) {
    return (
      <AuthShell aside={false}>
        <p className="auth-hint" role="status">
          Signed in. Taking you there…
        </p>
      </AuthShell>
    )
  }

  if (status === 'authenticated') {
    const signedIn = (
      <EmptyState
        size="page"
        headingLevel={1}
        icon={<UserCheck />}
        title="You're already signed in"
        description="Head back to your dashboard to keep going."
        action={
          <div className="auth-actions">
            <Button asChild>
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
            <Button type="button" variant="secondary" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        }
      />
    )
    return <AuthShell aside={false}>{signedIn}</AuthShell>
  }

  const copy = authCopy(view, resetting)

  // Back returns only to a page of this app (as on the legal pages and the 404); a visitor who arrived from
  // elsewhere, or in a fresh tab, goes home instead of leaving the app.
  return (
    <AuthShell actions={canGoBack ? <SiteBackAction onClick={() => router.history.back()} /> : <SiteBackAction to="/" />}>
      <PageHeader title={copy.title} lead={copy.intro} leadSize="lg" />
      <AuthSurface
        view={view}
        onViewChange={setView}
        resetting={resetting}
        onResettingChange={setResetting}
        onRegistering={onRegistering}
        onSuccess={() => {
          // Signing in moves straight on; a new account is welcomed first (above).
          if (!welcomeRef.current) moveOn()
        }}
        notice={
          resetting ? null : (
            <>
              {oauthErrorMessage ? <Notice tone="danger">{oauthErrorMessage}</Notice> : null}
              {oauthNextStep ? <Notice title={oauthNextStep.title}>{oauthNextStep.text}</Notice> : null}
              <AuthIntentNotice view={view} />
            </>
          )
        }
      />
      <Button asChild variant="link" className="auth-guest">
        <Link to="/dashboard">
          Continue as guest
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </AuthShell>
  )
}
