import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, LogOut } from 'lucide-react'
import { ApplicationDetailsCard } from '#/components/applications/ApplicationDetailsCard'
import {
  Avatar,
  Button,
  Cluster,
  EmptyState,
  KeyValue,
  List,
  Notice,
  Page,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowSubtitle,
  RowTitle,
  Section,
  Skeleton,
  Sticker,
} from '#/components/kit'
import { DataControls } from '#/components/profile/DataControls'
import { useSession } from '#/hooks/useSession'
import { requestPasswordReset } from '#/lib/api/client'

export function AccountPage() {
  const { status, user, openAuthDialog, providers, logout } = useSession()
  const resetLink = useMutation({ mutationFn: (email: string) => requestPasswordReset({ email }) })
  const [resetSentTo, setResetSentTo] = useState<string | null>(null)

  // Until the session answers (or while a signed-in browser cannot reach the server; the service banner
  // says so) the page holds its shape instead of flashing the guest sign-in prompt.
  if (status === 'loading' || status === 'unreachable') {
    return (
      <Page width="narrow">
        <PageHeader title="Account" />
        <Skeleton variant="card" count={2} label="Loading your account" />
      </Page>
    )
  }

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
  const memberSinceText =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? `Member since ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(memberSince)}`
      : null
  const googleEnabled = providers.some((p) => p.provider === 'google' && p.enabled)
  const displayName = user.full_name || user.email

  return (
    <Page width="narrow">
      <PageHeader title="Account" />

      <Panel as="section" aria-labelledby="account-identity-title">
        <PanelHeader
          title={<span id="account-identity-title">Identity</span>}
          actions={
            memberSinceText ? (
              <Sticker as="span" size="sm" tone="lemon" tilt={-2} className="account-since">
                {memberSinceText}
              </Sticker>
            ) : undefined
          }
        />
        <PanelBody>
          <div className="account-identity">
            <Avatar name={displayName} size="lg" decorative />
            <KeyValue
              aria-label="Your sign-in identity"
              items={[
                { label: 'Name', value: user.full_name },
                { label: 'Email', value: user.email },
              ]}
            />
          </div>
        </PanelBody>
      </Panel>

      <Panel as="section" aria-labelledby="account-details-title">
        <PanelHeader title={<span id="account-details-title">Details for applications</span>} />
        <PanelBody>
          <ApplicationDetailsCard />
        </PanelBody>
      </Panel>

      {googleEnabled ? <Section title="Sign-in options" description="Google sign-in is available." /> : null}

      <Section title="Session and password">
        {resetLink.isError ? (
          <Notice tone="danger" onDismiss={() => resetLink.reset()}>
            We could not send the link. Try again in a moment.
          </Notice>
        ) : resetSentTo ? (
          <Notice tone="success" onDismiss={() => setResetSentTo(null)}>
            If {resetSentTo} can sign in with a password, a reset link is on its way.
          </Notice>
        ) : null}
        <List className="settings-list" aria-label="Session">
          <Row>
            <RowLeading>
              <KeyRound aria-hidden />
            </RowLeading>
            <RowBody>
              <RowTitle>Change password</RowTitle>
              <RowSubtitle>We email {user.email} a link to choose a new one.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button
                variant="secondary"
                size="sm"
                loading={resetLink.isPending}
                onClick={() =>
                  resetLink.mutate(user.email, { onSuccess: () => setResetSentTo(user.email) })
                }
              >
                Email me a link
              </Button>
            </RowActions>
          </Row>
          <Row>
            <RowLeading>
              <LogOut aria-hidden />
            </RowLeading>
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

      <Section title="Your data" description="Download a copy, or erase what you saved. Deleting is permanent and takes effect immediately.">
        <DataControls listLabel="Your data" detailed />
      </Section>
    </Page>
  )
}
