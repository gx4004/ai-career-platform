import { Link } from '@tanstack/react-router'
import { Briefcase, KeyRound, LogOut, Shield, User } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { useSession } from '#/hooks/useSession'

export function AccountPage() {
  const { status, user, openAuthDialog, providers, logout } = useSession()

  if (status !== 'authenticated' || !user) {
    return (
      <AppStatePanel
        title="Your workspace, your way"
        description="Sign in to manage your profile, connected providers, and session preferences — all in one place."
        scene="loginWorkflow"
        actions={[
          {
            label: 'Sign in',
            onClick: () => openAuthDialog({ to: '/account', reason: 'account' }),
          },
          { label: 'Explore tools', to: '/resume', variant: 'outline' },
        ]}
      />
    )
  }

  const initials = user.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  return (
    <PageFrame>
      <section className="content-max account-layout">
        {/* Profile Hero Card */}
        <div className="account-hero">
          <div className="account-hero-accent" />
          <div className="account-hero-content">
            <div className="account-avatar">{initials}</div>
            <div className="account-hero-info">
              <h1 className="account-hero-title">Account</h1>
              <p className="account-hero-email">{user.email}</p>
            </div>
          </div>
          <div className="account-hero-meta">
            <div className="account-meta-item">
              <User size={14} className="account-meta-icon" />
              <span className="account-meta-label">Name</span>
              <span className="account-meta-value">{user.full_name || 'Not provided'}</span>
            </div>
            <div className="account-meta-divider" />
            <div className="account-meta-item">
              <KeyRound size={14} className="account-meta-icon" />
              <span className="account-meta-label">Member since</span>
              <span className="account-meta-value">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unavailable'}
              </span>
            </div>
          </div>
        </div>

        {/* Workspace Access */}
        <div className="account-card">
          <div className="account-card-header">
            <div className="account-card-icon">
              <Briefcase size={18} />
            </div>
            <div>
              <h2 className="account-card-title">Workspace access</h2>
              <p className="account-card-description">
                Signed-in runs are saved to your workspace timeline, support favorites, and keep the guided workflow connected across tools.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="settings-btn">
              <Link to="/history">Open workspace timeline</Link>
            </Button>
            <Button asChild variant="outline" className="settings-btn">
              <Link to="/settings">Review settings</Link>
            </Button>
          </div>
        </div>

        {/* Connected Providers */}
        <div className="account-card">
          <div className="account-card-header">
            <div className="account-card-icon">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="account-card-title">Connected providers</h2>
              <p className="account-card-description">
                Authentication methods configured for this account.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {providers.length ? (
              providers.map((provider) => (
                <div key={provider.provider} className="account-provider-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {provider.provider === 'google' ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" className="flex-shrink-0" aria-hidden="true">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                      ) : null}
                      <span className="font-medium text-[var(--text-strong)]">{provider.label}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={provider.enabled ? 'account-badge-active' : 'account-badge-inactive'}
                    >
                      <span className={`account-provider-dot ${provider.enabled ? 'is-enabled' : ''}`} />
                      {provider.enabled ? 'Connected' : 'Not connected'}
                    </Badge>
                  </div>
                  <p className="small-copy muted-copy mt-1.5">
                    {provider.enabled
                      ? 'Available for sign-in when configured in the backend.'
                      : 'Configured in the UI but not active in this environment.'}
                  </p>
                </div>
              ))
            ) : (
              <div className="account-provider-card">
                <p className="small-copy muted-copy">
                  No additional auth providers are enabled in this environment.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Session */}
        <div className="account-card account-card--session">
          <div className="account-card-header">
            <div className="account-card-icon account-card-icon--warn">
              <LogOut size={18} />
            </div>
            <div>
              <h2 className="account-card-title">Session</h2>
              <p className="account-card-description">
                Sign out on shared machines when you are done. Saved artifacts remain in your workspace history after you sign back in.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="settings-btn settings-btn--destructive"
            onClick={logout}
          >
            Sign out
          </Button>
        </div>
      </section>
    </PageFrame>
  )
}
