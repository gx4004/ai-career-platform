import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Clock, Eraser, PlayCircle, Wifi } from 'lucide-react'
import {
  Badge,
  Button,
  List,
  Page,
  PageHeader,
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowMeta,
  RowSubtitle,
  RowTitle,
  Section,
  useToast,
} from '#/components/kit'
import { outageOf } from '#/components/app/ServiceBanner'
import { DataControls } from '#/components/profile/DataControls'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { getHealth } from '#/lib/api/client'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'

export function SettingsPage() {
  const onboarding = useOnboarding()
  const { toast } = useToast()
  const { status, user } = useSession()
  // A real check on this page (the session's health only says the server answered /auth/me). Same key as
  // the service banner's, so a fresh result is shared; a visit always asks again.
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false, staleTime: 0 })
  // The service banner's reading of the same check, so the two never contradict: the latest failure wins over
  // an older good answer still held in data; no answer at all is "can't reach", a 5xx (or a health body that
  // is not ok) is the server's own error, and a 4xx is an answer from a server that is up.
  const outage = health.isError ? outageOf(health.error) : null
  const connection = outage === 'unreachable'
    ? 'offline'
    : outage === 'server-error'
      ? 'server-error'
      : health.isError
        ? 'ok'
        : health.data
          ? health.data.status === 'ok'
            ? 'ok'
            : 'server-error'
          : 'checking'
  const isAuthenticated = status === 'authenticated' && user !== null

  return (
    <Page width="narrow">
      <PageHeader title="Settings" />

      <Section title="General">
        <List className="settings-list" aria-label="General">
          <Row>
            <RowLeading>
              <PlayCircle aria-hidden />
            </RowLeading>
            <RowBody>
              <RowTitle>Onboarding</RowTitle>
              <RowSubtitle>Replay the welcome tour.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onboarding.reset()
                  onboarding.startTour()
                }}
              >
                Replay tour
              </Button>
            </RowActions>
          </Row>
          <Row>
            <RowLeading>
              <Eraser aria-hidden />
            </RowLeading>
            <RowBody>
              <RowTitle>Local workspace data</RowTitle>
              <RowSubtitle>Clear cached drafts, guest demos and workflow context on this device.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  clearSensitiveBrowserData()
                  toast({ tone: 'success', title: 'Local drafts and demo state were cleared.' })
                }}
              >
                Clear local drafts
              </Button>
            </RowActions>
          </Row>
          <Row>
            <RowLeading>
              <Clock aria-hidden />
            </RowLeading>
            <RowBody>
              <RowTitle>Saved workspace history</RowTitle>
              <RowSubtitle>Review, favorite, pin and delete saved runs in the timeline.</RowSubtitle>
            </RowBody>
            <RowActions reveal={false}>
              <Button asChild variant="secondary" size="sm">
                <Link to="/history">Open timeline</Link>
              </Button>
            </RowActions>
          </Row>
          <Row>
            <RowLeading>
              <Wifi aria-hidden />
            </RowLeading>
            <RowBody>
              <RowTitle>Connection</RowTitle>
            </RowBody>
            <RowMeta>
              <Badge tone={connection === 'ok' ? 'success' : connection === 'checking' ? 'neutral' : 'danger'} dot>
                {connection === 'ok'
                  ? 'Connected'
                  : connection === 'server-error'
                    ? 'Server error'
                    : connection === 'offline'
                      ? "Can't reach the server"
                      : 'Checking…'}
              </Badge>
            </RowMeta>
          </Row>
        </List>
      </Section>

      {isAuthenticated ? (
        <Section title="Data and privacy">
          <DataControls listLabel="Data and privacy" />
        </Section>
      ) : null}

      <OnboardingDialog
        open={onboarding.open}
        onComplete={onboarding.complete}
        onSkip={onboarding.skip}
        onOpenChange={onboarding.setOpen}
      />
    </Page>
  )
}
