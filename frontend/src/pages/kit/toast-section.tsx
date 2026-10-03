import { CircleAlert, CircleCheck, EyeOff, X } from 'lucide-react'
import { Button, useToast } from '#/components/kit'
import { GallerySection, Group, Row, Stage } from './gallery-parts'

function ToastButtons() {
  const { toast, dismiss } = useToast()
  return (
    <>
      <Group title="Tones">
        <Row>
          <Button variant="secondary" onClick={() => toast({ title: 'Link copied.' })}>
            Neutral
          </Button>
          <Button variant="secondary" onClick={() => toast({ tone: 'success', title: 'CV saved', description: 'Backend roles, 2026 is up to date.' })}>
            Success
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ tone: 'danger', title: 'That change could not be saved', description: 'Check your connection and try again.' })}
          >
            Danger
          </Button>
        </Row>
      </Group>

      <Group title="With an action, custom icon, no timeout">
        <Row>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                icon: <EyeOff aria-hidden="true" />,
                title: 'Hid “Senior Backend Engineer, Platform”.',
                action: { label: 'Undo', onClick: () => toast({ tone: 'success', title: 'Job restored.' }) },
                duration: null,
              })
            }
          >
            Hide with Undo (stays)
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: 'Imported 3 roles from your CV.', action: { label: 'Review', onClick: () => undefined } })}>
            With action (8s)
          </Button>
        </Row>
      </Group>

      <Group title="Queue and edge cases">
        <Row>
          <Button
            variant="secondary"
            onClick={() => {
              toast({ title: 'First toast' })
              toast({ tone: 'success', title: 'Second toast' })
              toast({ tone: 'danger', title: 'Third toast' })
              toast({ title: 'Fourth toast: the oldest one leaves' })
            }}
          >
            Stack four (max 3)
          </Button>
          <Button variant="secondary" onClick={() => toast({ id: 'sync', title: `Synced at ${new Date().toLocaleTimeString()}` })}>
            Replace in place (same id)
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: 'The job description you pasted was longer than we can read in one go, so we used the first 8,000 characters',
                description: 'Cut it down to the responsibilities and requirements for the best match.',
              })
            }
          >
            Long text
          </Button>
          <Button variant="ghost" onClick={() => dismiss()}>
            Dismiss all
          </Button>
        </Row>
      </Group>
    </>
  )
}

/** Plain-markup copies (same classes as the live toast) so each tone is visible at rest. */
function StaticToast({ tone, children, action, icon }: { tone: 'neutral' | 'success' | 'danger'; children: string; action?: string; icon?: 'success' | 'danger' }) {
  return (
    <div className="kit-toast kit-gallery__toast-static" data-tone={tone} data-state="open">
      {icon ? (
        <span className="kit-toast__icon">{icon === 'success' ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}</span>
      ) : null}
      <div className="kit-toast__text">
        <p className="kit-toast__title">{children}</p>
      </div>
      {action ? (
        <Button type="button" variant="ghost" size="sm" className="kit-toast__action">
          {action}
        </Button>
      ) : null}
      <Button type="button" iconOnly variant="ghost" size="sm" className="kit-toast__close" aria-label="Dismiss notification">
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

export function ToastSection() {
  return (
    <GallerySection
      id="toast"
      title="Toast"
      note="Queue via useToast(). Auto-dismiss after 5s (8s for danger or an action) and the timer pauses while you hover or focus a toast. Text is announced through two persistent live regions (polite for neutral and success, assertive for danger). Bottom-right on desktop, above the tab bar on phones."
    >
      <Group title="At rest (static copies)">
        <Stage label="Static preview of toasts" className="kit-gallery__stage--plain kit-gallery__stage--stack">
          <StaticToast tone="neutral">Link copied.</StaticToast>
          <StaticToast tone="success" icon="success">CV saved</StaticToast>
          <StaticToast tone="danger" icon="danger">That change could not be saved</StaticToast>
          <StaticToast tone="neutral" action="Undo">Hid “Senior Backend Engineer, Platform”.</StaticToast>
        </Stage>
      </Group>
      <ToastButtons />
    </GallerySection>
  )
}
