import { useState } from 'react'
import { Check, EyeOff, TriangleAlert, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '#/components/kit'
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
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                tone: 'success',
                title: 'Added to your applications',
                description: 'Senior Backend Engineer',
                action: { label: 'View application', onClick: () => undefined },
                secondaryAction: { label: 'Undo', onClick: () => toast({ title: 'Removed from your applications.' }) },
              })
            }
          >
            Two actions
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

      <Group title="With a dialog open">
        <Row>
          <ToastThenDialog />
        </Row>
        <p className="kit-gallery__section-note">
          On a phone, while a dialog or a bottom sheet is open, the toasts move to the top edge in their compact form (no
          description) and the dialog centres in the room left below them, so a toast never covers its footer buttons.
        </p>
      </Group>
    </>
  )
}

/** A toast lands, then a dialog opens over the page: the case of "Saved", then the next row's Edit. */
function ToastThenDialog() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        onClick={() => {
          toast({ tone: 'success', title: 'Saved to your profile', description: 'It shows up under Skills.' })
          setOpen(true)
        }}
      >
        Toast, then a dialog
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit experience</DialogTitle>
          <DialogDescription>The toast above stays clear of this dialog's buttons.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p>On a phone the toast sits at the top edge while this is open; on a desktop it stays bottom-right.</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Plain-markup copies (same classes as the live toast) so each tone is visible at rest. */
function StaticToast({
  tone,
  children,
  action,
  secondaryAction,
  icon,
}: {
  tone: 'neutral' | 'success' | 'danger'
  children: string
  action?: string
  secondaryAction?: string
  icon?: 'success' | 'danger'
}) {
  const actionButton = (label: string) => (
    <Button type="button" variant="link" size="sm" className="kit-toast__action">
      {label}
    </Button>
  )
  return (
    <div className="kit-toast kit-gallery__toast-static" data-tone={tone} data-state="open">
      {icon ? (
        <span className="kit-toast__icon">{icon === 'success' ? <Check aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}</span>
      ) : null}
      <div className="kit-toast__text">
        <p className="kit-toast__title">{children}</p>
      </div>
      {action && secondaryAction ? (
        <div className="kit-toast__actions">
          {actionButton(action)}
          {actionButton(secondaryAction)}
        </div>
      ) : action ? (
        actionButton(action)
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
      note="A white 2px-outlined panel with the 4px hard shadow; success and danger carry a mint check or rose alert disc, neutral has none. It slaps on in 260ms (kit-slap-lite) and leaves with a 120ms fade; reduced motion shows and hides it at once. Queue via useToast(). An action (and an optional secondaryAction after it, e.g. View application · Undo) drops under the text. Auto-dismiss after 5s (8s for danger or an action) and the timer pauses while you hover or focus a toast. Text is announced through two persistent live regions (polite for neutral and success, assertive for danger). Bottom-right on desktop, above the tab bar on phones; at the top edge on phones while a dialog or bottom sheet is open."
    >
      <Group title="At rest (static copies)">
        <Stage label="Static preview of toasts" className="kit-gallery__stage--plain kit-gallery__stage--stack">
          <StaticToast tone="neutral">Link copied.</StaticToast>
          <StaticToast tone="success" icon="success">CV saved</StaticToast>
          <StaticToast tone="danger" icon="danger">That change could not be saved</StaticToast>
          <StaticToast tone="neutral" action="Undo">Hid “Senior Backend Engineer, Platform”.</StaticToast>
          <StaticToast tone="success" icon="success" action="View application" secondaryAction="Undo">
            Added to your applications
          </StaticToast>
        </Stage>
      </Group>
      <ToastButtons />
    </GallerySection>
  )
}
