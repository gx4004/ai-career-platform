import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { authCopy } from '#/components/auth/auth-copy'
import { AuthSurface } from '#/components/auth/AuthSurface'
import { AuthShell } from '#/components/auth/AuthShell'
import { Button, Notice, PageHeader } from '#/components/kit'
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
  const { status } = useSession()
  const router = useRouter()
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
    return (
      <AuthShell>
        <PageHeader title="You're already signed in" lead="Head back to your dashboard to keep going." />
        <div>
          <Button asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </AuthShell>
    )
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
        notice={oauthErrorMessage && !resetting ? <Notice tone="danger">{oauthErrorMessage}</Notice> : null}
      />
      <Button asChild variant="ghost" className="auth-guest">
        <Link to="/dashboard">
          Continue as guest
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </AuthShell>
  )
}
