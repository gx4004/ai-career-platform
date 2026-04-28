import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { AuthSurface } from '#/components/auth/AuthSurface'
import { FadeUp } from '#/components/ui/motion'
import { useSession } from '#/hooks/useSession'

const OAUTH_ERROR_COPY: Record<string, string> = {
  signup_via_email_required:
    'To create your first account with Google, please first sign up using the email form below — it includes our Terms of Service. After your account exists you can sign in with Google as usual.',
  unverified_email:
    'Google reported your email as unverified. Verify your address with Google and try again.',
  no_userinfo: 'Google did not return profile details. Please try again.',
  auth_failed: 'Google sign-in failed. Please try again.',
}

export function LoginPage() {
  const { status } = useSession()
  const router = useRouter()
  const [view, setView] = useState<'login' | 'register'>('login')
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
      <AppStatePanel
        badge="Authenticated"
        title="You are already signed in"
        description="Use the dashboard to continue the workflow."
        scene="emptyPlanning"
        actions={[{ label: 'Go to dashboard', to: '/dashboard' }]}
      />
    )
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      router.history.back()
    } else {
      router.navigate({ to: '/' })
    }
  }

  return (
    <div className="auth-page">
      <FadeUp className="auth-page-shell">
        <div className="auth-page-actions">
          <button
            type="button"
            onClick={handleBack}
            className="small-copy muted-copy auth-back-link"
          >
            ← Back
          </button>
          <Link to="/dashboard" className="small-copy muted-copy auth-back-link">
            Continue as guest →
          </Link>
        </div>
        {oauthErrorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-destructive"
            style={{ marginBottom: '1rem' }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-sm leading-relaxed">{oauthErrorMessage}</p>
          </div>
        ) : null}
        <AuthSurface view={view} onViewChange={setView} />
      </FadeUp>
    </div>
  )
}
