import '#/styles/settings.css'
import { Link } from '@tanstack/react-router'
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
        badge="Account"
        title="Sign in to manage your account"
        description="Profile management lives inside the authenticated workspace."
        scene="emptyPlanning"
        actions={[
          {
            label: 'Sign in',
            onClick: () => openAuthDialog({ to: '/account', reason: 'account' }),
          },
        ]}
      />
    )
  }

  return (
    <PageFrame>
      <section className="content-max app-grid">
        <div className="section-card p-6">
          <div className="grid gap-4">
            <div>
              <p className="eyebrow mb-2">Profile</p>
              <h1 className="page-title">Account</h1>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="practice-card">
                <p className="eyebrow mb-2">Email</p>
                <p>{user.email}</p>
              </div>
              <div className="practice-card">
                <p className="eyebrow mb-2">Name</p>
                <p>{user.full_name || 'Not provided'}</p>
              </div>
              <div className="practice-card">
                <p className="eyebrow mb-2">Member since</p>
                <p>{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unavailable'}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <h2 className="section-title">Workspace access</h2>
            <p className="muted-copy">
              Signed-in runs are saved to your workspace timeline, support favorites, and keep the guided workflow connected across tools.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link to="/history">Open workspace timeline</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/settings">Review settings</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <h2 className="section-title">Connected providers</h2>
            <p className="muted-copy">
              Authentication is currently handled with email and password. Additional providers are displayed here when enabled.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {providers.length ? (
                providers.map((provider) => (
                  <div key={provider.provider} className="practice-card">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p>{provider.label}</p>
                      <Badge variant="outline">
                        {provider.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="small-copy muted-copy">
                      {provider.enabled
                        ? 'Available for sign-in when configured in the backend.'
                        : 'Configured in the UI but not active in this environment.'}
                    </p>
                  </div>
                ))
              ) : (
                <div className="practice-card">
                  <p className="small-copy muted-copy">
                    No additional auth providers are enabled in this environment.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <h2 className="section-title">Session</h2>
            <p className="muted-copy">
              Sign out on shared machines when you are done. Saved artifacts remain in your workspace history after you sign back in.
            </p>
            <Button variant="outline" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </section>
    </PageFrame>
  )
}
