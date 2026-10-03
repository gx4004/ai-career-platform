import { Button } from '#/components/ui/button'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { ApplicationDetailsCard } from '#/components/applications/ApplicationDetailsCard'
import { PageHero } from '#/components/app/PageHero'
import { WorkspacePage } from '#/components/app/WorkspacePage'
import { formatDate } from '#/components/applications/stages'
import { useSession } from '#/hooks/useSession'

export function AccountPage() {
  const { status, user, openAuthDialog, providers, logout } = useSession()

  if (status !== 'authenticated' || !user) {
    return (
      <AppStatePanel
        title="Your workspace, your way"
        description="Sign in to manage your details and session."
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

  const memberSince = user.created_at ? new Date(user.created_at) : null
  const chips =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? [`Member since ${formatDate(memberSince.toISOString())}`]
      : undefined
  const googleEnabled = providers.some((p) => p.provider === 'google' && p.enabled)

  return (
    <WorkspacePage className="settings-page">
      <PageHero title="Account" chips={chips} />
      <section className="account-layout">
        <ApplicationDetailsCard />

        {googleEnabled ? (
          <div className="account-card">
            <div className="account-card-header">
              <div>
                <h2 className="account-card-title">Sign-in options</h2>
                <p className="account-card-description">Google sign-in is available.</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Session */}
        <div className="account-card account-card--session">
          <div className="account-card-header">
            <div>
              <h2 className="account-card-title">Session</h2>
              <p className="account-card-description">
                Sign out on shared computers.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="settings-btn justify-self-start"
            onClick={logout}
          >
            Sign out
          </Button>
        </div>
      </section>
    </WorkspacePage>
  )
}
