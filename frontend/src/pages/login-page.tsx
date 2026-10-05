import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { authCopy } from '#/components/auth/auth-copy'
import { AuthIntentNotice } from '#/components/auth/AuthIntentNotice'
import { AuthSurface } from '#/components/auth/AuthSurface'
import { AuthShell } from '#/components/auth/AuthShell'
import { AuthStamp } from '#/components/auth/AuthStamp'
import { Button, EmptyState, Notice, PageHeader } from '#/components/kit'
import { useSession } from '#/hooks/useSession'

const OAUTH_ERROR_COPY: Record<string, string> = {
  signup_via_email_required:
    'To create your first account with Google, please first sign up using the email form below — it includes our Terms of Service. After your account exists you can sign in with Google as usual.',
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
  // Set the moment an account is being created, so the page can celebrate it instead of reading "already signed in".
  const [welcome, setWelcome] = useState(false)

  const [view, setView] = useState<'login' | 'register'>('login')
  const [resetting, setResetting] = useState(false)
  const [oauthErrorMessage, setOauthErrorMessage] = useState<string | null>(null)

  // Pull `?oauth_error=...` out of the URL once on mount and translate the
  // error code into a human-friendly message. Default the auth surface to
  // the register tab when the error is "signup_via_email_required" so the
  // user lands on the right form.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('oauth_error')
    if (!code) return
    const copy = OAUTH_ERROR_COPY[code] ?? 'Sign-in failed. Please try again.'
    setOauthErrorMessage(copy)
    if (code === 'signup_via_email_required') setView('register')
  }, [])

  if (status === 'authenticated') {
    // Straight after signing up the same page stamps a seal: the account exists, and the next step is the dashboard.
    const signedIn = (
      <EmptyState
        size="page"
        headingLevel={1}
        title="You're already signed in"
        description={
          welcome
            ? 'Your account is ready. Your runs, favorites and CV drafts now stay with you.'
            : 'Head back to your dashboard to keep going.'
        }
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
    return <AuthShell>{welcome ? <AuthStamp word="Hi!">{signedIn}</AuthStamp> : signedIn}</AuthShell>
  }

  const copy = authCopy(view, resetting)

  const handleBack = () => {
    if (window.history.length > 1) {
      router.history.back()
    } else {
      router.navigate({ to: '/' })
    }
  }

  return (
    <AuthShell
      actions={
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
      }
    >
      <PageHeader title={copy.title} lead={copy.intro} />
      <AuthSurface
        view={view}
        onViewChange={setView}
        resetting={resetting}
        onResettingChange={setResetting}
        onRegistering={setWelcome}
        notice={
          resetting ? null : (
            <>
              {oauthErrorMessage ? <Notice tone="danger">{oauthErrorMessage}</Notice> : null}
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
