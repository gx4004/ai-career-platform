import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, LogOut, UserRound } from 'lucide-react'
import { ChangePasswordDialog } from '#/components/account/ChangePasswordDialog'
import { EditNameDialog } from '#/components/account/EditNameDialog'
import { ApplicationDetailsCard, ApplicationDetailsSkeleton } from '#/components/applications/ApplicationDetailsCard'
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
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowSubtitle,
  RowTitle,
  Section,
  Skeleton,
  Stack,
} from '#/components/kit'
import { DataControls } from '#/components/profile/DataControls'
import { useSession } from '#/hooks/useSession'
import { requestPasswordReset } from '#/lib/api/client'
import { describeFailure } from '#/lib/api/errors'

export function AccountPage() {
  const { status, user, openAuthDialog, logout } = useSession()
  const resetLink = useMutation({ mutationFn: (email: string) => requestPasswordReset({ email }) })
  const [resetSent, setResetSent] = useState<{ email: string; devUrl?: string } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Until the session answers (or while a signed-in browser cannot reach the server; the service banner
  // says so) the page holds its shape instead of flashing the guest sign-in prompt.
  if (status === 'loading' || status === 'unreachable') {
    return (
      <Page width="narrow">
        <PageHeader title="Account" />
        {/* The two groups the page opens with, in their loaded frames (heading, panel, rows), so nothing jumps when
            the session answers. */}
        <Section title="Identity" description={<Skeleton width="11rem" />}>
          {/* The loaded block itself (avatar, the Name and Email facts, the Edit name button) with bars for the values,
              so the facts stack and wrap exactly as they will at every width. */}
          <Panel>
            <PanelBody>
              <div className="account-identity" role="status" aria-label="Loading your account" aria-busy="true">
                <Skeleton variant="block" shape="circle" width={36} height={36} />
                <KeyValue
                  items={[
                    {
                      label: 'Name',
                      value: (
                        <Cluster gap={3} justify="between">
                          <Skeleton width="8rem" />
                          <Skeleton variant="block" width="6.5rem" height="var(--kit-h-sm)" />
                        </Cluster>
                      ),
                    },
                    { label: 'Email', value: <Skeleton width="min(16rem, 100%)" /> },
                  ]}
                />
                <span className="kit-sr-only">Loading your account</span>
              </div>
            </PanelBody>
          </Panel>
        </Section>
        <Section title="Details for applications">
          <Panel aria-hidden>
            <PanelBody>
              <ApplicationDetailsSkeleton />
            </PanelBody>
          </Panel>
        </Section>
      </Page>
    )
  }

  if (status !== 'authenticated' || !user) {
    return (
      <Page width="narrow">
        <PageHeader title="Account" />
        <EmptyState
          headingLevel={2}
          icon={<UserRound />}
          title="Your workspace, your way"
          description="Sign in to manage your details and session."
          // One action, as every signed-in-only page's guest gate (STICKER 4.O, consistency-F25).
          action={<Button onClick={() => openAuthDialog({ to: '/account', reason: 'account' })}>Sign in</Button>}
        />
      </Page>
    )
  }

  const memberSince = user.created_at ? new Date(user.created_at) : null
  const memberSinceText =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? `Member since ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(memberSince)}`
      : null
  const displayName = user.full_name || user.email
  const emailResetLink = () => {
    setResetSent(null)
    resetLink.mutate(user.email, {
      onSuccess: (answer) => setResetSent({ email: user.email, devUrl: answer.dev_reset_url }),
    })
  }

  return (
    <Page width="narrow">
      <PageHeader title="Account" />

      {/* Every group is a Section heading over its framed content, as on /settings. The join date is the
          section's quiet meta line (it is not an object, so not a sticker). */}
      <Section title="Identity" landmark description={memberSinceText ?? undefined}>
        <Panel>
          <PanelBody>
            <div className="account-identity">
              <Avatar name={displayName} size="lg" decorative />
              <KeyValue
                aria-label="Your sign-in identity"
                items={[
                  {
                    label: 'Name',
                    value: (
                      <Cluster gap={3} justify="between">
                        {user.full_name ? <span>{user.full_name}</span> : <span className="kit-kv__empty">Not set</span>}
                        <Button variant="secondary" size="sm" onClick={() => setEditingName(true)}>
                          {user.full_name ? 'Edit name' : 'Add name'}
                        </Button>
                      </Cluster>
                    ),
                  },
                  { label: 'Email', value: user.email },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>
      </Section>

      <Section title="Details for applications" landmark>
        <Panel>
          <PanelBody>
            <ApplicationDetailsCard accountName={user.full_name} />
          </PanelBody>
        </Panel>
      </Section>

      <Section title="Session and password">
        <Stack gap={3}>
          {resetLink.isError ? (
            <Notice tone="danger" onDismiss={() => resetLink.reset()}>
              {describeFailure(resetLink.error, 'We could not send the link. Try again in a moment.').message}
            </Notice>
          ) : resetSent ? (
            <Notice tone="success" onDismiss={() => setResetSent(null)}>
              A link to choose a new password is on its way to {resetSent.email}.
              {resetSent.devUrl ? (
                <>
                  {' '}
                  Local development has no mail provider:{' '}
                  <a href={resetSent.devUrl}>open the reset link</a>.
                </>
              ) : null}
            </Notice>
          ) : null}
          <List className="settings-list" aria-label="Session">
            <Row>
              <RowLeading>
                <KeyRound aria-hidden />
              </RowLeading>
              <RowBody>
                <RowTitle>Password</RowTitle>
                {user.has_password === false ? (
                  <RowSubtitle>You sign in with Google. We email {user.email} a link to add a password.</RowSubtitle>
                ) : (
                  <>
                    <RowSubtitle>Changing it signs out every other device.</RowSubtitle>
                    <div>
                      <Button variant="link" size="sm" loading={resetLink.isPending} onClick={emailResetLink}>
                        Forgot it? Email me a link
                      </Button>
                    </div>
                  </>
                )}
              </RowBody>
              <RowActions reveal={false}>
                {user.has_password === false ? (
                  <Button variant="secondary" size="sm" loading={resetLink.isPending} onClick={emailResetLink}>
                    Email me a link
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setChangingPassword(true)}>
                    Change password
                  </Button>
                )}
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
        </Stack>
      </Section>

      <EditNameDialog open={editingName} onOpenChange={setEditingName} currentName={user.full_name} />
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} onEmailLink={emailResetLink} />

      <Section title="Your data" description="Download a copy, or erase what you saved. Deleting is permanent and takes effect immediately.">
        <DataControls listLabel="Your data" detailed />
      </Section>
    </Page>
  )
}
