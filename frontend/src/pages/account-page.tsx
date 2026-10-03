import { Link } from '@tanstack/react-router'
import { ApplicationDetailsCard } from '#/components/applications/ApplicationDetailsCard'
import {
  Button,
  Cluster,
  EmptyState,
  List,
  Page,
  PageHeader,
  Row,
  RowActions,
  RowBody,
  RowSubtitle,
  RowTitle,
  Section,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'

export function AccountPage() {
  const { status, user, openAuthDialog, providers, logout } = useSession()

  if (status !== 'authenticated' || !user) {
    return (
      <Page width="narrow">
        <PageHeader title="Account" />
        <EmptyState
          headingLevel={2}
          title="Your workspace, your way"
          description="Sign in to manage your details and session."
          action={
            <Cluster gap={2}>
              <Button onClick={() => openAuthDialog({ to: '/account', reason: 'account' })}>Sign in</Button>
              <Button asChild variant="secondary">
                <Link to="/resume">Explore tools</Link>
              </Button>
            </Cluster>
          }
        />
      </Page>
    )
  }

  const memberSince = user.created_at ? new Date(user.created_at) : null
  const meta =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? [`Member since ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(memberSince)}`]
      : undefined
  const googleEnabled = providers.some((p) => p.provider === 'google' && p.enabled)

  return (
    <Page width="narrow">
      <PageHeader title="Account" meta={meta} />

      <ApplicationDetailsCard />

      {googleEnabled ? <Section title="Sign-in options" description="Google sign-in is available." /> : null}

      <Section title="Session">
        <List aria-label="Session">
          <Row>
            <RowBody>
              <RowTitle>Sign out</RowTitle>
              <RowSubtitle>Sign out on shared computers.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button variant="secondary" size="sm" onClick={logout}>
                Sign out
              </Button>
            </RowActions>
          </Row>
        </List>
      </Section>
    </Page>
  )
}
