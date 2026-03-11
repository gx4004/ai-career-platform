import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { PageFrame } from '#/components/app/PageFrame'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { useSession } from '#/hooks/useSession'

export const Route = createFileRoute('/account')({
  component: AccountPage,
})

function AccountPage() {
  const { status, user, openAuthDialog, providers } = useSession()

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
            <div className="flex items-center gap-2">
              <h2 className="section-title">Change name</h2>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="muted-copy">
              Profile name editing will be available in a future update.
            </p>
            <Button variant="outline" disabled>
              Update name
            </Button>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <h2 className="section-title">Delete account</h2>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="muted-copy">
              Account deletion will be available in a future update.
            </p>
            <Button variant="outline" disabled>
              Delete account
            </Button>
          </div>
        </div>
        <div className="section-card p-6">
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <h2 className="section-title">Connected providers</h2>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="muted-copy">
              Provider connection management will be available in a future update.
            </p>
            <div className="flex flex-wrap gap-3">
              {providers.length ? (
                providers.map((provider) => (
                  <Button key={provider.provider} variant="outline" disabled>
                    {provider.label}
                  </Button>
                ))
              ) : (
                <Button variant="outline" disabled>
                  No providers enabled
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </PageFrame>
  )
}
