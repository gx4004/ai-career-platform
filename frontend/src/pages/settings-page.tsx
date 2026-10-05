import { Link } from '@tanstack/react-router'
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
import { DataControls } from '#/components/profile/DataControls'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'
import { useOnboarding } from '#/hooks/useOnboarding'
import { useSession } from '#/hooks/useSession'
import { clearSensitiveBrowserData } from '#/lib/privacy/browserData'

export function SettingsPage() {
  const onboarding = useOnboarding()
  const { toast } = useToast()
  const { health, status, user } = useSession()
  const isOnline = health?.status === 'ok'
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
              <Badge tone={isOnline ? 'success' : 'danger'} dot>
                {isOnline ? 'Connected' : "Can't reach the server"}
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
