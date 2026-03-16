import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { AuthSurface } from '#/components/auth/AuthSurface'
import { FadeUp } from '#/components/ui/motion'
import { useSession } from '#/hooks/useSession'

export function LoginPage() {
  const { status } = useSession()
  const [view, setView] = useState<'login' | 'register'>('login')

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

  return (
    <div className="auth-page">
      <FadeUp className="auth-page-shell">
        <div className="auth-page-actions">
          <Link to="/" className="small-copy muted-copy auth-back-link">
            ← Back to home
          </Link>
          <Link to="/dashboard" className="small-copy muted-copy auth-back-link">
            Continue as guest →
          </Link>
        </div>
        <AuthSurface view={view} onViewChange={setView} />
      </FadeUp>
    </div>
  )
}
